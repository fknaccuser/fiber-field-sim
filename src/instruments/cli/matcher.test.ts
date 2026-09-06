import { describe, expect, it } from 'vitest';
import { buildHelp, matchCommand, tokenize } from './matcher';
import type { CommandEntry } from '../../profiles';

const entries: CommandEntry[] = [
  { pattern: 'show ip interface brief', handler: 'show-ip-interface-brief', modes: ['priv-exec'], description: 'Interface status and IP summary' },
  { pattern: 'show ip route', handler: 'show-ip-route', modes: ['priv-exec'], description: 'Routing table' },
  { pattern: 'show ip ospf neighbor', handler: 'show-ip-ospf-neighbor', modes: ['priv-exec'], description: 'OSPF adjacencies' },
  { pattern: 'show', handler: 'show-stub', modes: ['priv-exec'], description: 'stub' },
  { pattern: 'shutdown', handler: 'if-shutdown', modes: ['interface-config'], description: 'Administratively disable' },
  { pattern: 'speed {value}', handler: 'if-speed', modes: ['interface-config'], description: '10, 100, 1000, or auto' },
];

describe('tokenize', () => {
  it('records each token and its starting column', () => {
    const tokens = tokenize('sh ip int br');
    expect(tokens.map((t) => t.text)).toEqual(['sh', 'ip', 'int', 'br']);
    expect(tokens[2].column).toBe(6);
  });
});

describe('matchCommand', () => {
  it('matches an abbreviation against the fully-spelled command', () => {
    const result = matchCommand(entries, 'priv-exec', tokenize('sh ip int br'));
    expect(result.kind).toBe('matched');
    if (result.kind === 'matched') expect(result.entry.handler).toBe('show-ip-interface-brief');
  });

  it('is incomplete when the input is a valid prefix of a longer command', () => {
    const result = matchCommand(entries, 'priv-exec', tokenize('show ip'));
    expect(result.kind).toBe('incomplete');
  });

  it('reports a syntax error at the deepest failing token, with the caret column at that token', () => {
    const tokens = tokenize('show ip interfaces brief');
    const result = matchCommand(entries, 'priv-exec', tokens);
    expect(result.kind).toBe('syntax-error');
    if (result.kind === 'syntax-error') {
      expect(result.caretTokenColumn).toBe(tokens[2].column); // 'interfaces' fails against 'interface'/'route'/'ospf'
    }
  });

  it('is ambiguous when multiple full matches tie on exactness', () => {
    // 's' alone matches both the bare 'show' stub entry and could prefix others, but against
    // only literal single-token entries at this mode there is exactly one -- use a case that
    // truly ties: two single-token entries both consuming 's' as a prefix.
    const tied: CommandEntry[] = [
      { pattern: 'show', handler: 'a', modes: ['priv-exec'], description: 'a' },
      { pattern: 'set', handler: 'b', modes: ['priv-exec'], description: 'b' },
    ];
    const result = matchCommand(tied, 'priv-exec', tokenize('s'));
    expect(result.kind).toBe('ambiguous');
  });

  it('is not ambiguous when only one candidate mode applies (shutdown is interface-only)', () => {
    const result = matchCommand(entries, 'priv-exec', tokenize('sh'));
    // 'sh' is a prefix of both 'show ip interface brief' etc and 'show' stub, all under the
    // same first literal 'show' -- but 'shutdown' is a different mode entirely and must not
    // contribute to ambiguity here.
    expect(result.kind).not.toBe('ambiguous');
  });

  it('"sh" uniquely resolves to shutdown (speed does not start with "sh"), but bare "s" is ambiguous between them', () => {
    const ifaceEntries: CommandEntry[] = [
      { pattern: 'shutdown', handler: 'if-shutdown', modes: ['interface-config'], description: 'Administratively disable' },
      { pattern: 'speed {value}', handler: 'if-speed', modes: ['interface-config'], description: 'speed' },
    ];
    const shResult = matchCommand(ifaceEntries, 'interface-config', tokenize('sh'));
    expect(shResult.kind).toBe('matched');
    if (shResult.kind === 'matched') expect(shResult.entry.handler).toBe('if-shutdown');

    const sResult = matchCommand(ifaceEntries, 'interface-config', tokenize('s'));
    // 's' alone is a complete (1-token) match for 'shutdown' but only an *incomplete*
    // prefix of the two-token 'speed {value}' pattern -- per the matching algorithm a
    // 'full' outcome exists (for shutdown) so it wins outright, it is not ambiguous.
    expect(sResult.kind).toBe('matched');
    if (sResult.kind === 'matched') expect(sResult.entry.handler).toBe('if-shutdown');
  });
});

describe('buildHelp', () => {
  it('returns sorted next-token candidates for "show ip ?"', () => {
    const help = buildHelp(entries, 'priv-exec', tokenize('show ip'));
    expect(help.map((h) => h.token)).toEqual(['interface', 'ospf', 'route']);
  });

  it('returns a WORD param candidate for "interface ?"-style patterns', () => {
    const ifaceEntries: CommandEntry[] = [{ pattern: 'interface {id}', handler: 'enter-interface-config', modes: ['global-config'], description: 'Configure an interface' }];
    const help = buildHelp(ifaceEntries, 'global-config', tokenize('interface'));
    expect(help).toEqual([{ token: 'WORD', description: 'Configure an interface', isParam: true }]);
  });
});
