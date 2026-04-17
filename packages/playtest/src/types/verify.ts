import type {
  ActiveSceneInspectionOutput,
  AutoloadValidationOutput,
  SceneBindingValidationOutput,
} from '@agent-harness/game-adapter';
import type {
  MilestoneSceneCriterionDefinition,
  MilestoneSceneDefinition,
  CriticalFlowInputReachabilityIssue,
  CriticalFlowStepResult,
  CriticalFlowVisibilityIssue,
  PlaytestResult,
} from './harness.js';

export interface VerifyProjectOptions {
  projectPath: string;
  timeoutMs?: number;
}

export interface VerificationSectionBase {
  passed: boolean;
  blockers: string[];
  warnings: string[];
}

export interface SceneInspectionVerification extends VerificationSectionBase {
  inspection: ActiveSceneInspectionOutput;
  durationMs: number;
}

export interface SceneBindingVerification extends VerificationSectionBase {
  validation: SceneBindingValidationOutput;
}

export interface AutoloadVerification extends VerificationSectionBase {
  validation: AutoloadValidationOutput;
}

export interface StartupVerification extends VerificationSectionBase {
  durationMs: number;
  currentScene?: string;
  sceneHistory?: string[];
  runtimeLogPath?: string;
}

export interface FlowVerification extends VerificationSectionBase {
  durationMs: number;
  flowName?: string;
  lastSuccessfulStepId?: string;
  failureStepId?: string;
  completedSteps: CriticalFlowStepResult[];
  logs: string[];
}

export interface UiVerification extends VerificationSectionBase {
  durationMs: number;
  visibilityIssues: CriticalFlowVisibilityIssue[];
  inputReachabilityIssues: CriticalFlowInputReachabilityIssue[];
}

export interface MilestoneCriterionVerification {
  id: MilestoneSceneCriterionDefinition['id'];
  description: string;
  status: 'passed' | 'failed';
  blockers: string[];
  evidence: string[];
}

export interface MilestoneSceneVerification extends VerificationSectionBase {
  sceneId: string;
  runtimeScene: string;
  label: string;
  primaryAction?: string;
  criteria: MilestoneCriterionVerification[];
  definition: MilestoneSceneDefinition;
}

export interface VerifyProjectSummary {
  requiredSceneCount: number;
  sceneBindingFailureCount: number;
  autoloadFailureCount: number;
  startupPassed: boolean;
  flowPassed: boolean;
  uiIssueCount: number;
  milestoneSceneCount: number;
  milestoneFailureCount: number;
}

export interface VerifyProjectReport {
  version: '1';
  projectPath: string;
  generatedAt: string;
  passed: boolean;
  blockers: string[];
  warnings: string[];
  summary: VerifyProjectSummary;
  sceneInspection: SceneInspectionVerification;
  sceneBinding: SceneBindingVerification;
  autoload: AutoloadVerification;
  startup: StartupVerification;
  flow: FlowVerification;
  ui: UiVerification;
  milestoneScenes: MilestoneSceneVerification[];
  playtest: PlaytestResult;
}
