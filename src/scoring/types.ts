export type AxisName = 'diagnosticAccuracy' | 'evidenceQuality' | 'efficiency' | 'serviceImpact' | 'safetyCompliance';

export interface AxisScore {
  axis: AxisName;
  score: number;
  details: string[];
}

export interface ReplayStep {
  actionId: string;
  index: number;
  atSimSeconds: number;
  durationSeconds: number;
  label: string;
  revealed: string[];
  classification: 'on-path' | 'useful' | 'redundant' | 'unnecessary' | 'violation' | 'refused';
}

export interface DecisionReplay {
  steps: ReplayStep[];
  referencePath: Array<{ label: string; matchedActionId: string | null }>;
  divergenceIndex: number | null;
  summary: string[];
}

export interface ScoreReport {
  /** Present on new reports. Older stored reports can be rebuilt through the session store. */
  debrief?: DebriefReport;
  axes: Record<AxisName, AxisScore>;
  total: number;
  endedBy: 'diagnosis' | 'safety-strike';
  overBudget: boolean;
  beatReference: boolean;
  matchedFaultIds: string[];
  falsePositiveClaims: number;
  missedFaultIds: string[];
  replay: DecisionReplay;
}

export interface DebriefReport {
  title: string;
  verdict: 'correct' | 'partial' | 'incorrect' | 'escalated';
  verdictText: string;
  faults: Array<{ id: string; label: string; description: string; location: string; detail: string; matched: boolean; outOfScope: boolean }>;
  claims: Array<{ label: string; location: string; detail: string; correct: boolean }>;
  noFaultClaim: boolean;
  escalation: string | null;
  walkthrough: Array<{ index: number; title: string; why: string; seconds: number; matchedActionId: string | null }>;
  evidence: Array<{ faultId: string; label: string; status: 'cited' | 'uncited' | 'partial' | 'missing'; explanation: string; supportingActionIds: string[]; citedActionIds: string[] }>;
  practice: string;
}
