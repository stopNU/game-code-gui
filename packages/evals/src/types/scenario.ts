import type { PlaytestStep, StateAssertion } from '@agent-harness/playtest';

export type EvalLayerName = 'build' | 'functional' | 'design' | 'data' | 'systems' | 'deckbuilder';

export interface EvalViolation {
  file: string;
  issue: string;
  severity: 'error' | 'warning';
}

export interface EvalContext {
  projectPath: string;
  layers?: EvalLayerName[];
}

export interface EvalResult {
  layerName: EvalLayerName;
  score: number;
  passed: boolean;
  violations?: EvalViolation[];
  summary?: string;
}

export interface ScenarioInput {
  projectPath: string;
  entryUrl?: string;
  actions?: PlaytestStep[];
  context?: Record<string, unknown>;
}

export interface ExpectedOutput {
  buildSuccess?: boolean;
  typecheckPasses?: boolean;
  bundleSizeKbMax?: number;
  scenesReachable?: string[];
  fpsMin?: number;
  stateAssertions?: StateAssertion[];
  designCriteria?: string[];
}

export interface ScoreDimension {
  name: string;
  description: string;
  maxScore: number;
  automated: boolean;
}

export interface ScoringRubric {
  dimensions: ScoreDimension[];
  passingThreshold: number;
  weights?: Record<string, number>;
}

export interface EvalScenario {
  id: string;
  name: string;
  description: string;
  layer: EvalLayerName;
  gameSpec: string;
  inputs: ScenarioInput;
  expectedOutputs: ExpectedOutput;
  rubric: ScoringRubric;
  tags: string[];
  version: string;
  createdAt: string;
}

export interface EvalDataset {
  id: string;
  name: string;
  description: string;
  scenarios: EvalScenario[];
  version: string;
  createdAt: string;
}
