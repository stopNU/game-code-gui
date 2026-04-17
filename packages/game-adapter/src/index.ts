export { scaffoldGame } from './scaffold/scaffolder.js';
export type { ScaffoldOptions } from './scaffold/scaffolder.js';
export { runBuild, runTypeCheck, runSceneBindingValidation, runAutoloadValidation } from './build/build-runner.js';
export {
  collectGDScriptValidationTargets,
  formatGDScriptCompatibilityIssue,
  parseGDScriptCompatibilityIssues,
  readGDScriptProjectSettings,
  runGDScriptCompatibilityValidation,
} from './build/gdscript-compatibility.js';
export {
  getDefaultRuntimeLayoutConfig,
  loadRuntimeLayoutConfig,
  validateRuntimeLayout,
  formatRuntimeLayoutIssues,
} from './build/runtime-layout.js';
export {
  generateRuntimeManifest,
  writeRuntimeManifest,
  readRuntimeManifest,
  validateRuntimeManifest,
} from './build/runtime-manifest.js';
export {
  generateRuntimeReconciliationReport,
  writeRuntimeReconciliationReport,
} from './build/runtime-reconciliation.js';
export { inspectActiveScenes } from './build/scene-inspection.js';
export {
  validateRuntimeDependencies,
  formatRuntimeDependencyIssue,
} from './build/runtime-dependencies.js';
export {
  createRuntimeLogReference,
  getRuntimeLogDir,
  getRuntimeLogIndexPath,
  readRuntimeErrorSummary,
  readRuntimeLogIndex,
  resolveLatestRuntimeLog,
  summarizeRuntimeErrors,
  writeRuntimeLog,
} from './build/runtime-logs.js';
export { startDevServer } from './build/dev-server.js';
export type {
  GodotProject,
  BuildOutput,
  TypecheckOutput,
  GDScriptWarningSetting,
  GDScriptProjectSettings,
  GDScriptValidationTarget,
  GDScriptCompatibilityEntry,
  GDScriptCompatibilityIssue,
  GDScriptCompatibilityOutput,
  SceneBindingValidationEntry,
  SceneBindingValidationOutput,
  AutoloadValidationTarget,
  AutoloadValidationEntry,
  AutoloadValidationOutput,
  RuntimeLayoutRule,
  RuntimeLayoutConfig,
  RuntimeLayoutDuplicateSubsystem,
  RuntimeLayoutValidationOutput,
  RuntimeManifestSceneEntry,
  RuntimeManifestScriptEntry,
  RuntimeManifestAutoloadEntry,
  RuntimeManifestDataRootEntry,
  RuntimeFileManifest,
  RuntimeManifestValidationIssue,
  RuntimeManifestValidationOutput,
  RuntimeReconciliationConflict,
  RuntimeReconciliationPlanStep,
  RuntimeReconciliationActiveFiles,
  RuntimeReconciliationReport,
  ActiveSceneInspectionEntry,
  ActiveSceneInspectionOutput,
  RuntimeDependencyValidationIssue,
  RuntimeDependencyValidationOutput,
  RuntimeLogMode,
  RuntimeLogReference,
  RuntimeLogIndex,
  RuntimeErrorSummary,
  DevServerHandle,
} from './types/project.js';
