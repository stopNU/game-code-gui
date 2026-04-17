import type { MemoryEntry, MemoryFile, MemoryScope } from '../types/memory.js';
import type { TaskState } from '../types/task.js';
import type { TaskResult } from '../types/task.js';

export class MemoryStore {
  private entries: Map<string, MemoryEntry> = new Map();
  private projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  set(
    key: string,
    value: string,
    scope: MemoryScope = 'project',
    tags: string[] = [],
    ttl?: number,
  ): void {
    const now = new Date().toISOString();
    const existing = this.entries.get(key);
    this.entries.set(key, {
      key,
      value,
      scope,
      tags,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(ttl !== undefined ? { ttl } : {}),
    });
  }

  get(key: string): MemoryEntry | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.ttl !== undefined) {
      const age = Date.now() - new Date(entry.createdAt).getTime();
      if (age > entry.ttl) {
        this.entries.delete(key);
        return undefined;
      }
    }
    return entry;
  }

  search(tags: string[]): MemoryEntry[] {
    return Array.from(this.entries.values()).filter((e) =>
      tags.some((t) => e.tags.includes(t)),
    );
  }

  byScope(scope: MemoryScope): MemoryEntry[] {
    return Array.from(this.entries.values()).filter((e) => e.scope === scope);
  }

  /**
   * Return project/global entries relevant to a specific task, capped at
   * `maxEntries` (default 15, sorted newest-first).
   *
   * Relevance rules (any one is sufficient):
   *  1. Entry has no tags → universal knowledge, always included.
   *  2. An entry tag matches `task.role` (e.g. "gameplay", "designer").
   *  3. An entry tag matches `task.context.subsystemId` (advanced mode).
   *  4. An entry tag matches `"phase:<n>"` for the task's phase number.
   *  5. An entry tag matches the task's own `id` (task-specific notes).
   *
   * Expired entries (past their TTL) are silently dropped.
   */
  forTask(task: TaskState, maxEntries = 15): MemoryEntry[] {
    const relevantTags = new Set<string>([
      task.role,
      `phase:${task.phase}`,
      task.id,
      ...task.dependencies,
      ...(task.context.subsystemId !== undefined ? [task.context.subsystemId] : []),
    ]);

    const now = Date.now();

    return Array.from(this.entries.values())
      .filter((e) => {
        // Scope filter: only project-wide or global entries are cross-task
        if (e.scope !== 'project' && e.scope !== 'global') return false;
        // TTL check
        if (e.ttl !== undefined && now - new Date(e.createdAt).getTime() > e.ttl) return false;
        // Relevance: untagged = universal; tagged = must intersect task context
        return e.tags.length === 0 || e.tags.some((t) => relevantTags.has(t));
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, maxEntries);
  }

  dependencySummaries(task: TaskState): MemoryEntry[] {
    const now = Date.now();

    return task.dependencies
      .map((dependencyId) => this.get(`task:${dependencyId}:summary`))
      .filter((entry): entry is MemoryEntry => {
        if (!entry) return false;
        if (entry.ttl !== undefined && now - new Date(entry.createdAt).getTime() > entry.ttl) {
          return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  setTaskSummary(task: TaskState, result: TaskResult): void {
    const summary = [
      `Task ${task.id} (${task.role}, phase ${task.phase})`,
      `Title: ${task.title}`,
      `Description: ${task.description}`,
      `Acceptance criteria: ${task.acceptanceCriteria.join(' | ')}`,
      `Result: ${result.summary}`,
      `Files modified: ${result.filesModified.length > 0 ? result.filesModified.join(', ') : 'none recorded'}`,
    ].join('\n');

    this.set(
      `task:${task.id}:summary`,
      summary,
      'project',
      [task.id, task.role, `phase:${task.phase}`, 'task-summary'],
    );
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  toFile(): MemoryFile {
    return {
      version: '1.0.0',
      projectId: this.projectId,
      entries: Array.from(this.entries.values()),
      lastUpdated: new Date().toISOString(),
    };
  }

  static fromFile(file: MemoryFile): MemoryStore {
    const store = new MemoryStore(file.projectId);
    for (const entry of file.entries) {
      store.entries.set(entry.key, entry);
    }
    return store;
  }
}
