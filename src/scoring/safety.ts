/** Safety and compliance: strikes dominate everything else, live-PON test violations and unreported hazards are penalized. */
import type { SessionState } from '../session/types';
import type { AxisScore } from './types';
import { clamp, lastDiagnosis } from './util';

function rolledToNodeIds(state: SessionState): Set<string> {
  const nodes = new Set<string>([state.meta.startLocationNodeId]);
  for (const action of state.log) {
    if (action.type === 'truck-roll') nodes.add(action.toNodeId);
  }
  return nodes;
}

export function computeSafety(state: SessionState): AxisScore {
  const strike = state.log.some((a) => a.type === 'excavate' && a.strike);
  if (strike) {
    return { axis: 'safetyCompliance', score: 0, details: ['Safety strike during excavation.'] };
  }

  const details: string[] = [];
  let score = 100;

  const liveViolations = state.log.filter((a) => a.type === 'otdr-shot' && a.violations.some((v) => v.kind === 'in-band-test-on-live-pon'));
  if (liveViolations.length > 0) {
    score -= 25 * liveViolations.length;
    details.push(`${liveViolations.length} in-band OTDR test(s) on live PON service (-25 each).`);
  }

  const diagnosis = lastDiagnosis(state);
  const claimedSiteIds = new Set(diagnosis.claims.map((c) => (c.target.type === 'site' ? c.target.nodeId : null)).filter((id): id is string => id !== null));
  const rolled = rolledToNodeIds(state);
  const aerialFaults = state.initialWorld.appliedFaults.filter((f) => f.kind.startsWith('aerial-') && f.target.type === 'site');
  for (const fault of aerialFaults) {
    if (fault.target.type !== 'site') continue;
    if (rolled.has(fault.target.nodeId) && !claimedSiteIds.has(fault.target.nodeId)) {
      score -= 15;
      details.push(`Unreported hazard: ${fault.kind} at a site visited but not called out (-15).`);
    }
  }

  score = clamp(score, 0, 100);
  if (details.length === 0) details.push('No safety or compliance issues.');
  return { axis: 'safetyCompliance', score, details };
}
