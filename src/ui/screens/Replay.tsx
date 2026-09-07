import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { listSessions, type StoredSession } from '../store/persistence';
import { loadDebriefSession, useSessionStore } from '../store/sessionStore';
import { competencyMap, type CompetencyDomain } from '../store/progress';
import type { ScoreReport, AxisName } from '../../scoring/types';
import './debrief.css';

const AXES: Record<AxisName, string> = { diagnosticAccuracy: 'Diagnostic accuracy', evidenceQuality: 'Evidence quality', efficiency: 'Efficiency', customerImpact: 'Customer impact', safetyCompliance: 'Safety & compliance' };
const VERDICTS = { correct: 'Diagnosis confirmed', partial: 'Partially correct', incorrect: 'Diagnosis needs review', escalated: 'Appropriate escalation' };
function duration(seconds: number) { return seconds < 60 ? `${Math.round(seconds)}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`; }

function Debrief({ report, sessionId, seed, weakest }: { report: ScoreReport; sessionId: string; seed: number; weakest?: CompetencyDomain }) {
  const lesson = report.debrief;
  const actionLink = (id: string) => <a key={id} className="evidence-link" href={`#${sessionId}-${id}`}>{id} · {report.replay.steps.find((step) => step.actionId === id)?.label ?? 'Recorded observation'}</a>;
  const missing = lesson?.walkthrough.filter((step) => !step.matchedActionId) ?? [];
  return <article className="debrief">
    <header className="debrief-header"><div className="debrief-eyebrow">FIELD REPORT / TIER REVIEW / SEED {seed}</div><h1>{lesson?.title ?? 'Session review'}</h1><p>Your decision, the evidence, and the next thing to practise.</p></header>
    {lesson && <>
      <section className="debrief-panel" aria-label="Diagnosis verdict">
        <div className="debrief-section-label">01 / THE VERDICT</div><span className={`debrief-badge ${lesson.verdict}`}>{VERDICTS[lesson.verdict]}</span><h2>{lesson.verdictText}</h2>
        <div className="debrief-columns"><div><h3>What was happening</h3>{lesson.faults.length === 0 && <p>No fault was present in scope.</p>}{lesson.faults.map((fault) => <div className="debrief-fault" key={fault.id}><strong>{fault.label}</strong><p className="debrief-location">{fault.location}{fault.detail && ` · ${fault.detail}`}</p><p>{fault.description}</p>{fault.outOfScope && <span className="debrief-badge">Outside your repair scope</span>}</div>)}</div>
          <div className="debrief-claim"><h3>Your submission</h3>{lesson.claims.map((claim, index) => <div key={index}><strong>{claim.correct ? '✓ ' : '↳ '}{claim.label}</strong><p>{claim.location}{claim.detail && ` · ${claim.detail}`}</p></div>)}{lesson.noFaultClaim && <p>You reported no fault in scope.</p>}{lesson.escalation && <p>Escalation: {lesson.escalation}</p>}{lesson.claims.length === 0 && !lesson.noFaultClaim && !lesson.escalation && <p>No specific diagnosis was submitted.</p>}</div></div>
      </section>
      <section className="debrief-panel" aria-label="Reference walkthrough"><div className="debrief-section-label">02 / A REFERENCE PATH</div><h2>Ask the question. Then make the measurement.</h2><p>One defensible route through this ticket. A different sequence can be productive.</p>
        <ol className="debrief-walkthrough">{lesson.walkthrough.map((step) => <li key={step.index}><span className="debrief-step-number">{String(step.index + 1).padStart(2, '0')}</span><div><div className="debrief-step-heading"><h3>{step.title}</h3><span className="debrief-time">{duration(step.seconds)}</span></div><p>{step.why}</p><span className={`debrief-badge ${step.matchedActionId ? 'correct' : ''}`}>{step.matchedActionId ? `Completed · ${step.matchedActionId}` : 'Not observed in your run'}</span></div></li>)}</ol>
        <div className="debrief-total-time">Reference time <strong>{duration(lesson.walkthrough.reduce((sum, step) => sum + step.seconds, 0))}</strong></div>
      </section>
    </>}
    <section className="debrief-panel" aria-label="Your actions compared"><div className="debrief-section-label">03 / YOUR ROUTE</div><h2>What your checks contributed</h2>{report.replay.summary.map((line, i) => <p key={i}>{line}</p>)}
      <p className="debrief-legend">Reference = an equivalent check · Useful = additional evidence · Redundant = repeated work · Unnecessary = no supporting evidence</p>
      <ol className="debrief-actions">{report.replay.steps.map((step) => <li id={`${sessionId}-${step.actionId}`} key={step.actionId} className={`action-${step.classification}`}><div className="debrief-action-meta"><span>{step.actionId}</span><span>+{duration(step.atSimSeconds)} · {duration(step.durationSeconds)}</span></div><div className="debrief-step-heading"><strong>{step.label}</strong><span className="debrief-badge">{step.classification === 'on-path' ? 'Reference' : step.classification === 'useful' ? 'Useful divergence' : step.classification}</span></div>{step.revealed.length > 0 && <p>{step.revealed.join(' · ')}</p>}</li>)}</ol>
      {missing.length > 0 && <div className="debrief-callout"><h3>Reference checks you did not make</h3><ul>{missing.map((step) => <li key={step.index}>{step.title}</li>)}</ul><p>These are comparison points. Equivalent evidence can still support a correct conclusion.</p></div>}
    </section>
    {lesson && <section className="debrief-panel" aria-label="Evidence review"><div className="debrief-section-label">04 / PROOF, NOT JUST A CONCLUSION</div><h2>Collected versus cited</h2>{lesson.evidence.length === 0 && <p>No fault required a fault-specific evidence rule.</p>}{lesson.evidence.map((entry) => <div className="debrief-evidence" key={entry.faultId}><div className="debrief-step-heading"><h3>{entry.label}</h3><span className={`debrief-badge ${entry.status === 'cited' ? 'correct' : ''}`}>{entry.status === 'cited' ? 'Supported & cited' : entry.status === 'uncited' ? 'Observed, citations incomplete' : entry.status === 'partial' ? 'Partial evidence' : 'Evidence missing'}</span></div><p>{entry.explanation}</p><div className="debrief-columns"><div><h4>Supporting observations</h4>{entry.supportingActionIds.length ? entry.supportingActionIds.map(actionLink) : <p>None sufficient in this run.</p>}</div><div><h4>Cited for this conclusion</h4>{entry.citedActionIds.length ? entry.citedActionIds.map(actionLink) : <p>No citations tied to a matching claim.</p>}</div></div></div>)}</section>}
    <section className="debrief-panel" aria-label="Scores and practice"><div className="debrief-section-label">05 / YOUR NEXT REP</div><div className="debrief-score-heading"><h2>Five skills. One field decision.</h2><div className="debrief-score">{Math.round(report.total)}<small>/ 100</small></div></div>
      <div className="debrief-axes">{(Object.keys(AXES) as AxisName[]).map((axis) => <div key={axis}><div className="debrief-step-heading"><h3>{AXES[axis]}</h3><strong>{Math.round(report.axes[axis].score)}</strong></div><progress value={report.axes[axis].score} max={100} aria-label={AXES[axis]} /><p>{report.axes[axis].details.join(' ')}</p></div>)}</div>
      <div className="debrief-callout"><h3>Keep practising</h3><p>{lesson?.practice ?? 'Review the observations supporting each claim.'}</p>{weakest && <p>Your lowest recent domain is <strong>{weakest.domain}</strong>: {Math.round(weakest.accuracy)} accuracy / {Math.round(weakest.evidence)} evidence across {weakest.sessionCount} {weakest.sessionCount === 1 ? 'session' : 'sessions'}.</p>}<Link to="/scenarios" className="debrief-primary">Choose a practice ticket ↗</Link><Link to="/" className="debrief-secondary">Return home</Link></div>
    </section>
  </article>;
}

function ReplayView({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<StoredSession | null | undefined>();
  const [weakest, setWeakest] = useState<CompetencyDomain>();
  const [error, setError] = useState(false);
  const store = useSessionStore();
  const location = useLocation();
  const liveReport = store.sessionId === sessionId && store.lastResult?.type === 'diagnosis' ? store.lastResult.report : null;
  useEffect(() => {
    let active = true;
    void loadDebriefSession(sessionId).then((row) => { if (active) setSession(row ?? null); }).catch(() => { if (active) setError(true); });
    void listSessions().then((rows) => { if (active) setWeakest(competencyMap(rows)[0]); }).catch(() => { /* History is optional for the debrief. */ });
    return () => { active = false; };
  }, [sessionId]);
  const report = session?.report ?? liveReport;
  if (!report) return <div className="debrief"><p role="status">{error ? 'This report could not be loaded. Your saved session has not been changed.' : session === undefined ? 'Loading your field report…' : 'Session not found or not yet scored.'}</p><Link to="/">Return home</Link></div>;
  return <div>{(error || location.state?.saveFailed) && <p role="alert" className="debrief-storage-error">Browser storage is unavailable. This report is available in this tab, but may not survive a reload.</p>}<Debrief report={report} sessionId={sessionId} seed={session?.seed ?? store.ui?.meta.seed ?? 0} weakest={weakest} /></div>;
}

export function Replay() {
  const params = useParams<{ sessionId?: string; a?: string; b?: string }>();
  if (params.a && params.b) return <div className="debrief-page debrief-compare"><ReplayView key={params.a} sessionId={params.a} /><ReplayView key={params.b} sessionId={params.b} /></div>;
  if (!params.sessionId) return <div>No session specified.</div>;
  return <div className="debrief-page"><ReplayView key={params.sessionId} sessionId={params.sessionId} /></div>;
}

