import type { Endpoint } from '../../instruments/cli';
import { deviceLocationNodeId } from '../../session/location';
import type { UiSessionState } from '../../session/runner';
import type { WorldState } from '../../world';
import { Chip } from '../components/Chip';

export function EndpointPicker({ ui, endpoint, onChange }: { ui: UiSessionState; endpoint: Endpoint | null; onChange(endpoint: Endpoint): void }) {
  const world = ui.world as WorldState; // topology/devices/hosts only -- see OtdrPanel's note on this cast.
  const devices = world.devices.filter((d) => ui.meta.remoteCliAccess || deviceLocationNodeId(world, d.id) === ui.locationNodeId);
  const hosts = world.hosts.filter((h) => ui.meta.remoteHostAccess || h.premiseNodeId === ui.locationNodeId);

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 0' }}>
      {devices.map((d) => {
        const active = endpoint?.kind === 'device' && endpoint.deviceId === d.id;
        return (
          <Chip key={d.id} active={active} onClick={() => onChange({ kind: 'device', deviceId: d.id })}>
            {d.hostname}
          </Chip>
        );
      })}
      {hosts.map((h) => {
        const active = endpoint?.kind === 'host' && endpoint.hostId === h.id;
        return (
          <Chip key={h.id} active={active} onClick={() => onChange({ kind: 'host', hostId: h.id })}>
            {h.label}
          </Chip>
        );
      })}
      {devices.length === 0 && hosts.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Nothing reachable from here.</span>}
    </div>
  );
}
