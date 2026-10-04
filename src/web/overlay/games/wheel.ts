import type { Tier } from '../../../shared/schema';
import type { WheelView } from '../../../shared/types';
import { SpinMotion } from '../spin-motion';
import type { WheelTheme } from '../themes/types';
import { WheelScene, type Framing } from '../wheel-scene';
import type { GameStage, PlayPlan, StageContext } from './types';

/** The classic wheel: a WheelScene turned by a SpinMotion. */
export class WheelStage implements GameStage {
  private readonly scene: WheelScene;
  private motion: SpinMotion<PlayPlan> | null = null;

  constructor({ canvas, theme }: StageContext, framing: Framing | null = null) {
    this.scene = new WheelScene(canvas, theme, framing);
  }

  get onTick(): ((speed: number) => void) | null {
    return this.scene.onTick;
  }

  set onTick(handler: ((speed: number) => void) | null) {
    this.scene.onTick = handler;
  }

  get center(): { x: number; y: number; radius: number } {
    return this.scene.center;
  }

  resize(cssSize: number, dpr: number): void {
    this.scene.resize(cssSize, dpr);
  }

  refresh(): void {
    this.scene.refresh();
  }

  setTheme(theme: WheelTheme): void {
    this.scene.setTheme(theme);
  }

  setPhotos(photos: readonly HTMLImageElement[], seconds: number): void {
    this.scene.setHubPhotos(photos, seconds);
  }

  show(view: WheelView, rotation: number, now: number): void {
    this.motion = null;
    this.scene.setWheel(view, now);
    this.scene.setRotation(rotation, now);
  }

  play(plan: PlayPlan, startedAt: number, now: number): void {
    this.motion = new SpinMotion(plan, startedAt);
    this.scene.setWheel(plan.wheel, now);
    this.scene.setRotation(plan.fromRotation, now);
  }

  update(now: number): boolean {
    const motion = this.motion;
    if (!motion) return true;
    const done = motion.done(now);
    this.scene.setRotation(motion.rotationAt(now), now, !done);
    return done;
  }

  setHighlight(index: number | null, tier?: Tier, bust?: boolean, now?: number): void {
    this.scene.setHighlight(index, tier, bust, now);
  }

  celebrate(durationMs: number, now?: number): void {
    this.scene.celebrate(durationMs, now);
  }

  draw(now: number): void {
    this.scene.draw(now);
  }
}
