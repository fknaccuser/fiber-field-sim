/**
 * Tier 1 and 2 guidance, sized so it does not take the job away from you.
 *
 * This used to open expanded, listing every step with its full rationale. On a phone that
 * came to about 38% of the screen, permanently, above a drawing that then had a strip left
 * to live in — so the trainee spent the session reading about the work instead of doing it.
 *
 * It now opens as one line: what step you are on, what it is, and where it is. The reasoning
 * is a tap away and stays a tap away, because the "why" is the part worth reading once, not
 * the part worth staring at while you work.
 */
import type { UiSessionState } from '../../session/runner';
import { useViewportState } from '../viewport/viewportStore';
import './teaching.css';

export function TeachingRail({ ui, onShow }: { ui: UiSessionState; onShow(nodeId: string): void }) {
  const [collapsed, setCollapsed] = useViewportState('teaching.collapsed', true);
  if (ui.meta.tier > 2 || ui.ended || ui.teachingSteps.length === 0) return null;
  const steps = ui.teachingSteps;
  const completed = steps.filter((step) => step.completedActionId).length;
  const next = steps.find((step) => !step.completedActionId);

  return <section className="teaching-rail" aria-label="Dispatch guidance">
    <header>
      <div className="teaching-head">
        <span className="teaching-kicker">DISPATCH / TIER {ui.meta.tier} · {completed}/{steps.length}</span>
        {/* Collapsed, the bar still has to be worth its own height: it says what to do next. */}
        <strong>{next ? next.title : 'Reference checks complete'}</strong>
      </div>
      <div className="teaching-actions">
        {collapsed && next?.targetNodeId && ui.meta.tier === 1 && (
          <button type="button" onClick={() => onShow(next.targetNodeId!)}>Where ↗</button>
        )}
        <button type="button" aria-expanded={!collapsed} aria-controls="teaching-steps" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? 'Why' : 'Hide'}
        </button>
      </div>
    </header>
    {!collapsed && <div id="teaching-steps" className="teaching-body">
      <p className="teaching-note">A method, not a checklist gate. You can work in any order.</p>
      <ol>{steps.map((step) => <li key={step.index} className={step.completedActionId ? 'complete' : step === next ? 'current' : ''}>
        <span className="teaching-number" aria-label={step.completedActionId ? 'Complete' : 'Not complete'}>{step.completedActionId ? '✓' : step.index + 1}</span>
        <div><strong>{step.title}</strong><p><b>WHY</b> {step.question}</p>
          {ui.meta.tier === 1 && step.targetNodeId && <button type="button" onClick={() => onShow(step.targetNodeId!)}>Show me where ↗</button>}
        </div>
      </li>)}</ol>
    </div>}
  </section>;
}
