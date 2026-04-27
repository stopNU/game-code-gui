import sharp from 'sharp';
import type { Vec2 } from '../types/skeleton.js';

/**
 * Anatomical landmarks detected on a T-pose cutout (bg-removed).
 *
 * Coordinates are in source-image pixel space (origin top-left, +y down).
 * All limb landmarks are symmetry-enforced around `centerX`.
 */
export interface Landmarks {
  /** Image width / height the landmarks were measured against. */
  imageWidth: number;
  imageHeight: number;
  /** Vertical center axis of the figure (from spine column). */
  centerX: number;

  head: { top: number; bottom: number; center: Vec2; halfWidth: number };

  /** Y of the maximum-width row in the upper part of the figure (T-pose arm bar). */
  shoulderY: number;
  /** Y of the top of the hip — where the torso column transitions to wider hip mass. */
  hipY: number;
  /** Y at which the leg mass splits into two separate columns. */
  legSplitY: number;

  /** Inner shoulder x (where the torso column meets the arm bar). */
  shoulderLx: number;
  shoulderRx: number;
  /** Wrist x — the leftmost/rightmost opaque columns at shoulderY. */
  wristLx: number;
  wristRx: number;
  /** Half-width of the torso column, measured well below the arm bar. */
  torsoHalfWidth: number;

  /** Hip rect (x range at hipY, plus center). */
  hipLx: number;
  hipRx: number;

  /** Per-leg vertical landmarks (knee = midpoint hip→ankle). */
  legL: { hip: Vec2; knee: Vec2; ankle: Vec2 };
  legR: { hip: Vec2; knee: Vec2; ankle: Vec2 };
}

const ALPHA_THRESHOLD = 32;

interface RowProfile {
  /** Width (count of opaque pixels) per row. */
  widths: number[];
  /** Leftmost opaque column per row (-1 if row is empty). */
  lefts: number[];
  /** Rightmost opaque column per row (-1 if row is empty). */
  rights: number[];
}

async function buildRowProfile(cutoutPath: string): Promise<{ W: number; H: number; profile: RowProfile; raw: Buffer }> {
  const meta = await sharp(cutoutPath).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const raw = await sharp(cutoutPath).ensureAlpha().raw().toBuffer();
  const widths = new Array<number>(H).fill(0);
  const lefts = new Array<number>(H).fill(-1);
  const rights = new Array<number>(H).fill(-1);
  for (let y = 0; y < H; y++) {
    let count = 0;
    let left = -1;
    let right = -1;
    for (let x = 0; x < W; x++) {
      if (raw[(y * W + x) * 4 + 3]! >= ALPHA_THRESHOLD) {
        count += 1;
        if (left === -1) left = x;
        right = x;
      }
    }
    widths[y] = count;
    lefts[y] = left;
    rights[y] = right;
  }
  return { W, H, profile: { widths, lefts, rights }, raw };
}

function findFirstOpaqueRow(profile: RowProfile): number {
  for (let y = 0; y < profile.widths.length; y++) {
    if ((profile.widths[y] ?? 0) > 0) return y;
  }
  return -1;
}

function findLastOpaqueRow(profile: RowProfile): number {
  for (let y = profile.widths.length - 1; y >= 0; y--) {
    if ((profile.widths[y] ?? 0) > 0) return y;
  }
  return -1;
}

/**
 * Find the row index of maximum width within [yLo, yHi].
 */
function rowArgMax(widths: number[], yLo: number, yHi: number): number {
  let best = yLo;
  let bestW = widths[yLo] ?? 0;
  for (let y = yLo + 1; y <= yHi; y++) {
    const w = widths[y] ?? 0;
    if (w > bestW) {
      bestW = w;
      best = y;
    }
  }
  return best;
}

/**
 * Find the row where the alpha mask first contains TWO disjoint horizontal
 * runs (i.e. the legs have separated). Returns -1 if never.
 */
function findLegSplit(profile: RowProfile, raw: Buffer, W: number, yStart: number, yEnd: number): number {
  for (let y = yStart; y <= yEnd; y++) {
    let runs = 0;
    let inRun = false;
    for (let x = 0; x < W; x++) {
      const op = (raw[(y * W + x) * 4 + 3] ?? 0) >= ALPHA_THRESHOLD;
      if (op && !inRun) {
        runs += 1;
        inRun = true;
      } else if (!op && inRun) {
        inRun = false;
      }
      if (runs >= 2) return y;
    }
  }
  return -1;
}

/**
 * Within row y, find the leftmost/rightmost opaque pixel of each separate run.
 * For a leg-split row, returns 2 runs: [{left,right} for left leg, then right leg].
 */
function rowRuns(raw: Buffer, W: number, y: number): Array<{ left: number; right: number }> {
  const runs: Array<{ left: number; right: number }> = [];
  let cur: { left: number; right: number } | null = null;
  for (let x = 0; x < W; x++) {
    const op = (raw[(y * W + x) * 4 + 3] ?? 0) >= ALPHA_THRESHOLD;
    if (op) {
      if (!cur) cur = { left: x, right: x };
      else cur.right = x;
    } else {
      if (cur) {
        runs.push(cur);
        cur = null;
      }
    }
  }
  if (cur) runs.push(cur);
  return runs;
}

/**
 * Detect landmarks on a T-pose cutout. Returns null if the cutout is too
 * sparse or doesn't match the expected biped shape — caller should fall
 * back to the template skeleton + region rects.
 */
export async function detectLandmarks(cutoutPath: string): Promise<Landmarks | null> {
  const { W, H, profile, raw } = await buildRowProfile(cutoutPath);
  if (W < 16 || H < 16) return null;

  const headTop = findFirstOpaqueRow(profile);
  const lastRow = findLastOpaqueRow(profile);
  if (headTop < 0 || lastRow < headTop + 16) return null;
  const figureH = lastRow - headTop + 1;

  // Shoulder line: look for the maximum-width row in the upper half. T-pose
  // makes the arm bar the widest row of the figure.
  const upperHi = headTop + Math.floor(figureH * 0.5);
  const shoulderY = rowArgMax(profile.widths, headTop, upperHi);
  const shoulderWidth = profile.widths[shoulderY] ?? 0;
  if (shoulderWidth < W * 0.10) return null; // figure too narrow to be a T-pose

  // Center column: the spine. The widest column in a band below the head
  // and above the legs. (Use a coarse approximation: just the midpoint of
  // the shoulderY row's opaque mass.)
  const shoulderRun = rowRuns(raw, W, shoulderY);
  if (shoulderRun.length === 0) return null;
  const armBar = shoulderRun.reduce(
    (acc, r) => ({ left: Math.min(acc.left, r.left), right: Math.max(acc.right, r.right) }),
    { left: shoulderRun[0]!.left, right: shoulderRun[0]!.right },
  );
  const centerX = Math.round((armBar.left + armBar.right) / 2);

  // Head: scan from headTop down until the row width drops to a local minimum
  // (the neck), the next peak after that is the shoulder. Head height = neck
  // y - head top. Head halfWidth = max width within [headTop, neckY] / 2.
  let neckY = shoulderY;
  let headPeakWidth = profile.widths[headTop] ?? 0;
  for (let y = headTop + 1; y < shoulderY; y++) {
    const w = profile.widths[y] ?? 0;
    if (w < headPeakWidth * 0.7 && w < shoulderWidth * 0.4) {
      neckY = y;
      break;
    }
    if (w > headPeakWidth) headPeakWidth = w;
  }
  let headHalfW = 0;
  for (let y = headTop; y < neckY; y++) {
    const w = profile.widths[y] ?? 0;
    if (w / 2 > headHalfW) headHalfW = w / 2;
  }
  const headBot = neckY;
  const headCenter: Vec2 = { x: centerX, y: Math.round((headTop + headBot) / 2) };

  // Torso column width: measured on a row clearly below the shoulder bar.
  // Take the median of widths in [shoulderY + 5%H, shoulderY + 25%H].
  const torsoBandStart = Math.min(H - 1, shoulderY + Math.floor(figureH * 0.05));
  const torsoBandEnd = Math.min(H - 1, shoulderY + Math.floor(figureH * 0.25));
  const torsoSamples: number[] = [];
  for (let y = torsoBandStart; y <= torsoBandEnd; y++) {
    torsoSamples.push(profile.widths[y] ?? 0);
  }
  torsoSamples.sort((a, b) => a - b);
  const torsoMedian = torsoSamples[Math.floor(torsoSamples.length / 2)] ?? 0;
  const torsoHalfWidth = Math.max(8, Math.floor(torsoMedian / 2));

  // Inner shoulder x = centerX ± torsoHalfWidth.
  const shoulderLx = Math.max(0, centerX - torsoHalfWidth);
  const shoulderRx = Math.min(W - 1, centerX + torsoHalfWidth);
  // Wrist x = ends of the arm bar.
  const wristLx = armBar.left;
  const wristRx = armBar.right;

  // Hip: scan downward from torsoBandEnd until the row width grows
  // significantly (legs widen, or hip mass) — that's hipY. Cap by figure
  // height: hipY can't exceed 75% of figure height.
  const hipScanEnd = headTop + Math.floor(figureH * 0.75);
  let hipY = headTop + Math.floor(figureH * 0.55); // sane default
  for (let y = torsoBandEnd; y < hipScanEnd; y++) {
    if ((profile.widths[y] ?? 0) > torsoMedian * 1.15) {
      hipY = y;
      break;
    }
  }
  // Hip rect: leftmost/rightmost at hipY.
  const hipRow = rowRuns(raw, W, hipY);
  if (hipRow.length === 0) return null;
  const hipBox = hipRow.reduce(
    (acc, r) => ({ left: Math.min(acc.left, r.left), right: Math.max(acc.right, r.right) }),
    { left: hipRow[0]!.left, right: hipRow[0]!.right },
  );
  const hipLx = hipBox.left;
  const hipRx = hipBox.right;

  // Leg split: first row below hipY where the alpha has two disjoint runs.
  const legSplitY = findLegSplit(profile, raw, W, hipY + 2, lastRow);
  if (legSplitY < 0) return null;

  // Per-leg landmarks: at the bottom of the figure, find the two leg blobs
  // (or estimate from leg-split row).
  // Strategy: at lastRow, find runs. If 2, those are the feet. If 1, fall
  // back to splitting the single run in half.
  const bottomRow = rowRuns(raw, W, lastRow);
  let footLcenter: number, footRcenter: number;
  if (bottomRow.length >= 2) {
    // Sort by leftness; pick the leftmost-most and rightmost-most groups.
    const sorted = bottomRow.slice().sort((a, b) => a.left - b.left);
    const lFirst = sorted[0]!;
    const lLast = sorted[sorted.length - 1]!;
    footLcenter = Math.round((lFirst.left + lFirst.right) / 2);
    footRcenter = Math.round((lLast.left + lLast.right) / 2);
  } else if (bottomRow.length === 1) {
    const single = bottomRow[0]!;
    footLcenter = Math.round(single.left + (single.right - single.left) * 0.25);
    footRcenter = Math.round(single.left + (single.right - single.left) * 0.75);
  } else {
    return null;
  }
  // Mirror-enforce the feet around centerX.
  const footHalfSpread = Math.max(8, Math.round((footRcenter - footLcenter) / 2));
  const ankleY = lastRow;

  // Hip points (where each leg attaches).
  const hipLcenter = Math.round((hipLx + centerX) / 2);
  const hipRcenter = Math.round((centerX + hipRx) / 2);

  // Knees: midpoint between hip and ankle (could refine via narrowest point).
  const kneeYL = Math.round((hipY + ankleY) / 2);
  const kneeYR = kneeYL;
  const legL = {
    hip: { x: hipLcenter, y: hipY },
    knee: { x: Math.round((hipLcenter + (centerX - footHalfSpread)) / 2), y: kneeYL },
    ankle: { x: centerX - footHalfSpread, y: ankleY },
  };
  const legR = {
    hip: { x: hipRcenter, y: hipY },
    knee: { x: Math.round((hipRcenter + (centerX + footHalfSpread)) / 2), y: kneeYR },
    ankle: { x: centerX + footHalfSpread, y: ankleY },
  };

  return {
    imageWidth: W,
    imageHeight: H,
    centerX,
    head: { top: headTop, bottom: headBot, center: headCenter, halfWidth: Math.max(6, Math.round(headHalfW)) },
    shoulderY,
    hipY,
    legSplitY,
    shoulderLx,
    shoulderRx,
    wristLx,
    wristRx,
    torsoHalfWidth,
    hipLx,
    hipRx,
    legL,
    legR,
  };
}
