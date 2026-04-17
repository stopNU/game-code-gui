export type MemoryScope = 'task' | 'session' | 'project' | 'global';

export interface MemoryEntry {
  key: string;
  value: string;
  scope: MemoryScope;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}

export interface MemoryFile {
  version: string;
  projectId: string;
  entries: MemoryEntry[];
  lastUpdated: string;
}
