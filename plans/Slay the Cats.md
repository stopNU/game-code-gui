Perfect — that’s enough to finalize the brief. Your prototype now has 3 starting nodes, 12 floors, a visible placeholder boss node at the top, and different placeholder destination screens per node type, which matches the kind of layered, upward map structure associated with Slay-the-Spire-style runs.

Below is a cleaner copy-paste brief for the AI coding agent.

Final brief
Build the opening run flow for a single-player fantasy roguelike deckbuilder in Godot using GDScript. The experience should feel inspired by the beginning of Slay the Spire / Slay the Spire 2, but it must use original characters, UI, assets, text, and implementation. The goal of this milestone is to create a polished vertical slice containing the title screen, character select, and a procedurally generated Act 1 map.

This build is presentation-first. Prioritize atmosphere, visual readability, clean UI flow, and a convincing game shell over full gameplay systems. The result should already feel like the beginning of a real deckbuilder, even though combat, deck construction, rewards, and progression systems are still placeholders.

Goal
Create a playable front-end prototype with this player flow:

Launch to Title Screen

Select Start / New Run

Open Character Select

Choose Cheddar or Lady Brexit

Confirm choice

Transition to a procedurally generated Act 1 map

Show a branching upward node graph

Allow node interaction to open a different placeholder screen per node type

There is no intro cutscene or narrative sequence in this version. The flow should go directly from title screen to character selection to map.

Setting and tone
The game is a fantasy deckbuilder with a tone broadly compatible with Slay the Spire 2, but all content should remain original. The visual direction is 2D illustrated, and the prototype should present a strong first impression through attractive layout, scene transitions, and stylized screen composition.

Characters
The player can choose between two starting characters:

Cheddar
Cheddar is aggressive but a coward. He should feel reckless, dangerous, jumpy, and unstable, like someone who attacks hard but loses nerve under pressure.

Lady Brexit
Lady Brexit is beautiful but a drama queen. She should feel elegant, theatrical, vain, emotionally exaggerated, and highly performative.

Character select requirements
The character selection screen must include:

Two clearly distinct character panels

Character name

Character portrait area

Short lore text

Strong visual emphasis on the selected choice

Confirm button after selection

The screen should communicate that these characters will eventually lead to different deck identities, even though decks are not implemented yet.

Map requirements
Create a procedural Act 1 map that is structurally close to Slay the Spire:

12 floors

3 starting nodes

Upward progression

Branching paths between floors

A visible placeholder boss node at the top

The map should resemble a layered node graph where each floor contains a set of nodes connected by edges to nearby nodes on the next floor. Slay-the-Spire-style maps are commonly described as floors of nodes, connected by upward paths, with an additional boss node placed after generation at the top.

Enabled node types
Normal fight

Elite

Rest

Event

Boss placeholder

Map generation constraints
The map should be procedurally generated each run, but generation must feel controlled and readable rather than random noise.

Constraints:

3 starting nodes on the bottom floor

12 playable floors before the boss

Valid paths from the start to upper floors

Connections should only go to nearby nodes on the next floor

Avoid isolated nodes

Avoid visually messy path crossings where possible

Maintain a balanced spread of node types

Keep the result aesthetically clean and easy to parse

The boss node can be a visual destination only for now and does not need full encounter logic. In Slay the Spire, the boss room is added above the generated map and acts as the act endpoint.

Interaction scope
This milestone is focused on UI and navigation flow plus a working generated map. It does not need real traversal, combat systems, rewards, or save progression yet.

Interaction behavior for this prototype:

Nodes can be clicked or selected

Selecting a node opens a different placeholder screen depending on node type

Example placeholder screens:

Normal Fight Placeholder

Elite Placeholder

Rest Placeholder

Event Placeholder

Boss Placeholder

These placeholder screens can be simple, but each should feel intentional and visually consistent with the rest of the prototype.

Presentation requirements
This is a presentation-first prototype, so emphasize:

Strong title screen composition

Cohesive fantasy art direction

Polished character selection layout

Readable map node icons and path lines

Smooth transitions between scenes

Distinct visual treatment for each node type

A map screen that already feels like a core identity screen for the game

Do not make this look like raw debug UI or editor widgets. It should feel like a game prototype with taste and direction.

Technical requirements
Use Godot + GDScript. Structure the project cleanly by feature. Godot documentation notes that grouping assets close to scenes is generally more maintainable than organizing only by asset type, especially as projects grow.

Recommended feature structure:

scenes/title/

scenes/character_select/

scenes/map/

scenes/placeholders/

scripts/core/

scripts/map/

data/characters/

data/map/

art/characters/

art/map/

art/ui/

Recommended core scenes:

GameRoot

TitleScreen

CharacterSelectScreen

MapScreen

PlaceholderScreen or one placeholder scene per node type

Suggested data model
Use lightweight data-driven structures so later systems can extend without rewriting core flow.

Suggested data objects:

CharacterDefinition

id

display_name

lore_text

portrait_path

theme_tags

MapNodeDefinition

id

floor_index

node_type

position

connected_node_ids

RunSetupState

selected_character

act_index

seed

MapGenerationConfig

floor_count = 12

starting_node_count = 3

allowed_node_types

generation tuning values

Keep map data separate from rendering so it can later support traversal, unlock state, rewards, and seeded repeatability.

Out of scope
Do not implement full versions of:

Combat

Cards

Deck management

Relics

Enemy AI

Rewards

Save/load persistence

Meta progression

Only build enough placeholder content to support the opening flow.

Acceptance criteria
The milestone is complete when:

The game opens to a polished title screen

The player can begin a new run

The player can choose between Cheddar and Lady Brexit

Each character has a portrait area and short lore text

The game transitions cleanly from character select to map

The map is procedurally generated each run

The map contains 12 floors

The map begins with 3 starting nodes

The map shows branching upward progression

The map includes normal fight, elite, rest, and event nodes

The map shows a placeholder boss node at the top

Selecting different node types opens different placeholder screens

The project structure is clean enough to extend into full gameplay later

Build order
Implement in this order:

Game root and scene flow

Title screen

Character select screen

Character data

Map data model

Procedural map generation

Map rendering

Node-type-specific placeholder screens

Visual polish and transitions

Notes for implementation
Favor clarity, readability, extensibility, and presentation. The prototype should immediately sell three ideas:

this is a fantasy deckbuilder,

the two characters feel different,

the map is the backbone of the run structure.

Do not overengineer systems that are still placeholder. Build a strong shell first.