import type { GameType, Tier } from '../../../shared/schema';
import type { WheelView } from '../../../shared/types';
import type { SoundBoard } from '../audio';
import type { WheelTheme } from '../themes/types';
import { ClawStage } from './claw';
import { GiftsStage } from './gifts';
import { PlinkoStage } from './plinko';
import { SlotsStage } from './slots';
import type { GameStage, PlayPlan, StageContext } from './types';
import { WheelStage } from './wheel';

const STAGES: Record<GameType, new (context: StageContext) => GameStage> = {
  wheel: WheelStage,
  slots: SlotsStage,
  claw: ClawStage,
  plinko: PlinkoStage,
  gifts: GiftsStage,
};

/**
 * Owns one stage per game type (created on first use) and forwards to the one on screen. Size,
 * theme, photos and the tick handler reach every stage, so switching games is instant.
 */
export class GameDirector {
  onTick: ((speed: number) => void) | null = null;

  private readonly stages = new Map<GameType, GameStage>();
  private active: GameStage;
  private size = 0;
  private dpr = 1;
  private photos: readonly HTMLImageElement[] = [];
  private photoSeconds = 8;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private theme: WheelTheme,
    private readonly sound: SoundBoard,
  ) {
    this.active = this.stage('wheel');
  }

  get themeId(): WheelTheme['id'] {
    return this.theme.id;
  }

  get center(): { x: number; y: number; radius: number } {
    return this.active.center;
  }

  /** Makes `game` the stage on screen and returns it. */
  use(game: GameType): GameStage {
    this.active = this.stage(game);
    return this.active;
  }

  resize(cssSize: number, dpr: number): void {
    this.size = cssSize;
    this.dpr = dpr;
    for (const stage of this.stages.values()) stage.resize(cssSize, dpr);
  }

  setTheme(theme: WheelTheme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    for (const stage of this.stages.values()) stage.setTheme(theme);
  }

  refresh(): void {
    for (const stage of this.stages.values()) stage.refresh();
  }

  setPhotos(photos: readonly HTMLImageElement[], seconds: number): void {
    this.photos = photos;
    this.photoSeconds = seconds;
    for (const stage of this.stages.values()) stage.setPhotos(photos, seconds);
  }

  show(view: WheelView, rotation: number, now: number): void {
    this.use(view.game).show(view, rotation, now);
  }

  play(plan: PlayPlan, startedAt: number, now: number): void {
    this.use(plan.wheel.game).play(plan, startedAt, now);
  }

  update(now: number): boolean {
    return this.active.update(now);
  }

  setHighlight(index: number | null, tier?: Tier, bust?: boolean, now?: number): void {
    this.active.setHighlight(index, tier, bust, now);
  }

  celebrate(durationMs: number, now?: number): void {
    this.active.celebrate(durationMs, now);
  }

  draw(now: number): void {
    this.active.draw(now);
  }

  private stage(game: GameType): GameStage {
    let stage = this.stages.get(game);
    if (stage) return stage;
    stage = new STAGES[game]({ canvas: this.canvas, theme: this.theme, sound: this.sound });
    stage.onTick = (speed) => this.onTick?.(speed);
    if (this.size > 0) stage.resize(this.size, this.dpr);
    if (this.photos.length > 0) stage.setPhotos(this.photos, this.photoSeconds);
    this.stages.set(game, stage);
    return stage;
  }
}
