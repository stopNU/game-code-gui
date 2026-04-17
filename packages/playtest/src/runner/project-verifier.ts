import {
  formatRuntimeDependencyIssue,
  generateRuntimeManifest,
  inspectActiveScenes,
  runAutoloadValidation,
  runSceneBindingValidation,
} from '@agent-harness/game-adapter';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type {
  AutoloadValidationOutput,
  SceneBindingValidationOutput,
} from '@agent-harness/game-adapter';
import { runPlaytest } from './playtest-runner.js';
import type {
  FlowVerification,
  MilestoneCriterionVerification,
  MilestoneSceneVerification,
  SceneInspectionVerification,
  StartupVerification,
  UiVerification,
  VerifyProjectOptions,
  VerifyProjectReport,
} from '../types/verify.js';
import type {
  CriticalFlowConfig,
  CriticalFlowInputReachabilityIssue,
  CriticalFlowVisibilityIssue,
  MilestoneSceneCriterionDefinition,
  MilestoneSceneDefinition,
} from '../types/harness.js';

export async function verifyProject(opts: VerifyProjectOptions): Promise<VerifyProjectReport> {
  const inspectionStart = Date.now();
  const inspection = await inspectActiveScenes(opts.projectPath);
  const sceneInspection = buildSceneInspectionVerification(inspection, Date.now() - inspectionStart);

  const manifest = await generateRuntimeManifest(opts.projectPath);
  const scenePaths = Array.from(new Set(inspection.scenes.map((scene) => scene.scenePath)));
  const autoloadTargets = manifest.autoloads.map((autoload) => ({
    name: autoload.name,
    scriptPath: autoload.scriptPath,
  }));

  const sceneBindingValidation = scenePaths.length > 0
    ? await runSceneBindingValidation(opts.projectPath, scenePaths)
    : emptySceneBindingValidation();
  const sceneBindingBlockers = scenePaths.length === 0
    ? ['No runtime scenes were discovered for dynamic scene binding validation.']
    : sceneBindingValidation.entries
      .filter((entry) => !entry.passed)
      .map((entry) =>
        `${entry.scenePath} failed scene binding validation: ${entry.failureReason ?? 'unknown failure'}`,
      );

  const autoloadValidation = autoloadTargets.length > 0
    ? await runAutoloadValidation(opts.projectPath, autoloadTargets)
    : emptyAutoloadValidation();
  const autoloadBlockers = autoloadTargets.length === 0
    ? ['No autoloads were declared in the runtime manifest.']
    : autoloadValidation.entries
      .filter((entry) => !entry.passed)
      .map((entry) => `${entry.name} failed autoload validation: ${entry.errorText ?? 'unknown failure'}`);

  const playtest = await runPlaytest({
    projectPath: opts.projectPath,
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
  });
  const criticalFlowConfig = await readCriticalFlowConfig(opts.projectPath);

  const startup = buildStartupVerification(playtest);
  const flow = buildFlowVerification(playtest);
  const ui = buildUiVerification(playtest);
  const milestoneScenes = buildMilestoneSceneVerification(playtest, criticalFlowConfig, startup, flow, ui);

  const warnings = playtest.dependencyValidation?.inactiveIssues.map((issue) => formatRuntimeDependencyIssue(issue)) ?? [];
  const blockers = [
    ...sceneInspection.blockers,
    ...sceneBindingBlockers,
    ...autoloadBlockers,
    ...startup.blockers,
    ...flow.blockers,
    ...ui.blockers,
    ...milestoneScenes.flatMap((scene) => scene.blockers),
  ];

  return {
    version: '1',
    projectPath: opts.projectPath,
    generatedAt: new Date().toISOString(),
    passed: blockers.length === 0,
    blockers,
    warnings,
    summary: {
      requiredSceneCount: inspection.scenes.filter((scene) => scene.required).length,
      sceneBindingFailureCount: sceneBindingBlockers.length,
      autoloadFailureCount: autoloadBlockers.length,
      startupPassed: startup.passed,
      flowPassed: flow.passed,
      uiIssueCount: ui.visibilityIssues.length + ui.inputReachabilityIssues.length,
      milestoneSceneCount: milestoneScenes.length,
      milestoneFailureCount: milestoneScenes.reduce(
        (count, scene) => count + scene.criteria.filter((criterion) => criterion.status === 'failed').length,
        0,
      ),
    },
    sceneInspection,
    sceneBinding: {
      passed: sceneBindingBlockers.length === 0 && sceneBindingValidation.success,
      blockers: sceneBindingBlockers,
      warnings: [],
      validation: sceneBindingValidation,
    },
    autoload: {
      passed: autoloadBlockers.length === 0 && autoloadValidation.success,
      blockers: autoloadBlockers,
      warnings: [],
      validation: autoloadValidation,
    },
    startup,
    flow,
    ui,
    milestoneScenes,
    playtest,
  };
}

function buildSceneInspectionVerification(
  inspection: Awaited<ReturnType<typeof inspectActiveScenes>>,
  durationMs: number,
): SceneInspectionVerification {
  const blockers = inspection.scenes
    .filter((scene) => scene.required || scene.kind === 'main-scene')
    .filter((scene) => scene.instantiationStatus !== 'ready')
    .map((scene) => {
      const issueSummary = scene.issues.length > 0 ? ` (${scene.issues.join('; ')})` : '';
      return `${scene.scenePath} is ${scene.instantiationStatus}${issueSummary}`;
    });

  return {
    passed: blockers.length === 0,
    blockers,
    warnings: [],
    inspection,
    durationMs,
  };
}

function buildStartupVerification(
  playtest: Awaited<ReturnType<typeof runPlaytest>>,
): StartupVerification {
  const currentScene = playtest.finalState?.scene;
  const sceneHistory = playtest.finalState?.sceneHistory;
  const blockers: string[] = [];

  if (playtest.finalState === undefined) {
    blockers.push('Startup did not produce a harness state.');
  }
  if (currentScene === undefined || currentScene.trim().length === 0) {
    blockers.push('Startup did not report a current scene.');
  }
  if (sceneHistory === undefined || sceneHistory.length === 0) {
    blockers.push('Startup did not report any scene history.');
  }

  const flowMessages = new Set([
    'Harness output did not include a critical flow result.',
    ...readFlowMessages(playtest),
  ]);
  const uiMessages = new Set([
    ...readUiMessages(playtest.finalState?.criticalFlow?.visibilityIssues),
    ...readUiMessages(playtest.finalState?.criticalFlow?.inputReachabilityIssues),
  ]);
  const runtimeBlockers = playtest.errorLog.filter((line) => !flowMessages.has(line) && !uiMessages.has(line));
  blockers.push(...runtimeBlockers);

  return {
    passed: blockers.length === 0,
    blockers,
    warnings: [],
    durationMs: playtest.durationMs,
    ...(currentScene !== undefined ? { currentScene } : {}),
    ...(sceneHistory !== undefined ? { sceneHistory } : {}),
    ...(playtest.runtimeLogPath !== undefined ? { runtimeLogPath: playtest.runtimeLogPath } : {}),
  };
}

function buildFlowVerification(
  playtest: Awaited<ReturnType<typeof runPlaytest>>,
): FlowVerification {
  const criticalFlow = playtest.finalState?.criticalFlow;
  const blockers = criticalFlow === undefined
    ? ['Harness output did not include a critical flow result.']
    : criticalFlow.passed
      ? []
      : [
        `Critical flow failed at "${criticalFlow.failureStepId ?? 'unknown'}" after "${criticalFlow.lastSuccessfulStepId ?? 'none'}"`,
      ];

  return {
    passed: blockers.length === 0,
    blockers,
    warnings: [],
    durationMs: playtest.durationMs,
    ...(criticalFlow?.name !== undefined ? { flowName: criticalFlow.name } : {}),
    ...(criticalFlow?.lastSuccessfulStepId !== undefined
      ? { lastSuccessfulStepId: criticalFlow.lastSuccessfulStepId }
      : {}),
    ...(criticalFlow?.failureStepId !== undefined ? { failureStepId: criticalFlow.failureStepId } : {}),
    completedSteps: criticalFlow?.completedSteps ?? [],
    logs: criticalFlow?.logs ?? [],
  };
}

function buildUiVerification(
  playtest: Awaited<ReturnType<typeof runPlaytest>>,
): UiVerification {
  const criticalFlow = playtest.finalState?.criticalFlow;
  const visibilityIssues = criticalFlow?.visibilityIssues ?? [];
  const inputReachabilityIssues = criticalFlow?.inputReachabilityIssues ?? [];
  const blockers = [
    ...readUiMessages(visibilityIssues),
    ...readUiMessages(inputReachabilityIssues),
  ];

  return {
    passed: blockers.length === 0,
    blockers,
    warnings: [],
    durationMs: playtest.durationMs,
    visibilityIssues,
    inputReachabilityIssues,
  };
}

function emptySceneBindingValidation(): SceneBindingValidationOutput {
  return {
    success: false,
    entries: [],
    stdout: '',
    stderr: '',
    durationMs: 0,
  };
}

function emptyAutoloadValidation(): AutoloadValidationOutput {
  return {
    success: false,
    entries: [],
    stdout: '',
    stderr: '',
    durationMs: 0,
  };
}

function readFlowMessages(playtest: Awaited<ReturnType<typeof runPlaytest>>): string[] {
  const criticalFlow = playtest.finalState?.criticalFlow;
  if (criticalFlow === undefined || criticalFlow.passed) {
    return [];
  }

  return [`Critical flow failed at "${criticalFlow.failureStepId ?? 'unknown'}" after "${criticalFlow.lastSuccessfulStepId ?? 'none'}"`];
}

function readUiMessages(issues: Array<{ message: string }> | undefined): string[] {
  return issues?.map((issue) => issue.message) ?? [];
}

async function readCriticalFlowConfig(projectPath: string): Promise<CriticalFlowConfig | undefined> {
  const configPath = join(projectPath, 'harness', 'critical-flow.json');
  if (!existsSync(configPath)) {
    return undefined;
  }

  try {
    const raw = await readFile(configPath, 'utf8');
    return JSON.parse(raw) as CriticalFlowConfig;
  } catch {
    return undefined;
  }
}

function buildMilestoneSceneVerification(
  playtest: Awaited<ReturnType<typeof runPlaytest>>,
  config: CriticalFlowConfig | undefined,
  startup: StartupVerification,
  flow: FlowVerification,
  ui: UiVerification,
): MilestoneSceneVerification[] {
  const milestoneScenes = config?.milestoneScenes ?? [];
  if (milestoneScenes.length === 0) {
    return [];
  }

  const criticalFlow = playtest.finalState?.criticalFlow;
  const completedSteps = criticalFlow?.completedSteps ?? [];
  const sceneHistory = playtest.finalState?.sceneHistory ?? [];

  return milestoneScenes.map((scene) => {
    const sceneVisibilityIssues = ui.visibilityIssues.filter((issue) => issue.scene === scene.scene);
    const sceneInputIssues = ui.inputReachabilityIssues.filter((issue) => issue.scene === scene.scene);
    const sceneCompletedSteps = completedSteps.filter((step) => step.scene === scene.scene);

    const criteria = scene.acceptanceCriteria.map((criterion) =>
      evaluateMilestoneCriterion(
        criterion,
        scene,
        sceneCompletedSteps,
        sceneHistory,
        sceneVisibilityIssues,
        sceneInputIssues,
        startup,
        flow,
      ));

    const blockers = criteria.flatMap((criterion) => criterion.blockers);
    return {
      passed: blockers.length === 0,
      blockers,
      warnings: [],
      sceneId: scene.sceneId,
      runtimeScene: scene.scene,
      label: scene.label,
      ...(scene.primaryAction !== undefined ? { primaryAction: scene.primaryAction } : {}),
      criteria,
      definition: scene,
    };
  });
}

function evaluateMilestoneCriterion(
  criterion: MilestoneSceneCriterionDefinition,
  scene: MilestoneSceneDefinition,
  completedSteps: FlowVerification['completedSteps'],
  sceneHistory: string[],
  visibilityIssues: CriticalFlowVisibilityIssue[],
  inputIssues: CriticalFlowInputReachabilityIssue[],
  startup: StartupVerification,
  flow: FlowVerification,
): MilestoneCriterionVerification {
  const reachedScene = completedSteps.some((step) => step.passed && step.scene === scene.scene)
    || sceneHistory.includes(scene.scene);
  const matchingVisibilityIssues = visibilityIssues.filter((issue) =>
    criterion.controlIds === undefined
      || criterion.controlIds.length === 0
      || criterion.controlIds.includes(issue.controlId));
  const matchingInputIssues = inputIssues.filter((issue) =>
    criterion.actionIds === undefined
      || criterion.actionIds.length === 0
      || criterion.actionIds.includes(issue.actionId));
  const failureMatchesStep = criterion.stepIds?.includes(flow.failureStepId ?? '') ?? false;
  const completedRelevantStep = criterion.stepIds?.some((stepId) =>
    flow.completedSteps.some((step) => step.id === stepId && step.passed)) ?? false;

  const blockers: string[] = [];
  const evidence: string[] = [];

  switch (criterion.id) {
    case 'renders-visibly':
      if (!reachedScene) {
        blockers.push(`${scene.label}: ${criterion.description} (scene was not reached in the critical flow).`);
      } else if (matchingVisibilityIssues.length > 0) {
        blockers.push(
          `${scene.label}: ${criterion.description} (${matchingVisibilityIssues[0]?.message ?? 'visibility issue detected'}).`,
        );
      } else {
        evidence.push(`${scene.label}: rendered with no visibility issues in the verified viewport checks.`);
      }
      break;
    case 'primary-action-visible':
      if (!reachedScene) {
        blockers.push(`${scene.label}: ${criterion.description} (scene was not reached in the critical flow).`);
      } else if (matchingVisibilityIssues.length > 0) {
        blockers.push(
          `${scene.label}: ${criterion.description} (${matchingVisibilityIssues[0]?.message ?? 'primary action is not visible'}).`,
        );
      } else {
        evidence.push(`${scene.label}: primary action remained visible during milestone verification.`);
      }
      break;
    case 'progression-possible':
      if (matchingInputIssues.length > 0) {
        blockers.push(
          `${scene.label}: ${criterion.description} (${matchingInputIssues[0]?.message ?? 'progression action is unreachable'}).`,
        );
      } else if (failureMatchesStep) {
        blockers.push(
          `${scene.label}: ${criterion.description} (critical flow failed at "${flow.failureStepId ?? 'unknown'}").`,
        );
      } else if ((criterion.stepIds?.length ?? 0) > 0 && !completedRelevantStep && !reachedScene) {
        blockers.push(`${scene.label}: ${criterion.description} (the scene or progression step was not reached).`);
      } else {
        evidence.push(`${scene.label}: milestone progression remained reachable in the verified flow.`);
      }
      break;
    case 'no-runtime-blocker':
      if (startup.blockers.length > 0) {
        blockers.push(
          `${scene.label}: ${criterion.description} (${startup.blockers[0] ?? 'runtime blocker detected during startup'}).`,
        );
      } else if (failureMatchesStep && flow.blockers.length > 0) {
        blockers.push(
          `${scene.label}: ${criterion.description} (${flow.blockers[0] ?? 'runtime blocker detected in flow'}).`,
        );
      } else {
        evidence.push(`${scene.label}: no startup/runtime blocker was detected for this milestone path.`);
      }
      break;
  }

  return {
    id: criterion.id,
    description: criterion.description,
    status: blockers.length === 0 ? 'passed' : 'failed',
    blockers,
    evidence,
  };
}
