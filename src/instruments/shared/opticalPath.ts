/**
 * Resolves the physical fiber path from an access point (or between two topology
 * nodes) by walking FiberSpans and topology exactly as a real technician's light would
 * travel: through splitters (which branch/superpose), through splice closures (per
 * their spliceMap), and stopping at breaks or un-spliced/dark fiber. Shared by the OTDR
 * module, the power meter, the VFL, and (in a later stage) ONT receive-power derivation
 * — every optical instrument sees the same ground truth through the same resolver.
 */
import type { FiberSpan, FiberTubeColor, TopologyNode, WorldState } from '../../world';
import { findNode, findSpan, getSplitRatio, getSpliceMap, spansAtNode } from '../../world';
import type { NetworkProfile } from '../../profiles';
import { END_CONNECTOR_REFLECTANCE_DB, UNTERMINATED_END_REFLECTANCE_DB } from './constants';
import { eventOneWayLossDb, wavelengthKey } from './eventLoss';
import { AmbiguousPathError, StrandRequiredError } from './errors';

export interface StrandRef {
  tubeColor: FiberTubeColor;
  fiberColor: FiberTubeColor;
}

function strandEquals(a: StrandRef | undefined, b: StrandRef | undefined): boolean {
  if (!a || !b) return false;
  return a.tubeColor === b.tubeColor && a.fiberColor === b.fiberColor;
}

export interface OtdrAccessLike {
  accessNodeId: string;
  launchSpanId: string;
  strand?: StrandRef;
}

export type NodeStep =
  | { nodeId: string; kind: 'splitter-node'; lossDb: number }
  | { nodeId: string; kind: 'unterminated-end'; reflectanceDb: number };

export interface PathSegment {
  spanId: string;
  /** True when this segment is traversed toNode -> fromNode (customer side toward the OLT). */
  reversed: boolean;
  /** Cumulative true distance (meters) at the start of this segment. */
  startMeters: number;
  strand?: StrandRef;
  nodeStepAtEnd?: NodeStep;
  children: PathSegment[];
}

export interface ResolvedPath {
  root: PathSegment;
  /** The longest branch's total true length, meters. */
  totalLengthMeters: number;
  /** Depth-first list of every span id touched. */
  spanIds: string[];
}

function longestBranch(segment: PathSegment, span: (id: string) => FiberSpan): number {
  const end = segment.startMeters + span(segment.spanId).lengthMeters;
  if (segment.children.length === 0) return end;
  return Math.max(...segment.children.map((c) => longestBranch(c, span)));
}

function collectSpanIds(segment: PathSegment, out: string[]): void {
  out.push(segment.spanId);
  for (const c of segment.children) collectSpanIds(c, out);
}

/**
 * Builds one segment of the path starting on `spanId`, having just arrived at
 * `arrivingFrom` (a node id). `carriedStrand` is the strand to use if `spanId`'s span is
 * stranded (required for the root call via `access.strand`; for deeper calls it comes
 * from a splice map entry, or is undefined when the span isn't stranded).
 */
function buildSegment(
  world: WorldState,
  network: NetworkProfile,
  spanId: string,
  arrivingFrom: string,
  carriedStrand: StrandRef | undefined,
  cum: number,
  visited: ReadonlySet<string>,
): PathSegment {
  if (visited.has(spanId)) throw new AmbiguousPathError(arrivingFrom);
  const nextVisited = new Set(visited);
  nextVisited.add(spanId);

  const span = findSpan(world, spanId);
  const reversed = span.toNodeId === arrivingFrom;
  const hasStrands = !!span.strands && span.strands.length > 0;
  if (hasStrands && !carriedStrand) throw new StrandRequiredError(spanId);
  const strand = hasStrands ? carriedStrand : undefined;
  const strandObj = strand ? span.strands!.find((s) => s.tubeColor === strand.tubeColor && s.fiberColor === strand.fiberColor) : undefined;
  if (hasStrands && !strandObj) throw new StrandRequiredError(spanId);

  const startMeters = cum;
  const nextCum = cum + span.lengthMeters;
  const nextNodeId = reversed ? span.fromNodeId : span.toNodeId;

  // Step 3: termination when this span's own strand has had its continuity broken
  // (a wrong-tube/wrong-fiber splice) -- the fiber physically ends, unpatched, right
  // about where the far end's splice should have continued it.
  if (strandObj?.continuityBroken) {
    return {
      spanId,
      reversed,
      startMeters,
      strand,
      nodeStepAtEnd: { nodeId: nextNodeId, kind: 'unterminated-end', reflectanceDb: UNTERMINATED_END_REFLECTANCE_DB },
      children: [],
    };
  }

  const nextNode = findNode(world, nextNodeId);
  const continuing = spansAtNode(world, nextNodeId).filter((s) => s.id !== spanId);

  if (nextNode.kind === 'splitter') {
    const ratio = getSplitRatio(nextNode);
    const ladderEntry = network.splitterLadder.find((l) => l.ratio === ratio);
    if (!ladderEntry) {
      throw new Error(`Splitter node ${nextNode.id}: split ratio "${ratio}" not found in the network profile's splitterLadder`);
    }
    const nodeStepAtEnd: NodeStep = { nodeId: nextNodeId, kind: 'splitter-node', lossDb: ladderEntry.nominalLossDb };
    let children: PathSegment[];
    if (!reversed) {
      // Arrived via the upstream feeder: branch into every leaving (downstream) span.
      children = continuing.map((child) => buildSegment(world, network, child.id, nextNodeId, undefined, nextCum, nextVisited));
    } else {
      // Arrived from a downstream leg: continue toward the single upstream span.
      const upstream = continuing.find((s) => s.toNodeId === nextNodeId);
      children = upstream ? [buildSegment(world, network, upstream.id, nextNodeId, undefined, nextCum, nextVisited)] : [];
    }
    return { spanId, reversed, startMeters, strand, nodeStepAtEnd, children };
  }

  if (continuing.length === 0) {
    const isDarkOrSpare = strandObj ? strandObj.role === 'dark' || strandObj.role === 'spare' : false;
    const atEquipment = nextNode.kind === 'ont' || nextNode.kind === 'olt';
    const reflectanceDb = atEquipment && !isDarkOrSpare ? END_CONNECTOR_REFLECTANCE_DB : UNTERMINATED_END_REFLECTANCE_DB;
    return {
      spanId,
      reversed,
      startMeters,
      strand,
      nodeStepAtEnd: { nodeId: nextNodeId, kind: 'unterminated-end', reflectanceDb },
      children: [],
    };
  }

  if (continuing.length === 1 && !hasStrands) {
    const only = continuing[0];
    return { spanId, reversed, startMeters, strand, children: [buildSegment(world, network, only.id, nextNodeId, undefined, nextCum, nextVisited)] };
  }

  // A splice-map entry is authored in one direction (fromSpanId/fromStrand ->
  // toSpanId/toStrand) but must resolve a walk arriving from *either* side -- an OTDR
  // shot launched from the far end of the map (e.g. testing upstream from a distribution
  // splitter back toward the feeder) arrives via what the entry calls its "to" side.
  const spliceMap = getSpliceMap(nextNode);
  const forwardEntry = spliceMap.find((e) => e.fromSpanId === spanId && (!hasStrands || strandEquals(e.fromStrand, strand)));
  const reverseEntry = !forwardEntry ? spliceMap.find((e) => e.toSpanId === spanId && (!hasStrands || strandEquals(e.toStrand, strand))) : undefined;
  if (forwardEntry) {
    return {
      spanId,
      reversed,
      startMeters,
      strand,
      children: [buildSegment(world, network, forwardEntry.toSpanId, nextNodeId, forwardEntry.toStrand, nextCum, nextVisited)],
    };
  }
  if (reverseEntry) {
    return {
      spanId,
      reversed,
      startMeters,
      strand,
      children: [buildSegment(world, network, reverseEntry.fromSpanId, nextNodeId, reverseEntry.fromStrand, nextCum, nextVisited)],
    };
  }

  if (!hasStrands && continuing.length > 1) {
    throw new AmbiguousPathError(nextNodeId);
  }

  // Stranded span with no matching splice-map entry: a dark or never-spliced fiber
  // that simply ends, unpatched, in this tray -- exactly what a wrong roll looks like.
  return {
    spanId,
    reversed,
    startMeters,
    strand,
    nodeStepAtEnd: { nodeId: nextNodeId, kind: 'unterminated-end', reflectanceDb: UNTERMINATED_END_REFLECTANCE_DB },
    children: [],
  };
}

export function resolveTestPath(world: WorldState, network: NetworkProfile, access: OtdrAccessLike): ResolvedPath {
  const root = buildSegment(world, network, access.launchSpanId, access.accessNodeId, access.strand, 0, new Set());
  const spanIds: string[] = [];
  collectSpanIds(root, spanIds);
  return { root, totalLengthMeters: longestBranch(root, (id) => findSpan(world, id)), spanIds };
}

export interface PathLossResult {
  lossDb: number;
  broken: boolean;
  spanIds: string[];
}

/**
 * One-way loss (dB) from `fromNodeId` to `toNodeId` at `wavelengthNm`, following
 * whichever fiber route (through splitters, splice maps, and strand choices) actually
 * connects the two nodes. `broken` is true when no route reaches `toNodeId`, or a
 * fiber-break or unterminated end is crossed before it does.
 */
export function pathLossDb(world: WorldState, network: NetworkProfile, fromNodeId: string, toNodeId: string, wavelengthNm: number): PathLossResult {
  const key = wavelengthKey(wavelengthNm);
  const visitedNodes = new Set<string>();

  /**
   * `arrivingStrand` is the specific fiber we're already on, once one has been chosen
   * (undefined at the very start, before any stranded span has been entered). At a node
   * with more than one continuation and a splice map, only the map's entry for that exact
   * strand may continue the search -- matching only by span id (ignoring which strand)
   * would let the search "leak" onto a physically disconnected fiber via an unrelated
   * splice-map row for the same pair of spans.
   */
  function search(nodeId: string, arrivingSpanId: string | null, arrivingStrand: StrandRef | undefined): { lossDb: number; spanIds: string[] } | null {
    if (nodeId === toNodeId) return { lossDb: 0, spanIds: [] };
    if (visitedNodes.has(nodeId)) return null;
    visitedNodes.add(nodeId);

    const node: TopologyNode = findNode(world, nodeId);
    const candidates = spansAtNode(world, nodeId).filter((s) => s.id !== arrivingSpanId);
    const spliceMap = node.kind !== 'splitter' ? getSpliceMap(node) : [];

    for (const span of candidates) {
      const hasStrands = !!span.strands && span.strands.length > 0;
      let strandsToTry: (StrandRef | undefined)[];

      if (arrivingSpanId !== null && spliceMap.length > 0) {
        // A splice map is authoritative once we know which specific fiber we arrived on:
        // only the entry naming both this span pair AND the arriving strand continues it.
        const continuations = spliceMap
          .map((e) => {
            if (e.fromSpanId === arrivingSpanId && e.toSpanId === span.id && strandEquals(e.fromStrand, arrivingStrand)) return e.toStrand;
            if (e.toSpanId === arrivingSpanId && e.fromSpanId === span.id && strandEquals(e.toStrand, arrivingStrand)) return e.fromStrand;
            return undefined;
          })
          .filter((s): s is StrandRef => s !== undefined);
        if (continuations.length === 0) continue;
        strandsToTry = hasStrands
          ? continuations.filter((s) => !span.strands!.some((st) => st.tubeColor === s.tubeColor && st.fiberColor === s.fiberColor && st.continuityBroken))
          : [undefined];
        if (hasStrands && strandsToTry.length === 0) continue;
      } else if (hasStrands) {
        // No splice-map context to disambiguate (the search root, or a node without one):
        // try every strand that hasn't had its continuity broken.
        strandsToTry = span.strands!.filter((s) => !s.continuityBroken).map((s) => ({ tubeColor: s.tubeColor, fiberColor: s.fiberColor }));
      } else {
        strandsToTry = [undefined];
      }

      for (const strand of strandsToTry) {
        const reversed = span.toNodeId === nodeId;
        const farNodeId = reversed ? span.fromNodeId : span.toNodeId;

        let eventLoss = 0;
        for (const ev of span.events) {
          eventLoss += eventOneWayLossDb(ev, network, key, 'forward');
          if (ev.kind === 'fiber-break') {
            // Nothing beyond a break is reachable through this span at all.
            eventLoss = Infinity;
            break;
          }
        }
        if (!Number.isFinite(eventLoss)) continue;

        const fiberLoss = (span.lengthMeters / 1000) * (network.fiberAttenuationDbPerKm[key] ?? 0);
        let splitterLoss = 0;
        let ok = true;
        if (node.kind === 'splitter') {
          const ratio = getSplitRatio(node);
          const entry = network.splitterLadder.find((l) => l.ratio === ratio);
          if (!entry) ok = false;
          else splitterLoss = entry.nominalLossDb;
        }
        if (!ok) continue;

        // An unstranded fan-out (no splice map at all) with more than one candidate is
        // ambiguous beyond the search root -- only a single unambiguous continuation is
        // safe there (matches resolveTestPath's AmbiguousPathError case).
        if (node.kind !== 'splitter' && spliceMap.length === 0 && candidates.length > 1 && arrivingSpanId !== null) continue;

        const downstream = search(farNodeId, span.id, strand);
        if (downstream) {
          return {
            lossDb: eventLoss + fiberLoss + splitterLoss + downstream.lossDb,
            spanIds: [span.id, ...downstream.spanIds],
          };
        }
      }
    }
    return null;
  }

  const result = search(fromNodeId, null, undefined);
  if (!result) return { lossDb: NaN, broken: true, spanIds: [] };
  return { lossDb: result.lossDb, broken: false, spanIds: result.spanIds };
}
