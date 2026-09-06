export type AxisName = 'diagnosticAccuracy' | 'evidenceQuality' | 'efficiency' | 'customerImpact' | 'safetyCompliance';

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
