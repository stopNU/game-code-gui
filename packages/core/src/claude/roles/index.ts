import type { AgentRole } from '../../types/agent.js';

export { ASSET_SYSTEM_PROMPT } from './asset.js';
export { QA_SYSTEM_PROMPT } from './qa.js';
export { EVALUATOR_SYSTEM_PROMPT } from './evaluator.js';
export { BRIEF_ANALYST_SYSTEM_PROMPT } from './brief-analyst.js';
export { ADVANCED_DESIGNER_SYSTEM_PROMPT, buildAdvancedDesignerPrompt } from './advanced-designer.js';
export { ADVANCED_GAMEPLAY_SYSTEM_PROMPT, buildAdvancedGameplayPrompt } from './advanced-gameplay.js';
export { SYSTEMS_SYSTEM_PROMPT, buildSystemsPrompt } from './systems.js';
export { INTEGRATION_VERIFIER_SYSTEM_PROMPT, buildIntegrationVerifierPrompt } from './integration-verifier.js';
export { BALANCE_SYSTEM_PROMPT, buildBalancePrompt } from './balance.js';
export { buildPrompt, SHARED_DISCIPLINE } from './shared.js';

import { ASSET_SYSTEM_PROMPT } from './asset.js';
import { QA_SYSTEM_PROMPT } from './qa.js';
import { EVALUATOR_SYSTEM_PROMPT } from './evaluator.js';
import { buildAdvancedDesignerPrompt } from './advanced-designer.js';
import { buildAdvancedGameplayPrompt } from './advanced-gameplay.js';
import { buildSystemsPrompt } from './systems.js';
import { buildIntegrationVerifierPrompt } from './integration-verifier.js';
import { buildBalancePrompt } from './balance.js';

export interface SystemPromptOptions {
  hasNPCs?: boolean;
}

/**
 * Detect whether a task likely involves AI/NPC-controlled entities from its
 * title + description, so callers don't need to pass `hasNPCs` explicitly.
 */
export function detectNPCs(title: string, description: string): boolean {
  return /\b(ai|npc|enemy|enemies|bot|computer.?controlled|auto.?play|opponent)\b/i.test(
    `${title} ${description}`,
  );
}

export function getSystemPrompt(
  role: AgentRole,
  _mode?: string,
  _opts: SystemPromptOptions = {},
): string {
  switch (role) {
    case 'gameplay':              return buildAdvancedGameplayPrompt();
    case 'designer':              return buildAdvancedDesignerPrompt();
    case 'systems':               return buildSystemsPrompt();
    case 'integration-verifier':  return buildIntegrationVerifierPrompt();
    case 'balance':               return buildBalancePrompt();
    case 'asset':                 return ASSET_SYSTEM_PROMPT;
    case 'qa':                    return QA_SYSTEM_PROMPT;
    case 'evaluator':             return EVALUATOR_SYSTEM_PROMPT;
    default:                      return buildAdvancedGameplayPrompt();
  }
}
