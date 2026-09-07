import type { UiSessionState } from '../../session/runner';
import { useViewportState } from '../viewport/viewportStore';
import './teaching.css';

export function TeachingRail({ ui, onShow }: { ui: UiSessionState; onShow(nodeId: string): void }) {
  const [collapsed, setCollapsed] = useViewportState('teaching.collapsed', false);
  if (ui.meta.tier > 2 || ui.ended || ui.teachingSteps.length === 0) return null;
  const steps = ui.teachingSteps;
  const completed = steps.filter((step) => step.completedActionId).length;
  const next = steps.find((step) => !step.completedActionId);
  return <section className="teaching-rail" aria-label="Dispatch guidance">
    <header>
      <div><span className="teaching-kicker">DISPATCH / TIER {ui.meta.tier}</span><strong>{next ? `Step ${next.index + 1} of ${steps.length}` : 'Reference checks complete'} <small>{completed}/{steps.length} complete</small></strong></div>
      <button type="button" aria-expanded={!collapsed} aria-controls="teaching-steps" onClick={() => setCollapsed(!collapsed)}>{collapsed ? 'Show steps' : 'Hide steps'}</button>
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
