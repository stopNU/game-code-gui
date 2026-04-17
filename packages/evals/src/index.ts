export { runEvals, buildReport, checkCIThresholds, buildRegressionReport } from './runner/eval-runner.js';
export type { EvalRunOptions } from './runner/eval-runner.js';
export { runBuildEval } from './layers/build-eval.js';
export { runFunctionalEval } from './layers/functional-eval.js';
export { runDesignEval } from './layers/design-eval.js';
export { runDataEval } from './layers/data-eval.js';
export { runSystemsEval } from './layers/systems-eval.js';
export { runDeckbuilderEval } from './layers/deckbuilder-eval.js';
export type {
  EvalScenario,
  EvalDataset,
  EvalLayerName,
  ScenarioInput,
  ExpectedOutput,
  ScoringRubric,
  ScoreDimension,
} from './types/scenario.js';
export type {
  ScoreResult,
  EvalReport,
  CIThreshold,
  RegressionReport,
  RegressionEntry,
  DimensionScore,
} from './types/report.js';
export { DEFAULT_CI_THRESHOLDS } from './types/report.js';
