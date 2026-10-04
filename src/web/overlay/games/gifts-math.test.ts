import { describe, expect, it } from 'vitest';
import {
  arcAt,
  blankPose,
  BOX,
  boxCount,
  brightness,
  burstParticles,
  currentGroup,
  easeOutBack,
  fillBoxes,
  FLOOR_Y,
  focusDim,
  giftsLayout,
  MAX_BOXES,
  mixColor,
  mouthOf,
  parseColor,
  particleAt,
  peekPose,
  planGifts,
  poseBoxes,
  prizePose,
  REVEAL,
  revealsDone,
  splitLabel,
  spotAim,
  TICK_GAP,
  withAlpha,
  type BoxPose,
  type GiftsInput,
  type PrizePose,
} from './gifts-math.js';
import { seededRandom } from './random.js';

const input = (over: Partial<GiftsInput> = {}): GiftsInput => ({
  segments: 8,
  segmentIndex: 3,
  durationMs: 7200,
  seed: 12345,
  ...over,
});

const isPermutation = (order: number[], count: number) =>
  [...order].sort((a, b) => a - b).join() === Array.from({ length: count }, (_, i) => i).join();

describe('boxCount', () => {
  it('keeps 3 to 5 boxes, none for an empty wheel', () => {
    expect(boxCount(0)).toBe(0);
    expect(boxCount(1)).toBe(3);
    expect(boxCount(2)).toBe(3);
    expect(boxCount(4)).toBe(4);
    expect(boxCount(5)).toBe(5);
    expect(boxCount(64)).toBe(5);
  });
});

describe('giftsLayout', () => {
  it('spreads the boxes symmetrically inside the play area', () => {
    for (let n = 3; n <= MAX_BOXES; n++) {
      const layout = giftsLayout(n);
      expect(layout.slots).toHaveLength(n);
      const first = layout.slots[0]!;
      const last = layout.slots[n - 1]!;
      expect(first.x).toBeCloseTo(-last.x);
      // Lids stay inside −1 … 1, and boxes do not overlap at rest.
      expect(last.x + (layout.width * BOX.lidWidth * last.scale) / 2).toBeLessThan(1);
      for (let i = 1; i < n; i++) {
        const gap = layout.slots[i]!.x - layout.slots[i - 1]!.x;
        expect(gap).toBeGreaterThan(layout.width * 1.1);
      }
    }
  });

  it('puts the middle box in front: lowest and biggest', () => {
    const layout = giftsLayout(5);
    expect(arcAt(layout, 0)).toEqual({ y: FLOOR_Y, scale: 1 });
    expect(layout.slots[0]!.y).toBeLessThan(FLOOR_Y);
    expect(layout.slots[0]!.scale).toBeLessThan(1);
    expect(layout.slots[2]!.scale).toBe(1);
  });
});

describe('planGifts', () => {
  it('is deterministic for a seed and varies with it', () => {
    const a = planGifts(input());
    const b = planGifts(input());
    expect(b).toEqual(a);
    const others = [1, 2, 3, 4, 5].map((seed) => planGifts(input({ seed })));
    expect(new Set(others.map((p) => JSON.stringify(p.groups.map((g) => g.pairs)))).size).toBeGreaterThan(1);
    expect(new Set(others.map((p) => p.openSlot)).size).toBeGreaterThan(1);
  });

  it('opens the box holding the won prize', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const segments of [1, 2, 3, 4, 7, 64]) {
        const segmentIndex = seed % segments;
        const play = planGifts(input({ seed, segments, segmentIndex }));
        expect(play.count).toBe(boxCount(segments));
        expect(isPermutation(play.final, play.count)).toBe(true);
        expect(play.final[play.openSlot]).toBe(play.openBox);
        expect(play.contents[play.openBox]).toBe(segmentIndex);
        expect(play.missed.map((m) => m.box).sort()).toEqual(
          Array.from({ length: play.count }, (_, i) => i)
            .filter((i) => i !== play.openBox)
            .sort(),
        );
      }
    }
  });

  it('times the phases in order and lands on the play length', () => {
    for (const durationMs of [300, 1656, 2250, 4000, 7200, 8640, 29160]) {
      const play = planGifts(input({ durationMs, seed: durationMs }));
      expect(play.landedAt).toBe(durationMs);
      expect(play.shuffleStart).toBeGreaterThan(0);
      expect(play.shuffleEnd).toBeGreaterThan(play.shuffleStart);
      expect(play.wiggleStart).toBeGreaterThanOrEqual(play.shuffleEnd);
      expect(play.openAt).toBeGreaterThan(play.wiggleStart);
      expect(play.landedAt).toBeGreaterThan(play.openAt);
      expect(play.drumStart).toBeLessThanOrEqual(play.wiggleStart);
      expect(play.groups.length).toBeGreaterThanOrEqual(2);
      expect(play.groups[0]!.start).toBeCloseTo(play.shuffleStart);
      expect(play.groups[play.groups.length - 1]!.end).toBe(play.shuffleEnd);
      for (let i = 1; i < play.groups.length; i++) {
        expect(play.groups[i]!.start).toBeCloseTo(play.groups[i - 1]!.end);
      }
      for (const m of play.missed) expect(m.at).toBeGreaterThan(play.landedAt);
    }
  });

  it('speeds the shuffle up, then slows it down', () => {
    const play = planGifts(input({ durationMs: 8000 }));
    const lengths = play.groups.map((g) => g.end - g.start);
    const middle = lengths[Math.floor(lengths.length / 2)]!;
    expect(middle).toBeLessThan(lengths[0]! * 0.6);
    expect(middle).toBeLessThan(lengths[lengths.length - 1]! * 0.6);
    expect(Math.max(...play.groups.map((g) => g.speed))).toBeCloseTo(1, 1);
  });

  it('swaps distinct slots, never the same pair twice in a row', () => {
    for (let seed = 0; seed < 40; seed++) {
      const play = planGifts(input({ seed, segments: 5 }));
      let last = '';
      for (const group of play.groups) {
        const used = group.pairs.flatMap((p) => [p.a, p.b]);
        expect(new Set(used).size).toBe(used.length);
        for (const p of group.pairs) {
          expect(p.a).toBeLessThan(p.b);
          expect(p.b).toBeLessThan(play.count);
        }
        const key = `${group.pairs[0]!.a}-${group.pairs[0]!.b}`;
        expect(key).not.toBe(last);
        last = key;
      }
    }
  });

  it('keeps ticks and sounds in order, at most 25 swaps per second', () => {
    const play = planGifts(input({ durationMs: 1656 }));
    const swaps = play.events.filter((e) => e.kind === 'swap');
    for (let i = 1; i < swaps.length; i++)
      expect(swaps[i]!.at - swaps[i - 1]!.at).toBeGreaterThanOrEqual(TICK_GAP);
    for (let i = 1; i < play.events.length; i++) {
      expect(play.events[i]!.at).toBeGreaterThanOrEqual(play.events[i - 1]!.at);
    }
    expect(play.events.filter((e) => e.kind === 'pop')).toEqual([
      expect.objectContaining({ at: play.openAt }),
    ]);
    expect(play.events.filter((e) => e.kind === 'drum')).toHaveLength(1);
  });
});

describe('fillBoxes', () => {
  it('puts other prizes, all different when the wheel has enough', () => {
    const contents = fillBoxes(seededRandom(1), 5, 2, 9, 4);
    expect(contents[2]).toBe(4);
    const others = contents.filter((_, box) => box !== 2);
    expect(others).not.toContain(4);
    expect(new Set(others).size).toBe(4);
  });

  it('repeats prizes on small wheels', () => {
    expect(fillBoxes(seededRandom(1), 3, 0, 1, 0)).toEqual([0, 0, 0]);
    const two = fillBoxes(seededRandom(1), 3, 1, 2, 0);
    expect(two).toEqual([1, 0, 1]);
  });
});

describe('poseBoxes', () => {
  const play = planGifts(input({ segments: 5, seed: 99 }));
  const at = (t: number) => poseBoxes(play, t, []).map((p) => ({ ...p }));

  it('starts with every box in its own slot and ends in the final order', () => {
    const start = at(0);
    start.forEach((pose, box) => expect(pose.x).toBeCloseTo(play.layout.slots[box]!.x));
    const end = at(play.wiggleStart - 1);
    play.final.forEach((box, slot) => {
      expect(end[box]!.x).toBeCloseTo(play.layout.slots[slot]!.x);
      expect(end[box]!.y).toBeCloseTo(play.layout.slots[slot]!.y);
    });
  });

  it('moves smoothly: no jumps between frames', () => {
    let previous = at(0);
    for (let t = 4; t <= play.openAt; t += 4) {
      const poses = at(t);
      poses.forEach((pose, box) => {
        expect(Math.abs(pose.x - previous[box]!.x)).toBeLessThan(0.1);
        expect(Math.abs(pose.y - previous[box]!.y)).toBeLessThan(0.1);
      });
      previous = poses;
    }
  });

  it('lifts the hopper over the other box mid-swap', () => {
    const group = play.groups[1]!;
    const t = (group.start + group.end) / 2;
    expect(currentGroup(play, t)).toBe(group);
    const poses = at(t);
    const pair = group.pairs[0]!;
    const hopper = group.before[pair.hopper === 0 ? pair.a : pair.b]!;
    const other = group.before[pair.hopper === 0 ? pair.b : pair.a]!;
    expect(poses[hopper]!.y).toBeLessThan(poses[other]!.y - 0.05);
    expect(poses[hopper]!.z).toBeGreaterThan(poses[other]!.z);
  });

  it('opens the won box at openAt and the others after landing', () => {
    expect(at(play.openAt - 1)[play.openBox]!.open).toBe(false);
    const opened = at(play.openAt + 10);
    expect(opened[play.openBox]!.open).toBe(true);
    expect(opened.filter((p) => p.open)).toHaveLength(1);
    const landed = at(play.landedAt);
    expect(landed.filter((p) => p.open)).toHaveLength(1);
    const later = at(play.missed[play.missed.length - 1]!.at + 1);
    expect(later.every((p) => p.open)).toBe(true);
    expect(revealsDone(play, play.landedAt)).toBe(false);
    expect(revealsDone(play, play.missed[play.missed.length - 1]!.at + 5000)).toBe(true);
  });

  it('reuses the output array', () => {
    const out: BoxPose[] = [blankPose()];
    const result = poseBoxes(play, 1000, out);
    expect(result).toBe(out);
    expect(out).toHaveLength(play.count);
  });
});

describe('prize poses', () => {
  const play = planGifts(input());
  const mouth = { x: 0.4, y: 0.3 };
  const pose = (t: number): PrizePose =>
    prizePose(play, t, mouth, { x: 0, y: 0, scale: 0, alpha: 0, rot: 0 });

  it('rises from the box mouth to the reveal spot exactly on landing', () => {
    expect(pose(play.openAt).alpha).toBe(0);
    const landed = pose(play.landedAt);
    expect(landed.x).toBeCloseTo(REVEAL.x);
    expect(landed.y).toBeCloseTo(REVEAL.y);
    expect(landed.scale).toBeCloseTo(1);
    expect(landed.alpha).toBe(1);
    expect(landed.rot).toBeCloseTo(0);
    expect(pose(play.landedAt + 3000)).toEqual(landed);
  });

  it('peeks missed prizes just above their box', () => {
    const out = peekPose(2000, mouth, 0.3, { x: 0, y: 0, scale: 0, alpha: 0, rot: 0 });
    expect(out.x).toBe(mouth.x);
    expect(out.y).toBeLessThan(mouth.y);
    expect(out.y).toBeGreaterThan(mouth.y - 0.2);
    expect(out.alpha).toBe(1);
  });

  it('finds the mouth on top of the body', () => {
    const p = { ...blankPose(), x: 0.2, y: 0.8 };
    expect(mouthOf(p, 0.3)).toEqual({ x: 0.2, y: expect.closeTo(0.8 - 0.3 * BOX.body) });
  });
});

describe('spotAim', () => {
  it('searches during the drumroll and rests on the chosen box while it wiggles', () => {
    const play = planGifts(input({ segments: 5, seed: 3 }));
    expect(spotAim(play, 0)).toBe(0);
    expect(spotAim(play, play.drumStart - 1)).toBe(0);
    const target = play.layout.slots[play.openSlot]!.x;
    expect(spotAim(play, play.wiggleStart)).toBeCloseTo(target);
    expect(spotAim(play, (play.wiggleStart + play.openAt) / 2)).toBe(target);
    expect(spotAim(play, play.landedAt)).toBe(0);
    const sweep = Array.from({ length: 20 }, (_, i) =>
      spotAim(play, play.drumStart + ((play.wiggleStart - play.drumStart) * i) / 20),
    );
    expect(Math.max(...sweep) - Math.min(...sweep)).toBeGreaterThan(play.layout.reach);
  });
});

describe('focusDim', () => {
  it('dims the other boxes as the chosen one starts to wiggle, fully once landed', () => {
    const play = planGifts(input());
    expect(focusDim(play, 0)).toBe(0);
    expect(focusDim(play, play.wiggleStart - 300)).toBe(0);
    expect(focusDim(play, play.openAt)).toBeCloseTo(0.7);
    expect(focusDim(play, play.landedAt)).toBeCloseTo(1);
  });
});

describe('burst', () => {
  it('is seeded and fades out', () => {
    const a = burstParticles(7, 12, 4);
    expect(burstParticles(7, 12, 4)).toEqual(a);
    const out = { x: 0, y: 0, alpha: 0, rot: 0 };
    for (const p of a) {
      expect(p.color).toBeLessThan(4);
      expect(particleAt(p, 0, out).alpha).toBe(1);
      expect(particleAt(p, 3000, out).alpha).toBe(0);
    }
  });
});

describe('easing and colours', () => {
  it('overshoots then settles', () => {
    expect(easeOutBack(0)).toBeCloseTo(0);
    expect(easeOutBack(1)).toBeCloseTo(1);
    expect(Math.max(...Array.from({ length: 20 }, (_, i) => easeOutBack(i / 20)))).toBeGreaterThan(1);
  });

  it('reads hex and rgb colours', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('#e8559f')).toEqual([232, 85, 159]);
    expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30]);
    expect(parseColor('rgba(10,20,30,0.5)')).toEqual([10, 20, 30]);
    expect(parseColor('pink')).toBeNull();
    expect(brightness('#ffffff')).toBeCloseTo(1);
    expect(brightness('#000000')).toBe(0);
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('rgb(128, 128, 128)');
    expect(withAlpha('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
  });
});

describe('splitLabel', () => {
  it('keeps short labels and balances long ones on two lines', () => {
    expect(splitLabel('$10')).toEqual(['$10']);
    expect(splitLabel('Chat Picks Loadout')).toEqual(['Chat Picks', 'Loadout']);
    expect(splitLabel('1v1 the Streamer')).toEqual(['1v1 the', 'Streamer']);
    expect(splitLabel('Supercalifragilistic')).toEqual(['Supercalifragilistic']);
  });
});
