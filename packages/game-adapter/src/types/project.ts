export interface GodotProject {
  id: string;
  path: string;
  title: string;
  version: string;
  scenes: string[];
  runtimeLayout: string;
}

export interface BuildOutput {
  success: boolean;
  /** Size of the exported binary or build output in KB */
  sizeKb: number;
  /** Path to the exported game binary or output directory */
  outputPath: string;
  stdout: string;
  stderr: string;
  durationMs: number;
  runtimeLogPath?: string;
}

export interface TypecheckOutput {
  success: boolean;
  errorCount: number;
  errors: string[];
  issues?: GDScriptCompatibilityIssue[];
  settings?: GDScriptProjectSettings;
  targetsChecked?: number;
  durationMs: number;
  runtimeLogPath?: string;
}

export interface GDScriptWarningSetting {
  key: string;
  level: 'ignore' | 'warn' | 'error';
  rawValue: string;
}

export interface GDScriptProjectSettings {
  warningsEnabled: boolean;
  warningSettings: GDScriptWarningSetting[];
  warningsAsErrors: string[];
}

export interface GDScriptValidationTarget {
  id: string;
  kind: 'autoload' | 'scene' | 'script';
  path: string;
}

export interface GDScriptCompatibilityEntry {
  id: string;
  kind: GDScriptValidationTarget['kind'];
  path: string;
  passed: boolean;
  loaded: boolean;
  instantiated: boolean;
  failureReason?: string;
}

export interface GDScriptCompatibilityIssue {
  severity: 'error';
  message: string;
  filePath?: string;
  line?: number;
  treatedAsError: boolean;
  rawText: string;
}

export interface GDScriptCompatibilityOutput {
  success: boolean;
  settings: GDScriptProjectSettings;
  targets: GDScriptValidationTarget[];
  entries: GDScriptCompatibilityEntry[];
  issues: GDScriptCompatibilityIssue[];
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface SceneBindingValidationEntry {
  scenePath: string;
  rootType: string;
  attachedScriptPath: string | null;
  expectedSiblingScriptPath: string | null;
  passed: boolean;
  failureReason?: string;
}

export interface SceneBindingValidationOutput {
  success: boolean;
  entries: SceneBindingValidationEntry[];
  stdout: string;
  stderr: string;
  durationMs: number;
  runtimeLogPath?: string;
}

export interface AutoloadValidationTarget {
  name: string;
  scriptPath: string;
}

export interface AutoloadValidationEntry {
  name: string;
  scriptPath: string;
  passed: boolean;
  errorText?: string;
}

export interface AutoloadValidationOutput {
  success: boolean;
  entries: AutoloadValidationEntry[];
  stdout: string;
  stderr: string;
  durationMs: number;
  runtimeLogPath?: string;
}

export interface RuntimeLayoutRule {
  authoritative: string;
  conflicting: string;
}

export interface RuntimeLayoutConfig {
  canonicalLayoutId: string;
  authoritativeRuntimeRoots: string[];
  conflictingRuntimeRoots: string[];
  duplicateSubsystemRules: RuntimeLayoutRule[];
  allowMixedActiveLayouts: boolean;
}

export interface RuntimeLayoutDuplicateSubsystem {
  subsystem: string;
  authoritativePath: string;
  conflictingPath: string;
}

export interface RuntimeLayoutValidationOutput {
  success: boolean;
  canonicalLayoutId: string;
  allowMixedActiveLayouts: boolean;
  authoritativeRuntimeRoots: string[];
  conflictingRuntimeRoots: string[];
  activeRuntimeRoots: string[];
  duplicateSubsystems: RuntimeLayoutDuplicateSubsystem[];
  issues: string[];
}

export interface RuntimeManifestSceneEntry {
  id: string;
  scenePath: string;
  scriptPath?: string;
}

export interface RuntimeManifestScriptEntry {
  id: string;
  scriptPath: string;
  category: 'autoload' | 'scene' | 'system' | 'script';
}

export interface RuntimeManifestAutoloadEntry {
  name: string;
  scriptPath: string;
}

export interface RuntimeManifestDataRootEntry {
  id: string;
  path: string;
  kind: 'content' | 'schema' | 'data';
}

export interface RuntimeFileManifest {
  version: string;
  generatedAt: string;
  canonicalLayoutId: string;
  manifestPath: string;
  mainScenePath?: string;
  scenes: RuntimeManifestSceneEntry[];
  scripts: RuntimeManifestScriptEntry[];
  autoloads: RuntimeManifestAutoloadEntry[];
  dataRoots: RuntimeManifestDataRootEntry[];
}

export interface RuntimeManifestValidationIssue {
  entryType: 'manifest' | 'scene' | 'script' | 'autoload' | 'dataRoot';
  identifier: string;
  path?: string;
  message: string;
}

export interface RuntimeManifestValidationOutput {
  success: boolean;
  manifestPath: string;
  issues: RuntimeManifestValidationIssue[];
}

export interface RuntimeReconciliationConflict {
  id: string;
  kind:
    | 'mixed-runtime-layout'
    | 'duplicate-implementation'
    | 'manifest-mismatch'
    | 'reference-mismatch'
    | 'scene-instantiation';
  severity: 'error' | 'warning';
  summary: string;
  details: string;
  paths: string[];
  active: boolean;
  authoritativePath?: string;
  conflictingPath?: string;
  suggestedAction: string;
}

export interface RuntimeReconciliationPlanStep {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  details: string;
  targets: string[];
  conflictIds: string[];
}

export interface RuntimeReconciliationActiveFiles {
  scenes: string[];
  scripts: string[];
  autoloads: string[];
  dataRoots: string[];
}

export interface RuntimeReconciliationReport {
  version: string;
  generatedAt: string;
  mode: 'read-only';
  canonicalLayoutId: string;
  manifestPath: string;
  activeRuntimeRoots: string[];
  activeFiles: RuntimeReconciliationActiveFiles;
  conflicts: RuntimeReconciliationConflict[];
  repairPlan: RuntimeReconciliationPlanStep[];
}

export interface ActiveSceneInspectionEntry {
  kind: 'main-scene' | 'required-scene';
  sceneId: string;
  scenePath: string;
  required: boolean;
  exists: boolean;
  rootNodeType: string | null;
  attachedScriptPath: string | null;
  instantiationStatus:
    | 'ready'
    | 'missing-scene'
    | 'missing-root-node'
    | 'missing-script'
    | 'unresolved-script'
    | 'invalid-scene-path';
  issues: string[];
}

export interface ActiveSceneInspectionOutput {
  projectPath: string;
  inspectedAt: string;
  inspectionMode: 'static';
  mainScenePath?: string;
  scenes: ActiveSceneInspectionEntry[];
}

export interface RuntimeDependencyValidationIssue {
  sourcePath: string;
  sourceLine: number;
  dependencyKind: 'load' | 'preload' | 'class_name';
  dependency: string;
  message: string;
  active: boolean;
}

export interface RuntimeDependencyValidationOutput {
  success: boolean;
  activeScriptPaths: string[];
  inactiveScriptPaths: string[];
  activeIssues: RuntimeDependencyValidationIssue[];
  inactiveIssues: RuntimeDependencyValidationIssue[];
}

export type RuntimeLogMode =
  | 'play'
  | 'smoke'
  | 'build'
  | 'typecheck'
  | 'scene-binding'
  | 'autoload-validation';

export interface RuntimeLogReference {
  mode: RuntimeLogMode;
  startedAt: string;
  logPath: string;
}

export interface RuntimeLogIndex {
  latest?: RuntimeLogReference;
  byMode: Partial<Record<RuntimeLogMode, RuntimeLogReference>>;
}

export interface RuntimeErrorSummary {
  logPath: string;
  mode: RuntimeLogMode;
  startedAt: string;
  totalMatches: number;
  lines: string[];
}

/** Handle returned by startDevServer - Godot opens a native window, no URL. */
export interface DevServerHandle {
  logPath: string;
  stop: () => Promise<void>;
}
