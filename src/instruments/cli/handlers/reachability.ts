import { createRng, deriveSeed } from '../../../world';
import type { Endpoint } from '../types';
import { forward } from '../network/forwarding';
import { resolveName } from '../network/dns';
import type { Handler } from './types';

const DOTTED_QUAD = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function endpointFor(device: { id: string } | undefined, host: { id: string } | undefined): Endpoint {
  if (device) return { kind: 'device', deviceId: device.id };
  return { kind: 'host', hostId: host!.id };
}

export const ping: Handler = (ctx, params) => {
  const endpoint = endpointFor(ctx.device, ctx.host);
  const target = params.target;
  let ip: string;
  if (DOTTED_QUAD.test(target)) {
    ip = target;
  } else {
    const dnsResult = resolveName(ctx.world, ctx.profiles.network, endpoint, target, ctx.attemptCounter);
    if (!dnsResult.ip) {
      return {
        output: [ctx.vendorProfile.messages.unknownHost.replace('{input}', target)],
        facts: [{ kind: 'ping', target, resolvedIp: null, delivered: 0, sent: 0 }],
      };
    }
    ip = dnsResult.ip;
  }

  const rng = createRng(deriveSeed(ctx.world.seed, 'ping', JSON.stringify(endpoint), target, String(ctx.attemptCounter)));
  let glyphs = '';
  let delivered = 0;
  let failureAt: string | undefined;
  for (let i = 0; i < 5; i++) {
    const result = forward(ctx.world, ctx.profiles.network, endpoint, ip, 'icmp');
    if (result.delivered) {
      if (result.lossFraction > 0 && rng.next() < result.lossFraction) {
        glyphs += '.';
        failureAt = failureAt ?? 'duplex-loss';
      } else {
        glyphs += '!';
        delivered++;
      }
    } else {
      const g = result.failure?.at === 'acl-denied' || result.failure?.at === 'no-route-at-hop' ? 'U' : '.';
      glyphs += g;
      failureAt = failureAt ?? result.failure?.at;
    }
  }
  const pct = Math.round((delivered / 5) * 100);
  const lines = [
    'Type escape sequence to abort.',
    `Sending 5, 100-byte ICMP Echos to ${ip}, timeout is 2 seconds:`,
    glyphs,
    delivered > 0
      ? `Success rate is ${pct} percent (${delivered}/5), round-trip min/avg/max = 1/2/4 ms`
      : `Success rate is ${pct} percent (${delivered}/5)`,
  ];
  return {
    output: lines,
    simulatedSeconds: 15 + 2 * (5 - delivered),
    facts: [{ kind: 'ping', target, resolvedIp: ip, delivered, sent: 5, failureAt }],
  };
};

export const traceroute: Handler = (ctx, params) => {
  const endpoint = endpointFor(ctx.device, ctx.host);
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
  const lines = ['Type escape sequence to abort.', `Tracing the route to ${ip}`, 'VRF info: (vrf in name/id, vrf out name/id)'];
  let timeoutHops = 0;
  result.hops.forEach((hop, i) => {
    const hopNum = i + 1;
    const isFailureHop = result.failure?.hopIndex === i;
    if (isFailureHop && result.failure!.at === 'acl-denied') {
      lines.push(`  ${hopNum} ${hop.ingressIp ?? '*'} !A !A !A`);
      timeoutHops++;
    } else if (isFailureHop) {
      lines.push(`  ${hopNum}  *  *  *`);
      timeoutHops++;
    } else {
      lines.push(`  ${hopNum} ${hop.ingressIp ?? ip} 1 msec 1 msec 1 msec`);
    }
  });
  return { output: lines, simulatedSeconds: 30 + 3 * timeoutHops };
};
