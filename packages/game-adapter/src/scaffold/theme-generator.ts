import type { StyleNote } from '@agent-harness/core';

/**
 * Per-game theme generator.
 *
 * The deckbuilder template ships a neutral default palette. When the planner
 * commits to a per-game `styleNote.palette`, the scaffolder calls this module
 * to overwrite `src/theme/palette.gd` and `src/theme/main.tres` with values
 * derived from that palette. Result: every generated game gets its own
 * visual identity at scaffold time, without any agent involvement.
 *
 * Why deterministic generation rather than asking the agent to write the
 * theme: `.tres` syntax is finicky (load_steps must be exact, sub_resource
 * IDs must be unique, property paths are case-sensitive) and a single typo
 * silently breaks the theme load. Computing the file from a structured
 * palette is a one-shot deterministic transform with no failure modes
 * besides invalid hex input.
 */

interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Parse "#rrggbb" or "rrggbb" into normalised floats in [0, 1]. */
function parseHex(hex: string): RGB {
  const cleaned = hex.replace(/^#/, '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    throw new Error(`Invalid hex colour: ${JSON.stringify(hex)} (expected "#rrggbb")`);
  }
  return {
    r: parseInt(cleaned.slice(0, 2), 16) / 255,
    g: parseInt(cleaned.slice(2, 4), 16) / 255,
    b: parseInt(cleaned.slice(4, 6), 16) / 255,
  };
}

/** Format a Godot Color() literal with 3-decimal precision. */
function colorLiteral(rgb: RGB, alpha = 1): string {
  const fmt = (n: number) => Number.isInteger(n) ? n.toFixed(1) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '.0');
  return `Color(${fmt(rgb.r)}, ${fmt(rgb.g)}, ${fmt(rgb.b)}, ${fmt(alpha)})`;
}

/**
 * Mix two colours (0 = pure a, 1 = pure b). Used to derive hover/border
 * variants from base palette colours so we don't ask the planner to pick
 * 20 colours when 8 do the job.
 */
function mix(a: RGB, b: RGB, t: number): RGB {
  return {
    r: a.r * (1 - t) + b.r * t,
    g: a.g * (1 - t) + b.g * t,
    b: a.b * (1 - t) + b.b * t,
  };
}

const WHITE: RGB = { r: 1, g: 1, b: 1 };
const BLACK: RGB = { r: 0, g: 0, b: 0 };

export interface GeneratedTheme {
  /** Contents of `src/theme/palette.gd`. */
  paletteGd: string;
  /** Contents of `src/theme/main.tres`. */
  themeTres: string;
}

/**
 * Build per-game `palette.gd` + `main.tres` from a `StyleNote.palette`.
 *
 * - palette.gd: `class_name Palette` with all 8 colour tokens + the
 *   universal dimensional constants (font sizes, spacing, radius). Code
 *   side reads `Palette.ACCENT`, `Palette.SPACE_M`, etc.
 * - main.tres: structural styles (button shape, panel borders, font
 *   sizes) using the palette colours. Same skeleton as the template
 *   default — only colour values change per game.
 */
export function buildThemeAssets(styleNote: StyleNote): GeneratedTheme {
  const p = {
    bgDeep: parseHex(styleNote.palette.bgDeep),
    bgPanel: parseHex(styleNote.palette.bgPanel),
    accent: parseHex(styleNote.palette.accent),
    success: parseHex(styleNote.palette.success),
    warning: parseHex(styleNote.palette.warning),
    danger: parseHex(styleNote.palette.danger),
    text: parseHex(styleNote.palette.text),
    textDim: parseHex(styleNote.palette.textDim),
  };

  // Derived colours — kept structural so the planner only commits to 8
  // identity colours and the rest are computed.
  const bgPanelHover = mix(p.bgPanel, WHITE, 0.08);
  const panelBorder = mix(p.bgPanel, WHITE, 0.12);
  const accentHover = mix(p.accent, WHITE, 0.12);
  const accentPressed = mix(p.accent, BLACK, 0.12);
  const accentBorder = mix(p.accent, WHITE, 0.18);
  const textMuted = mix(p.textDim, p.bgDeep, 0.4);

  return {
    paletteGd: buildPaletteGd(p),
    themeTres: buildThemeTres(p, { bgPanelHover, panelBorder, accentHover, accentPressed, accentBorder, textMuted }),
  };
}

function buildPaletteGd(p: Record<'bgDeep' | 'bgPanel' | 'accent' | 'success' | 'warning' | 'danger' | 'text' | 'textDim', RGB>): string {
  return `class_name Palette
extends RefCounted

## Per-game colour tokens, generated at scaffold time from the design's
## styleNote palette. Use these constants from code (Palette.ACCENT,
## Palette.TEXT_DIM, ...). For .tscn-side colours, prefer theme overrides
## referencing res://src/theme/main.tres which uses the same palette;
## inline overrides are only for highlights the theme can't express.

# Surfaces
const BG_DEEP := ${colorLiteral(p.bgDeep)}
const BG_PANEL := ${colorLiteral(p.bgPanel)}
const BG_OVERLAY := ${colorLiteral(p.bgDeep, 0.88)}

# Text
const TEXT := ${colorLiteral(p.text)}
const TEXT_DIM := ${colorLiteral(p.textDim)}

# Brand / accents
const ACCENT := ${colorLiteral(p.accent)}
const SUCCESS := ${colorLiteral(p.success)}
const WARNING := ${colorLiteral(p.warning)}
const DANGER := ${colorLiteral(p.danger)}

# Card type tints — derived from accent so cards read as part of the same
# visual family without forcing the planner to pick five extra hues.
const CARD_ATTACK := ${colorLiteral(p.accent)}
const CARD_SKILL := ${colorLiteral(p.success)}
const CARD_POWER := ${colorLiteral(p.warning)}

# Dimensions — universal, not per-game.
const FONT_TITLE := 48
const FONT_HEADING := 32
const FONT_BODY := 18
const FONT_SMALL := 14

const SPACE_XS := 4
const SPACE_S := 8
const SPACE_M := 16
const SPACE_L := 24
const SPACE_XL := 40

const RADIUS_S := 4
const RADIUS_M := 8
`;
}

function buildThemeTres(
  p: Record<'bgDeep' | 'bgPanel' | 'accent' | 'success' | 'warning' | 'danger' | 'text' | 'textDim', RGB>,
  d: Record<'bgPanelHover' | 'panelBorder' | 'accentHover' | 'accentPressed' | 'accentBorder' | 'textMuted', RGB>,
): string {
  // Theme.tres skeleton — structural styles unchanged, colour values
  // driven by the palette. Keep load_steps in sync with sub-resource count.
  void d.bgPanelHover;
  return `[gd_resource type="Theme" load_steps=10 format=3]

[sub_resource type="StyleBoxFlat" id="PanelBox"]
bg_color = ${colorLiteral(p.bgPanel)}
border_color = ${colorLiteral(d.panelBorder)}
border_width_left = 1
border_width_top = 1
border_width_right = 1
border_width_bottom = 1
corner_radius_top_left = 8
corner_radius_top_right = 8
corner_radius_bottom_right = 8
corner_radius_bottom_left = 8
content_margin_left = 16.0
content_margin_top = 16.0
content_margin_right = 16.0
content_margin_bottom = 16.0

[sub_resource type="StyleBoxFlat" id="ButtonNormal"]
bg_color = ${colorLiteral(p.bgPanel)}
border_color = ${colorLiteral(d.panelBorder)}
border_width_left = 1
border_width_top = 1
border_width_right = 1
border_width_bottom = 1
corner_radius_top_left = 6
corner_radius_top_right = 6
corner_radius_bottom_right = 6
corner_radius_bottom_left = 6
content_margin_left = 18.0
content_margin_top = 10.0
content_margin_right = 18.0
content_margin_bottom = 10.0

[sub_resource type="StyleBoxFlat" id="ButtonHover"]
bg_color = ${colorLiteral(d.accentHover)}
border_color = ${colorLiteral(d.accentBorder)}
border_width_left = 1
border_width_top = 1
border_width_right = 1
border_width_bottom = 1
corner_radius_top_left = 6
corner_radius_top_right = 6
corner_radius_bottom_right = 6
corner_radius_bottom_left = 6
content_margin_left = 18.0
content_margin_top = 10.0
content_margin_right = 18.0
content_margin_bottom = 10.0

[sub_resource type="StyleBoxFlat" id="ButtonPressed"]
bg_color = ${colorLiteral(d.accentPressed)}
border_color = ${colorLiteral(d.accentBorder)}
border_width_left = 1
border_width_top = 1
border_width_right = 1
border_width_bottom = 1
corner_radius_top_left = 6
corner_radius_top_right = 6
corner_radius_bottom_right = 6
corner_radius_bottom_left = 6
content_margin_left = 18.0
content_margin_top = 10.0
content_margin_right = 18.0
content_margin_bottom = 10.0

[sub_resource type="StyleBoxFlat" id="ButtonDisabled"]
bg_color = ${colorLiteral(p.bgPanel)}
border_color = ${colorLiteral(d.panelBorder)}
border_width_left = 1
border_width_top = 1
border_width_right = 1
border_width_bottom = 1
corner_radius_top_left = 6
corner_radius_top_right = 6
corner_radius_bottom_right = 6
corner_radius_bottom_left = 6
content_margin_left = 18.0
content_margin_top = 10.0
content_margin_right = 18.0
content_margin_bottom = 10.0

[sub_resource type="StyleBoxFlat" id="ProgressBg"]
bg_color = ${colorLiteral(p.bgDeep)}
border_color = ${colorLiteral(d.panelBorder)}
border_width_left = 1
border_width_top = 1
border_width_right = 1
border_width_bottom = 1
corner_radius_top_left = 4
corner_radius_top_right = 4
corner_radius_bottom_right = 4
corner_radius_bottom_left = 4

[sub_resource type="StyleBoxFlat" id="ProgressFill"]
bg_color = ${colorLiteral(p.accent)}
corner_radius_top_left = 4
corner_radius_top_right = 4
corner_radius_bottom_right = 4
corner_radius_bottom_left = 4

[sub_resource type="StyleBoxFlat" id="LineEditNormal"]
bg_color = ${colorLiteral(p.bgDeep)}
border_color = ${colorLiteral(d.panelBorder)}
border_width_left = 1
border_width_top = 1
border_width_right = 1
border_width_bottom = 1
corner_radius_top_left = 4
corner_radius_top_right = 4
corner_radius_bottom_right = 4
corner_radius_bottom_left = 4
content_margin_left = 8.0
content_margin_top = 6.0
content_margin_right = 8.0
content_margin_bottom = 6.0

[sub_resource type="StyleBoxEmpty" id="EmptyBox"]

[resource]
default_font_size = 18

Label/colors/font_color = ${colorLiteral(p.text)}
Label/colors/font_shadow_color = Color(0, 0, 0, 0.5)
Label/constants/shadow_offset_x = 0
Label/constants/shadow_offset_y = 1
Label/font_sizes/font_size = 18

Button/colors/font_color = ${colorLiteral(p.text)}
Button/colors/font_hover_color = Color(1, 1, 1, 1)
Button/colors/font_pressed_color = ${colorLiteral(p.text)}
Button/colors/font_disabled_color = ${colorLiteral(d.textMuted)}
Button/font_sizes/font_size = 18
Button/styles/normal = SubResource("ButtonNormal")
Button/styles/hover = SubResource("ButtonHover")
Button/styles/pressed = SubResource("ButtonPressed")
Button/styles/disabled = SubResource("ButtonDisabled")
Button/styles/focus = SubResource("EmptyBox")

Panel/styles/panel = SubResource("PanelBox")
PanelContainer/styles/panel = SubResource("PanelBox")

ProgressBar/styles/background = SubResource("ProgressBg")
ProgressBar/styles/fill = SubResource("ProgressFill")
ProgressBar/colors/font_color = ${colorLiteral(p.text)}
ProgressBar/font_sizes/font_size = 14

LineEdit/styles/normal = SubResource("LineEditNormal")
LineEdit/colors/font_color = ${colorLiteral(p.text)}
LineEdit/font_sizes/font_size = 18
`;
}
