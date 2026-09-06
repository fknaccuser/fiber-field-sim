import type { InterfaceState } from '../../../world';
import { abbrev, adminOrLineStatusWord, counterFromSeed, isErrDisabled, macFromSeed, resolveInterfaceId, type InterfaceFamily } from '../format';
import type { Handler } from './types';

export const showIpInterfaceBrief: Handler = (ctx) => {
  const device = ctx.device!;
  const lines: string[] = ['Interface              IP-Address      OK? Method Status                Protocol'];
  for (const iface of device.interfaces) {
    const ip = iface.ipAddress ?? 'unassigned';
    const method = iface.ipAddress ? 'manual' : 'unset';
    const { status, protocol } = adminOrLineStatusWord(iface);
    const statusWord = isErrDisabled(iface) ? 'err-disabled' : status;
    lines.push(`${iface.id.padEnd(23)}${ip.padEnd(16)}YES ${method.padEnd(7)}${statusWord.padEnd(22)}${protocol}`);
  }
  return { output: lines };
};

function statusColumn(iface: InterfaceState): string {
  if (isErrDisabled(iface)) return 'err-disabled';
  if (iface.adminStatus === 'administratively-down') return 'disabled';
  if (iface.lineStatus === 'up') return 'connected';
  return 'notconnect';
}

function vlanColumn(iface: InterfaceState): string {
  if (iface.ipAddress) return 'routed';
  if (iface.mode === 'trunk') return 'trunk';
  return String(iface.accessVlan ?? 1);
}

function duplexColumn(iface: InterfaceState, connected: boolean): string {
  if (iface.duplex === 'auto') return connected ? 'a-full' : 'auto';
  return iface.duplex;
}

function speedColumn(iface: InterfaceState, connected: boolean): string {
  if (iface.duplex === 'auto') return connected ? `a-${iface.speedMbps}` : 'auto';
  return String(iface.speedMbps);
}

export const showInterfacesStatus: Handler = (ctx) => {
  const device = ctx.device!;
  const families = ctx.vendorProfile.interfaceFamilies;
  const lines: string[] = ['Port      Name               Status       Vlan       Duplex  Speed Type'];
  for (const iface of device.interfaces) {
    if (families.some((f) => f.prefix === 'Vlan') && iface.id.startsWith('Vlan')) continue; // physical interfaces only
    const connected = iface.lineStatus === 'up';
    lines.push(
      `${abbrev(iface.id, families).padEnd(10)}${(iface.description ?? '').padEnd(19)}${statusColumn(iface).padEnd(13)}${vlanColumn(iface).padEnd(11)}${duplexColumn(iface, connected).padEnd(8)}${speedColumn(iface, connected).padEnd(6)} ${typeLabelFor(iface, families)}`,
    );
  }
  return { output: lines };
};

function typeLabelFor(iface: InterfaceState, families: readonly { prefix: string; typeLabel: string }[]): string {
  return families.find((f) => iface.id.startsWith(f.prefix))?.typeLabel ?? '';
}

export const showInterfaceDetail: Handler = (ctx, params) => {
  const device = ctx.device!;
  const families = ctx.vendorProfile.interfaceFamilies;
  const resolvedId = resolveInterfaceId(params.id, device.interfaces.map((i) => i.id), families);
  if (!resolvedId) {
    return { output: [`% Invalid input detected at '^' marker.`] };
  }
  const iface = device.interfaces.find((i) => i.id === resolvedId)!;
  const family = families.find((f) => resolvedId.startsWith(f.prefix));
  const bandwidthKbit = family?.bandwidthKbit ?? 1000000;
  const typeLabel = family?.typeLabel ?? 'Unknown';
  const mac = iface.macAddress ?? macFromSeed(ctx.world.seed, device.id, iface.id);
  const counters = counterFromSeed(ctx.world.seed, device.id, iface.id, iface);
  const errDisabled = isErrDisabled(iface);
  const lineWord = iface.adminStatus === 'administratively-down' ? 'administratively down' : iface.lineStatus;
  const protoSuffix = iface.lineStatus === 'up' ? ' (connected)' : errDisabled ? ' (err-disabled)' : ' (notconnect)';

  const lines: string[] = [];
  lines.push(`${iface.id} is ${lineWord}, line protocol is ${iface.lineStatus}${protoSuffix}`);
  lines.push(`  Hardware is ${typeLabel}, address is ${mac} (bia ${mac})`);
  if (iface.description) lines.push(`  Description: ${iface.description}`);
  if (iface.ipAddress) lines.push(`  Internet address is ${iface.ipAddress}/${iface.prefixLength}`);
  lines.push(`  MTU ${iface.mtu ?? 1500} bytes, BW ${bandwidthKbit} Kbit/sec, DLY 10 usec,`);
  lines.push(`     reliability 255/255, txload 1/255, rxload 1/255`);
  lines.push(`  Encapsulation ARPA, loopback not set`);
  lines.push(`  Keepalive set (10 sec)`);
  const duplexWord = iface.duplex === 'auto' ? 'Auto' : iface.duplex === 'full' ? 'Full' : 'Half';
  lines.push(`  ${duplexWord}-duplex, ${iface.speedMbps}Mb/s, media type is ${typeLabel}`);
  lines.push(`  input flow-control is off, output flow-control is unsupported`);
  lines.push(`  Last input 00:00:01, output 00:00:00, output hang never`);
  lines.push(`  Last clearing of "show interface" counters never`);
  lines.push(`  Input queue: 0/75/0/0 (size/max/drops/flushes); Total output drops: 0`);
  lines.push(`  5 minute input rate 1000 bits/sec, 2 packets/sec`);
  lines.push(`  5 minute output rate 1000 bits/sec, 2 packets/sec`);
  lines.push(`     ${counters.packetsIn} packets input, ${counters.bytesIn} bytes, 0 no buffer`);
  lines.push(`     Received 0 broadcasts (0 multicasts)`);
  lines.push(`     0 runts, 0 giants, 0 throttles`);
  lines.push(`     ${counters.crcErrors} input errors, ${counters.crcErrors} CRC, 0 frame, 0 overrun, 0 ignored`);
  lines.push(`     0 watchdog, 0 multicast, 0 pause input`);
  lines.push(`     ${counters.packetsOut} packets output, ${counters.bytesOut} bytes, 0 underruns`);
  lines.push(`     0 output errors, ${counters.lateCollisions} collisions, 0 interface resets`);
  lines.push(`     0 unknown protocol drops`);
  lines.push(`     0 babbles, ${counters.lateCollisions} late collision, 0 deferred`);
  lines.push(`     0 lost carrier, 0 no carrier, 0 pause output`);
  lines.push(`     0 output buffer failures, 0 output buffers swapped out`);

  return { output: lines, facts: [{ kind: 'interface-observed', deviceId: device.id, interfaceId: iface.id }] };
};

const TRANSCEIVER_HEADER = [
  'Transceiver monitoring is enabled for all interfaces.',
  '',
  'mA: milliamps, dBm: decibels (milliwatts), NA or N/A: not applicable.',
  '++ : high alarm, +  : high warning, -- : low alarm, - : low warning.',
  'A2D readouts (if they differ), are reported in parentheses.',
  'The threshold values are calibrated.',
  '',
];

function thresholdFlag(value: number | undefined, thresholds: readonly [number, number, number, number]): string {
  if (value === undefined) return '';
  const [highAlarm, highWarn, lowWarn, lowAlarm] = thresholds;
  if (value > highAlarm) return '++';
  if (value > highWarn) return '+';
  if (value < lowAlarm) return '--';
  if (value < lowWarn) return '-';
  return '';
}

function block(
  title: string,
  unit: string,
  device: { id: string },
  interfaces: InterfaceState[],
  families: readonly InterfaceFamily[],
  thresholds: readonly [number, number, number, number] | undefined,
  valueOf: (iface: InterfaceState) => number | undefined,
): { lines: string[]; facts: { kind: 'transceiver-observed'; deviceId: string; interfaceId: string; rxPowerDbm: number | null }[] } {
  const lines: string[] = [];
  const facts: { kind: 'transceiver-observed'; deviceId: string; interfaceId: string; rxPowerDbm: number | null }[] = [];
  lines.push(`                              High Alarm  High Warn  Low Warn   Low Alarm`);
  lines.push(`           ${title}`);
  lines.push(`Port       (${unit})     Threshold   Threshold  Threshold  Threshold`);
  lines.push(`---------  -----------------  ----------  ---------  ---------  ---------`);
  for (const iface of interfaces) {
    if (!iface.transceiver?.present) continue;
    const value = valueOf(iface);
    const [t0, t1, t2, t3] = thresholds ?? [0, 0, 0, 0];
    const flag = thresholds ? thresholdFlag(value, thresholds) : '';
    const valueStr = value === undefined ? 'N/A' : value.toFixed(1);
    lines.push(`${abbrev(iface.id, families).padEnd(11)}${valueStr.padStart(6)} ${flag.padEnd(2)}${t0.toFixed(1).padStart(12)}${t1.toFixed(1).padStart(11)}${t2.toFixed(1).padStart(11)}${t3.toFixed(1).padStart(11)}`);
    if (title.includes('Receive')) facts.push({ kind: 'transceiver-observed', deviceId: device.id, interfaceId: iface.id, rxPowerDbm: value ?? null });
  }
  return { lines, facts };
}

export const showTransceiverDetail: Handler = (ctx) => {
  const device = ctx.device!;
  const families = ctx.vendorProfile.interfaceFamilies;
  const th = ctx.vendorProfile.transceiverThresholds;
  const output = [...TRANSCEIVER_HEADER];
  const temp = block('Temperature', 'Celsius', device, device.interfaces, families, th?.temperatureC, (i) => i.transceiver?.temperatureC);
  const tx = block('Optical Transmit Power', 'dBm', device, device.interfaces, families, th?.txDbm, (i) => i.transceiver?.txPowerDbm);
  const rx = block('Optical Receive Power', 'dBm', device, device.interfaces, families, th?.rxDbm, (i) => i.transceiver?.rxPowerDbm);
  output.push(...temp.lines, '', ...tx.lines, '', ...rx.lines);
  return { output, facts: rx.facts };
};
