/**
 * Command-line tokenizing and matching against a vendor profile's commandSet. Vendor
 * syntax (which words exist, error text) lives entirely in the profile; this module is
 * vendor-neutral machinery.
 */
import type { CommandEntry } from '../../profiles';
import type { CliMode } from './types';

export interface Token {
  text: string;
  column: number;
}

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ text: m[0], column: m.index });
  }
  return tokens;
}

type PatternToken = { kind: 'literal'; text: string } | { kind: 'param'; name: string } | { kind: 'rest'; name: string };

function parsePattern(pattern: string): PatternToken[] {
  return pattern.split(/\s+/).map((p) => {
    const restMatch = /^\{\.\.\.(\w+)\}$/.exec(p);
    if (restMatch) return { kind: 'rest', name: restMatch[1] };
    const paramMatch = /^\{(\w+)\}$/.exec(p);
    if (paramMatch) return { kind: 'param', name: paramMatch[1] };
    return { kind: 'literal', text: p };
  });
}

type CandidateOutcome =
  | { kind: 'full'; entry: CommandEntry; exactCount: number; params: Record<string, string> }
  | { kind: 'incomplete'; entry: CommandEntry }
  | { kind: 'fail'; entry: CommandEntry; failIndex: number };

function evaluateCandidate(entry: CommandEntry, tokens: Token[]): CandidateOutcome {
  const pattern = parsePattern(entry.pattern);
  const params: Record<string, string> = {};
  let exactCount = 0;

  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i];
    if (p.kind === 'rest') {
      if (i >= tokens.length) return { kind: 'incomplete', entry };
      params[p.name] = tokens
        .slice(i)
        .map((t) => t.text)
        .join(' ');
      return { kind: 'full', entry, exactCount, params };
    }
    if (i >= tokens.length) return { kind: 'incomplete', entry };
    const t = tokens[i];
    if (p.kind === 'param') {
      params[p.name] = t.text;
      continue;
    }
    const literalLower = p.text.toLowerCase();
    const tokenLower = t.text.toLowerCase();
    if (!literalLower.startsWith(tokenLower)) return { kind: 'fail', entry, failIndex: i };
    if (literalLower === tokenLower) exactCount++;
  }

  if (tokens.length > pattern.length) return { kind: 'fail', entry, failIndex: pattern.length };
  return { kind: 'full', entry, exactCount, params };
}

export interface MatchSuccess {
  kind: 'matched';
  entry: CommandEntry;
  params: Record<string, string>;
}
export interface MatchAmbiguous {
  kind: 'ambiguous';
}
export interface MatchIncomplete {
  kind: 'incomplete';
}
export interface MatchSyntaxError {
  kind: 'syntax-error';
  caretTokenColumn: number;
}
export type MatchResult = MatchSuccess | MatchAmbiguous | MatchIncomplete | MatchSyntaxError;

export function matchCommand(entries: readonly CommandEntry[], mode: CliMode, tokens: Token[]): MatchResult {
  const candidates = entries.filter((e) => e.modes.includes(mode));
  const outcomes = candidates.map((e) => evaluateCandidate(e, tokens));

  const fulls = outcomes.filter((o): o is Extract<CandidateOutcome, { kind: 'full' }> => o.kind === 'full');
  if (fulls.length > 0) {
    const maxExact = Math.max(...fulls.map((f) => f.exactCount));
    const best = fulls.filter((f) => f.exactCount === maxExact);
    if (best.length === 1) return { kind: 'matched', entry: best[0].entry, params: best[0].params };
    return { kind: 'ambiguous' };
  }

  const incompletes = outcomes.filter((o) => o.kind === 'incomplete');
  if (incompletes.length > 0) return { kind: 'incomplete' };

  const fails = outcomes.filter((o): o is Extract<CandidateOutcome, { kind: 'fail' }> => o.kind === 'fail');
  const maxFailIndex = fails.length > 0 ? Math.max(...fails.map((f) => f.failIndex)) : 0;
  const caretTokenColumn = tokens[maxFailIndex] ? tokens[maxFailIndex].column : (tokens[tokens.length - 1]?.column ?? 0);
  return { kind: 'syntax-error', caretTokenColumn };
}

export interface HelpCandidateInternal {
  token: string;
  description: string;
  isParam: boolean;
}

function paramPlaceholder(name: string): string {
  if (name === 'id' || name === 'target' || name === 'name' || name === 'mode' || name === 'value' || name === 'ontId') return 'WORD';
  if (name === 'ip' || name === 'mask' || name === 'nexthop' || name === 'network') return 'A.B.C.D';
  return 'WORD';
}

/** Candidates for the next token, given what's typed so far -- what item 6's tap-token chips render. */
export function buildHelp(entries: readonly CommandEntry[], mode: CliMode, tokens: Token[]): HelpCandidateInternal[] {
  const candidates = entries.filter((e) => e.modes.includes(mode));
  const seen = new Map<string, HelpCandidateInternal>();

  for (const entry of candidates) {
    const pattern = parsePattern(entry.pattern);
    let matchedSoFar = true;
    for (let i = 0; i < tokens.length; i++) {
      const p = pattern[i];
      if (!p) {
        matchedSoFar = false;
        break;
      }
      if (p.kind === 'rest') break; // rest swallows everything from here; nothing further to suggest against
      if (p.kind === 'param') continue; // any token is acceptable for a param
      if (!p.text.toLowerCase().startsWith(tokens[i].text.toLowerCase())) {
        matchedSoFar = false;
        break;
      }
    }
    if (!matchedSoFar) continue;
    const nextPattern = pattern[tokens.length];
    if (!nextPattern) continue; // this entry is already fully consumed by the typed tokens
    const token = nextPattern.kind === 'literal' ? nextPattern.text : nextPattern.kind === 'rest' ? paramPlaceholder(nextPattern.name) : paramPlaceholder(nextPattern.name);
    const isParam = nextPattern.kind !== 'literal';
    if (!seen.has(token)) seen.set(token, { token, description: entry.description, isParam });
  }

  return Array.from(seen.values()).sort((a, b) => {
    if (a.isParam !== b.isParam) return a.isParam ? 1 : -1;
    return a.token.localeCompare(b.token);
  });
}
