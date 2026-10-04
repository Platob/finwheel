import type { ThemeId, Tier } from '../../../shared/schema';
import type { WheelView } from '../../../shared/types';

/** Where the wheel sits in the square scene canvas, in device pixels. */
export interface SceneGeometry {
  /** Side of the square canvas. */
  size: number;
  cx: number;
  cy: number;
  /** Outer radius of the rim. */
  rim: number;
  /** Radius of the rotating face. */
  face: number;
  /** Radius of the hub. */
  hub: number;
}

export interface HubOptions {
  /** Hub radius in device pixels. */
  radius: number;
  /** Wheel on screen (null before the first state arrives). */
  view: WheelView | null;
  /** Centre photo, decoded and scaled down; null shows the theme's own hub art. */
  photo: HTMLCanvasElement | null;
}

export interface HighlightStyle {
  /** Outline and glow colour of the winning slice. */
  glow: string;
  /** "r, g, b" of the pulsing additive fill. */
  fill: string;
  /** Opacity of the shade laid over the other slices. */
  dim: number;
  /** "r, g, b" of that shade (default black). */
  shade?: string;
}

/**
 * Everything that gives the wheel its look. The scene owns geometry, motion, the marquee chase
 * and the highlight timing; a theme only paints.
 */
export interface WheelTheme {
  readonly id: ThemeId;
  /** CSS font shorthands to load before text is drawn ("700 40px Cinzel"). */
  readonly fonts: readonly string[];
  /** Placement relative to the canvas size (centre, outer rim) and the rim (face, hub ⊂ face). */
  readonly layout: { centerY: number; rimOuter: number; face: number; hub: number };
  /** Inner radius of the slice outline drawn around the winner, relative to the face radius. */
  readonly hubRing: number;
  /** Marquee lights: track radius relative to the rim, angles in turns clockwise from 12 o'clock. */
  readonly lights: { track: number; angles: readonly number[] };
  /** Whether the hub turns with the face (false keeps its text and photo upright). */
  readonly hubRotates: boolean;

  /** The rotating face (slices, labels, pegs) as a square canvas of side `2 × radius`. */
  renderFace(view: WheelView, radius: number): HTMLCanvasElement;
  /** Static parts behind the face: floor shadow and rim. Full scene size. */
  buildRim(g: SceneGeometry): HTMLCanvasElement;
  /** The hub as a square canvas of side `2 × radius`. */
  buildHub(options: HubOptions): HTMLCanvasElement;
  /** Sheen over the face, full scene size; null for none. */
  buildGloss(g: SceneGeometry): HTMLCanvasElement | null;
  /** Marquee light sprites (same size), drawn centred on each light. */
  buildLights(g: SceneGeometry): { on: HTMLCanvasElement; off: HTMLCanvasElement };
  /** Pointer at 12 o'clock; `angle` is its flick in radians (negative = tip pushed left). */
  drawPointer(ctx: CanvasRenderingContext2D, g: SceneGeometry, angle: number): void;
  highlight(tier: Tier, bust: boolean): HighlightStyle;
}

/** `count` evenly spaced angles in turns, starting at 12 o'clock. */
export const evenAngles = (count: number, offset = 0): number[] =>
  Array.from({ length: count }, (_, i) => (i + offset) / count);
