import type { SpinView } from '../../shared/types';

/** Share of the spin spent pulling the wheel back before release. */
const WIND_UP = 0.05;
/** How far the wheel is pulled back, in turns. */
const PULL_BACK = 0.012;

const easeOutQuart = (t: number) => 1 - (1 - t) ** 4;
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/** Offset from the start rotation at normalized time t ∈ [0, 1]. */
export function spinOffset(t: number, total: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return total;
  if (t < WIND_UP) return -PULL_BACK * easeInOutSine(t / WIND_UP);
  const u = (t - WIND_UP) / (1 - WIND_UP);
  return -PULL_BACK + (total + PULL_BACK) * easeOutQuart(u);
}

/** Plays a server-decided spin locally; the landing rotation is fixed by the server. */
export class SpinMotion {
  constructor(
    readonly spin: SpinView,
    /** performance.now() timestamp corresponding to the server start time. */
    readonly startedAt: number,
  ) {}

  progress(now: number): number {
    return Math.min(1, Math.max(0, (now - this.startedAt) / this.spin.durationMs));
  }

  rotationAt(now: number): number {
    const { fromRotation, toRotation } = this.spin;
    return fromRotation + spinOffset(this.progress(now), toRotation - fromRotation);
  }

  done(now: number): boolean {
    return this.progress(now) >= 1;
  }
}
