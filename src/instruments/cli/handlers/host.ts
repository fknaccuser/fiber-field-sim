/** Windows customer-laptop shell handlers: ipconfig, ping, nslookup, tracert. */
import { createRng, deriveSeed } from '../../../world';
import type { Endpoint } from '../types';
import { prefixToMask } from '../format';
import { resolveHostAddressing } from '../network/dhcp';
import { resolveName } from '../network/dns';
import { forward } from '../network/forwarding';
import type { Handler } from './types';

const DOTTED_QUAD = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function macWithDashes(mac: string): string {
  return mac
    .replace(/\./g, '')
    .match(/.{1,2}/g)!
    .join('-')
    .toUpperCase();
}

function ipconfigBody(ctx: Parameters<Handler>[0]): { lines: string[]; addressingState: string } {
  const host = ctx.host!;
  const addressing = resolveHostAddressing(ctx.world, ctx.profiles.network, host);
  const lines: string[] = ['', 'Windows IP Configuration', '', '', 'Ethernet adapter Ethernet:', '', '   Connection-specific DNS Suffix  . : '];
  if (addressing.state === 'apipa') {
    lines.push(`   Autoconfiguration IPv4 Address. . : ${addressing.ip}`);
    lines.push(`   Subnet Mask . . . . . . . . . . . : 255.255.0.0`);
    lines.push(`   Default Gateway . . . . . . . . . : `);
  } else {
    lines.push(`   IPv4 Address. . . . . . . . . . . : ${addressing.ip}`);
    lines.push(`   Subnet Mask . . . . . . . . . . . : ${prefixToMask(addressing.prefixLength)}`);
    lines.push(`   Default Gateway . . . . . . . . . : ${addressing.gateway}`);
  }
  return { lines, addressingState: addressing.state };
}

export const hostIpconfig: Handler = (ctx) => {
  const { lines, addressingState } = ipconfigBody(ctx);
  return { output: lines, facts: [{ kind: 'host-addressing-observed', hostId: ctx.host!.id, state: addressingState }] };
};

export const hostIpconfigAll: Handler = (ctx) => {
  const host = ctx.host!;
  const addressing = resolveHostAddressing(ctx.world, ctx.profiles.network, host);
  const { lines, addressingState } = ipconfigBody(ctx);
  const dhcpEnabled = host.addressing.mode === 'dhcp';
  const dns = addressing.state === 'apipa' ? '' : addressing.dns;
  const extended = [
    ...lines.slice(0, 6),
    `   Physical Address. . . . . . . . . : ${macWithDashes(host.macAddress)}`,
    `   DHCP Enabled. . . . . . . . . . . : ${dhcpEnabled ? 'Yes' : 'No'}`,
    ...lines.slice(6),
    `   DNS Servers . . . . . . . . . . . : ${dns}`,
  ];
  return { output: extended, facts: [{ kind: 'host-addressing-observed', hostId: host.id, state: addressingState }] };
};

export const hostPing: Handler = (ctx, params) => {
  const host = ctx.host!;
  const endpoint: Endpoint = { kind: 'host', hostId: host.id };
  const target = params.target;
  let ip: string;
  let wasName = false;
  if (DOTTED_QUAD.test(target)) {
    ip = target;
  } else {
    wasName = true;
    const dnsResult = resolveName(ctx.world, ctx.profiles.network, endpoint, target, ctx.attemptCounter);
    if (!dnsResult.ip) {
      return {
        output: [ctx.vendorProfile.messages.unknownHost.replace('{input}', target)],
        facts: [{ kind: 'ping', target, resolvedIp: null, delivered: 0, sent: 4 }],
      };
    }
    ip = dnsResult.ip;
  }

  const rng = createRng(deriveSeed(ctx.world.seed, 'ping', JSON.stringify(endpoint), target, String(ctx.attemptCounter)));
  const lines: string[] = ['', `Pinging ${target}${wasName ? ` [${ip}]` : ''} with 32 bytes of data:`];
  let received = 0;
  let failureAt: string | undefined;
  for (let i = 0; i < 4; i++) {
    const result = forward(ctx.world, ctx.profiles.network, endpoint, ip, 'icmp');
    if (result.delivered && !(result.lossFraction > 0 && rng.next() < result.lossFraction)) {
      lines.push(`Reply from ${ip}: bytes=32 time=${1 + i}ms TTL=64`);
      received++;
    } else if (!result.delivered && (result.failure?.at === 'acl-denied' || result.failure?.at === 'no-route-at-hop' || result.failure?.at === 'destination-unreachable')) {
      const hopIp = result.hops[result.hops.length - 1]?.ingressIp ?? ip;
      lines.push(`Reply from ${hopIp}: Destination net unreachable.`);
      failureAt = failureAt ?? result.failure.at;
    } else {
      lines.push('Request timed out.');
      failureAt = failureAt ?? result.failure?.at ?? 'duplex-loss';
    }
  }
  lines.push('');
  lines.push(`Ping statistics for ${ip}:`);
  lines.push(`    Packets: Sent = 4, Received = ${received}, Lost = ${4 - received} (${Math.round(((4 - received) / 4) * 100)}% loss),`);
  if (received > 0) {
    lines.push('Approximate round trip times in milli-seconds:');
    lines.push('    Minimum = 1ms, Maximum = 4ms, Average = 2ms');
  }
  return {
    output: lines,
    simulatedSeconds: 15 + 2 * (4 - received),
    facts: [{ kind: 'ping', target, resolvedIp: ip, delivered: received, sent: 4, failureAt }],
  };
};

export const hostNslookup: Handler = (ctx, params) => {
  const host = ctx.host!;
  const result = resolveName(ctx.world, ctx.profiles.network, { kind: 'host', hostId: host.id }, params.target, ctx.attemptCounter);
  const fact = { kind: 'dns-lookup' as const, name: params.target, resolvedIp: result.ip, serverIp: result.serverIp, stale: result.stale, serverHealth: result.serverHealth };

  if (result.timedOut) {
    const lines = [
      'DNS request timed out.',
      '    timeout was 2 seconds.',
      'DNS request timed out.',
      '    timeout was 2 seconds.',
      `*** UnKnown can't find ${params.target}: No response from server`,
    ];
    return { output: lines, simulatedSeconds: 15 + 8, facts: [fact] };
  }
  if (!result.ip) {
    return {
      output: ['Server:  UnKnown', `Address:  ${result.serverIp ?? ''}`, '', `*** UnKnown can't find ${params.target}: Non-existent domain`],
      facts: [fact],
    };
  }
  return {
    output: ['Server:  UnKnown', `Address:  ${result.serverIp ?? ''}`, '', `Name:    ${params.target}`, `Address:  ${result.ip}`],
    facts: [fact],
  };
};

export const hostTracert: Handler = (ctx, params) => {
  const host = ctx.host!;
  const endpoint: Endpoint = { kind: 'host', hostId: host.id };
  const target = params.target;
  let ip: string;
  if (DOTTED_QUAD.test(target)) {
    ip = target;
  } else {
    const dnsResult = resolveName(ctx.world, ctx.profiles.network, endpoint, target, ctx.attemptCounter);
    if (!dnsResult.ip) return { output: [ctx.vendorProfile.messages.unknownHost.replace('{input}', target)] };
    ip = dnsResult.ip;
  }

  const result = forward(ctx.world, ctx.profiles.network, endpoint, ip, 'icmp');
  const lines = [`Tracing route to ${ip} over a maximum of 30 hops`, ''];
  result.hops.forEach((hop, i) => {
    const n = i + 1;
    if (result.failure?.hopIndex === i) {
      lines.push(`  ${n}     *        *        *     Request timed out.`);
    } else {
      lines.push(`  ${n}    <1 ms    <1 ms    <1 ms  ${hop.ingressIp ?? ip}`);
    }
  });
  lines.push('', 'Trace complete.');
  return { output: lines };
};
