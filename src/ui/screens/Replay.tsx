import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getSession, type StoredSession } from '../store/persistence';
import { AxisGauge } from '../components/AxisGauge';

const CLASSIFICATION_COLOR: Record<string, string> = {
  'on-path': 'var(--led-ok)',
  useful: 'var(--cursor-b)',
  redundant: 'var(--muted)',
  unnecessary: 'var(--led-warn)',
  violation: 'var(--led-alarm)',
  refused: 'var(--muted)',
};

function ReplayView({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<StoredSession | null | undefined>(undefined);

  useEffect(() => {
    void getSession(sessionId).then((s) => setSession(s ?? null));
  }, [sessionId]);

  if (session === undefined) return <div style={{ padding: 16, color: 'var(--muted)' }}>Loading…</div>;
  if (session === null || !session.report) return <div style={{ padding: 16, color: 'var(--muted)' }}>Session not found or not yet scored.</div>;

  const { report } = session;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16, flex: 1, minWidth: 280 }}>
      <div>
        <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>{session.scenarioId}</h2>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Seed {session.seed} · ended by {report.endedBy} {report.overBudget && '· over budget'} {report.beatReference && '· beat reference'}
        </div>
      </div>

      <div className="bezel" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 700, textAlign: 'center' }}>{Math.round(report.total)}</div>
        {(Object.keys(report.axes) as Array<keyof typeof report.axes>).map((axis) => (
          <AxisGauge key={axis} label={axis} value={report.axes[axis].score} detail={report.axes[axis].details.join(' ')} />
        ))}
      </div>

      <div className="bezel" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Decision replay</div>
        {report.replay.summary.map((line, i) => (
          <p key={i} style={{ margin: 0, fontSize: 13 }}>
            {line}
          </p>
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          {report.replay.steps.map((step) => (
            <div
              key={step.actionId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                borderLeft: `3px solid ${CLASSIFICATION_COLOR[step.classification] ?? 'var(--muted)'}`,
                padding: '4px 8px',
                background: step.index === report.replay.divergenceIndex ? 'var(--panel-2)' : 'transparent',
              }}
            >
              <span>{step.label}</span>
              <span style={{ color: 'var(--muted)' }}>{step.classification}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Replay() {
  const params = useParams<{ sessionId?: string; a?: string; b?: string }>();
  if (params.a && params.b) {
    return (
      <div style={{ display: 'flex', gap: 0, height: '100%', overflowY: 'auto' }}>
        <ReplayView sessionId={params.a} />
        <ReplayView sessionId={params.b} />
      </div>
    );
  }
  if (!params.sessionId) return <div style={{ padding: 16 }}>No session specified.</div>;
  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <ReplayView sessionId={params.sessionId} />
    </div>
  );
}
