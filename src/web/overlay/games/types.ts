import type { Tier } from '../../../shared/schema';
import type { SpinView, WheelView } from '../../../shared/types';
import type { SoundBoard } from '../audio';
import type { WheelTheme } from '../themes/types';

/** What a play needs to be animated: the server-decided outcome and its timing. */
export type PlayPlan = Pick<
  SpinView,
  'wheel' | 'segmentIndex' | 'fromRotation' | 'toRotation' | 'durationMs' | 'seed'
>;

/**
 * One way of playing a wheel's prizes on the overlay (the wheel itself, slots, claw, plinko,
 * gifts). Every stage draws into the shared square stage canvas, inside the play area the theme
 * gives (see `playArea`).
 *
 * The server decides the winning prize (`segmentIndex`); a stage only animates its way there. The
 * animation must be a pure function of the plan, its seed and the elapsed time, so several overlays
 * (or one reloaded mid-play) show exactly the same thing.
 */
export interface GameStage {
  /** Called on every peg/reel/bounce click while playing; `speed` is 0 (slow) to 1 (fast). */
  onTick: ((speed: number) => void) | null;
  resize(cssSize: number, dpr: number): void;
  /** Redraws text once web fonts are ready. */
  refresh(): void;
  setTheme(theme: WheelTheme): void;
  /** Centre photos (a stage may show them, e.g. in a hub or a reveal). */
  setPhotos(photos: readonly HTMLImageElement[], seconds: number): void;
  /** Shows a game at rest. `rotation` is the wheel's resting angle; other games may ignore it. */
  show(view: WheelView, rotation: number, now: number): void;
  /** Starts a play; `startedAt` is the local `performance.now()` time when it began (maybe in the past). */
  play(plan: PlayPlan, startedAt: number, now: number): void;
  /** Advances the current play; true once it has landed (or when nothing is playing). */
  update(now: number): boolean;
  /** Marks the winning prize after landing (null clears it). */
  setHighlight(index: number | null, tier?: Tier, bust?: boolean, now?: number): void;
  /** Party mode for a while (lights flashing, …). */
  celebrate(durationMs: number, now?: number): void;
  /** Where celebrations burst from, in CSS pixels relative to the canvas. */
  readonly center: { x: number; y: number; radius: number };
  draw(now: number): void;
}

/** Shared services a stage may use. */
export interface StageContext {
  canvas: HTMLCanvasElement;
  theme: WheelTheme;
  /** Synthesized sounds; stages add their own with `sound.voice()`. */
  sound: SoundBoard;
}

/** The square play area a theme gives the games, in canvas pixels (the wheel's bounding box). */
export function playArea(theme: WheelTheme, size: number): { cx: number; cy: number; half: number } {
  const { centerY, rimOuter } = theme.layout;
  return { cx: size / 2, cy: size * centerY, half: size * rimOuter };
}
