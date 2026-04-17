export type AssetType = 'image' | 'spritesheet' | 'audio' | 'tilemap' | 'atlas';
export type AssetStatus = 'placeholder' | 'generated' | 'approved' | 'failed';

export interface AssetEntry {
  key: string;
  type: AssetType;
  path: string;
  scene: string;
  usage: string;
  resolution?: string;
  status: AssetStatus;
  frameWidth?: number;
  frameHeight?: number;
  frameCount?: number;
  provenance?: string;
  generatedAt?: string;
  qualityScore?: number;
}

export interface AssetManifest {
  version: string;
  gameId: string;
  assets: AssetEntry[];
}

export interface AssetRequest {
  key: string;
  type: AssetType;
  prompt: string;
  width?: number;
  height?: number;
  frameWidth?: number;
  frameHeight?: number;
  frameCount?: number;
  transparent?: boolean;
  scene?: string;
  usage?: string;
  styleGuide?: string;
}

export interface AssetGenerationResult {
  request: AssetRequest;
  outputPath: string;
  status: AssetStatus;
  qualityScore: number;
  provenance: string;
  error?: string;
}
