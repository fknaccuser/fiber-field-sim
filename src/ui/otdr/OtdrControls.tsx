import type { ReactNode } from 'react';
import type { InstrumentProfile, NetworkProfile } from '../../profiles';
import type { OtdrSettings } from '../../instruments/otdr';
import { Chip } from '../components/Chip';

const RANGE_PRESETS_KM = [1, 2.5, 5, 10, 20, 40];

function wavelengthKey(nm: number): '1310' | '1550' | '1625' {
  return nm <= 1400 ? '1310' : nm <= 1600 ? '1550' : '1625';
}

function launchCableOptionsFrom(truckInventory: string[]): number[] {
  const meters = truckInventory
    .map((item) => /^launch-cable-(\d+)m$/.exec(item))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]));
  return [0, ...Array.from(new Set(meters)).sort((a, b) => a - b)];
}

export function OtdrControls({
  network,
  instrument,
  truckInventory,
  settings,
  onChange,
}: {
  network: NetworkProfile;
  instrument: InstrumentProfile;
  truckInventory: string[];
  settings: OtdrSettings;
  onChange(next: OtdrSettings): void;
}) {
  const wavelengths = Array.from(new Set([...network.wavelengths.otdrTestWavelengthsNm, ...instrument.liveTestOutOfBandNm])).sort((a, b) => a - b);
  const oobSet = new Set(instrument.liveTestOutOfBandNm);
  const pulseWidths = network.otdrPulseWidthsNs.filter((ns) => ns >= instrument.pulseWidthsNsRange.minNs && ns <= instrument.pulseWidthsNsRange.maxNs);
  const launchCableOptions = launchCableOptionsFrom(truckInventory);

  const set = (patch: Partial<OtdrSettings>) => onChange({ ...settings, ...patch });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row label="λ">
        {wavelengths.map((nm) => (
          <Chip key={nm} active={settings.wavelengthNm === nm} onClick={() => set({ wavelengthNm: nm, iorSetting: network.iorDefault[wavelengthKey(nm)] ?? settings.iorSetting })}>
            {nm}
            {oobSet.has(nm) ? ' (OOB)' : ''}
          </Chip>
        ))}
      </Row>
      <Row label="Pulse">
        {pulseWidths.map((ns) => (
          <Chip key={ns} active={settings.pulseWidthNs === ns} onClick={() => set({ pulseWidthNs: ns })}>
            {ns} ns
          </Chip>
        ))}
      </Row>
      <Row label="Range">
        {RANGE_PRESETS_KM.map((km) => (
          <Chip key={km} active={settings.rangeMeters === km * 1000} onClick={() => set({ rangeMeters: km * 1000 })}>
            {km} km
          </Chip>
        ))}
      </Row>
      <Row label="Avg">
        {instrument.averagingSecondsOptions.map((s) => (
          <Chip key={s} active={settings.averagingSeconds === s} onClick={() => set({ averagingSeconds: s })}>
            {s} s
          </Chip>
        ))}
      </Row>
      <Row label="Launch cable">
        {launchCableOptions.map((m) => (
          <Chip key={m} active={settings.launchCableMeters === m} onClick={() => set({ launchCableMeters: m })}>
            {m} m
          </Chip>
        ))}
      </Row>
      <Row label="IOR">
        <input
          type="number"
          step="0.0001"
          value={settings.iorSetting}
          onChange={(e) => set({ iorSetting: Number(e.target.value) })}
          style={{ width: 84, minHeight: 32, background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--bezel)', borderRadius: 6, padding: '4px 8px' }}
        />
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, color: 'var(--muted)', width: 72, flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{children}</div>
    </div>
  );
}
