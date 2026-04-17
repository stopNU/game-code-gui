# Deckbuilding Roguelike — Developer Design Document
### A Pattern Extraction & Implementation Blueprint Based on Slay the Spire Analysis

> **Document Purpose:** Developer-facing design and architecture reference for building an original single-player deckbuilding roguelike. All mechanics, schemas, and patterns are abstracted from observed design principles. No copyrighted names, card text, relic names, or enemy specifics are reproduced.
>
> **Legend:**
> - 🔵 **[OBSERVED]** — Verified fact about Slay the Spire
> - 🟡 **[INFERRED]** — Plausible design intent, not explicitly confirmed
> - 🟢 **[RECOMMENDATION]** — Guidance for the new game

***

## 1. Core Fantasy and Design Pillars

### 1.1 The Player Fantasy

🔵 **[OBSERVED]** The player fantasy in Slay the Spire is that of a **tactical engineer**: the player feels they are building and optimizing a personal machine (the deck), piloting it through known threats, and validating their mastery through cumulative runs rather than through reflexes or reaction time[^1]. Combat reads like a puzzle with all variables visible — enemy intent is broadcast before the player commits — so the focus is entirely on optimizing one's own output rather than guessing opponent behavior[^2].

🟡 **[INFERRED]** The fantasy is specifically *power-through-mastery*, not power-through-progression. A run does not carry forward, so each victory is a re-demonstration of competence, which makes wins feel earned rather than purchased with persistent stats[^3].

### 1.2 Design Pillars

| Pillar | Concrete Manifestation | System Constraint | New Game Replication |
|---|---|---|---|
| **Meaningful choice under uncertainty** | 3-card reward offers, branching map paths, risk-reward elites | Every decision must have tradeoffs; no obviously dominant choice at every step | Offer choices, never singletons; build in tension between short-term and long-term gain |
| **Short, high-stakes runs** | 45–90 minute runs; full reset on death | No infinite healing; persistent HP across fights creates resource pressure | Keep runs completable in one sitting; HP drain between fights |
| **Visible information enables planning** | Enemy intent display; full deck/discard visibility | Enemies cannot be purely random; they must telegraph | Display all upcoming threats; hide only non-impactful data |
| **Emergent synergy discovery** | Cards interact in non-obvious ways discovered over many runs | Cards must be simple individually but composable into complex patterns | Use tags and hooks; design cards with incidental cross-compatibility |
| **Deck as identity** | Deck composition signals strategy; no "correct" deck | Character class defines card pool boundaries, not optimal decklists | Card pools should have multiple viable archetypes per character/class |
| **Tension between now and later** | Taking elite fights risks HP but yields relics; scaling damage vs. frontloaded damage | Every resource spend must have opportunity cost | Every combat resource must compete with alternatives |
| **Data-driven, not feel-driven, balance** | Playtest metrics tracked from day 1; pick rates and win-appearance rates are primary KPIs | Balance is never "solved"; treat it as an ongoing empirical process[^4] | Instrument everything from prototype stage |

***

## 2. Macro Loop: Run Structure and Map

### 2.1 Run Structure Overview

```
[NEW RUN]
  └── Select character / class
  └── Initialize starting deck
  └── Generate map (acts)
  └── Act 1:
        └── Traverse nodes (fights → elites → shops → events → rests → boss)
        └── Acquire cards / relics / gold
  └── Act 2: (higher difficulty scaling)
  └── Act 3: (end-game elites; final boss)
  └── [Optional Act 4 / True Ending]: requires collecting keys
  └── [VICTORY or DEATH] → show run summary
[META-LAYER]
  └── Unlock new cards, characters, ascension levels
```

🔵 **[OBSERVED]** Each act contains a procedurally generated map of approximately 15 floors organized as a layered graph, with 6 paths generated from 7 possible starting nodes in a 7×15 grid[^5]. The specific constraint rules are:
- Elites and rest sites cannot appear until floor 6 or later[^5]
- Two nodes sharing the same parent cannot be the same type[^5]
- Normal enemies, chests, and rest sites are "pre-typed" at fixed floors; all remaining nodes are typed from a probability bucket[^5]

### 2.2 Node Types

| Node Type | Purpose | Reward | Risk |
|---|---|---|---|
| **Normal Fight** | Deck test; gold/card income | Card reward + gold + chance of potion | HP loss (persistent across fights) |
| **Elite Fight** | High-stakes power check | Relic + elevated card reward odds | High HP loss; can kill weak decks |
| **Rest Site** | Resource recovery decision | Heal OR upgrade a card (not both) | Opportunity cost between HP and card power |
| **Shop** | Economy node | Buy cards, relics, potions; remove cards | Gold cost |
| **Treasure / Chest** | Passive relic acquisition | Relic (may have condition) | Sometimes cursed relics |
| **Unknown / Event** | Narrative choice | Variable (could be excellent or terrible) | Probabilistic outcomes; requires decision |
| **Boss** | Act-end gate | Large gold reward; boss relic choice | Significant HP loss; deck must be mature |

### 2.3 Act Flow and Pacing

🔵 **[OBSERVED]** Research analyzing 20,000 game runs shows that **victorious runs are associated with higher path entropy** — players who took more varied, risk-taking paths (visiting more elites) won more often[^6]. Higher-skill players exhibit distinct risk-taking patterns in later acts compared to less experienced players[^6].

🟡 **[INFERRED]** Pacing is designed so the deck should "come online" (develop its core synergy) by the boss of Act 1. Act 2 elites serve as the primary quality gate — players with weak decks die here. Act 3 is a victory lap or a last-minute fix opportunity.

### 2.4 Macro Loop Template (Generalized)

```json
{
  "run_template": {
    "acts": 3,
    "act_config": {
      "map_width": 7,
      "map_height": 15,
      "paths_generated": 6,
      "elite_min_floor": 6,
      "node_type_weights": {
        "normal_fight": 0.45,
        "elite": 0.12,
        "rest": 0.12,
        "shop": 0.05,
        "event": 0.22,
        "treasure": 0.04
      },
      "pre_typed_nodes": {
        "floor_1": "normal_fight",
        "floor_9": "treasure",
        "floor_15": "rest_before_boss"
      }
    },
    "scaling": {
      "enemy_hp_multiplier_per_act": 1.5,
      "elite_hp_multiplier_per_act": 1.4,
      "boss_hp_multiplier_per_act": 1.6
    }
  }
}
```

🟢 **[RECOMMENDATION]** Expose `node_type_weights` and `elite_min_floor` as tunable parameters. Early prototypes should weight normal fights higher. The ratio of elites to total nodes is the primary difficulty lever in act design.

***

## 3. Combat Rules Engine

### 3.1 Combat as a State Machine

```
States:
  COMBAT_INIT
    → PLAYER_TURN_START
      → PLAYER_TURN_ACTIVE  (player plays cards)
        → PLAYER_TURN_END
          → ENEMY_TURN_ACTIVE  (enemies execute intents)
            → UPKEEP  (tick status effects, check scaling)
              → CHECK_VICTORY  → if all enemies dead → COMBAT_VICTORY
              → CHECK_DEFEAT   → if player HP ≤ 0  → COMBAT_DEFEAT
              → PLAYER_TURN_START  (loop)

Interrupts (can fire at any state transition):
  - ON_CARD_PLAYED
  - ON_DAMAGE_TAKEN
  - ON_DAMAGE_DEALT
  - ON_BLOCK_GAINED
  - ON_STATUS_APPLIED
  - ON_ENEMY_DEAD
  - ON_TURN_START (player or enemy)
  - ON_TURN_END (player or enemy)
  - ON_HAND_EMPTY
  - ON_CARD_EXHAUSTED
  - ON_DISCARD
  - ON_DRAW
```

### 3.2 Turn Structure

🔵 **[OBSERVED]** Each player turn:
1. Draw N cards from draw pile (default: 5)[^7]
2. Gain M energy (default: 3)[^7]
3. Play any number of cards, paying their energy cost
4. Optionally use consumables (potions) at no energy cost[^7]
5. End turn → discard remaining hand → drain remaining energy
6. Enemy turn: each enemy executes its telegraphed intent[^7]
7. After all enemies act → upkeep phase (tick status effects) → back to step 1

### 3.3 Card Life Cycle

```
                   ┌──────────────────────────────────────────────┐
                   │                  DRAW PILE                   │
                   │  (shuffled from discard when empty)          │
                   └─────────────┬────────────────────────────────┘
                                 │ draw N cards per turn
                                 ▼
                   ┌──────────────────────────────────────────────┐
                   │                    HAND                      │
                   │  (max 10 cards; overflow → discard or burn)  │
                   └───────────┬──────────────────┬───────────────┘
                               │ play             │ discard (end of turn
                               │                  │ or card effect)
                               ▼                  ▼
                   ┌───────────────────┐  ┌────────────────────────┐
                   │  RESOLVE EFFECTS  │  │      DISCARD PILE      │
                   └────────┬──────────┘  └──────────┬─────────────┘
                            │                        │
              ┌─────────────┴────────────┐           │ shuffle when
              │                          │           │ draw pile empty
              ▼                          ▼           │
   ┌───────────────────────┐  ┌──────────────────────┘
   │    DISCARD PILE       │  │    (back to draw pile)
   │    (default)          │  │
   └───────────────────────┘  │
                              │
              if EXHAUST:     │
              ▼               │
   ┌───────────────────────┐  │
   │    EXHAUST PILE       │  │
   │  (removed from combat;│  │
   │  returned to deck     │  │
   │  after fight)         │  │
   └───────────────────────┘
```

### 3.4 Core Primitives

| Primitive | Definition | Implementation Note |
|---|---|---|
| **HP** | Entity health; reaches 0 = dead. Player HP persists across fights[^7] | `entity.hp: int`, `entity.hp_max: int` |
| **Damage** | Reduces target HP; reduced by block first | `damage = max(0, raw_damage - target.block)` |
| **Block** | Temporary shield; removed at start of entity's next turn (unless modified) | `entity.block: int` |
| **Energy** | Per-turn resource for playing cards; unspent energy drains at turn end | `combat_state.energy: int` |
| **Status Effect (Buff)** | Positive modifier; stacks or applies per-turn effect | See § 3.5 |
| **Status Effect (Debuff)** | Negative modifier; stacks or applies per-turn effect | See § 3.5 |
| **Exhaust** | Card removed from combat (but not from deck permanently) | `card.zone = EXHAUST` |
| **Ethereal** | Card auto-exhausts if in hand at turn end | Check in `ON_TURN_END` handler |
| **Retain** | Card does NOT discard at turn end | Prevents default discard logic |
| **Scry N** | Look at top N cards; choose which to keep on top or bottom | Controlled draw-order manipulation |

### 3.5 Status Effect Architecture

🔵 **[OBSERVED]** Status effects (both buffs and debuffs) are implemented via an **event queue / signal system**. Each status subscribes to relevant game events and fires a response[^8]. This architecture naturally handles interaction ordering.

```typescript
interface StatusEffect {
  id: string;
  name: string;
  stacks: number;
  is_buff: boolean;
  hooks: StatusHook[];          // which events this status listens to
  on_apply(target: Entity): void;
  on_remove(target: Entity): void;
}

interface StatusHook {
  event: GameEvent;             // e.g., ON_TURN_START, ON_DAMAGE_TAKEN
  handler(ctx: EventContext): void;
}

// Example: Poison analog
{
  id: "venom",
  stacks: N,
  hooks: [
    {
      event: "ON_TURN_START",    // enemy's turn start
      handler: (ctx) => {
        ctx.target.take_damage(ctx.target.get_status("venom").stacks);
        ctx.target.get_status("venom").stacks -= 1;
        if (ctx.target.get_status("venom").stacks <= 0) ctx.target.remove_status("venom");
      }
    }
  ]
}
```

🟡 **[INFERRED]** The "Next Turn" system (showing enemy intent) was discovered to enable design of new buffs/debuffs that could be explained through the UI, not just through card text[^2]. This is a critical co-design insight: **the intent display and the status system evolved together**.

### 3.6 Full Combat Round Pseudocode

```python
def run_combat(player, enemies, deck):
    combat_state = CombatState(player, enemies, deck)
    fire_event("COMBAT_INIT", combat_state)
    
    while True:
        # --- PLAYER TURN ---
        combat_state.energy = player.max_energy
        draw_cards(combat_state, count=player.draw_count)
        fire_event("PLAYER_TURN_START", combat_state)
        
        # Player input loop (UI-driven in real game)
        while player_has_actions(combat_state):
            card = player.select_card()
            if card and can_afford(card, combat_state.energy):
                pay_cost(card, combat_state)
                resolve_card(card, combat_state)
                move_card_to_zone(card, "DISCARD" if not card.exhausts else "EXHAUST")
                fire_event("ON_CARD_PLAYED", combat_state, card=card)
        
        fire_event("PLAYER_TURN_END", combat_state)
        discard_hand(combat_state)
        combat_state.energy = 0
        player.block = 0  # block resets unless modified by relic/card
        
        # --- ENEMY TURN ---
        for enemy in combat_state.living_enemies():
            fire_event("ENEMY_TURN_START", combat_state, enemy=enemy)
            execute_intent(enemy, combat_state)
            fire_event("ENEMY_TURN_END", combat_state, enemy=enemy)
            enemy.block = 0  # enemies lose block between turns too
        
        # --- UPKEEP ---
        fire_event("UPKEEP", combat_state)
        tick_status_effects(combat_state)
        generate_enemy_intents(combat_state)  # sets next turn's telegraphed actions
        
        # --- WIN/LOSE CHECK ---
        if all_dead(combat_state.enemies):
            fire_event("COMBAT_VICTORY", combat_state)
            return "VICTORY"
        if player.hp <= 0:
            fire_event("COMBAT_DEFEAT", combat_state)
            return "DEFEAT"
```

### 3.7 Enemy Intent System

🔵 **[OBSERVED]** Enemy intent transforms combat from an **information problem** into an **optimization problem**[^1]. Players calculate lethal setups two turns ahead because attack patterns are fully visible, allowing planning rather than reaction[^1].

🔵 **[OBSERVED]** Most enemies do not repeat the same action more than 3 consecutive times[^9]. This prevents trivially predictable loops without introducing pure randomness.

```python
def generate_enemy_intent(enemy, combat_state) -> Intent:
    available_intents = enemy.ai_script.get_available_intents(combat_state)
    
    # Filter: don't repeat same intent more than 2 times consecutively
    if enemy.last_intent == available_intents and enemy.repeat_count >= 2:
        available_intents = available_intents[1:]
    
    # Weighted random selection from available intents
    selected = weighted_choice(available_intents)
    enemy.last_intent = selected
    enemy.repeat_count = enemy.repeat_count + 1 if selected == enemy.last_intent else 1
    return selected
```

### 3.8 Suggested Variations (Keep Structure, Change Feel)

| Variation | Change | Effect on Play |
|---|---|---|
| **Alternate resource** | Replace energy with a die roll (spend any faces) | More variance per turn; less deterministic planning |
| **Shared resource** | Both player and enemies draw from one resource pool | Depletion mechanics; racing |
| **Momentum system** | Cards played in sequence generate a "flow" resource | Rewards chaining specific card types |
| **Partial intents** | Show intent category (attack/defend/buff) but not value | More tension; less math puzzle |
| **Persistent hand** | Hand does not discard each turn; play from a pool | Shift to tempo/sequencing decisions |

***

## 4. Card System and Deckbuilding

### 4.1 Card Role Categories

| Role | Definition | Design Purpose | Example Pattern |
|---|---|---|---|
| **Direct Damage** | Deal N damage for M energy | Baseline output metric; all other cards compared to this | `cost:1, damage:6` is baseline |
| **Block/Defense** | Gain N block for M energy | Mirrors damage; enables survival math | `cost:1, block:5` is baseline |
| **Draw/Filter** | Manipulate hand; scry; cycle | Increases deck consistency; thins effectively | `cost:0, draw:2` |
| **Scaling (Active)** | Apply buff that grows each turn | Long-game payoff; loses to fast enemies | `gain +1 permanent-stat per use` |
| **Scaling (Passive / Power)** | Play-once effect that modifies rules | Engine enabler; most powerful category | Play once → modify all future turns |
| **Exhaust Synergy** | Generate value when cards are removed | Rewards deck-thinning philosophy | "When a card is exhausted, deal 3 damage" |
| **Status Manipulation** | Apply/react to debuffs | Test-specific counter play | Apply X stacks of a debuff |
| **Economy / Zero-Cost** | 0-cost cards; generate card draw | Enable high-volume turns | `cost:0, effect: minor` |
| **Archetype Pivot** | Cards that change evaluation of other cards | Enable non-linear synergy discovery | "All attacks deal +2 damage this combat" |

### 4.2 Deckbuilding Philosophy

🔵 **[OBSERVED]** Thin, focused decks consistently outperform large unfocused ones because draw consistency improves dramatically with fewer cards[^10]. A deck under 15 cards cycling key combo pieces more frequently is more powerful than a 25-card deck with diverse tools[^10].

🔵 **[OBSERVED]** The game teaches thin-deck principles through mechanical pressure: you draw dead cards more often in fat decks, which immediately punishes bloat during play[^11].

🟡 **[INFERRED]** Cards should be designed at three granularities:
1. **Individually useful** — works in any deck at a fair rate
2. **Incidentally synergistic** — slightly better when paired with certain cards
3. **Engine-defining** — transforms the deck's fundamental strategy

🔵 **[OBSERVED]** Synergies are encouraged because single-player removes the PvP balance concern; the team explicitly allowed "going infinite" to remain rare but possible[^4].

### 4.3 Upgrade System

🔵 **[OBSERVED]** Card upgrades come in several patterns (generalized):
- **Numeric boost**: +damage, +block, +stacks
- **Cost reduction**: cost 2 → cost 1; or cost 1 → cost 0
- **Keyword addition**: add Exhaust, add Retain, remove Ethereal
- **Effect improvement**: add secondary effect (block AND draw 1)
- **Threshold change**: "deal damage if X" → lower X requirement

**Design rule for upgrade interest:** An upgrade is *interesting* if it changes the card's role or evaluation in a build, not just when it makes a good card slightly better. A cost reduction on an already-cheap card is trivial. A cost reduction that puts a card at 0 cost enables an entirely new category of play (zero-cost spam).

### 4.4 Generic Card Schema

```json
{
  "card": {
    "id": "string (unique)",
    "name": "string",
    "character": "string | null",
    "rarity": "common | uncommon | rare | special | curse | status",
    "type": "attack | skill | power",
    "cost": "int | X | unplayable",
    "tags": ["array of strings — e.g., 'fast', 'status-synergy', 'exhaust-synergy', 'draw']",
    "targeting": "single_enemy | all_enemies | self | random_enemy | none",
    "effects": [
      {
        "type": "deal_damage | gain_block | apply_status | draw_cards | modify_cost | exhaust_cards | gain_energy | create_card",
        "value": "int | formula_string",
        "target": "self | source | target | all_enemies | random",
        "condition": "string | null"
      }
    ],
    "keywords": ["exhaust", "retain", "ethereal", "innate", "unplayable"],
    "upgrade": {
      "modified_effects": [...],
      "modified_cost": "int | null",
      "added_keywords": ["array | null"],
      "removed_keywords": ["array | null"]
    },
    "flavor_text": "string | null"
  }
}
```

### 4.5 Archetype Creation via Tags

🟢 **[RECOMMENDATION]** Use a **tag intersection system** to create emergent archetypes without rigid decklists:

```
Archetype "Exhaust Engine":
  Required tags: ["exhaust-synergy"] (payoff card) + ["self-exhaust"] (fuel card)
  Bonus synergy: ["scry"] (filter), ["discard"] (thinning)

Archetype "Status Proliferator":
  Required tags: ["apply-status"] + ["status-amplifier"]
  Bonus synergy: ["draw-on-status", "damage-on-status"]
```

Each card should have 2–4 tags. A "focused deck" is one where 70%+ of cards share at least 1 common tag cluster.

***

## 5. Relics and Passive Modifiers

### 5.1 Relic Function Categories

| Category | Function | Example Pattern | Design Purpose |
|---|---|---|---|
| **Consistency Enhancer** | Draw more cards; gain extra energy | "+1 energy on first turn" | Smooths variance; generally safe first pick |
| **Economy Modifier** | Gold bonuses; shop discounts; extra rewards | "Gain 25 gold whenever you rest" | Enables more shop visits; alters path value |
| **Combat Rule-Bender** | Changes core combat rules | "Block is not removed at turn end" (with synergy cards) | Creates entire new archetypes |
| **Archetype Enabler** | Supercharges specific card tag | "+2 damage for every Exhaust card played" | Transforms existing cards into combo pieces |
| **Risk-Reward Item** | Permanent buff with permanent drawback | "Start each combat with 2 Wounds" | High variance; player assessment required |
| **Boss Relic** | Powerful; replaces a starter relic | Significant effect; replaces energy or draw count | Redirects entire run strategy |

🔵 **[OBSERVED]** Relic interactions are handled via an **event queue** — relics subscribe to game events and fire responses when triggered[^8]. This makes relics easily composable and allows multiple relics to respond to the same event without hard-coded interaction lists[^8].

🔵 **[OBSERVED]** Slay the Spire 2 introduced a **Durability** system limiting how many times per combat a relic can activate, preventing passive-stacking exploits[^12].

### 5.2 Generic Relic/Passive Schema

```json
{
  "relic": {
    "id": "string",
    "name": "string",
    "rarity": "common | uncommon | rare | boss | event | special",
    "tags": ["economy", "combat", "archetype:exhaust", "risky"],
    "hooks": [
      {
        "event": "ON_COMBAT_START | ON_TURN_START | ON_CARD_PLAYED | ON_CARD_DRAWN | ON_CARD_EXHAUSTED | ON_DAMAGE_TAKEN | ON_DAMAGE_DEALT | ON_BLOCK_GAINED | ON_ENEMY_DEAD | ON_COMBAT_END | ON_NODE_VISITED | ON_RUN_START | ON_STATUS_APPLIED | ON_GOLD_GAINED | ON_REST",
        "condition": "string formula | null",
        "effect": {
          "type": "deal_damage | gain_block | draw_cards | gain_energy | modify_gold | apply_status | gain_hp | modify_relic_counter | trigger_callback",
          "value": "int | formula",
          "target": "self | all_enemies | random_enemy"
        },
        "max_activations_per_combat": "int | null"
      }
    ],
    "counter": {
      "initial": "int | null",
      "display": "boolean"
    },
    "flavor_text": "string | null"
  }
}
```

### 5.3 Relic Balance Rules

🟢 **[RECOMMENDATION]**:
- **Common relics** should have measurable but non-run-defining value (~5-10% win rate improvement)
- **Uncommon relics** should change how you evaluate some card choices
- **Rare relics** should fundamentally shift strategy; you may reroute for them
- **Boss relics** should be the single most impactful item decision in an act
- No relic should make a specific card effectively broken by itself (interaction monitoring required)
- 🔵 **[OBSERVED]** At most ~3–4 "run-defining" relics should appear per run to prevent trivial victories[^13]

***

## 6. Enemy, Encounter, and Act Design

### 6.1 Enemy Taxonomy by Test Dimension

| Type | What It Tests | Example Behavior Pattern |
|---|---|---|
| **Bruiser** | Burst damage tolerance | Charges up for 1–2 turns, then hits very hard |
| **Scaler** | Speed; killing before power spikes | Grows stronger each turn; must be killed fast |
| **Disruptor** | Deck robustness; status tolerance | Adds status cards (wounds, burns) to your deck |
| **Multi-target** | AoE vs. single-target balance | Group of small enemies requiring efficient AoE |
| **Blocker** | Damage efficiency | Gains large block each turn; drains attack cards |
| **Regenerator** | Burst damage availability | Heals HP each turn; forces burst windows |
| **Phase-changer** | Adaptability | Radically changes behavior at HP threshold |

🔵 **[OBSERVED]** Enemy variety is a key reason Slay the Spire is considered well-designed — enemies are distinct and one deck style can be strong against one enemy type and weak against another, forcing deeper deck construction thinking[^14].

### 6.2 Enemy Roles per Fight Category

🔵 **[OBSERVED]** Fight structure by act: Acts 1 and 2 restrict early encounters to "weak" enemy pool for the first 2–3 encounters; harder combinations phase in gradually[^9]. Consecutive enemy pools cannot repeat the same encounter[^9].

- **Normal fights**: Teach mechanics, provide income, build deck. Losing one means losing HP, not death (except accumulated).
- **Elites**: Gating checkpoint. Deck must be "online" to survive. Reward: 1 relic + enhanced rewards.
- **Bosses**: Run-defining test. Requires a complete strategy. Reward: boss relic (pivotal choice).

### 6.3 Generic Enemy Schema

```json
{
  "enemy": {
    "id": "string",
    "name": "string",
    "tags": ["bruiser", "scaler", "multi-enemy", "disruptor"],
    "base_hp": { "min": 42, "max": 46 },
    "base_block_per_turn": 0,
    "ai_script": {
      "type": "weighted_random | scripted_sequence | conditional",
      "intents": [
        {
          "id": "heavy_strike",
          "weight": 0.5,
          "max_consecutive": 2,
          "actions": [
            { "type": "deal_damage", "value": 18, "target": "player" }
          ]
        },
        {
          "id": "defend",
          "weight": 0.25,
          "actions": [
            { "type": "gain_block", "value": 12, "target": "self" }
          ]
        },
        {
          "id": "buff_self",
          "weight": 0.25,
          "actions": [
            { "type": "apply_status", "status": "strength", "value": 3, "target": "self" }
          ]
        }
      ],
      "phases": [
        {
          "trigger": "hp_below_percent",
          "value": 0.5,
          "intent_override": "enrage_phase"
        }
      ]
    },
    "rewards": {
      "gold": { "min": 10, "max": 20 },
      "card_reward": true,
      "potion_chance": 0.4,
      "relic_reward": false
    },
    "act_appearances": [1, 2]
  }
}
```

### 6.4 Act Enemy Design Guidelines

🟢 **[RECOMMENDATION]** Each act's enemy roster should collectively cover all test dimensions. A well-designed act:
- Has at least one **disruptor** (tests deck robustness)
- Has at least one **scaler** (tests speed/kill windows)
- Has one **bruiser** elite (tests block sufficiency)
- Has a boss that **counteracts the act's dominant strategy** (e.g., if Act 1 rewards passive scaling, the Act 1 boss should punish slow starts)

***

## 7. Meta-Progression and Replayability

### 7.1 Meta-Progression Structure

🔵 **[OBSERVED]** Characters are unlocked sequentially by completing runs; the second character unlocks after completing any run (win or lose), the third after completing a run with the second, etc.[^15]. This gates complexity behind familiarity — players learn basic systems before encountering more complex ones (orbs, stance-switching).

🔵 **[OBSERVED]** Ascension mode (difficulty modifiers) stacks cumulatively, adding modifiers one at a time per difficulty level. Ascension is character-specific and requires completing a run on the previous level to unlock the next[^16]. Modifiers include: more elites, stronger enemies, harder bosses, less healing, cursed starting HP[^16].

🟡 **[INFERRED]** The meta-progression is designed to teach systems progressively:
1. Basic combat + deckbuilding (starting character)
2. Alternative resource systems (second character introduces new mechanics)
3. Stance/phase mechanics (third character adds more complexity)
4. Ascension mode teaches optimization and run consistency

### 7.2 Replayability Mechanics

| Driver | Mechanism | Why It Works |
|---|---|---|
| **Procedural map** | Every run has different path layout | No memorized optimal path |
| **Random card rewards** | Card offers are random from class pool | Forced improvisation each run |
| **Random relic acquisition** | Relics appear with some randomness | Run strategy shifts based on relics found |
| **Multiple characters** | Different starting decks, card pools, mechanics | Each character is effectively a different game |
| **Ascension modifiers** | Stacked difficulty adds new constraints | Reframes familiar content as new challenge |
| **Event variety** | Hundreds of possible random events | Long-tail content discovery |
| **Synergy discovery** | New combinations emerge across runs | Motivates experimentation |

### 7.3 Minimal Meta-Progression Template

🟢 **[RECOMMENDATION]** For an MVP meta-layer:

```
Phase 1 (Starting State):
  - 1 character available
  - Core card set (25–35 cards)
  - Core relic pool (15–20 relics)

Phase 2 (Unlocked after first completion):
  - 1 additional character
  - Difficulty modifier system unlocked (Ascension analog)
  - 10–15 additional cards available in pool

Phase 3 (Unlocked after win with character 2):
  - 1–2 additional characters
  - Daily challenge / seeded run mode
  - Expanded event pool

Rule: Never unlock in ways that invalidate previous knowledge.
Rule: Each character should teach one new mechanic not present in any prior character.
```

***

## 8. Balance and Metrics-Driven Design

### 8.1 Core Telemetry Philosophy

🔵 **[OBSERVED]** Mega Crit's approach: "There's no way we can intuitively balance this many cards. We took a data-driven approach."[^4] By launch they had grown from 3 metric graphs to over 90[^4]. The key insight was making all data filterable by specific questions, not just storing raw logs[^4].

🔵 **[OBSERVED]** The two most important card metrics: **pick rate when offered** (too low = card effectively doesn't exist) and **appearance rate in winning decks** (too high = overpower)[^4].

🔵 **[OBSERVED]** Single-player context allows balancing for *entertainment value* rather than competitive parity — decks don't need to be equal, only interesting[^4].

### 8.2 Telemetry Specification

```json
{
  "telemetry_events": [
    {
      "event": "card_offered",
      "fields": ["run_id", "character", "act", "floor", "card_ids_offered", "card_id_chosen", "ascension_level", "timestamp"]
    },
    {
      "event": "combat_end",
      "fields": ["run_id", "encounter_id", "result", "hp_before", "hp_after", "turns_taken", "cards_in_deck", "relics_held"]
    },
    {
      "event": "run_end",
      "fields": ["run_id", "character", "result", "floor_reached", "ascension_level", "final_deck_ids", "relic_ids", "gold_spent", "seed"]
    },
    {
      "event": "card_played",
      "fields": ["run_id", "combat_id", "card_id", "turn", "energy_remaining_before", "targets"]
    },
    {
      "event": "relic_acquired",
      "fields": ["run_id", "relic_id", "source", "act", "floor"]
    },
    {
      "event": "path_choice",
      "fields": ["run_id", "floor", "chosen_node_type", "alternative_node_types"]
    },
    {
      "event": "reward_screen",
      "fields": ["run_id", "reward_type", "options_shown", "option_chosen", "skipped"]
    }
  ]
}
```

### 8.3 Iterative Balance Process

```
COLLECT: 500+ runs worth of data (per character, per ascension level)
  │
IDENTIFY OUTLIERS:
  ├── Pick rate < 15%: card is too weak or too niche → investigate
  ├── Win-deck appearance > 35%: card may be overloaded → investigate
  ├── Encounter win rate < 40%: encounter too punishing or deck test too narrow
  └── Encounter win rate > 85%: encounter too easy; not a meaningful test
  │
FORM HYPOTHESIS:
  ├── Weak card: "Players skip it because [numbers/cost/effect] is unfavorable"
  ├── Strong card: "It's too efficient at [role] for its cost; reduces deck decision-making"
  └── Encounter: "Players with [specific deck type] fail this 70% of the time"
  │
TWEAK (one change at a time):
  ├── Card numbers (damage/block/stacks ±1-3)
  ├── Card cost (±1)
  ├── Card rarity (common ↔ uncommon ↔ rare)
  ├── Encounter HP/damage (±10-15%)
  ├── Encounter frequency (weight ±0.05)
  └── Reward table composition
  │
VALIDATE: Re-run telemetry for 2 weeks; compare distributions
  │
ITERATE
```

### 8.4 Balance Knobs Reference

| Knob | Effect | Typical Range |
|---|---|---|
| Card cost | Most powerful single lever; 0-cost changes deck strategy category | 0–3 energy |
| Card rarity | Controls frequency; rare cards have higher power ceiling | common/uncommon/rare |
| Damage/block numbers | Fine-tuning; ±2-3 rarely kills a build | Usually ±15% of baseline |
| Status stack count | Controls debuff potency; multipliers of existing effects | ±1-2 stacks per application |
| Encounter HP | Fight duration; affects scaling vs. burst deck testing | ±10-20% of act baseline |
| Enemy frequency weight | How often an encounter appears; addresses systematic issues | 0.01 – 0.5 |
| Reward table composition | What percentage of rewards are high-rarity | 5–25% elevated chance |
| Ascension-level modifiers | Targeted balance for advanced players | Tuned per level |

***

## 9. Randomness, Fairness, and Player Agency

### 9.1 RNG Sources and Constraints

| RNG Source | Constraint Applied | Agency Tool |
|---|---|---|
| Card rewards | Always 3 choices; pool filtered by character | Choice; skip option |
| Relic rewards | Category-weighted pools; never two of same type | Choice between boss relics |
| Event outcomes | Most events show all options + costs before commit | Full information before decision |
| Map generation | Layout fixed once generated; player traverses seen map | Path planning across full visible map |
| Enemy behavior | Intent shown before player acts; repeat cap of ~3 | All information visible; planning horizon of 1+ turns |
| Draw order | Draw pile can be seen; scry available | Deck-thinning; scry; retain mechanics |
| Enemy encounter | Pool restricted early; difficulty ramp controlled | Path-selection provides some control |

🔵 **[OBSERVED]** Research analyzing 20,000 runs showed that ~11.7% of losses in a well-designed deckbuilder should be attributable to RNG; all other losses should be skill-based[^17].

🟡 **[INFERRED]** The design intent is that **RNG determines the puzzle, but skill determines the solution**. Runs are not lost to bad luck; they are lost because the player failed to adapt their strategy to the hand they were dealt.

### 9.2 "Fair RNG" Design Rules

1. **Never hide actionable information.** Enemy actions must be visible before the player commits.
2. **Rewards always offer multiple options.** A single reward offering can result in a forced bad pick; 3 options ensure agency.
3. **Randomness sets the *context*, player chooses the *response*.** Cards are randomly offered; whether to take them is a decision.
4. **Deck thinning must be accessible.** Players must be able to reduce variance in their own deck through card removal.
5. **Map is fixed before traversal.** Players plan routes with full map information; they are not surprised by node types mid-path.
6. **Repeat-capping enemy AI.** Enemies shouldn't repeat the same powerful action more than 2 consecutive turns.
7. **Early encounters are forgiving; late encounters are demanding.** First 2-3 encounters are from a "soft" pool[^9].

### 9.3 Tunable Fairness Parameters

```json
{
  "rng_params": {
    "card_reward_count": 3,
    "card_reward_rarity_weights": { "common": 0.6, "uncommon": 0.37, "rare": 0.03 },
    "card_reward_rare_boost_after_floor": { "floor": 6, "new_rare_chance": 0.1 },
    "relic_pool_exclude_already_held": true,
    "pity_system": {
      "enabled": true,
      "rare_pity_after_n_offerings": 8
    },
    "map_seed_exposed": true,
    "daily_challenge_seed_shared": true,
    "enemy_repeat_cap": 2,
    "early_act_easy_pool_floors": 3
  }
}
```

***

## 10. Information Design and UX

### 10.1 Critical UI Elements

🔵 **[OBSERVED]** Slay the Spire's UI was designed specifically to make playing cards "feel as good as possible"[^18]. Key tricks include:
- Cards animate with streaks on draw/discard, helping players track flow[^18]
- Cards can be cast before animations finish (non-blocking UI)[^18]
- Hitboxes for targeted attacks are very large, preventing misclicks[^18]
- Enemy weapon icons change at damage thresholds to give visceral severity feedback without requiring number reading[^18]

### 10.2 UI Primitives Required

| Screen / Element | Information Required | Design Guidance |
|---|---|---|
| **Combat arena** | Enemy HP, block, status effects, intent icons; player HP, block, energy, hand, deck/discard/exhaust counts | All visible at once; no clicking to reveal critical data |
| **Enemy intent display** | Action type icon + numeric value | Must be readable without hovering; icon = action type, number = magnitude |
| **Card in hand** | Cost, effect text, type, tags (visual) | Full effect text always visible; tooltip for keyword definitions |
| **Hover/tooltip** | Expanded card/relic text; keyword definitions | Never obscure combat state while reading |
| **Damage/block preview** | Show damage after block calculation before confirming | Player sees "this card will deal X effective damage" |
| **Deck/discard/exhaust inspect** | Scrollable list of all cards in each zone | Accessible at any time; sort by type/cost |
| **Reward screen** | 3 card options + skip; skip cost if applicable | Flat display; card art + text + rarity color |
| **Map screen** | Full act map; current position; node type icons | Reveal entire map at act start; player should plan route |
| **Shop screen** | Cards, relics, potions with prices; card remove service | Prices visible without hover; affordable items highlighted |
| **Run summary** | Full deck composition, relics held, path taken, floor reached | Post-run review enables learning |

### 10.3 Wireframe Descriptions

**Combat Screen (primary interaction surface):**
```
┌─────────────────────────────────────────────────┐
│  [ENEMY ZONE]                                   │
│  Enemy 1: [HP bar] [Block badge] [Status icons] │
│           [INTENT ICON] "18 DMG next turn"      │
│                                                 │
│─────────────────────────────────────────────────│
│  [PLAYER ZONE]                                  │
│  HP: 72/80  Block: 0   Energy: ●●○   [Potion]  │
│  Deck: 14   Discard: 5   Exhaust: 1            │
│─────────────────────────────────────────────────│
│  [HAND ZONE — cards spread horizontally]        │
│  [Card1] [Card2] [Card3] [Card4] [Card5]        │
│  Cost:1   Cost:1  Cost:2  Cost:0  Cost:1        │
│─────────────────────────────────────────────────│
│           [END TURN BUTTON]                     │
└─────────────────────────────────────────────────┘
```

**Card Reward Screen:**
```
┌─────────────────────────────────────────────────┐
│  Choose a Card to Add to Your Deck:             │
│                                                 │
│  ┌────────┐  ┌────────┐  ┌────────┐            │
│  │ CARD A │  │ CARD B │  │ CARD C │            │
│  │ Rare   │  │ Common │  │ Uncommon│           │
│  │ [art]  │  │ [art]  │  │ [art]  │            │
│  │ Text.. │  │ Text.. │  │ Text.. │            │
│  └────────┘  └────────┘  └────────┘            │
│                                   [Skip ►]      │
└─────────────────────────────────────────────────┘
```

***

## 11. System Architecture for Implementation

### 11.1 Module Map

```
┌─────────────────────────────────────────────────────────────────┐
│                         GAME SHELL                              │
│  RunManager  ←→  MetaLayerManager  ←→  SaveSystem             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   MapGenerator      ContentLoader      TelemetryLogger
   (node graph)    (JSON definitions)  (event stream)
        │                  │
        ▼                  ▼
   NodeResolver     CardEngine  ←→  CombatEngine  ←→  EnemyAI
   (event/shop/     (zones,          (turn loop,       (intent
    fight select)   effects,         state machine,    planner,
                    targeting)       event bus)        scripting)
                           │
                           ▼
                    RewardGenerator
                    (card/relic/gold)
```

### 11.2 Module Responsibilities

| Module | Responsibilities |
|---|---|
| **RunManager** | Initialize run state; track current act/floor; coordinate module calls; handle win/lose |
| **MetaLayerManager** | Persistent storage of unlocks, ascension progress, character completion |
| **MapGenerator** | Produce layered-graph map with constraint rules; serialize for display and traversal |
| **ContentLoader** | Load card, relic, enemy, event, encounter definitions from JSON/data files |
| **CombatEngine** | Run turn state machine; dispatch event bus; manage all entity state |
| **CardEngine** | Parse card effects; execute targeting; manage card zone transitions |
| **EnemyAI** | Generate intents; execute scripted behavior; manage phase transitions |
| **RewardGenerator** | Select card/relic offers from filtered pools; apply rarity weights and pity systems |
| **TelemetryLogger** | Emit structured events at all key decision points; buffer and flush to storage |
| **SaveSystem** | Serialize/deserialize mid-run state; autosave after each node |

### 11.3 Data Flows

**Run Start:**
```
RunManager.start_run(character_id, seed)
  → MetaLayerManager.get_character_state(character_id)
  → ContentLoader.load_card_pool(character_id)
  → ContentLoader.load_relic_pool()
  → RunManager.initialize_deck(starting_cards)
  → MapGenerator.generate(seed, act_config)
  → TelemetryLogger.emit("run_start", run_id, character, seed)
```

**Map Node Resolution:**
```
player selects node
  → RunManager.enter_node(node_type, node_id)
  → if FIGHT: CombatEngine.run(encounter_id)
  → if SHOP: RunManager.open_shop()
  → if REST: RunManager.open_rest()
  → if EVENT: RunManager.trigger_event(event_id)
  → SaveSystem.save_run_state()
  → TelemetryLogger.emit("node_visited", ...)
```

**Combat Loop:**
```
CombatEngine.run(encounter_id)
  → ContentLoader.load_enemies(encounter_id)
  → CombatEngine.init_combat(player_state, enemies)
  → EventBus.subscribe(all_relics)   ← relics hook into combat events
  → EventBus.subscribe(all_statuses)
  → LOOP: CombatEngine.run_player_turn()
           CombatEngine.run_enemy_turn()
           CombatEngine.run_upkeep()
           CombatEngine.check_end_conditions()
  → if VICTORY: RewardGenerator.generate_combat_rewards()
  → TelemetryLogger.emit("combat_end", ...)
```

### 11.4 Main Game Loop Pseudocode

```python
def game_loop(save_slot):
    meta = MetaLayerManager.load(save_slot)
    run_state = RunManager.load_or_new(save_slot)
    
    while run_state.active:
        if run_state.at_map:
            node = UI.player_select_node(run_state.map, run_state.current_floor)
            result = RunManager.enter_node(node)
            
            if result == "COMBAT_VICTORY":
                rewards = RewardGenerator.generate(run_state)
                choice = UI.show_reward_screen(rewards)
                RunManager.apply_reward(choice)
            
            elif result == "COMBAT_DEFEAT":
                meta.record_run_end(run_state, "defeat")
                RunManager.end_run()
                break
            
            run_state.advance_floor()
            SaveSystem.save(run_state)
            TelemetryLogger.flush()
        
        elif run_state.at_boss_victory:
            RunManager.start_next_act()
            player.hp = player.hp_max  # full heal between acts
    
    if run_state.victory:
        meta.record_run_end(run_state, "victory")
        meta.process_unlocks(run_state)
```

***

## 12. Content Schemas and Examples

### 12.1 Card Examples (Original, Non-Infringing)

**Schema reminder:** see § 4.4 above.

```json
[
  {
    "id": "arc_lance",
    "name": "Arc Lance",
    "rarity": "common",
    "type": "attack",
    "cost": 1,
    "tags": ["chain", "lightning"],
    "targeting": "single_enemy",
    "effects": [
      { "type": "deal_damage", "value": 8, "target": "target" },
      { "type": "deal_damage", "value": 3, "target": "random_other_enemy" }
    ],
    "keywords": [],
    "upgrade": {
      "modified_effects": [
        { "type": "deal_damage", "value": 11, "target": "target" },
        { "type": "deal_damage", "value": 5, "target": "random_other_enemy" }
      ]
    }
  },
  {
    "id": "spectral_ward",
    "name": "Spectral Ward",
    "rarity": "uncommon",
    "type": "skill",
    "cost": 1,
    "tags": ["block", "retain-synergy"],
    "targeting": "self",
    "effects": [
      { "type": "gain_block", "value": 8, "target": "self" },
      { "type": "draw_cards", "value": 1, "target": "self" }
    ],
    "keywords": ["retain"],
    "upgrade": {
      "modified_effects": [
        { "type": "gain_block", "value": 12, "target": "self" },
        { "type": "draw_cards", "value": 1, "target": "self" }
      ]
    }
  },
  {
    "id": "entropy_coil",
    "name": "Entropy Coil",
    "rarity": "rare",
    "type": "power",
    "cost": 2,
    "tags": ["exhaust-synergy", "scaling"],
    "targeting": "self",
    "effects": [
      { "type": "apply_status", "status": "entropy_gain", "value": 1, "target": "self",
        "description": "Whenever you Exhaust a card, deal 4 damage to all enemies." }
    ],
    "keywords": [],
    "upgrade": {
      "modified_effects": [
        { "type": "apply_status", "status": "entropy_gain", "value": 2, "target": "self",
          "description": "Whenever you Exhaust a card, deal 6 damage to all enemies." }
      ]
    }
  }
]
```

### 12.2 Relic Examples

```json
[
  {
    "id": "echo_crystal",
    "name": "Echo Crystal",
    "rarity": "common",
    "tags": ["economy"],
    "hooks": [
      {
        "event": "ON_COMBAT_START",
        "effect": { "type": "draw_cards", "value": 1, "target": "self" }
      }
    ],
    "flavor_text": "It hums with faint memory."
  },
  {
    "id": "volatile_core",
    "name": "Volatile Core",
    "rarity": "rare",
    "tags": ["risky", "combat", "archetype:exhaust"],
    "hooks": [
      {
        "event": "ON_CARD_EXHAUSTED",
        "effect": { "type": "deal_damage", "value": 4, "target": "all_enemies" }
      },
      {
        "event": "ON_TURN_START",
        "condition": "turn == 1",
        "effect": { "type": "apply_status", "status": "fragile", "value": 1, "target": "self",
                    "description": "Take 25% more damage this combat." }
      }
    ]
  }
]
```

### 12.3 Enemy Example

```json
{
  "id": "stone_sentinel",
  "name": "Stone Sentinel",
  "tags": ["blocker", "scaling"],
  "base_hp": { "min": 48, "max": 54 },
  "ai_script": {
    "type": "weighted_random",
    "intents": [
      {
        "id": "crush",
        "weight": 0.4,
        "max_consecutive": 2,
        "actions": [{ "type": "deal_damage", "value": 14, "target": "player" }]
      },
      {
        "id": "fortify",
        "weight": 0.35,
        "actions": [
          { "type": "gain_block", "value": 14, "target": "self" },
          { "type": "apply_status", "status": "strength", "value": 1, "target": "self" }
        ]
      },
      {
        "id": "shatter",
        "weight": 0.25,
        "max_consecutive": 1,
        "actions": [
          { "type": "deal_damage", "value": 20, "target": "player" },
          { "type": "apply_status", "status": "vulnerable", "value": 2, "target": "player" }
        ]
      }
    ],
    "phases": [
      {
        "trigger": "hp_below_percent",
        "value": 0.35,
        "intent_weight_overrides": { "shatter": 0.7, "fortify": 0.1, "crush": 0.2 }
      }
    ]
  },
  "rewards": { "gold": { "min": 14, "max": 22 }, "card_reward": true, "potion_chance": 0.35 },
  "act_appearances": [^1]
}
```

### 12.4 Event Schema and Example

```json
{
  "event": {
    "id": "string",
    "name": "string",
    "flavor_text": "string",
    "options": [
      {
        "id": "string",
        "label": "string",
        "cost_display": "string | null",
        "condition": "formula | null",
        "effects": [
          { "type": "gain_hp | lose_hp | gain_gold | lose_gold | gain_relic | add_card | remove_card | gain_status | modify_max_hp", "value": "int | formula" }
        ]
      }
    ]
  }
}
```

### 12.5 Status Effect Examples

```json
[
  {
    "id": "corrode",
    "name": "Corrode",
    "is_buff": false,
    "hooks": [
      {
        "event": "ON_TURN_START",
        "handler": "target.take_damage(stacks); stacks -= 1"
      }
    ]
  },
  {
    "id": "momentum",
    "name": "Momentum",
    "is_buff": true,
    "hooks": [
      {
        "event": "ON_ATTACK_DAMAGE_CALC",
        "handler": "damage += stacks"
      },
      {
        "event": "ON_TURN_END",
        "handler": "stacks = 0"
      }
    ]
  }
]
```

***

## 13. Originality and "Do Not Clone" Constraints

### 13.1 What Must Be Different

| Category | What to Avoid | Alternative Directions |
|---|---|---|
| **Thematic wrapper** | Tower/spire climbing; knight/rogue/mage archetypes | Ecological collapse; deep-sea station; corporate dystopia; celestial navigation |
| **Resource names** | "Energy", "Mana", "Strike", "Defend" | Heat / Momentum / Voltage / Resolve / Tempo |
| **Status vocabularies** | Strength, Dexterity, Vulnerable, Weak, Poison | Corrosion, Pressure, Resonance, Disruption, Decay |
| **Signature mechanics** | Exact stance-dance implementation; exact orb system; exact character kit names | Entirely new resource type (e.g., "pressure" that benefits from being high or low); set-based card acquisition[^19] |
| **Map presentation** | Exact branching-path-with-node-icons visual | Top-down hex grid; timeline/train-car metaphor; orbital map; dungeon-tile crawl |
| **Card reward cadence** | Post-every-fight 3-card offer as primary acquisition | Draft at act start; vendor-only acquisition; crafting via components; split acquisition from combat |
| **Boss relic design** | Relics replacing core resources at act boundary | Faction allegiance choices; biome modifiers; persistent enemies |
| **Character unlock sequence** | Linear unlock by "completing a run" | Skill-tree unlocks; story-gate unlocks; run-count unlocks |

### 13.2 Alternative Theme Directions

🟢 **[RECOMMENDATION]** Strong original directions include:

1. **Ecological crisis**: Player is a mycelial network spreading through a dying forest. Cards are spore patterns; relics are ancient roots. Enemies are invasive species.
2. **Deep-sea research station**: Player is an AI managing crew under pressure. Cards are procedures; "HP" is oxygen supply. Enemies are equipment failures and hostile organisms.
3. **Planetary navigation**: Player pilots a ship through celestial bodies. Cards are trajectory burns; enemies are cosmic phenomena (solar flares, gravity wells).
4. **Culinary competition**: Cards are recipes and techniques; enemies are judges with revealed scoring criteria; "block" is presentation score; "damage" is flavor impact.

### 13.3 "Do Not Clone" Checklist

Before shipping, verify each item is **clearly distinct**:

- [ ] World theme and visual language differ from any existing deckbuilder
- [ ] Resource names and icons are original (not "Energy" with lightning bolt)
- [ ] Status effect names are original and differ from StS vocabulary
- [ ] Character abilities do not replicate exact mechanical kits (e.g., no orbs-and-channels clone, no exact stance-dance clone)
- [ ] Map visualization uses a different metaphor or visual style
- [ ] Card acquisition cadence has at least one meaningful structural difference
- [ ] Boss encounters test different mechanical dimensions than StS bosses
- [ ] No card or relic description text reuses StS exact phrasing
- [ ] Starting deck composition is different in philosophy (not just renamed)
- [ ] At least one macro-loop structural difference (different act structure, node types, or run length)

***

## 14. MVP Build Blueprint

### 14.1 Minimum Viable Content

| Category | MVP Minimum | Target for Full Demo |
|---|---|---|
| Cards | 45–55 (1 character) | 75–90 per character |
| Relics | 20–25 | 50+ |
| Enemies (Normal) | 8–10 | 15–20 per act |
| Enemies (Elite) | 4–6 | 6–10 per act |
| Bosses | 2 (one per act) | 3 per act (random selection) |
| Acts | 2 | 3 |
| Events | 15–20 | 50+ |
| Map node types | 5 (fight, elite, rest, shop, boss) | 6+ (add event, treasure) |

🔵 **[OBSERVED]** Community consensus on MVP: "Core systems in place with room to expand; able to complete a full run"[^20]. The MVP doesn't need to be fun — it needs to be a proof of concept. Public prototypes/demos do need to be fun.

### 14.2 System Priority — V1 Must-Have vs. Later

| System | V1 (Must Have) | V2+ (Add Later) |
|---|---|---|
| Deterministic combat engine | ✅ | |
| Card zone management (draw/hand/discard/exhaust) | ✅ | |
| Status effect system (5–8 statuses) | ✅ | |
| Enemy intent display | ✅ | |
| Basic map traversal (fight + rest + boss) | ✅ | |
| Card reward screen (3 choices) | ✅ | |
| Relic system (5–10 relics) | ✅ | |
| Telemetry logging (basic) | ✅ | |
| Card upgrade system | ✅ | |
| Shop node | ✅ | |
| Event nodes | | ✅ |
| Full meta-progression (ascension) | | ✅ |
| Multiple characters | | ✅ |
| Daily challenge / seeded runs | | ✅ |
| Full telemetry dashboard | | ✅ |
| Achievement system | | ✅ |

### 14.3 Recommended Implementation Order

```
Sprint 1: COMBAT CORE
  ├── Entity model (HP, block, energy, statuses)
  ├── Card data schema + loader
  ├── Card zone manager (draw/hand/discard/exhaust)
  ├── Basic turn loop (no relics, no statuses)
  ├── 10 cards (5 attack, 5 defense) for testing
  └── Win/lose detection

Sprint 2: ENEMY AI + INTENT
  ├── Enemy schema + loader
  ├── Intent generation system
  ├── Enemy AI script runner
  ├── Intent UI display
  └── 4 test enemies

Sprint 3: STATUS EFFECTS + RELICS
  ├── Event bus implementation
  ├── Status effect system (8–10 statuses)
  ├── Relic system with hooks
  └── 10 test relics

Sprint 4: MAP + RUN LOOP
  ├── Map generator (constraint-based)
  ├── Node resolver (fight/rest/shop/boss)
  ├── Run state manager
  ├── Card reward screen
  └── Save/load run state

Sprint 5: CONTENT PASS
  ├── Full MVP card set (45–55 cards)
  ├── Full MVP relic set (20–25)
  ├── Full MVP enemy set (12–16)
  ├── Act 2 map config
  └── Act-end boss encounters

Sprint 6: TELEMETRY + BALANCE
  ├── Full telemetry event emission
  ├── Run summary screen
  ├── First balance pass from playtesting data
  └── Basic meta-progression (unlock 2nd character slot)
```

### 14.4 Test and Iteration Plan

**What to test first:** Deterministic combat loop. Can a player complete a fight from a known starting state to a known ending state with full reproducibility?

**Day-1 prototype metrics:**
- Can you complete a full run end-to-end?
- Does the game crash on any card combination?
- Is combat legible? (Do players understand what's happening without tutorial?)

**Week-2 prototype metrics:**
- Average HP at act 1 boss (should be 50–70% remaining for good players)
- Card pick distribution (are 3+ cards per offer being chosen competitively?)
- Act 1 win rate (target: 70–80% for playtesting with experienced gamers)

**Evaluating run interest:**
- "Did you feel like you had a strategy by floor 5?" → if No, reward structure needs work
- "Was there a moment the run felt decided (won/lost)?" → if Act 1, difficulty curve is off
- "Would you try a different strategy next run?" → core replayability signal

***

## Deliverables

### Mechanics Summary

- **Turn-based combat**: Energy + draw system with full hand discard each turn
- **Card zones**: Draw pile → hand → discard → shuffle → exhaust (permanent removal per combat)
- **Enemy intent**: Full transparency of enemy next action before player commits
- **Status effects**: Stackable buff/debuff system subscribed to event bus
- **Deck growth**: Incremental card acquisition after each combat; optional card removal
- **Thin-deck pressure**: Deck consistency mechanically rewards focused builds
- **Relic system**: Passive modifiers hooking into event bus; run-shaping effects
- **Procedural map**: Layered graph with typed node constraints; visible before traversal
- **HP persistence**: Player health carries across fights within an act
- **Meta-progression**: Character unlocks, difficulty modifiers, expanded content pools

### Dependency Map

```
MetaLayer
  └─ depends on: RunManager, ContentLoader

RunManager
  └─ depends on: MapGenerator, CombatEngine, RewardGenerator, SaveSystem

MapGenerator
  └─ depends on: ContentLoader (node configs)

CombatEngine
  └─ depends on: CardEngine, EnemyAI, EventBus, ContentLoader

CardEngine
  └─ depends on: EventBus, ContentLoader (card defs)

EnemyAI
  └─ depends on: EventBus, ContentLoader (enemy defs)

RewardGenerator
  └─ depends on: ContentLoader, RunManager (current state)

TelemetryLogger
  └─ depends on: EventBus (subscribes to all events)

EventBus
  └─ depends on: nothing (core infrastructure)

ContentLoader
  └─ depends on: nothing (reads from data files)
```

### Telemetry Spec Table

| Event | Key Fields | Purpose |
|---|---|---|
| `run_start` | character, ascension, seed | Baseline per-run attribution |
| `card_offered` | card_ids_offered, card_chosen, act, floor, ascension | Pick rate; competitive analysis |
| `card_played` | card_id, turn, energy_before | Usage frequency; combo detection |
| `combat_end` | encounter_id, result, hp_before/after, turns, deck_snapshot | Encounter win rates; HP loss per fight |
| `run_end` | result, floor, deck_ids, relic_ids, ascension | Win rate; winning deck compositions |
| `relic_acquired` | relic_id, source, act, floor | Relic frequency; relic-win correlation |
| `reward_screen` | type, options, chosen, skipped | Skip rate; relative card desirability |
| `path_choice` | chosen_type, alternatives | Path risk-taking patterns |
| `status_applied` | status_id, source, target, combat_id | Status usage frequency |
| `upgrade_applied` | card_id, source_node, act | Upgrade priority patterns |

### MVP Feature List

| Feature | Priority |
|---|---|
| Combat state machine (turn loop) | Must-Have |
| Card zone management | Must-Have |
| Card data loader (JSON) | Must-Have |
| Enemy intent system | Must-Have |
| Status effect event bus | Must-Have |
| Basic relic hooks | Must-Have |
| Map generator (5 node types) | Must-Have |
| Run state manager | Must-Have |
| Card reward screen (3 choices) | Must-Have |
| Card upgrade system | Must-Have |
| Save/load run state | Must-Have |
| Telemetry emission | Must-Have |
| Event nodes | Nice-to-Have |
| 2nd character | Nice-to-Have |
| Ascension/difficulty modifier | Nice-to-Have |
| Daily seed mode | Nice-to-Have |
| Full telemetry dashboard UI | Nice-to-Have |
| Achievement system | Nice-to-Have |
| Run history viewer | Nice-to-Have |
| Card collection browser | Nice-to-Have |

### "Do Not Clone Directly" Checklist

Use this as a gate before content production begins:

- [ ] Thematic world is original (not tower/spire/medieval dungeon)
- [ ] Resource name is original (not "Energy" + lightning bolt)
- [ ] Status names differ entirely from StS vocabulary (Strength, Dexterity, Vulnerable, Weak, Poison, etc.)
- [ ] No character mechanical kit is a direct analog (no orb-channel system clone, no exact stance-dance)
- [ ] Map visualization differs from branching-path-with-node-icons presentation
- [ ] Card acquisition timing/cadence has a structural difference
- [ ] No card or relic text copies exact StS wording
- [ ] Starting deck composition philosophy is different
- [ ] Boss encounter tests different things than StS bosses
- [ ] At least one macro-loop structural innovation present (e.g., different act structure or run length)
- [ ] Art style is wholly original and does not reference StS character/enemy aesthetics
- [ ] Sound design does not reference StS audio identity

---

## References

1. [How Slay the Spire PERFECTED the Roguelike Formula - YouTube](https://www.youtube.com/watch?v=NDPrH_62g-c) - ... Slay the Spire has redefined the roguelike genre. We analyze its unique mechanics, strategic dep...

2. [Slay the Spire - Wikipedia](https://en.wikipedia.org/wiki/Slay_the_Spire)

3. [Slay The Spire Game Design Analysis - YouTube](https://www.youtube.com/watch?v=DnF8Yt3tNMU) - Why you can't stop playing Slay The Spire. Game Designer analyzes Slay The Spire. Discussing Slay th...

4. [How Slay the Spire's devs use data to balance their roguelike deck ...](https://www.gamedeveloper.com/design/how-i-slay-the-spire-i-s-devs-use-data-to-balance-their-roguelike-deck-builder) - The two most important metrics, Giovannetti says, are how often a player picks a card when given the...

5. [I've Learned How The STS Map Generation Works : r/slaythespire](https://www.reddit.com/r/slaythespire/comments/1jczl7v/ive_learned_how_the_sts_map_generation_works/) - The STS map is a 7x15 grid (wide by tall). At the start of map generation, a random starting node fr...

6. [Analysis of Uncertainty in Procedural Maps in Slay the Spire - arXiv](https://arxiv.org/html/2504.03918v1) - This work investigates the role of uncertainty in Slay the Spire using an information-theoretic fram...

7. [Combat Mechanics | Slay the Spire Wiki - Fandom](https://slay-the-spire.fandom.com/wiki/Combat_Mechanics) - Combat is done as a turn based card game. The player uses cards from the deck they have built during...

8. [Implementing a Slay The Spire-style relic system.](https://www.reddit.com/r/godot/comments/o71vsx/implementing_a_slay_the_spirestyle_relic_system/)

9. [Slay the Spire/Monster - NamuWiki](https://en.namu.wiki/w/Slay%20the%20Spire/%EB%AA%AC%EC%8A%A4%ED%84%B0) - There is an 'encounter weight' for each common enemy combination, and the higher this is, the more l...

10. [Slay the Spire Tips: Master Deck‑Building, Path Planning ... - Eneba](https://www.eneba.com/hub/games-guides/slay-the-spire-tips/) - Master Slay the Spire tips with a lean deck, smart route planning, and character synergy to outthink...

11. [Slay the Spire finally taught me how to build a deck - Polygon.com](https://www.polygon.com/2019/1/11/18167460/slay-the-spire-impressions-deck-building-strategy/) - The early access, roguelike card game tasks players to create new strategies each run. Slay the Spir...

12. [All Relics In Slay The Spire 2 Explained - EGamersWorld](https://egamersworld.com/blog/all-relics-in-slay-the-spire-2-explained-5kcfciqEl0) - Every Slay the Spire 2 relic ranked by rarity with effects, early game picks, and tips to build stro...

13. [Slay the Spire: Metrics Driven Design and Balance - YouTube](https://www.youtube.com/watch?v=7rqfbvnO_H0) - In this 2019 GDC session, Mega Crit Games' Anthony Giovannetti discusses how the dev team approached...

14. [What design choices makes Slay the Spire one of the best games ...](https://www.reddit.com/r/slaythespire/comments/17rn2ie/what_design_choices_makes_slay_the_spire_one_of/) - One thing for me is the combination of art and enemy design. The enemies are varied, but are memorab...

15. [Slay the Spire: Meta-Progression and Unlocks](https://www.rappy-world.com/posts/slay_the_spire_metaprogression_and_unlocks/) - Discover efficient strategies to unlock content, maximize progression, and adapt your gameplay in 'S...

16. [Ascension | Slay the Spire Wiki - Fandom](https://slay-the-spire.fandom.com/wiki/Ascension) - Ascension is a game mode that adds new challenge modifiers to runs for added difficulty. In order to...

17. [The Price of Randomness - Balancing RNG - Extra Credits - YouTube](https://www.youtube.com/watch?v=ry2xz5yYZwY) - Let's compare the RNG design in Hearthstone and Slay the Spire and figure out how we can design RNG ...

18. [Flash Thoughts: Slay the Spire's UI - Cloudfall Studios](https://www.cloudfallstudios.com/blog/2018/2/20/flash-thoughts-slay-the-spires-ui) - They made playing cards feel as good as possible. Note all these little tricks they do to make the g...

19. [Set-Based Card Mechanics in Roguelike-Deckbuilders - YouTube](https://www.youtube.com/watch?v=uwiFwic03EE) - Most deckbuilders (roguelike or otherwise) focus on the interesting choices around an adding single ...

20. [What would you say is the minimum viable product for a roguelike ...](https://www.reddit.com/r/deckbuildingroguelike/comments/15d19vi/what_would_you_say_is_the_minimum_viable_product/) - Minimum viable product I think is the core systems in place with room to expand. Complete a full run...

