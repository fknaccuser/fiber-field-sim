import { logTimestamp } from '../format';
import type { Handler } from './types';

function cidrToWildcard(cidr: string): string {
  const [ip, prefixStr] = cidr.split('/');
  const prefix = Number(prefixStr);
  const maskBits = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const wildcardBits = ~maskBits >>> 0;
  const octets = [(wildcardBits >>> 24) & 255, (wildcardBits >>> 16) & 255, (wildcardBits >>> 8) & 255, wildcardBits & 255];
  return `${ip} ${octets.join('.')}`;
}

export const showRunningConfig: Handler = (ctx) => {
  const device = ctx.device!;
  const body: string[] = [];
  body.push('!');
  if (ctx.vendorProfile.osVersionLine) body.push(ctx.vendorProfile.osVersionLine, '!');
  body.push(`hostname ${device.hostname}`, '!');

  for (const vlan of device.vlans) {
    if (vlan.id === 1) continue;
    body.push(`vlan ${vlan.id}`, ` name ${vlan.name}`, '!');
  }

  for (const iface of device.interfaces) {
    body.push(`interface ${iface.id}`);
    if (iface.description) body.push(` description ${iface.description}`);
    const isPhysical = !iface.id.startsWith('Vlan');
    if (isPhysical) body.push(` switchport mode ${iface.mode}`);
    if (iface.mode === 'access' && iface.accessVlan != null && iface.accessVlan !== 1) {
      body.push(` switchport access vlan ${iface.accessVlan}`);
    }
    if (iface.mode === 'trunk') {
      if (iface.nativeVlan != null && iface.nativeVlan !== 1) body.push(` switchport trunk native vlan ${iface.nativeVlan}`);
      if (iface.allowedVlans) body.push(` switchport trunk allowed vlan ${iface.allowedVlans.join(',')}`);
    }
    if (iface.portSecurity?.enabled) {
      body.push(` switchport port-security maximum ${iface.portSecurity.maxMac}`, ` switchport port-security`);
    }
    if (iface.duplex !== 'auto') body.push(` duplex ${iface.duplex}`, ` speed ${iface.speedMbps}`);
    if (iface.ipAddress && iface.prefixLength != null) {
      body.push(` ip address ${iface.ipAddress} ${prefixToDottedMask(iface.prefixLength)}`);
    }
    if (iface.id.startsWith('Vlan')) {
      const vlanNum = Number(iface.id.replace('Vlan', ''));
      const dhcp = device.dhcp?.find((d) => d.vlan === vlanNum);
      for (const helper of dhcp?.helperAddresses ?? []) body.push(` ip helper-address ${helper}`);
    }
    if (iface.adminStatus === 'administratively-down') body.push(' shutdown');
    body.push('!');
  }

  for (const route of device.routeTable) {
    const [network, prefixStr] = route.network.split('/');
    const mask = prefixToDottedMask(Number(prefixStr));
    body.push(`ip route ${network} ${mask} ${route.nextHop}`);
  }
  body.push('!');

  for (const acl of device.acls ?? []) {
    body.push(`ip access-list extended ${acl.id}`);
    if (acl.match) {
      body.push(` ${acl.action} ${acl.match.protocol} ${cidrToWildcard(acl.match.srcCidr)} ${cidrToWildcard(acl.match.dstCidr)}`);
    }
    body.push('!');
  }

  for (const line of device.runningConfigLines ?? []) body.push(line);
  if (device.runningConfigLines?.length) body.push('!');
  body.push('end');

  const bytes = body.join('\n').length;
  const output = ['Building configuration...', '', `Current configuration : ${bytes} bytes`, ...body];
  return { output, simulatedSeconds: 30, facts: [{ kind: 'route-table-observed', deviceId: device.id }, { kind: 'vlan-table-observed', deviceId: device.id }] };
};

function prefixToDottedMask(prefixLength: number): string {
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return [(mask >>> 24) & 255, (mask >>> 16) & 255, (mask >>> 8) & 255, mask & 255].join('.');
}

export const showLogging: Handler = (ctx) => {
  const device = ctx.device!;
  const logLines = device.logLines ?? [];
  const output: string[] = [
    `Syslog logging: enabled (0 messages dropped, 0 messages rate-limited, 0 flushes, 0 overruns, xml disabled, filtering disabled)`,
    `    Console logging: level debugging, ${logLines.length} messages logged, xml disabled, filtering disabled`,
    `    Buffer logging:  level debugging, ${logLines.length} messages logged, xml disabled, filtering disabled`,
    '',
    'Log Buffer (8192 bytes):',
    '',
  ];
  logLines.forEach((line, i) => output.push(`${logTimestamp(i)}${line}`));
  return { output, facts: [{ kind: 'log-observed', deviceId: device.id }] };
};
