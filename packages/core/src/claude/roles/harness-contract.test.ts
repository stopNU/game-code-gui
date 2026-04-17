import { describe, expect, it } from 'vitest';
import { buildAdvancedDesignerPrompt } from './advanced-designer.js';
import { buildAdvancedGameplayPrompt } from './advanced-gameplay.js';

describe('advanced harness contract prompts', () => {
  it('injects the exact runtime contract into the advanced designer prompt', () => {
    const prompt = buildAdvancedDesignerPrompt();

    expect(prompt).toContain('window.__HARNESS__.getState()');
    expect(prompt).toContain('machineStates: Record<string, string>');
    expect(prompt).toContain('gameState.handSize');
    expect(prompt).toContain('machineStates.combat');
    expect(prompt).toContain('Every gameplay, systems, and integration-verifier task must identify the authoritative runtime file path for the subsystem it changes.');
    expect(prompt).toContain('reference the active .tscn path, the paired script path when applicable, and project.godot');
  });

  it('tells advanced gameplay to expose scene fields via gameState without duplicating machineStates', () => {
    const prompt = buildAdvancedGameplayPrompt();

    expect(prompt).toContain('Scene `get harnessState()` values become `window.__HARNESS__.getState().gameState`');
    expect(prompt).toContain('Do NOT duplicate FSM values as `machineState` or `machineStates` inside the getter');
    expect(prompt).toContain('selectedCardId');
    expect(prompt).toContain('Before editing any runtime code, identify the authoritative project-relative path for the subsystem you are touching');
    expect(prompt).toContain('When changing flow code, scene transitions, autoload wiring, or startup/combat progression, read the active .tscn and project.godot first');
  });
});
