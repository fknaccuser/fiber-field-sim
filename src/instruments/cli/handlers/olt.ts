import { deriveOntStatus } from '../network/ontStatus';
import type { Handler, HandlerContext } from './types';

function requirePonPorts(ctx: HandlerContext): string[] | null {
  if (!ctx.device!.ponPorts || ctx.device!.ponPorts.length === 0) return ['% No PON ports on this system'];
  return null;
}

function ontRow(portId: string, ont: { ontId: string; serial: string; provisionedSerial?: string }, status: string, rxAtOntDbm: number | null, rxAtOltDbm: number | null): string {
  const rx = rxAtOntDbm !== null ? rxAtOntDbm.toFixed(2) : '-';
  const oltRx = rxAtOltDbm !== null ? rxAtOltDbm.toFixed(2) : '-';
  return `${ont.ontId.padEnd(14)}${ont.serial.padEnd(14)}${(ont.provisionedSerial ?? '-').padEnd(14)}${status.padEnd(12)}${rx.padEnd(10)}${oltRx.padEnd(14)}${portId}`;
}

export const oltShowOntStatus: Handler = (ctx) => {
  const err = requirePonPorts(ctx);
  if (err) return { output: err };
  const device = ctx.device!;
  const lines = ['ONT ID        Serial        Prov. Serial  Status      Rx (dBm)  OLT Rx (dBm)  PON'];
  const facts: Array<{ kind: 'ont-status-observed'; deviceId: string; ontId: string; status: string }> = [];
  for (const port of device.ponPorts!) {
    for (const ont of port.onts) {
      const result = deriveOntStatus(ctx.world, ctx.profiles.network, device, port, ont);
      lines.push(ontRow(port.id, ont, result.status, result.rxAtOntDbm, result.rxAtOltDbm));
      facts.push({ kind: 'ont-status-observed', deviceId: device.id, ontId: ont.ontId, status: result.status });
    }
  }
  return { output: lines, facts };
};

export const oltShowOntDetail: Handler = (ctx, params) => {
  const err = requirePonPorts(ctx);
  if (err) return { output: err };
  const device = ctx.device!;
  for (const port of device.ponPorts!) {
    const ont = port.onts.find((o) => o.ontId === params.ontId);
    if (!ont) continue;
    const result = deriveOntStatus(ctx.world, ctx.profiles.network, device, port, ont);
    const lines = [
      `ONT: ${ont.ontId}`,
      `  Serial: ${ont.serial}`,
      `  Provisioned Serial: ${ont.provisionedSerial ?? '-'}`,
      `  Status: ${result.status}`,
      `  Rx power: ${result.rxAtOntDbm !== null ? result.rxAtOntDbm.toFixed(2) : '-'} dBm`,
      `  OLT Rx power: ${result.rxAtOltDbm !== null ? result.rxAtOltDbm.toFixed(2) : '-'} dBm`,
      `  PON: ${port.id}`,
    ];
    return { output: lines, facts: [{ kind: 'ont-status-observed', deviceId: device.id, ontId: ont.ontId, status: result.status }] };
  }
  return { output: [`% Unknown ONT ${params.ontId}`] };
};

export const oltShowPonPort: Handler = (ctx) => {
  const err = requirePonPorts(ctx);
  if (err) return { output: err };
  const device = ctx.device!;
  const lines = ['PON      Admin  Oper  ONTs  Online  LOS  Offline'];
  for (const port of device.ponPorts!) {
    const statuses = port.onts.map((o) => deriveOntStatus(ctx.world, ctx.profiles.network, device, port, o).status);
    const online = statuses.filter((s) => s === 'online').length;
    const los = statuses.filter((s) => s === 'los').length;
    const offline = statuses.filter((s) => s === 'offline').length;
    const allLos = port.onts.length > 0 && los === port.onts.length;
    const admin = port.adminStatus === 'up' ? 'up' : 'down';
    const oper = port.adminStatus === 'administratively-down' || allLos ? 'down' : 'up';
    lines.push(`${port.id.padEnd(9)}${admin.padEnd(7)}${oper.padEnd(6)}${String(port.onts.length).padEnd(6)}${String(online).padEnd(8)}${String(los).padEnd(5)}${offline}`);
  }
  return { output: lines };
};

export const oltShowPonInterface: Handler = (ctx, params) => {
  const err = requirePonPorts(ctx);
  if (err) return { output: err };
  const device = ctx.device!;
  const port = device.ponPorts!.find((p) => p.id === params.id);
  if (!port) return { output: [`% Invalid interface ${params.id}`] };
  const network = ctx.profiles.network;
  const lines = [
    `PON interface ${port.id}`,
    `  Admin status: ${port.adminStatus}`,
    `  Tx power: ${network.oltTxPowerDbm} dBm`,
    `  Wavelength plan: ${network.wavelengths.serviceDownstreamNm}/${network.wavelengths.serviceUpstreamNm} nm`,
    '',
    'ONT ID        Serial        Prov. Serial  Status      Rx (dBm)  OLT Rx (dBm)  PON',
  ];
  for (const ont of port.onts) {
    const result = deriveOntStatus(ctx.world, network, device, port, ont);
    lines.push(ontRow(port.id, ont, result.status, result.rxAtOntDbm, result.rxAtOltDbm));
  }
  return { output: lines };
};

export const oltShowAlarms: Handler = (ctx) => {
  const err = requirePonPorts(ctx);
  if (err) return { output: err };
  const device = ctx.device!;
  const network = ctx.profiles.network;
  const lines: string[] = [];
  for (const port of device.ponPorts!) {
    for (const ont of port.onts) {
      const result = deriveOntStatus(ctx.world, network, device, port, ont);
      if (result.status === 'los') lines.push(`LOS ont ${ont.ontId}`);
      if (result.status === 'offline') lines.push(`DYING-GASP ont ${ont.ontId}`);
      if (result.status === 'serial-mismatch') lines.push(`SERIAL-MISMATCH ont ${ont.ontId}`);
      if (result.status === 'rogue') lines.push(`ROGUE-ONT pon ${port.id} suspect ${ont.ontId}`);
      if (result.rxAtOntDbm !== null && result.rxAtOntDbm > network.receivePower.maxDbm) lines.push(`RX-HIGH ont ${ont.ontId}`);
    }
  }
  if (lines.length === 0) lines.push('No active alarms.');
  return { output: lines };
};
