export interface PhaserProject {
  id: string;
  path: string;
  title: string;
  version: string;
  width: number;
  height: number;
  scenes: string[];
  backgroundColor: string;
}

export interface BuildOutput {
  success: boolean;
  bundleSizeKb: number;
  outputDir: string;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface TypecheckOutput {
  success: boolean;
  errorCount: number;
  errors: string[];
  durationMs: number;
}

export interface DevServerHandle {
  url: string;
  port: number;
  stop: () => Promise<void>;
}
