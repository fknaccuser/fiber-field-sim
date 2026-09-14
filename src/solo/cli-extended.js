import { applyAction } from './actions.js';
import { testService } from './forward.js';

// A bounded simulator subset. These commands never execute on the host OS.
export function extendedHelp(kind) {
  if (kind === 'client') return [
    'curl http://portal.northline.test',
    'netsh interface ipv4 set address name=eth0 static <IP> <MASK> <GATEWAY>',
    'netsh interface ipv4 set dnsservers name=eth0 static <DNS-IP>',
  ];
  if (kind === 'server') return ['dns-record <NAME> <IP>  (simulator DNS editor)'];
  return [];
}

function change(ctx, actions) {
  let network = ctx.network;
  for (const action of actions) {
    const result = applyAction(network, action);
    if (!result.ok) return { ok: false, code: result.code, output: [`% ${result.message}`] };
    network = result.state;
  }
  // Publish only after all fields validate, so malformed commands cannot partially apply.
  return { network, actions, output: ['Configuration updated. Verify connectivity before closing the ticket.'] };
}

function prefixFor(mask) {
  const parts = mask.split('.');
  if (parts.length !== 4 || parts.some(p => !/^\d+$/.test(p) || +p > 255)) return null;
  const bits = parts.map(p => (+p).toString(2).padStart(8, '0')).join('');
  return /^1*0*$/.test(bits) ? bits.indexOf('0') === -1 ? 32 : bits.indexOf('0') : null;
}

export function extendedCommand(ctx, command) {
  const tokens = command.trim().split(/\s+/);
  if (ctx.device.kind === 'client' && tokens[0].toLowerCase() === 'curl') {
    const args = tokens.slice(1);
    if (args[0] === '-I' || args[0] === '--head') args.shift();
    const match = args.length === 1 && /^http:\/\/([a-z\d.-]+)\/?$/i.exec(args[0]);
    if (!match) return { ok: false, output: ['Supported: curl [-I] http://<hostname> (HTTP only).'] };
    const name = match[1].toLowerCase().replace(/\.$/, '');
    const result = testService(ctx.network, ctx.device.id, name);
    const isMissionTarget = name === ctx.state.mission.targetName.toLowerCase().replace(/\.$/, '');
    return { output: result.ok ? ['HTTP/1.1 200 OK', 'Northline portal is reachable.'] : [`curl: connection failed (${result.code})`],
      test: { testKind: isMissionTarget ? ctx.device.id === ctx.state.mission.protectedClientId ? 'checkProtected' : 'openPortal' : 'httpRequest', result, target: name } };
  }
  if (ctx.device.kind === 'client' && /^netsh\b/i.test(command)) {
    let match = /^netsh interface ipv4 set address name="?eth0"? (?:source=)?static (?:address=)?(\S+) (?:mask=)?(\S+) (?:gateway=)?(\S+)$/i.exec(command);
    if (match) {
      const prefix = prefixFor(match[2]);
      if (prefix === null) return { ok: false, output: ['% Invalid contiguous subnet mask.'] };
      return change(ctx, [{ type: 'setClientAddress', deviceId: ctx.device.id, ip: match[1], prefix }, { type: 'setClientGateway', deviceId: ctx.device.id, gateway: match[3] }]);
    }
    match = /^netsh interface ipv4 set dnsservers name="?eth0"? (?:source=)?static (?:address=)?(\S+)$/i.exec(command);
    if (match) return change(ctx, [{ type: 'setClientDns', deviceId: ctx.device.id, dns: match[1] }]);
    return { ok: false, output: ['% Unsupported netsh syntax. Supported static eth0 commands:', ...extendedHelp('client').filter(s => s.startsWith('netsh'))] };
  }
  if (ctx.device.kind === 'server' && /^dns-record\b/i.test(command)) {
    if (tokens.length !== 3) return { ok: false, output: ['Simulator command: dns-record <existing-name> <IPv4-address>'] };
    return change(ctx, [{ type: 'setDnsRecord', serverId: ctx.device.id, name: tokens[1].toLowerCase().replace(/\.$/, ''), address: tokens[2] }]);
  }
  return null;
}
