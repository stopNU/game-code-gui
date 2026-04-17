import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runDataEval } from './data-eval.js';
import { runSystemsEval } from './systems-eval.js';

const { runSceneBindingValidationMock } = vi.hoisted(() => ({
  runSceneBindingValidationMock: vi.fn(),
}));
const { runAutoloadValidationMock } = vi.hoisted(() => ({
  runAutoloadValidationMock: vi.fn(),
}));
const { validateRuntimeLayoutMock } = vi.hoisted(() => ({
  validateRuntimeLayoutMock: vi.fn(),
}));
const { formatRuntimeLayoutIssuesMock } = vi.hoisted(() => ({
  formatRuntimeLayoutIssuesMock: vi.fn(),
}));
const { generateRuntimeManifestMock } = vi.hoisted(() => ({
  generateRuntimeManifestMock: vi.fn(),
}));

vi.mock('@agent-harness/game-adapter', () => ({
  runSceneBindingValidation: runSceneBindingValidationMock,
  runAutoloadValidation: runAutoloadValidationMock,
  validateRuntimeLayout: validateRuntimeLayoutMock,
  formatRuntimeLayoutIssues: formatRuntimeLayoutIssuesMock,
  generateRuntimeManifest: generateRuntimeManifestMock,
}));

describe('data eval', () => {
  it('fails when content entry is missing id field', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'data-eval-'));
    const contentDir = join(projectPath, 'src', 'data', 'content');
    await mkdir(contentDir, { recursive: true });
    await writeFile(join(contentDir, 'cards.json'), JSON.stringify([{ name: 'No id here' }]), 'utf8');

    const result = await runDataEval({ projectPath });

    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(6);
  });

  it('passes when all entries have valid ids', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'data-eval-pass-'));
    const contentDir = join(projectPath, 'src', 'data', 'content');
    await mkdir(contentDir, { recursive: true });
    await writeFile(
      join(contentDir, 'cards.json'),
      JSON.stringify([
        { id: 'strike', name: 'Strike', artPrompt: 'a glowing sword slash' },
        { id: 'defend', name: 'Defend', artPrompt: 'a glowing shield' },
        { id: 'bash', name: 'Bash', artPrompt: 'a mace strike' },
      ]),
      'utf8',
    );

    const result = await runDataEval({ projectPath });

    expect(result.score).toBeGreaterThanOrEqual(6);
  });
});

describe('systems eval (GDScript)', () => {
  beforeEach(() => {
    runSceneBindingValidationMock.mockReset();
    runAutoloadValidationMock.mockReset();
    validateRuntimeLayoutMock.mockReset();
    formatRuntimeLayoutIssuesMock.mockReset();
    generateRuntimeManifestMock.mockReset();
    validateRuntimeLayoutMock.mockResolvedValue({
      success: true,
      canonicalLayoutId: 'godot-src-v1',
      allowMixedActiveLayouts: false,
      authoritativeRuntimeRoots: ['src', 'src/autoload', 'src/scenes', 'src/systems'],
      conflictingRuntimeRoots: ['scripts'],
      activeRuntimeRoots: ['src', 'src/autoload', 'src/scenes'],
      duplicateSubsystems: [],
      issues: [],
    });
    formatRuntimeLayoutIssuesMock.mockImplementation((result: { issues: string[] }) => result.issues);
    generateRuntimeManifestMock.mockResolvedValue({
      version: '1.0.0',
      generatedAt: '2026-04-16T00:00:00.000Z',
      canonicalLayoutId: 'godot-src-v1',
      manifestPath: 'harness/runtime-manifest.json',
      scenes: [],
      scripts: [],
      autoloads: [],
      dataRoots: [],
    });
  });

  it('fails when GDScript autoload files are missing', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'systems-eval-'));
    runAutoloadValidationMock.mockResolvedValue({
      success: true,
      entries: [],
      stdout: '',
      stderr: '',
      durationMs: 1,
    });
    runSceneBindingValidationMock.mockResolvedValue({
      success: true,
      entries: [],
      stdout: '',
      stderr: '',
      durationMs: 1,
    });
    generateRuntimeManifestMock.mockResolvedValue({
      version: '1.0.0',
      generatedAt: '2026-04-16T00:00:00.000Z',
      canonicalLayoutId: 'godot-src-v1',
      manifestPath: 'harness/runtime-manifest.json',
      scenes: [],
      scripts: [],
      autoloads: [],
      dataRoots: [],
    });

    const result = await runSystemsEval({ projectPath });

    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(6);
  });

  it('passes when all GDScript autoloads and scene bindings are valid', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'systems-eval-pass-'));
    const autoloadDir = join(projectPath, 'src', 'autoload');
    const scenesDir = join(projectPath, 'src', 'scenes');
    await mkdir(autoloadDir, { recursive: true });
    await mkdir(scenesDir, { recursive: true });
    await writeFile(join(projectPath, 'project.godot'), [
      '[autoload]',
      'EventBus="*res://src/autoload/EventBus.gd"',
      'ContentLoader="*res://src/autoload/ContentLoader.gd"',
      'RunStateManager="*res://src/autoload/RunStateManager.gd"',
      'DebugOverlay="*res://src/autoload/DebugOverlay.gd"',
      'HarnessPlugin="*res://src/autoload/HarnessPlugin.gd"',
      'GameState="*res://src/autoload/GameState.gd"',
    ].join('\n'), 'utf8');
    await writeFile(join(projectPath, 'src', 'main.tscn'), '[gd_scene format=3]\n[node name="Boot" type="Node"]\n', 'utf8');
    await writeFile(join(scenesDir, 'BootScene.tscn'), '[gd_scene format=3]\n[node name="BootScene" type="Node"]\n', 'utf8');

    await writeFile(join(autoloadDir, 'EventBus.gd'), [
      'extends Node',
      'signal card_played(card_id: String, target_id: String)',
      'signal turn_started(is_player_turn: bool)',
      'signal turn_ended(is_player_turn: bool)',
    ].join('\n'), 'utf8');

    await writeFile(join(autoloadDir, 'ContentLoader.gd'), [
      'extends Node',
      'func load_all() -> void:',
      '    var file := FileAccess.open("res://src/data/content/cards.json", FileAccess.READ)',
      '    _cards = JSON.parse_string(file.get_as_text())',
      'func get_cards() -> Array[Dictionary]: return _cards',
      'func get_enemies() -> Array[Dictionary]: return _enemies',
    ].join('\n'), 'utf8');

    await writeFile(join(autoloadDir, 'RunStateManager.gd'), [
      'extends Node',
      'func save_run() -> void:',
      '    var file := FileAccess.open("user://run_save.json", FileAccess.WRITE)',
      'func load_run() -> void:',
      '    var file := FileAccess.open("user://run_save.json", FileAccess.READ)',
    ].join('\n'), 'utf8');

    await writeFile(join(autoloadDir, 'HarnessPlugin.gd'), [
      'extends Node',
      'func _ready() -> void:',
      '    if "--harness-test" in OS.get_cmdline_args():',
      '        _write_output()',
      'func _write_output() -> void:',
      '    var f := FileAccess.open("harness/test-output.json", FileAccess.WRITE)',
    ].join('\n'), 'utf8');

    await writeFile(join(autoloadDir, 'DebugOverlay.gd'), [
      'extends CanvasLayer',
      'func push_error_message(source: String, message: String) -> void:',
      '    push_error("[%s] %s" % [source, message])',
      'func copy_snapshot_to_clipboard() -> void:',
      '    DisplayServer.clipboard_set("snapshot")',
      'func _should_enable_runtime_overlay() -> bool:',
      '    return bool(ProjectSettings.get_setting("debug_overlay/enabled_in_release", false))',
    ].join('\n'), 'utf8');

    await writeFile(join(autoloadDir, 'GameState.gd'), [
      'extends Node',
      'func save() -> void:',
      '    pass',
      'func load() -> void:',
      '    pass',
    ].join('\n'), 'utf8');

    runAutoloadValidationMock.mockResolvedValue({
      success: true,
      entries: [
        { name: 'EventBus', scriptPath: 'res://src/autoload/EventBus.gd', passed: true },
        { name: 'ContentLoader', scriptPath: 'res://src/autoload/ContentLoader.gd', passed: true },
        { name: 'RunStateManager', scriptPath: 'res://src/autoload/RunStateManager.gd', passed: true },
        { name: 'DebugOverlay', scriptPath: 'res://src/autoload/DebugOverlay.gd', passed: true },
        { name: 'HarnessPlugin', scriptPath: 'res://src/autoload/HarnessPlugin.gd', passed: true },
        { name: 'GameState', scriptPath: 'res://src/autoload/GameState.gd', passed: true },
      ],
      stdout: '',
      stderr: '',
      durationMs: 1,
    });
    generateRuntimeManifestMock.mockResolvedValue({
      version: '1.0.0',
      generatedAt: '2026-04-16T00:00:00.000Z',
      canonicalLayoutId: 'godot-src-v1',
      manifestPath: 'harness/runtime-manifest.json',
      mainScenePath: 'res://src/main.tscn',
      scenes: [
        { id: 'main', scenePath: 'res://src/main.tscn', scriptPath: 'res://src/main.gd' },
        {
          id: 'BootScene',
          scenePath: 'res://src/scenes/BootScene.tscn',
          scriptPath: 'res://src/scenes/BootScene.gd',
        },
      ],
      scripts: [
        { id: 'EventBus', scriptPath: 'res://src/autoload/EventBus.gd', category: 'autoload' },
        { id: 'ContentLoader', scriptPath: 'res://src/autoload/ContentLoader.gd', category: 'autoload' },
        { id: 'RunStateManager', scriptPath: 'res://src/autoload/RunStateManager.gd', category: 'autoload' },
        { id: 'DebugOverlay', scriptPath: 'res://src/autoload/DebugOverlay.gd', category: 'autoload' },
        { id: 'HarnessPlugin', scriptPath: 'res://src/autoload/HarnessPlugin.gd', category: 'autoload' },
        { id: 'GameState', scriptPath: 'res://src/autoload/GameState.gd', category: 'autoload' },
        { id: 'main', scriptPath: 'res://src/main.gd', category: 'scene' },
        { id: 'BootScene', scriptPath: 'res://src/scenes/BootScene.gd', category: 'scene' },
      ],
      autoloads: [
        { name: 'ContentLoader', scriptPath: 'res://src/autoload/ContentLoader.gd' },
        { name: 'DebugOverlay', scriptPath: 'res://src/autoload/DebugOverlay.gd' },
        { name: 'EventBus', scriptPath: 'res://src/autoload/EventBus.gd' },
        { name: 'GameState', scriptPath: 'res://src/autoload/GameState.gd' },
        { name: 'HarnessPlugin', scriptPath: 'res://src/autoload/HarnessPlugin.gd' },
        { name: 'RunStateManager', scriptPath: 'res://src/autoload/RunStateManager.gd' },
      ],
      dataRoots: [],
    });

    runSceneBindingValidationMock.mockResolvedValue({
      success: true,
      entries: [
        {
          scenePath: 'res://src/main.tscn',
          rootType: 'Node',
          attachedScriptPath: 'res://src/main.gd',
          expectedSiblingScriptPath: 'res://src/main.gd',
          passed: true,
        },
        {
          scenePath: 'res://src/scenes/BootScene.tscn',
          rootType: 'Node',
          attachedScriptPath: 'res://src/scenes/BootScene.gd',
          expectedSiblingScriptPath: 'res://src/scenes/BootScene.gd',
          passed: true,
        },
      ],
      stdout: '',
      stderr: '',
      durationMs: 1,
    });

    const result = await runSystemsEval({ projectPath });

    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(9);
    expect(result.summary).toContain('ACTIVE SCRIPT FILES:');
    expect(result.summary).toContain('UNUSED DUPLICATE SCRIPTS: none');
    expect(result.summary).toContain('ORPHAN RUNTIME SCRIPTS: none');
    expect(runAutoloadValidationMock).toHaveBeenCalledWith(projectPath, [
      { name: 'EventBus', scriptPath: 'res://src/autoload/EventBus.gd' },
      { name: 'ContentLoader', scriptPath: 'res://src/autoload/ContentLoader.gd' },
      { name: 'RunStateManager', scriptPath: 'res://src/autoload/RunStateManager.gd' },
      { name: 'DebugOverlay', scriptPath: 'res://src/autoload/DebugOverlay.gd' },
      { name: 'HarnessPlugin', scriptPath: 'res://src/autoload/HarnessPlugin.gd' },
      { name: 'GameState', scriptPath: 'res://src/autoload/GameState.gd' },
    ]);
    expect(runSceneBindingValidationMock).toHaveBeenCalledWith(projectPath, [
      'res://src/main.tscn',
      'res://src/scenes/BootScene.tscn',
    ]);
  });

  it('fails when a runtime scene root loses its script binding', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'systems-eval-scene-fail-'));
    const autoloadDir = join(projectPath, 'src', 'autoload');
    const scenesDir = join(projectPath, 'src', 'scenes');
    await mkdir(autoloadDir, { recursive: true });
    await mkdir(scenesDir, { recursive: true });
    await writeFile(join(projectPath, 'project.godot'), [
      '[autoload]',
      'EventBus="*res://src/autoload/EventBus.gd"',
      'ContentLoader="*res://src/autoload/ContentLoader.gd"',
      'RunStateManager="*res://src/autoload/RunStateManager.gd"',
      'DebugOverlay="*res://src/autoload/DebugOverlay.gd"',
      'HarnessPlugin="*res://src/autoload/HarnessPlugin.gd"',
      'GameState="*res://src/autoload/GameState.gd"',
    ].join('\n'), 'utf8');
    await writeFile(join(scenesDir, 'CombatScene.tscn'), '[gd_scene format=3]\n[node name="Combat" type="Control"]\n', 'utf8');
    await writeFile(join(autoloadDir, 'EventBus.gd'), [
      'extends Node',
      'signal card_played(card_id: String, target_id: String)',
      'signal turn_started(is_player_turn: bool)',
      'signal turn_ended(is_player_turn: bool)',
    ].join('\n'), 'utf8');

    await writeFile(join(autoloadDir, 'ContentLoader.gd'), [
      'extends Node',
      'func load_all() -> void:',
      '    var file := FileAccess.open("res://src/data/content/cards.json", FileAccess.READ)',
      '    _cards = JSON.parse_string(file.get_as_text())',
      'func get_cards() -> Array[Dictionary]: return _cards',
      'func get_enemies() -> Array[Dictionary]: return _enemies',
    ].join('\n'), 'utf8');

    await writeFile(join(autoloadDir, 'RunStateManager.gd'), [
      'extends Node',
      'func save_run() -> void:',
      '    var file := FileAccess.open("user://run_save.json", FileAccess.WRITE)',
      'func load_run() -> void:',
      '    var file := FileAccess.open("user://run_save.json", FileAccess.READ)',
    ].join('\n'), 'utf8');

    await writeFile(join(autoloadDir, 'HarnessPlugin.gd'), [
      'extends Node',
      'func _ready() -> void:',
      '    if "--harness-test" in OS.get_cmdline_args():',
      '        _write_output()',
      'func _write_output() -> void:',
      '    var f := FileAccess.open("harness/test-output.json", FileAccess.WRITE)',
    ].join('\n'), 'utf8');

    await writeFile(join(autoloadDir, 'DebugOverlay.gd'), [
      'extends CanvasLayer',
      'func push_error_message(source: String, message: String) -> void:',
      '    push_error("[%s] %s" % [source, message])',
      'func copy_snapshot_to_clipboard() -> void:',
      '    DisplayServer.clipboard_set("snapshot")',
      'func _should_enable_runtime_overlay() -> bool:',
      '    return bool(ProjectSettings.get_setting("debug_overlay/enabled_in_release", false))',
    ].join('\n'), 'utf8');

    await writeFile(join(autoloadDir, 'GameState.gd'), [
      'extends Node',
      'func save() -> void:',
      '    pass',
      'func load() -> void:',
      '    pass',
    ].join('\n'), 'utf8');

    runAutoloadValidationMock.mockResolvedValue({
      success: true,
      entries: [
        { name: 'EventBus', scriptPath: 'res://src/autoload/EventBus.gd', passed: true },
        { name: 'ContentLoader', scriptPath: 'res://src/autoload/ContentLoader.gd', passed: true },
        { name: 'RunStateManager', scriptPath: 'res://src/autoload/RunStateManager.gd', passed: true },
        { name: 'DebugOverlay', scriptPath: 'res://src/autoload/DebugOverlay.gd', passed: true },
        { name: 'HarnessPlugin', scriptPath: 'res://src/autoload/HarnessPlugin.gd', passed: true },
        { name: 'GameState', scriptPath: 'res://src/autoload/GameState.gd', passed: true },
      ],
      stdout: '',
      stderr: '',
      durationMs: 1,
    });

    runSceneBindingValidationMock.mockResolvedValue({
      success: false,
      entries: [
        {
          scenePath: 'res://src/scenes/CombatScene.tscn',
          rootType: 'Control',
          attachedScriptPath: null,
          expectedSiblingScriptPath: 'res://src/scenes/CombatScene.gd',
          passed: false,
          failureReason: 'Root script is null',
        },
      ],
      stdout: '',
      stderr: '',
      durationMs: 1,
    });
    generateRuntimeManifestMock.mockResolvedValue({
      version: '1.0.0',
      generatedAt: '2026-04-16T00:00:00.000Z',
      canonicalLayoutId: 'godot-src-v1',
      manifestPath: 'harness/runtime-manifest.json',
      scenes: [
        {
          id: 'CombatScene',
          scenePath: 'res://src/scenes/CombatScene.tscn',
          scriptPath: 'res://src/scenes/CombatScene.gd',
        },
      ],
      scripts: [
        { id: 'EventBus', scriptPath: 'res://src/autoload/EventBus.gd', category: 'autoload' },
        { id: 'ContentLoader', scriptPath: 'res://src/autoload/ContentLoader.gd', category: 'autoload' },
        { id: 'RunStateManager', scriptPath: 'res://src/autoload/RunStateManager.gd', category: 'autoload' },
        { id: 'DebugOverlay', scriptPath: 'res://src/autoload/DebugOverlay.gd', category: 'autoload' },
        { id: 'HarnessPlugin', scriptPath: 'res://src/autoload/HarnessPlugin.gd', category: 'autoload' },
        { id: 'GameState', scriptPath: 'res://src/autoload/GameState.gd', category: 'autoload' },
        { id: 'CombatScene', scriptPath: 'res://src/scenes/CombatScene.gd', category: 'scene' },
      ],
      autoloads: [
        { name: 'ContentLoader', scriptPath: 'res://src/autoload/ContentLoader.gd' },
        { name: 'DebugOverlay', scriptPath: 'res://src/autoload/DebugOverlay.gd' },
        { name: 'EventBus', scriptPath: 'res://src/autoload/EventBus.gd' },
        { name: 'GameState', scriptPath: 'res://src/autoload/GameState.gd' },
        { name: 'HarnessPlugin', scriptPath: 'res://src/autoload/HarnessPlugin.gd' },
        { name: 'RunStateManager', scriptPath: 'res://src/autoload/RunStateManager.gd' },
      ],
      dataRoots: [],
    });

    const result = await runSystemsEval({ projectPath });

    expect(result.passed).toBe(false);
    expect(result.summary).toContain('res://src/scenes/CombatScene.tscn');
    expect(result.summary).toContain('script=null');
    expect(result.summary).toContain('expected=res://src/scenes/CombatScene.gd');
    expect(result.summary).toContain('UNUSED DUPLICATE SCRIPTS: res://src/scenes/CombatScene.gd intended-for=res://src/scenes/CombatScene.tscn active=none');
  });

  it('fails when a declared autoload cannot compile or instantiate', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'systems-eval-autoload-fail-'));
    const autoloadDir = join(projectPath, 'src', 'autoload');
    const scenesDir = join(projectPath, 'src', 'scenes');
    await mkdir(autoloadDir, { recursive: true });
    await mkdir(scenesDir, { recursive: true });
    await writeFile(join(projectPath, 'project.godot'), [
      '[autoload]',
      'EventBus="*res://src/autoload/EventBus.gd"',
      'BrokenLoader="*res://src/autoload/BrokenLoader.gd"',
      'DebugOverlay="*res://src/autoload/DebugOverlay.gd"',
    ].join('\n'), 'utf8');
    await writeFile(join(scenesDir, 'BootScene.tscn'), '[gd_scene format=3]\n[node name="BootScene" type="Node"]\n', 'utf8');

    await writeFile(join(autoloadDir, 'EventBus.gd'), [
      'extends Node',
      'signal card_played(card_id: String, target_id: String)',
      'signal turn_started(is_player_turn: bool)',
      'signal turn_ended(is_player_turn: bool)',
    ].join('\n'), 'utf8');
    await writeFile(join(autoloadDir, 'ContentLoader.gd'), [
      'extends Node',
      'func load_all() -> void:',
      '    var file := FileAccess.open("res://src/data/content/cards.json", FileAccess.READ)',
      '    _cards = JSON.parse_string(file.get_as_text())',
      'func get_cards() -> Array[Dictionary]: return _cards',
      'func get_enemies() -> Array[Dictionary]: return _enemies',
    ].join('\n'), 'utf8');
    await writeFile(join(autoloadDir, 'RunStateManager.gd'), [
      'extends Node',
      'func save_run() -> void:',
      '    var file := FileAccess.open("user://run_save.json", FileAccess.WRITE)',
      'func load_run() -> void:',
      '    var file := FileAccess.open("user://run_save.json", FileAccess.READ)',
    ].join('\n'), 'utf8');
    await writeFile(join(autoloadDir, 'HarnessPlugin.gd'), [
      'extends Node',
      'func _ready() -> void:',
      '    if "--harness-test" in OS.get_cmdline_args():',
      '        _write_output()',
      'func _write_output() -> void:',
      '    var f := FileAccess.open("harness/test-output.json", FileAccess.WRITE)',
    ].join('\n'), 'utf8');
    await writeFile(join(autoloadDir, 'DebugOverlay.gd'), [
      'extends CanvasLayer',
      'func push_error_message(source: String, message: String) -> void:',
      '    push_error("[%s] %s" % [source, message])',
      'func copy_snapshot_to_clipboard() -> void:',
      '    DisplayServer.clipboard_set("snapshot")',
      'func _should_enable_runtime_overlay() -> bool:',
      '    return bool(ProjectSettings.get_setting("debug_overlay/enabled_in_release", false))',
    ].join('\n'), 'utf8');
    await writeFile(join(autoloadDir, 'GameState.gd'), [
      'extends Node',
      'func save() -> void:',
      '    pass',
      'func load() -> void:',
      '    pass',
    ].join('\n'), 'utf8');

    runAutoloadValidationMock.mockResolvedValue({
      success: false,
      entries: [
        { name: 'EventBus', scriptPath: 'res://src/autoload/EventBus.gd', passed: true },
        {
          name: 'BrokenLoader',
          scriptPath: 'res://src/autoload/BrokenLoader.gd',
          passed: false,
          errorText: 'Parse Error: Unexpected identifier',
        },
      ],
      stdout: '',
      stderr: '',
      durationMs: 1,
    });
    runSceneBindingValidationMock.mockResolvedValue({
      success: true,
      entries: [
        {
          scenePath: 'res://src/scenes/BootScene.tscn',
          rootType: 'Node',
          attachedScriptPath: 'res://src/scenes/BootScene.gd',
          expectedSiblingScriptPath: 'res://src/scenes/BootScene.gd',
          passed: true,
        },
      ],
      stdout: '',
      stderr: '',
      durationMs: 1,
    });
    generateRuntimeManifestMock.mockResolvedValue({
      version: '1.0.0',
      generatedAt: '2026-04-16T00:00:00.000Z',
      canonicalLayoutId: 'godot-src-v1',
      manifestPath: 'harness/runtime-manifest.json',
      scenes: [
        {
          id: 'BootScene',
          scenePath: 'res://src/scenes/BootScene.tscn',
          scriptPath: 'res://src/scenes/BootScene.gd',
        },
      ],
      scripts: [
        { id: 'EventBus', scriptPath: 'res://src/autoload/EventBus.gd', category: 'autoload' },
        { id: 'ContentLoader', scriptPath: 'res://src/autoload/ContentLoader.gd', category: 'autoload' },
        { id: 'DebugOverlay', scriptPath: 'res://src/autoload/DebugOverlay.gd', category: 'autoload' },
        { id: 'RunStateManager', scriptPath: 'res://src/autoload/RunStateManager.gd', category: 'autoload' },
        { id: 'HarnessPlugin', scriptPath: 'res://src/autoload/HarnessPlugin.gd', category: 'autoload' },
        { id: 'GameState', scriptPath: 'res://src/autoload/GameState.gd', category: 'autoload' },
        { id: 'BootScene', scriptPath: 'res://src/scenes/BootScene.gd', category: 'scene' },
        { id: 'UnusedCombatMath', scriptPath: 'res://src/systems/UnusedCombatMath.gd', category: 'system' },
      ],
      autoloads: [
        { name: 'BrokenLoader', scriptPath: 'res://src/autoload/BrokenLoader.gd' },
        { name: 'DebugOverlay', scriptPath: 'res://src/autoload/DebugOverlay.gd' },
        { name: 'EventBus', scriptPath: 'res://src/autoload/EventBus.gd' },
      ],
      dataRoots: [],
    });

    const result = await runSystemsEval({ projectPath });

    expect(result.passed).toBe(false);
    expect(result.summary).toContain('AUTOLOAD FAIL: BrokenLoader -> res://src/autoload/BrokenLoader.gd');
    expect(result.summary).toContain('Parse Error: Unexpected identifier');
    expect(result.summary).toContain('ORPHAN RUNTIME SCRIPTS: res://src/autoload/ContentLoader.gd, res://src/autoload/GameState.gd, res://src/autoload/HarnessPlugin.gd, res://src/autoload/RunStateManager.gd, res://src/systems/UnusedCombatMath.gd');
  });

  it('fails fast when mixed runtime roots are active', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'systems-eval-layout-fail-'));
    validateRuntimeLayoutMock.mockResolvedValue({
      success: false,
      canonicalLayoutId: 'godot-src-v1',
      allowMixedActiveLayouts: false,
      authoritativeRuntimeRoots: ['src', 'src/autoload', 'src/scenes', 'src/systems'],
      conflictingRuntimeRoots: ['scripts'],
      activeRuntimeRoots: ['src', 'scripts'],
      duplicateSubsystems: [
        {
          subsystem: 'EventBus',
          authoritativePath: 'src/autoload/EventBus.gd',
          conflictingPath: 'scripts/core/EventBus.gd',
        },
      ],
      issues: [
        'Mixed active runtime layout detected across roots: src, scripts',
        'Duplicate subsystem "EventBus" found in src/autoload/EventBus.gd and scripts/core/EventBus.gd',
      ],
    });
    formatRuntimeLayoutIssuesMock.mockReturnValue([
      'Canonical layout: godot-src-v1',
      'Authoritative roots: src, src/autoload, src/scenes, src/systems',
      'Conflicting roots: scripts',
      'Active roots: src, scripts',
      'Mixed active runtime layout detected across roots: src, scripts',
      'Duplicate subsystem "EventBus" found in src/autoload/EventBus.gd and scripts/core/EventBus.gd',
    ]);

    const result = await runSystemsEval({ projectPath });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.summary).toContain('Mixed active runtime layout detected across roots: src, scripts');
    expect(result.summary).toContain('Duplicate subsystem "EventBus" found in src/autoload/EventBus.gd and scripts/core/EventBus.gd');
    expect(runAutoloadValidationMock).not.toHaveBeenCalled();
    expect(runSceneBindingValidationMock).not.toHaveBeenCalled();
  });
});
