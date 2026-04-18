import path from 'path';
import fs from 'fs';
import os from 'os';
import type { SettingsStatus, LangSmithStatus } from '../../shared/domain.js';
import type { SettingsRepository } from '../db/repositories/settings-repository.js';
import type { SecretStorage } from './secret-storage.js';

const WORKSPACE_ROOT_KEY = 'workspace.root';

const secretSettingKeys = {
  anthropic: 'secret.anthropic_api_key',
  openai: 'secret.openai_api_key',
  fal: 'secret.fal_key',
  langsmith: 'secret.langsmith_api_key',
  godotPath: 'secret.godot_path',
  claudePath: 'secret.claude_path',
} as const;

type SecretName = keyof typeof secretSettingKeys;

const secretEnvVars: Record<SecretName, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  fal: 'FAL_KEY',
  langsmith: 'LANGSMITH_API_KEY',
  godotPath: 'GODOT_PATH',
  claudePath: 'CLAUDE_PATH',
};

export class SettingsService {
  public constructor(
    private readonly settingsRepository: SettingsRepository,
    private readonly secretStorage: SecretStorage,
    private readonly defaultWorkspaceRoot: string,
  ) {}

  public get(key: string): string | null {
    return this.settingsRepository.get(key)?.value ?? null;
  }

  public set(key: string, value: string): string {
    return this.settingsRepository.set(key, value).value;
  }

  public getWorkspaceRoot(): string | null {
    return this.get(WORKSPACE_ROOT_KEY);
  }

  public getEffectiveWorkspaceRoot(): string {
    return this.getWorkspaceRoot() ?? this.defaultWorkspaceRoot;
  }

  public setWorkspaceRoot(workspaceRoot: string): string {
    const resolved = path.resolve(workspaceRoot);
    this.settingsRepository.set(WORKSPACE_ROOT_KEY, resolved);
    return resolved;
  }

  public getApiKey(name: SecretName): string | null {
    const envValue = process.env[secretEnvVars[name]];
    if (typeof envValue === 'string' && envValue.length > 0) {
      return envValue;
    }

    const stored = this.settingsRepository.get(secretSettingKeys[name])?.value;
    if (stored === undefined) {
      return null;
    }

    return this.secretStorage.decryptString(stored);
  }

  public setApiKey(name: SecretName, value: string): void {
    if (value.trim().length === 0) {
      this.settingsRepository.delete(secretSettingKeys[name]);
      return;
    }

    if (!this.secretStorage.isEncryptionAvailable()) {
      throw new Error('Secure secret storage is unavailable on this device.');
    }

    this.settingsRepository.set(secretSettingKeys[name], this.secretStorage.encryptString(value));
  }

  public getClaudeCodeToken(): string | null {
    try {
      const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
      const raw = fs.readFileSync(credPath, 'utf8');
      const parsed = JSON.parse(raw) as { claudeAiOauth?: { accessToken?: string } };
      const token = parsed.claudeAiOauth?.accessToken;
      return typeof token === 'string' && token.length > 0 ? token : null;
    } catch {
      return null;
    }
  }

  public getStatus(): SettingsStatus {
    return {
      workspaceRoot: this.getEffectiveWorkspaceRoot(),
      anthropicConfigured: this.getApiKey('anthropic') !== null,
      openaiConfigured: this.getApiKey('openai') !== null,
      claudeCodeConfigured: this.getClaudeCodeToken() !== null,
    };
  }

  public getLangSmithRuntimeConfig(): {
    enabled: boolean;
    apiKey: string | null;
    projectName: string;
    endpoint: string | null;
  } {
    return {
      enabled: this.get('langsmith.enabled') === 'true',
      apiKey: this.getApiKey('langsmith'),
      projectName: this.get('langsmith.project') ?? process.env.LANGSMITH_PROJECT ?? 'harness-studio',
      endpoint: this.get('langsmith.endpoint') ?? process.env.LANGSMITH_ENDPOINT ?? null,
    };
  }

  public getLangSmithStatus(): LangSmithStatus {
    const config = this.getLangSmithRuntimeConfig();
    return {
      configured: config.apiKey !== null,
      enabled: config.enabled,
      projectName: config.projectName,
      ...(config.endpoint !== null ? { endpoint: config.endpoint } : {}),
    };
  }
}

export { secretSettingKeys };
export type { SecretName };
