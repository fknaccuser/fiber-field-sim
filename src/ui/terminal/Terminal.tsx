import { useState } from 'react';
import { promptFor } from '../../instruments/cli';
import type { CliSession, Endpoint } from '../../instruments/cli';
import type { UiActionEvent, UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import type { WorldState } from '../../world';
import { EndpointPicker } from './EndpointPicker';
import { TokenChips } from './TokenChips';

function endpointKey(endpoint: Endpoint): string {
  return endpoint.kind === 'device' ? `device:${endpoint.deviceId}` : `host:${endpoint.hostId}`;
}

function endpointsEqual(a: Endpoint, b: Endpoint | null): boolean {
  if (!b || a.kind !== b.kind) return false;
  return a.kind === 'device' && b.kind === 'device' ? a.deviceId === b.deviceId : a.kind === 'host' && b.kind === 'host' ? a.hostId === b.hostId : false;
}

export function Terminal({ ui, dispatch }: { ui: UiSessionState; dispatch(intent: Intent): void }) {
  const [endpoint, setEndpoint] = useState<Endpoint | null>(null);
  const [input, setInput] = useState('');

  const world = ui.world as WorldState;
  const session: CliSession = endpoint ? ui.cliSessions[endpointKey(endpoint)] ?? { endpoint, mode: 'user-exec' } : null!;
  const prompt = endpoint ? promptFor(ui.profiles, world, session) : '';

  const history = ui.log.filter((a): a is Extract<UiActionEvent, { type: 'cli' }> => a.type === 'cli' && endpointsEqual(a.endpoint, endpoint));

  const submit = () => {
    if (!endpoint || input.trim().length === 0) return;
    dispatch({ type: 'cli', endpoint, command: input });
    setInput('');
  };

  const appendToken = (token: string) => {
    setInput((current) => (current.length > 0 && !current.endsWith(' ') ? `${current} ${token} ` : `${current}${token} `));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', minHeight: 0, padding: 8 }}>
      <EndpointPicker ui={ui} endpoint={endpoint} onChange={(e) => { setEndpoint(e); setInput(''); }} />
      {endpoint && (
        <>
          <pre className="mono bezel" style={{ flex: 1, minHeight: 0, overflowY: 'auto', margin: 0, padding: 10, fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {history.map((a) => {
              const lines = ui.blobs[a.outputRef];
              const outputLines = Array.isArray(lines) ? lines : [];
              return `> ${a.command}\n${outputLines.join('\n')}\n`;
            })}
          </pre>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className="mono" style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
              {prompt}
            </span>
            <input
              className="mono"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              style={{ flex: 1, minHeight: 40, background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--bezel)', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <TokenChips ui={ui} session={session} input={input} onAppend={appendToken} onQuestionMark={() => setInput((i) => `${i}?`)} />
        </>
      )}
    </div>
  );
}
