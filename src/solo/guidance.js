// Coaching depends on completed work, not a timer or simply opening a scenario.
export function guidanceLevel(profile) {
  const runs = (profile?.completedRuns ?? []).filter(r => r.mode === 'repair');
  if (runs.length < 3) return 'guided';
  const independentCauses = new Set(runs.filter(r => !r.assisted).flatMap(r => r.recipes ?? []));
  return runs.length >= 8 && independentCauses.size >= 4 ? 'independent' : 'coached';
}
export function trainingMode(mission, profile) {
  const level = guidanceLevel(profile);
  if (mission?.mode === 'repair' && (mission.tier >= 3 || level === 'independent')) return 'console';
  return level === 'guided' && (mission?.tier ?? 1) < 2 ? 'guided' : 'coached';
}
export function nextGuidance(mission) {
  const events = mission.events ?? [];
  if (!events.some(e => e.kind === 'inspection')) return { step: 1, title: 'Start with the customer workstation', detail: 'Select a workstation on the canvas. Inspect its address and power, then run a test to establish what fails.' };
  if (!events.some(e => e.kind === 'test')) return { step: 2, title: 'Establish a baseline', detail: 'Run Ping gateway or Open portal from a workstation. The result is recorded in Findings.' };
  if (!events.some(e => e.kind === 'change')) return { step: 3, title: 'Follow the evidence', detail: 'Compare the test result with device settings and cable endpoints. Make one change, then test again. Hints are available in the work order.' };
  return { step: 4, title: 'Verify and document', detail: 'Test the customer and protected workstation. Open Findings, select your evidence, and document what you changed before submitting.' };
}
