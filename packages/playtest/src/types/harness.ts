export interface HarnessButton {
  id: string;
  label: string;
  action: string;
  params?: Record<string, unknown>;
}

export interface CriticalFlowAction {
  type: 'call_method';
  method: string;
  args?: unknown[];
}

export interface CriticalFlowViewportDefinition {
  id: string;
  label: string;
  width: number;
  height: number;
}

export interface CriticalFlowVisibleControlDefinition {
  id: string;
  label: string;
  nodePath: string;
}

export interface CriticalFlowVisibleRegionDefinition {
  id: string;
  label: string;
  nodePath: string;
}

export interface CriticalFlowInputActionDefinition {
  id: string;
  label: string;
  controlId?: string;
  nodePath: string;
}

export interface MilestoneSceneCriterionDefinition {
  id: 'renders-visibly' | 'primary-action-visible' | 'progression-possible' | 'no-runtime-blocker';
  description: string;
  controlIds?: string[];
  actionIds?: string[];
  stepIds?: string[];
}

export interface MilestoneSceneDefinition {
  sceneId: string;
  scene: string;
  label: string;
  primaryAction?: string;
  acceptanceCriteria: MilestoneSceneCriterionDefinition[];
}

export interface CriticalFlowVisibilityCheckDefinition {
  scene: string;
  label?: string;
  viewports: CriticalFlowViewportDefinition[];
  requiredControls: CriticalFlowVisibleControlDefinition[];
  requiredRegions?: CriticalFlowVisibleRegionDefinition[];
}

export interface CriticalFlowInputReachabilityCheckDefinition {
  scene: string;
  label?: string;
  viewports: CriticalFlowViewportDefinition[];
  requiredActions: CriticalFlowInputActionDefinition[];
}

export interface CriticalFlowVisibilityIssue {
  scene: string;
  sceneLabel: string;
  targetType: 'control' | 'region';
  controlId: string;
  controlLabel: string;
  nodePath: string;
  viewportId: string;
  viewportLabel: string;
  viewportWidth: number;
  viewportHeight: number;
  areaLeft: number;
  areaTop: number;
  areaRight: number;
  controlBottom: number;
  viewportLeft: number;
  viewportTop: number;
  viewportRight: number;
  viewportBottom: number;
  overflowLeftPx: number;
  overflowTopPx: number;
  overflowRightPx: number;
  overflowBottomPx: number;
  overflowPx: number;
  message: string;
}

export interface CriticalFlowInputReachabilityIssue {
  scene: string;
  sceneLabel: string;
  actionId: string;
  actionLabel: string;
  controlId: string;
  controlLabel: string;
  nodePath: string;
  viewportId: string;
  viewportLabel: string;
  viewportWidth: number;
  viewportHeight: number;
  issueType: 'missing_control' | 'hidden_control' | 'disabled_control' | 'ignored_control' | 'clipped_control';
  controlFound: boolean;
  controlUsable: boolean;
  message: string;
}

export interface CriticalFlowStepDefinition {
  id: string;
  label: string;
  type: 'scene' | 'action';
  scene?: string;
  timeoutMs?: number;
  action?: CriticalFlowAction;
}

export interface CriticalFlowConfig {
  version: string;
  name: string;
  timeoutMs?: number;
  steps: CriticalFlowStepDefinition[];
  visibilityChecks?: CriticalFlowVisibilityCheckDefinition[];
  inputReachabilityChecks?: CriticalFlowInputReachabilityCheckDefinition[];
  milestoneScenes?: MilestoneSceneDefinition[];
}

export interface CriticalFlowStepResult {
  id: string;
  label: string;
  type: 'scene' | 'action';
  passed: boolean;
  scene?: string;
  timeoutMs?: number;
  error?: string;
  timestamp: number;
  visibilityIssues?: CriticalFlowVisibilityIssue[];
  inputReachabilityIssues?: CriticalFlowInputReachabilityIssue[];
}

export interface CriticalFlowResult {
  name: string;
  passed: boolean;
  lastSuccessfulStepId?: string;
  failureStepId?: string;
  completedSteps: CriticalFlowStepResult[];
  logs: string[];
  visibilityIssues?: CriticalFlowVisibilityIssue[];
  inputReachabilityIssues?: CriticalFlowInputReachabilityIssue[];
}

export interface HarnessState {
  scene: string;
  fps: number;
  gameState: Record<string, unknown>;
  buttons: HarnessButton[];
  sceneHistory: string[];
  errorLog: string[];
  frameCount: number;
  timestamp: number;
  /**
   * Advanced mode: summary of loaded data content.
   * e.g. { cardCount: 45, enemyCount: 12, relicCount: 20 }
   */
  dataState?: Record<string, number>;
  /**
   * Advanced mode: current state of all registered state machines.
   * Key = machine id, value = current state name.
   * e.g. { combat: 'PLAYER_TURN_ACTIVE', runFlow: 'MAP' }
   */
  machineStates?: Record<string, string>;
  /**
   * Advanced mode: last N events emitted on the event bus, for debugging.
   * Each entry is a string like "ON_CARD_PLAYED:arc_lance".
   */
  eventLog?: string[];
  criticalFlow?: CriticalFlowResult;
}

export interface PlaytestStep {
  type:
    | 'click'
    | 'keypress'
    | 'keydown'
    | 'keyup'
    | 'wait'
    | 'emit'
    | 'navigate'
    | 'assert'
    | 'screenshot'
    /**
     * Advanced mode: evaluate a JS expression in the page context and assert
     * the result. Requires `expression` to be set.
     */
    | 'evaluate'
    /**
     * Advanced mode: poll window.__HARNESS__.getState() until the given
     * assertion passes or `timeoutMs` elapses.
     */
    | 'wait-for-state';
  target?: string;
  value?: string;
  waitMs?: number;
  assertion?: StateAssertion;
  screenshotPath?: string;
  /** JS expression evaluated in the browser context (for 'evaluate' steps). */
  expression?: string;
  /** Max ms to poll before failing (for 'wait-for-state' steps). Defaults to 5000. */
  timeoutMs?: number;
}

export interface StateAssertion {
  path: string;
  operator:
    | 'eq'
    | 'ne'
    | 'gt'
    | 'lt'
    | 'contains'
    | 'exists'
    /** Advanced: array/string length is greater than value */
    | 'length-gt'
    /** Advanced: array/string length equals value */
    | 'length-eq'
    /** Advanced: object has key (path points to an object, value is the key name) */
    | 'has-key'
    /** Advanced: string matches regex pattern in value */
    | 'matches';
  value?: unknown;
}

export interface AssertionResult {
  step: PlaytestStep;
  passed: boolean;
  actual?: unknown;
  expected?: unknown;
  error?: string;
}

export interface PlaytestSession {
  id: string;
  url: string;
  startedAt: string;
  steps: PlaytestStep[];
  results: AssertionResult[];
  screenshots: string[];
  finalState?: HarnessState;
}

export interface PlaytestResult {
  sessionId: string;
  passed: boolean;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  durationMs: number;
  screenshots: string[];
  errorLog: string[];
  results: AssertionResult[];
  authoritativeRuntimeRoots?: string[];
  runtimeLogPath?: string;
  runtimeErrorSummary?: string[];
  dependencyValidation?: {
    activeIssues: Array<{
      sourcePath: string;
      sourceLine: number;
      dependencyKind: 'load' | 'preload' | 'class_name';
      dependency: string;
      message: string;
      active: boolean;
    }>;
    inactiveIssues: Array<{
      sourcePath: string;
      sourceLine: number;
      dependencyKind: 'load' | 'preload' | 'class_name';
      dependency: string;
      message: string;
      active: boolean;
    }>;
  };
  finalState?: HarnessState;
}
