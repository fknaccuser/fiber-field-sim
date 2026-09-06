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

  const spliceMap = getSpliceMap(nextNode);
  const entry = spliceMap.find((e) => e.fromSpanId === spanId && (!hasStrands || strandEquals(e.fromStrand, strand)));
  if (entry) {
    return {
      spanId,
      reversed,
      startMeters,
      strand,
      children: [buildSegment(world, network, entry.toSpanId, nextNodeId, entry.toStrand, nextCum, nextVisited)],
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

  function search(nodeId: string, arrivingSpanId: string | null): { lossDb: number; spanIds: string[] } | null {
    if (nodeId === toNodeId) return { lossDb: 0, spanIds: [] };
    if (visitedNodes.has(nodeId)) return null;
    visitedNodes.add(nodeId);

    const node: TopologyNode = findNode(world, nodeId);
    const candidates = spansAtNode(world, nodeId).filter((s) => s.id !== arrivingSpanId);

    for (const span of candidates) {
      const hasStrands = !!span.strands && span.strands.length > 0;
      const strandsToTry: (StrandRef | undefined)[] = hasStrands
        ? span.strands!.filter((s) => !s.continuityBroken).map((s) => ({ tubeColor: s.tubeColor, fiberColor: s.fiberColor }))
        : [undefined];

      for (const strand of strandsToTry) {
        void strand; // selects which non-broken strand to attempt; no per-strand event data to branch on yet
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

        // If we're leaving a splitter/closure via a spliceMap-governed fork, honor it:
        // when there is more than one candidate and the node is not a splitter, only a
        // spliceMap-listed continuation (or the single unambiguous continuation) counts.
        const nonSplitterFanOut = node.kind !== 'splitter' && candidates.length > 1;
        if (nonSplitterFanOut) {
          const spliceMap = getSpliceMap(node);
          const matches = arrivingSpanId
            ? spliceMap.some(
                (e) =>
                  (e.fromSpanId === arrivingSpanId && e.toSpanId === span.id) ||
                  (e.toSpanId === arrivingSpanId && e.fromSpanId === span.id),
              )
            : true; // starting node: no incoming span to match against yet.
          if (!matches && spliceMap.length > 0) continue;
        }

        const downstream = search(farNodeId, span.id);
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

  const result = search(fromNodeId, null);
  if (!result) return { lossDb: NaN, broken: true, spanIds: [] };
  return { lossDb: result.lossDb, broken: false, spanIds: result.spanIds };
}
