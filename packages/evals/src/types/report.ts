import type { EvalLayerName } from './scenario.js';

export interface DimensionScore {
  name: string;
  description: string;
  score: number;
  maxScore: number;
  rationale?: string;
}

export interface ScoreResult {
  scenarioId: string;
  layer: EvalLayerName;
  passed: boolean;
  inconclusive?: boolean;
  totalScore: number;
  maxScore: number;
  ratio: number;
  dimensions: DimensionScore[];
  durationMs: number;
  runAt: string;
  summary?: string;
  runtimeLogPath?: string;
  runtimeErrorSummary?: string[];
}

export interface LayerSummary {
  total: number;
  passed: number;
  avgScore: number;
}

export interface ReportSummary {
  total: number;
  passed: number;
  failed: number;
  inconclusive: number;
  passRate: number;
  avgScore: number;
  byLayer: Partial<Record<EvalLayerName, LayerSummary>>;
}

export interface EvalReport {
  reportId: string;
  datasetId: string;
  runAt: string;
  projectPath: string;
  scores: ScoreResult[];
  summary: ReportSummary;
  latestRuntimeLogPath?: string;
  regressions?: string[];
}

export interface CIThreshold {
  buildPassRate: number;
  functionalPassRate: number;
  designPassRate: number;
  minAvgScore: number;
  dataMinScore?: number;
  systemsMinScore?: number;
  deckbuilderMinScore?: number;
}

export const DEFAULT_CI_THRESHOLDS: CIThreshold = {
  buildPassRate: 1.0,
  functionalPassRate: 0.9,
  designPassRate: 0.7,
  minAvgScore: 0.75,
  dataMinScore: 6.0,
  systemsMinScore: 6.0,
  deckbuilderMinScore: 6.0,
};

export interface RegressionEntry {
  scenarioId: string;
  baselineScore: number;
  currentScore: number;
  delta: number;
}

export interface RegressionReport {
  baselineReportId: string;
  currentReportId: string;
  regressions: RegressionEntry[];
  improvements: RegressionEntry[];
}
