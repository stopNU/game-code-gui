/**
 * Output of the visual stage. Always an image — the stage throws when image
 * generation fails (no FAL_KEY, network error, retries exhausted), letting
 * the stage runner retry or surface the failure to the caller.
 */
export interface VisualOutput {
  /** Path to the generated source PNG on disk (under .compiler/visual/). */
  neutralPath: string;
  width: number;
  height: number;
  /** Provenance, e.g. "fal-ai/flux/schnell". */
  provenance: string;
}
