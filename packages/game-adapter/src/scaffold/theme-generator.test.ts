import { describe, expect, it } from 'vitest';
import type { StyleNote } from '@agent-harness/core';
import { buildThemeAssets } from './theme-generator.js';

function styleNote(overrides: Partial<StyleNote['palette']> = {}): StyleNote {
  return {
    mood: 'test mood',
    typographyNote: 'test',
    artDirection: 'test',
    palette: {
      bgDeep: '#101218',
      bgPanel: '#1c2030',
      accent: '#d14b3c',
      success: '#6abf69',
      warning: '#e0b14a',
      danger: '#c0392b',
      text: '#e8ecf4',
      textDim: '#9aa3b8',
      ...overrides,
    },
  };
}

describe('buildThemeAssets', () => {
  it('produces a parseable palette.gd with class_name Palette', () => {
    const result = buildThemeAssets(styleNote());
    expect(result.paletteGd).toContain('class_name Palette');
    expect(result.paletteGd).toContain('extends RefCounted');
    expect(result.paletteGd).toContain('const ACCENT :=');
    expect(result.paletteGd).toContain('const TEXT :=');
    expect(result.paletteGd).toContain('const BG_DEEP :=');
  });

  it('converts hex palette values to Godot Color literals', () => {
    const result = buildThemeAssets(styleNote({ accent: '#ff0000' }));
    // #ff0000 → r=1, g=0, b=0
    expect(result.paletteGd).toMatch(/const ACCENT := Color\(1\.0, 0\.0, 0\.0, 1\.0\)/);
  });

  it('rejects malformed hex values with a clear error', () => {
    expect(() => buildThemeAssets(styleNote({ accent: 'not-a-colour' }))).toThrow(/Invalid hex/);
    expect(() => buildThemeAssets(styleNote({ accent: '#abc' }))).toThrow(/Invalid hex/);
    expect(() => buildThemeAssets(styleNote({ accent: '#gggggg' }))).toThrow(/Invalid hex/);
  });

  it('accepts hex with or without leading #', () => {
    const withHash = buildThemeAssets(styleNote({ accent: '#abcdef' }));
    const withoutHash = buildThemeAssets(styleNote({ accent: 'abcdef' }));
    // Both should parse, both should embed the same colour.
    const colorRe = /const ACCENT := Color\(([^)]+)\)/;
    expect(withHash.paletteGd.match(colorRe)?.[1]).toBe(withoutHash.paletteGd.match(colorRe)?.[1]);
  });

  it('produces a theme.tres header that Godot recognises', () => {
    const result = buildThemeAssets(styleNote());
    expect(result.themeTres.startsWith('[gd_resource type="Theme"')).toBe(true);
    expect(result.themeTres).toContain('format=3');
    expect(result.themeTres).toContain('[resource]');
  });

  it('embeds the palette accent colour into the ButtonHover stylebox', () => {
    // Use a distinctive accent so we can grep for it
    const result = buildThemeAssets(styleNote({ accent: '#aabbcc' }));
    // ButtonHover bg is a mix of accent → white at 12%, so the channels won't
    // be exactly aabbcc but they should land near it. Check the hover block
    // exists and contains a Color literal.
    expect(result.themeTres).toContain('id="ButtonHover"');
    expect(result.themeTres).toMatch(/id="ButtonHover"\][^\[]+bg_color = Color\(/);
  });

  it('uses bgPanel for ButtonNormal, bgDeep for ProgressBg', () => {
    const result = buildThemeAssets(styleNote({ bgPanel: '#222244', bgDeep: '#000000' }));
    // ButtonNormal block uses bgPanel
    const normalMatch = result.themeTres.match(/id="ButtonNormal"\][^\[]+bg_color = Color\(([^)]+)\)/);
    expect(normalMatch).toBeTruthy();
    expect(normalMatch?.[1]).toMatch(/0\.133.*0\.133.*0\.267/); // 0x22/0xff ≈ 0.133, 0x44/0xff ≈ 0.267
    // ProgressBg uses bgDeep (#000000)
    const progressMatch = result.themeTres.match(/id="ProgressBg"\][^\[]+bg_color = Color\(([^)]+)\)/);
    expect(progressMatch?.[1]).toMatch(/^0\.0,\s*0\.0,\s*0\.0/);
  });

  it('keeps load_steps in sync with sub-resource count', () => {
    const result = buildThemeAssets(styleNote());
    // Count sub_resource declarations
    const subResourceCount = (result.themeTres.match(/\[sub_resource /g) ?? []).length;
    const loadStepsMatch = result.themeTres.match(/load_steps=(\d+)/);
    const loadSteps = loadStepsMatch ? parseInt(loadStepsMatch[1]!, 10) : 0;
    // Godot's load_steps is sub_resources + 1 (the [resource] block itself)
    expect(loadSteps).toBe(subResourceCount + 1);
  });

  it('produces different output for different palettes', () => {
    const a = buildThemeAssets(styleNote({ accent: '#ff0000' }));
    const b = buildThemeAssets(styleNote({ accent: '#00ff00' }));
    expect(a.paletteGd).not.toBe(b.paletteGd);
    expect(a.themeTres).not.toBe(b.themeTres);
  });

  it('preserves universal dimensional constants regardless of palette', () => {
    const a = buildThemeAssets(styleNote({ accent: '#ff0000' }));
    const b = buildThemeAssets(styleNote({ accent: '#00ff00' }));
    // Font sizes, spacing, radius — these are not per-game.
    for (const constant of ['FONT_TITLE := 48', 'FONT_BODY := 18', 'SPACE_M := 16', 'RADIUS_M := 8']) {
      expect(a.paletteGd).toContain(constant);
      expect(b.paletteGd).toContain(constant);
    }
  });
});
