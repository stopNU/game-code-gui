class_name Palette
extends RefCounted

## Centralised colour tokens for the deckbuilder UI.
##
## Use these constants from code (Palette.ACCENT, Palette.TEXT_DIM, ...).
## For .tscn-side colours, prefer theme overrides referencing
## res://src/theme/main.tres and only fall back to inline colours when the
## theme cannot express what you need.

# Surfaces
const BG_DEEP := Color("12161e")        # outer background
const BG_PANEL := Color("1d2330")       # panel / card backgrounds
const BG_PANEL_HOVER := Color("262d3e") # hover variant
const BG_OVERLAY := Color("0a0d14e0")   # modal / dim overlay (alpha)

# Text
const TEXT := Color("e8ecf4")
const TEXT_DIM := Color("9aa3b8")
const TEXT_MUTED := Color("5d6478")

# Brand / accents
const ACCENT := Color("d14b3c")         # primary action, energy, fire
const ACCENT_HOVER := Color("e36352")
const SUCCESS := Color("6abf69")        # block, heal, gold gain
const WARNING := Color("e0b14a")        # gold, relics
const DANGER := Color("c0392b")         # damage, defeat

# Card type tints (subtle — used as 1-2 px borders)
const CARD_ATTACK := Color("c75a4a")
const CARD_SKILL := Color("4a89c7")
const CARD_POWER := Color("a85ec7")

# Dimensions
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
