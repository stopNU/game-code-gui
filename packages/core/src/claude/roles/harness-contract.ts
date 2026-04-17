export const ADVANCED_HARNESS_RUNTIME_CONTRACT = `## Advanced harness runtime contract

Automated playtests read \`window.__HARNESS__.getState()\`. In advanced mode, that object has this exact top-level shape:
\`\`\`typescript
type HarnessState = {
  scene: string;
  fps: number;
  gameState: Record<string, unknown>;
  buttons: Array<{ id: string; label: string; action: string; params?: Record<string, unknown> }>;
  sceneHistory: string[];
  errorLog: string[];
  frameCount: number;
  timestamp: number;
  dataState: Record<string, number>;
  machineStates: Record<string, string>;
  eventLog: string[];
};
\`\`\`

Important:
- Scene \`get harnessState()\` values become \`window.__HARNESS__.getState().gameState\`
- State machine values do NOT come from the scene getter; they appear under top-level \`machineStates\`
- Content-load counts appear under top-level \`dataState\`
- Browser assertions should use paths like \`gameState.handSize\`, \`dataState.cardCount\`, or \`machineStates.combat\` exactly as written above`;

export const ADVANCED_GAMEPLAY_HARNESS_RULES = `## Scene harnessState rules

Every interactive gameplay scene MUST implement \`get harnessState()\` and return only scene-specific gameState fields that a playtest may assert on.
Scene \`get harnessState()\` values become \`window.__HARNESS__.getState().gameState\`.

Required pattern:
\`\`\`typescript
get harnessState(): Record<string, unknown> {
  return {
    handSize: this.hand.length,
    drawPileSize: this.drawPile.length,
    discardPileSize: this.discardPile.length,
    currentHp: this.playerHp,
    maxHp: this.playerMaxHp,
    energy: this.currentEnergy,
    maxEnergy: this.maxEnergy,
    enemyCount: this.enemies.length,
    turn: this.turnCount,
    selectedCardId: this.selectedCard?.id ?? null,
  };
}
\`\`\`

Rules:
- Expose only scene-local observable values in \`gameState\`
- Do NOT nest fields under a \`gameState\` key inside the getter
- Do NOT duplicate FSM values as \`machineState\` or \`machineStates\` inside the getter; playtests read FSM state from top-level \`machineStates\`
- If verification steps need to assert a scene-local value, expose that exact field name in the getter
- If a scene supports buttons or click flows, expose the fields that confirm the interaction succeeded`;
