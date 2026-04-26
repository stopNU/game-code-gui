import { describe, expect, it } from 'vitest';
import {
  verifyCompleteness,
  formatCompletenessReprompt,
  type FileReader,
  type CompletenessIssue,
} from './completeness-verifier.js';

const SCENE = 'src/scenes/CombatScene.gd';
const SYSTEM = 'src/systems/CombatEngine.gd';
const AUTOLOAD = 'src/autoload/RunStateManager.gd';

function readerFor(files: Record<string, string>): FileReader {
  return async (abs) => {
    // Match by suffix so callers can pass either absolute or relative paths.
    const match = Object.entries(files).find(([rel]) => abs.endsWith(rel));
    if (!match) throw new Error(`not found: ${abs}`);
    return match[1];
  };
}

describe('verifyCompleteness', () => {
  it('passes when no files were modified', async () => {
    const result = await verifyCompleteness('/proj', [], readerFor({}));
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('skips non-.gd files', async () => {
    const result = await verifyCompleteness(
      '/proj',
      ['src/data/content/cards.json', 'docs/game-spec.md'],
      readerFor({}),
    );
    expect(result.passed).toBe(true);
  });

  it('skips .gd files outside scenes/systems/autoload', async () => {
    // e.g. a shared util script — we don't gate those by line count
    const result = await verifyCompleteness(
      '/proj',
      ['src/util/helpers.gd'],
      readerFor({ 'src/util/helpers.gd': '## TODO: implement\nextends Object\n' }),
    );
    expect(result.passed).toBe(true);
  });

  it('flags a scene script that still has the STUB docstring', async () => {
    const stub = [
      '## TODO: implement this scene',
      '## STUB — must be replaced before any flow reaches it.',
      'extends Node',
      '',
      'const _SCENE_NAME := "CombatScene"',
      '',
      'func _ready() -> void:',
      '    push_error("[stub] CombatScene reached but not implemented — fill src/scenes/CombatScene.gd")',
      '    assert(false, "CombatScene is a stub — implement before any flow can reach this scene")',
    ].join('\n');
    const result = await verifyCompleteness('/proj', [SCENE], readerFor({ [SCENE]: stub }));
    expect(result.passed).toBe(false);
    expect(result.issues[0]?.filePath).toBe(SCENE);
    // The first matching marker wins; "STUB — must be replaced" is checked first.
    expect(result.issues[0]?.reason).toContain('STUB');
  });

  it('flags a scene that removed the docstring but kept the assert', async () => {
    const partial = [
      'extends Control',
      '',
      'func _ready() -> void:',
      '    assert(false, "CombatScene is a stub — implement before any flow can reach this scene")',
      '    pass',
    ].join('\n');
    const result = await verifyCompleteness('/proj', [SCENE], readerFor({ [SCENE]: partial }));
    expect(result.passed).toBe(false);
    expect(result.issues[0]?.reason).toContain('assert');
  });

  it('flags a scene that removed the assert but kept the push_error', async () => {
    const partial = [
      'extends Control',
      '',
      'func _ready() -> void:',
      '    push_error("[stub] CombatScene reached but not implemented")',
      '    pass',
    ].join('\n');
    const result = await verifyCompleteness('/proj', [SCENE], readerFor({ [SCENE]: partial }));
    expect(result.passed).toBe(false);
    expect(result.issues[0]?.reason).toContain('push_error');
  });

  it('flags a scene that still leads with the TODO marker', async () => {
    const partial = [
      '## TODO: implement this scene',
      'extends Control',
      '',
      'func _ready() -> void:',
      '    pass',
    ].join('\n');
    const result = await verifyCompleteness('/proj', [SCENE], readerFor({ [SCENE]: partial }));
    expect(result.passed).toBe(false);
    expect(result.issues[0]?.reason).toContain('TODO: implement');
  });

  it('flags a scene that is below the minimum line floor', async () => {
    const tiny = [
      'extends Control',
      '',
      'func _ready() -> void:',
      '    pass',
    ].join('\n');
    const result = await verifyCompleteness('/proj', [SCENE], readerFor({ [SCENE]: tiny }));
    expect(result.passed).toBe(false);
    expect(result.issues[0]?.reason).toContain('only');
    expect(result.issues[0]?.reason).toContain('lines');
  });

  it('uses a higher floor for scene scripts than autoload scripts', async () => {
    // 18 lines: under scene floor (30) but over autoload floor (15)
    const eighteenLines = Array.from({ length: 18 }, (_, i) => `# line ${i}`).join('\n');
    const sceneResult = await verifyCompleteness(
      '/proj',
      [SCENE],
      readerFor({ [SCENE]: eighteenLines }),
    );
    expect(sceneResult.passed).toBe(false);

    const autoloadResult = await verifyCompleteness(
      '/proj',
      [AUTOLOAD],
      readerFor({ [AUTOLOAD]: eighteenLines }),
    );
    expect(autoloadResult.passed).toBe(true);
  });

  it('passes a real implementation that has none of the stub markers', async () => {
    const real = [
      '## CombatEngine — runs the deckbuilder turn loop.',
      'extends RefCounted',
      '',
      'enum CombatState { PLAYER_TURN, RESOLVING, ENEMY_TURN, VICTORY, DEFEAT }',
      'var _state := CombatState.PLAYER_TURN',
      '',
      'func start_turn() -> void:',
      '    EventBus.turn_started.emit()',
      '    _state = CombatState.PLAYER_TURN',
      '',
      'func play_card(card_id: String, target_id: String) -> void:',
      '    EventBus.card_played.emit(card_id, target_id)',
      '',
      'func end_turn() -> void:',
      '    _state = CombatState.ENEMY_TURN',
      '    EventBus.turn_ended.emit()',
      '',
      'func resolve_enemy_turn() -> void:',
      '    pass',
      '',
      'func check_victory() -> bool:',
      '    return false',
    ].join('\n');
    const result = await verifyCompleteness('/proj', [SYSTEM], readerFor({ [SYSTEM]: real }));
    expect(result.passed).toBe(true);
  });

  it('deduplicates repeated entries in filesModified', async () => {
    const stub = [
      '## TODO: implement',
      'extends Node',
      'func _ready() -> void:',
      '    assert(false, "CombatScene is a stub — implement before any flow can reach this scene")',
    ].join('\n');
    const result = await verifyCompleteness(
      '/proj',
      [SCENE, SCENE, SCENE],
      readerFor({ [SCENE]: stub }),
    );
    expect(result.issues.length).toBe(1);
  });

  it('skips files that fail to read (treats as not-a-stub)', async () => {
    const reader: FileReader = async () => {
      throw new Error('ENOENT');
    };
    const result = await verifyCompleteness('/proj', [SCENE], reader);
    expect(result.passed).toBe(true);
  });
});

describe('formatCompletenessReprompt', () => {
  it('mentions every issue and instructs the agent to revert if out of scope', () => {
    const issues: CompletenessIssue[] = [
      { filePath: 'src/scenes/ShopScene.gd', reason: 'still contains "STUB"' },
      { filePath: 'src/systems/MapGenerator.gd', reason: 'has only 6 lines (min 20)' },
    ];
    const reprompt = formatCompletenessReprompt(issues);
    expect(reprompt).toContain('src/scenes/ShopScene.gd');
    expect(reprompt).toContain('src/systems/MapGenerator.gd');
    expect(reprompt).toContain('only 6 lines');
    expect(reprompt).toContain('not complete');
    // Tells the agent that "leave it alone" is a valid answer when out of scope.
    expect(reprompt).toMatch(/outside this task|untouched|revert/);
  });
});
