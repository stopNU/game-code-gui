export type StageName =
  | 'parse'
  | 'visual'
  | 'segment'
  | 'mesh'
  | 'atlas'
  | 'rig'
  | 'motion'
  | 'export';

export interface StageIssue {
  severity: 'warn' | 'error';
  message: string;
}

export interface StageResult {
  stage: StageName;
  ok: boolean;
  /** Quality score in [0, 1]. 1 = perfect, 0 = unusable. */
  score: number;
  issues: StageIssue[];
  /** Number of times this stage was retried before settling. */
  retries: number;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
}

export interface CompileResult {
  ok: boolean;
  bundlePath: string;
  files: {
    tscn: string;
    atlas: string;
    meta: string;
  };
  stages: StageResult[];
}
