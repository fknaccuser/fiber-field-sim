import { IP_ROUTE_CODES_HEADER } from '../format';
import { ipToInt, networkAddress } from '../network/addressing';
import type { Handler } from './types';

export const showIpRoute: Handler = (ctx) => {
  const device = ctx.device!;
  const lines: string[] = [IP_ROUTE_CODES_HEADER, ''];
  const defaultRoute = device.routeTable.find((r) => r.network === '0.0.0.0/0');
  lines.push(defaultRoute ? `Gateway of last resort is ${defaultRoute.nextHop} to network 0.0.0.0` : 'Gateway of last resort is not set');
  lines.push('');

  const rows: Array<{ network: string; line: string }> = [];
  for (const iface of device.interfaces) {
    if (iface.ipAddress && iface.prefixLength != null) {
      const net = networkAddress(iface.ipAddress, iface.prefixLength);
      rows.push({ network: `${net}/${iface.prefixLength}`, line: `C        ${net}/${iface.prefixLength} is directly connected, ${iface.id}` });
      rows.push({ network: `${iface.ipAddress}/32`, line: `L        ${iface.ipAddress}/32 is directly connected, ${iface.id}` });
    }
  }
  for (const r of device.routeTable) {
    if (rows.some((x) => x.network === r.network)) continue;
    if (r.network === '0.0.0.0/0') {
      rows.push({ network: r.network, line: `S*    0.0.0.0/0 [1/0] via ${r.nextHop}` });
    } else if (r.source === 'connected') {
      rows.push({ network: r.network, line: `C        ${r.network} is directly connected, ${r.interfaceId}` });
    } else if (r.source === 'static') {
      rows.push({ network: r.network, line: `S        ${r.network} [1/0] via ${r.nextHop}` });
    } else if (r.source === 'ospf') {
      rows.push({ network: r.network, line: `O        ${r.network} [110/2] via ${r.nextHop}, 00:10:00, ${r.interfaceId}` });
    }
  }
  rows.sort((a, b) => {
    if (a.network === '0.0.0.0/0') return -1;
    if (b.network === '0.0.0.0/0') return 1;
    return ipToInt(a.network.split('/')[0]) - ipToInt(b.network.split('/')[0]);
  });
  lines.push(...rows.map((r) => r.line));
  return { output: lines, facts: [{ kind: 'route-table-observed', deviceId: device.id }] };
};

export const showIpOspfNeighbor: Handler = (ctx) => {
  const device = ctx.device!;
  const lines: string[] = ['Neighbor ID     Pri   State           Dead Time   Address         Interface'];
  for (const n of device.ospfNeighbors ?? []) {
    const stateWord = n.state === '2way' ? '2WAY/DROTHER' : `${n.state.toUpperCase()}/DR`;
    const link = ctx.world.links.find((l) => ('deviceId' in l.b ? l.a.interfaceId === n.interfaceId || l.b.interfaceId === n.interfaceId : l.a.interfaceId === n.interfaceId));
    let peerIp = '0.0.0.0';
    if (link && 'deviceId' in link.b) {
      const peerSide = link.a.interfaceId === n.interfaceId ? link.b : link.a;
      const peerDevice = ctx.world.devices.find((d) => d.id === peerSide.deviceId);
      const peerIface = peerDevice?.interfaces.find((i) => i.id === peerSide.interfaceId);
      if (peerIface?.ipAddress) peerIp = peerIface.ipAddress;
    }
    lines.push(`${n.neighborId.padEnd(16)}  1   ${stateWord.padEnd(16)}00:00:35    ${peerIp.padEnd(16)}${n.interfaceId}`);
  }
  return { output: lines };
};
