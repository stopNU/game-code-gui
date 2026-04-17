export { runPlaytest } from './runner/playtest-runner.js';
export { verifyProject } from './runner/project-verifier.js';
export type { RunPlaytestOptions } from './runner/playtest-runner.js';
export type { VerifyProjectOptions, VerifyProjectReport } from './types/verify.js';
export type {
  HarnessButton,
  HarnessState,
  CriticalFlowAction,
  CriticalFlowConfig,
  CriticalFlowResult,
  CriticalFlowViewportDefinition,
  CriticalFlowVisibleControlDefinition,
  CriticalFlowVisibleRegionDefinition,
  CriticalFlowVisibilityCheckDefinition,
  CriticalFlowVisibilityIssue,
  MilestoneSceneCriterionDefinition,
  MilestoneSceneDefinition,
  CriticalFlowStepDefinition,
  CriticalFlowStepResult,
  PlaytestStep,
  PlaytestSession,
  PlaytestResult,
  AssertionResult,
  StateAssertion,
} from './types/harness.js';
