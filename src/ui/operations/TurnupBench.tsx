/**
 * Turning up equipment in a POP.
 *
 * Four choices, none of them hard, all of them skippable, and every one of them invisible on
 * the day you make it. That is what makes this worth a bench: nothing here will bite you
 * while you are standing in the room, so nothing in the room teaches you.
 *
 * The screen deliberately shows the *source* behind each circuit and the *duct* behind each
 * route, because that is what a technician has to go and find out and it is exactly what a
 * drawing hides. Two breakers in different panels look diverse until somebody traces them
 * back to one transfer switch. Handing that over on the panel is not giving the answer away —
 * finding it is a phone call, and the lesson is that you make the phone call.
 *
 * `judgeTurnup` decides everything. This collects a plan.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createRng, deriveSeed } from '../../world';
import {
  generateTurnupJob,
  headroomA,
  judgeTurnup,
  type Bonding,
  type TurnupPlan,
} from '../../operations/popTurnup';
import { BENCH_DOMAINS, scoreTurnupRun } from '../../operations/benchRecord';
import { getOrCreateTraineeId, saveBenchRun } from '../store/persistence';
import { SoftKey } from '../components/SoftKey';
import { Chip } from '../components/Chip';

const BONDING_LABEL: Record<Bonding, string> = {
  'to-ground-bar': 'To the ground bar',
  'to-rack': 'To the rack',
  none: 'Not bonded',
};

export function TurnupBench() {
  const [seed, setSeed] = useState(() => 1 + Math.floor(Math.random() * 9999));
  const { build } = useMemo(() => generateTurnupJob(seed, createRng(deriveSeed(seed, 'turnup'))), [seed]);

  const [supplyFeeds, setSupplyFeeds] = useState<string[]>([]);
  const [bonding, setBonding] = useState<Bonding>('to-ground-bar');
  const [rackBonded, setRackBonded] = useState(true);
  const [uplinkPaths, setUplinkPaths] = useState<string[]>([]);
  const [labelled, setLabelled] = useState(false);
  const [done, setDone] = useState(false);

  const plan: TurnupPlan = useMemo(
    () => ({ supplyFeeds, bonding, rackBonded, uplinkPaths, labelled }),
    [supplyFeeds, bonding, rackBonded, uplinkPaths, labelled],
  );
  const verdict = useMemo(() => judgeTurnup(build, plan), [build, plan]);
  const started = supplyFeeds.length > 0 || uplinkPaths.length > 0;

  const setSupply = (index: number, feedId: string) =>
    !done && setSupplyFeeds((prev) => {
      const next = [...prev];
      while (next.length < index) next.push('');
      next[index] = feedId;
      return next.filter((v) => v !== '');
    });

  const toggleUplink = (pathId: string) =>
    !done && setUplinkPaths((prev) => (prev.includes(pathId) ? prev.filter((p) => p !== pathId) : [...prev, pathId].slice(-2)));

  const commit = async () => {
    setDone(true);
    const traineeId = await getOrCreateTraineeId();
    await saveBenchRun({
      id: `turnup-${seed}-${Date.now()}`,
      traineeId,
      kind: 'pop-turnup',
      at: new Date().toISOString(),
      seed,
      mistakes: verdict.issues.map((i) => i.code),
      omitted: [],
      // Racking, power, bonding and uplinks is most of a day before anything is configured.
      seconds: 6 * 60 * 60,
      passed: verdict.accepted,
      score: scoreTurnupRun(verdict),
      domains: BENCH_DOMAINS['pop-turnup'],
    });
  };

  const reset = () => {
    setSeed(1 + Math.floor(Math.random() * 9999));
    setSupplyFeeds([]);
    setUplinkPaths([]);
    setBonding('to-ground-bar');
    setRackBonded(true);
    setLabelled(false);
    setDone(false);
  };

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 620, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link to="/" style={{ fontSize: 12, color: 'var(--cyan)' }}>← Board</Link>
        <span className="eyebrow" style={{ color: 'var(--cyan)' }}>POP turn-up</span>
      </div>

      <div className="bezel" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{build.siteLabel}</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>{build.equipmentLabel}</div>
        <div className="mono" style={{ fontSize: 10, letterSpacing: 1.1, color: 'var(--ink-soft)' }}>
          {build.supplies} SUPPLIES · {build.supplyDrawA} A EACH, CONTINUOUS
        </div>
      </div>

      {/* Power. The source column is the whole question. */}
      {Array.from({ length: build.supplies }, (_, i) => (
        <div key={i}>
          <div className="eyebrow" style={{ color: 'var(--cyan)', marginBottom: 6 }}>Supply {i + 1}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {build.feeds.map((f) => {
              const room = headroomA(f);
              const picked = supplyFeeds[i] === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSupply(i, f.id)}
                  style={{
                    minHeight: 46, textAlign: 'left', padding: '8px 11px', borderRadius: 'var(--radius)',
                    border: picked ? '2px solid var(--cyan)' : '1px solid var(--bezel)',
                    background: picked ? 'rgba(0,240,255,0.08)' : 'transparent',
                    color: 'var(--ink)', fontSize: 12,
                    display: 'flex', justifyContent: 'space-between', gap: 10,
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block' }}>{f.label}</span>
                    <span className="mono" style={{ fontSize: 9, letterSpacing: 1, color: 'var(--ink-faint)' }}>
                      SOURCE: {f.source.toUpperCase()}
                    </span>
                  </span>
                  <span className="mono" style={{ flexShrink: 0, fontSize: 10.5, color: room >= build.supplyDrawA ? 'var(--ink-soft)' : 'var(--orange)' }}>
                    {room} A FREE
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Bonding. */}
      <div>
        <div className="eyebrow" style={{ color: 'var(--cyan)', marginBottom: 6 }}>Chassis bond</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(Object.keys(BONDING_LABEL) as Bonding[]).map((b) => (
            <Chip key={b} active={bonding === b} onClick={() => !done && setBonding(b)}>{BONDING_LABEL[b]}</Chip>
          ))}
        </div>
        {bonding === 'to-rack' && (
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <input type="checkbox" checked={rackBonded} onChange={(e) => setRackBonded(e.target.checked)} disabled={done} />
            The rack is itself bonded to the ground bar
          </label>
        )}
      </div>

      {/* Uplinks. The duct column is the same question again, in fibre. */}
      <div>
        <div className="eyebrow" style={{ color: 'var(--cyan)', marginBottom: 6 }}>Uplink routes · pick two</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {build.paths.map((p) => {
            const picked = uplinkPaths.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggleUplink(p.id)}
                style={{
                  minHeight: 44, textAlign: 'left', padding: '8px 11px', borderRadius: 'var(--radius)',
                  border: picked ? '2px solid var(--cyan)' : '1px solid var(--bezel)',
                  background: picked ? 'rgba(0,240,255,0.08)' : 'transparent',
                  color: 'var(--ink)', fontSize: 12,
                }}
              >
                <span style={{ display: 'block' }}>{p.label}</span>
                <span className="mono" style={{ fontSize: 9, letterSpacing: 1, color: 'var(--ink-faint)' }}>
                  RUNS IN: {p.duct.toUpperCase()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={labelled} onChange={(e) => setLabelled(e.target.checked)} disabled={done} />
        Circuits, ports and fibres labelled
      </label>

      <div className={`bezel${verdict.accepted ? '' : ' alert'}`} style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: verdict.notRedundant > 0 ? 'var(--red)' : verdict.accepted ? 'var(--led-ok)' : 'var(--orange)' }}>
          {started ? verdict.summary : 'Nothing landed yet.'}
        </div>
        {started && verdict.issues.map((issue, i) => (
          <div key={i} style={{ borderLeft: `2px solid ${issue.severity === 'not-redundant' ? 'var(--red)' : issue.severity === 'blocking' ? 'var(--orange)' : 'var(--ink-faint)'}`, paddingLeft: 9 }}>
            <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.3, color: issue.severity === 'not-redundant' ? 'var(--red)' : 'var(--ink-soft)' }}>
              {issue.severity.replace(/-/g, ' ').toUpperCase()} · {issue.where.toUpperCase()}
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{issue.detail}</div>
          </div>
        ))}
        {done
          ? <SoftKey label="Next site" tone="cyan" onClick={reset} />
          : <SoftKey label="Hand it over" disabled={!verdict.accepted} onClick={() => void commit()} />}
      </div>
    </div>
  );
}
