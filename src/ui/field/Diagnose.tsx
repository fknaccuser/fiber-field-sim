import { useState } from 'react';
import { FAULT_TAXONOMY } from '../../world';
import type { FaultTarget, FiberTubeColor } from '../../world';
import type { UiSessionState } from '../../session/runner';
import type { DiagnosisClaim, Intent } from '../../session/types';
import { Chip } from '../components/Chip';
import { SoftKey } from '../components/SoftKey';
import { useViewportState } from '../viewport/viewportStore';

export interface DiagnosePrefill {
  spanId: string;
  positionMeters: number;
}

function labelForAction(index: number, type: string): string {
  return `#${index} ${type}`;
}

function targetLabel(ui: UiSessionState, target: FaultTarget): string {
  switch (target.type) {
    case 'fiber-span':
      return target.spanId;
    case 'site':
      return ui.world.topology.nodes.find((n) => n.id === target.nodeId)?.label ?? target.nodeId;
    case 'device-global':
      return ui.world.devices.find((d) => d.id === target.deviceId)?.hostname ?? target.deviceId;
    case 'device-interface': {
      const device = ui.world.devices.find((d) => d.id === target.deviceId);
      return `${device?.hostname ?? target.deviceId} ${target.interfaceId}`;
    }
  }
}

function TargetPicker({ ui, appliesTo, target, onChange }: { ui: UiSessionState; appliesTo: FaultTarget['type']; target: FaultTarget | null; onChange(t: FaultTarget): void }) {
  if (appliesTo === 'fiber-span') {
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ui.world.topology.spans.map((s) => (
          <Chip key={s.id} active={target?.type === 'fiber-span' && target.spanId === s.id} onClick={() => onChange({ type: 'fiber-span', spanId: s.id })}>
            {s.id}
          </Chip>
        ))}
      </div>
    );
  }
  if (appliesTo === 'site') {
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ui.world.topology.nodes.map((n) => (
          <Chip key={n.id} active={target?.type === 'site' && target.nodeId === n.id} onClick={() => onChange({ type: 'site', nodeId: n.id })}>
            {n.label}
          </Chip>
        ))}
      </div>
    );
  }
  if (appliesTo === 'device-global') {
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ui.world.devices.map((d) => (
          <Chip key={d.id} active={target?.type === 'device-global' && target.deviceId === d.id} onClick={() => onChange({ type: 'device-global', deviceId: d.id })}>
            {d.hostname}
          </Chip>
        ))}
      </div>
    );
  }
  // device-interface
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {ui.world.devices.map((d) => (
        <div key={d.id} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{d.hostname}</span>
          {d.interfaces.map((iface) => (
            <Chip
              key={iface.id}
              active={target?.type === 'device-interface' && target.deviceId === d.id && target.interfaceId === iface.id}
              onClick={() => onChange({ type: 'device-interface', deviceId: d.id, interfaceId: iface.id })}
            >
              {iface.id}
            </Chip>
          ))}
        </div>
      ))}
    </div>
  );
}

export function Diagnose({ ui, dispatch, prefill }: { ui: UiSessionState; dispatch(intent: Intent): void; prefill: DiagnosePrefill | null }) {
  const [search, setSearch] = useState('');
  const [faultKind, setFaultKind] = useState<string | null>(null);
  const [target, setTarget] = useState<FaultTarget | null>(prefill ? { type: 'fiber-span', spanId: prefill.spanId } : null);
  const [positionMeters, setPositionMeters] = useState<number | undefined>(prefill?.positionMeters);
  const [strand, setStrand] = useState<{ tubeColor: FiberTubeColor; fiberColor: FiberTubeColor } | undefined>(undefined);
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [claims, setClaims] = useViewportState<DiagnosisClaim[]>('diagnose.claims', []);
  const [escalate, setEscalate] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');
  const [noFaultInScope, setNoFaultInScope] = useState(false);

  const taxonomy = FAULT_TAXONOMY.filter((f) => f.minTier <= ui.meta.tier && f.label.toLowerCase().includes(search.toLowerCase()));
  const selectedDef = FAULT_TAXONOMY.find((f) => f.id === faultKind) ?? null;
  const targetSpan = target?.type === 'fiber-span' ? ui.world.topology.spans.find((s) => s.id === target.spanId) : undefined;

  const toggleEvidence = (id: string) => setEvidenceIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));

  const addClaim = () => {
    if (!selectedDef || !target) return;
    setClaims((c) => [...c, { faultKind: selectedDef.id, target, positionMeters, strand, evidenceActionIds: evidenceIds }]);
    setFaultKind(null);
    setTarget(null);
    setPositionMeters(undefined);
    setStrand(undefined);
    setEvidenceIds([]);
    setSearch('');
  };

  const submit = () => {
    dispatch({
      type: 'diagnosis',
      diagnosis: {
        claims,
        escalate: escalate ? { reason: escalateReason, evidenceActionIds: evidenceIds } : undefined,
        noFaultInScope: noFaultInScope || undefined,
      },
    });
  };

  const evidenceLog = ui.log.filter((a) => a.type !== 'diagnosis' && a.type !== 'refused');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 8, overflowY: 'auto' }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>Claims so far ({claims.length})</div>
        {claims.map((c, i) => (
          <div key={i} className="bezel" style={{ padding: 8, marginBottom: 6, fontSize: 12 }}>
            {FAULT_TAXONOMY.find((f) => f.id === c.faultKind)?.label ?? c.faultKind} — {targetLabel(ui, c.target)}
            {c.positionMeters !== undefined && ` @${c.positionMeters}m`}
          </div>
        ))}
      </div>

      <div className="bezel" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Add a claim</div>
        <input
          placeholder="Search fault kinds…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minHeight: 40, background: 'var(--panel-2)', border: '1px solid var(--bezel)', borderRadius: 6, color: 'var(--text)', padding: '6px 10px' }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 120, overflowY: 'auto' }}>
          {taxonomy.map((f) => (
            <Chip key={f.id} active={faultKind === f.id} onClick={() => { setFaultKind(f.id); setTarget(null); }}>
              {f.label}
            </Chip>
          ))}
        </div>

        {selectedDef && (
          <>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Target</div>
            <TargetPicker ui={ui} appliesTo={selectedDef.appliesTo} target={target} onChange={setTarget} />

            {target?.type === 'fiber-span' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Position (m){' '}
                  <input
                    type="number"
                    value={positionMeters ?? ''}
                    onChange={(e) => setPositionMeters(e.target.value === '' ? undefined : Number(e.target.value))}
                    style={{ width: 90, minHeight: 32, background: 'var(--panel-2)', border: '1px solid var(--bezel)', borderRadius: 6, color: 'var(--text)', padding: '4px 8px' }}
                  />
                </label>
                {targetSpan?.strands && targetSpan.strands.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {targetSpan.strands.map((s) => (
                      <Chip key={`${s.tubeColor}-${s.fiberColor}`} active={strand?.tubeColor === s.tubeColor && strand?.fiberColor === s.fiberColor} onClick={() => setStrand({ tubeColor: s.tubeColor, fiberColor: s.fiberColor })}>
                        {s.tubeColor}/{s.fiberColor}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Cite evidence</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 100, overflowY: 'auto' }}>
              {evidenceLog.map((a) => (
                <Chip key={a.id} active={evidenceIds.includes(a.id)} onClick={() => toggleEvidence(a.id)}>
                  {labelForAction(a.index, a.type)}
                </Chip>
              ))}
            </div>

            <SoftKey label="Add claim" onClick={addClaim} disabled={!target} />
          </>
        )}
      </div>

      <div className="bezel" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={escalate} onChange={(e) => setEscalate(e.target.checked)} /> Escalate to NOC/IT
        </label>
        {escalate && (
          <textarea
            placeholder="Reason for escalation…"
            value={escalateReason}
            onChange={(e) => setEscalateReason(e.target.value)}
            rows={2}
            style={{ background: 'var(--panel-2)', border: '1px solid var(--bezel)', borderRadius: 6, color: 'var(--text)', padding: 8 }}
          />
        )}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={noFaultInScope} onChange={(e) => setNoFaultInScope(e.target.checked)} /> Nothing wrong in my scope
        </label>
      </div>

      <SoftKey label="Submit diagnosis" onClick={submit} />
    </div>
  );
}
