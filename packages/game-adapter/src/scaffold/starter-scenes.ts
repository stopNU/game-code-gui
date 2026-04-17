export const DEFAULT_STARTER_SCENES = [
  'BootScene',
  'MainMenuScene',
  'CharacterSelectScene',
  'MapScene',
] as const;

export function mergeStarterScenes(sceneIds: readonly string[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const sceneId of DEFAULT_STARTER_SCENES) {
    if (!seen.has(sceneId)) {
      seen.add(sceneId);
      merged.push(sceneId);
    }
  }

  for (const sceneId of sceneIds) {
    if (!seen.has(sceneId)) {
      seen.add(sceneId);
      merged.push(sceneId);
    }
  }

  return merged;
}
