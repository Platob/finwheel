import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { GAME_PLAYS } from '../../shared/constants';
import type { GameType } from '../../shared/schema';

/** How the dock names each way of playing a wheel. */
export const GAME_INFO: Record<
  GameType,
  {
    icon: string;
    label: string;
    /** What one prize is in this game, singular and plural ("slice", "Slices"). */
    item: string;
    items: string;
    /** One play and several ("spin", "spins"). */
    play: string;
    plays: string;
    /** Placeholder for the chat command. */
    command: string;
    /** How the prizes are played, for the Wheels tab. */
    hint: string;
  }
> = {
  wheel: {
    icon: '🎡',
    label: 'Wheel',
    item: 'slice',
    items: 'Slices',
    play: GAME_PLAYS.wheel[0],
    plays: GAME_PLAYS.wheel[1],
    command: '!wheel',
    hint: '',
  },
  slots: {
    icon: '🎰',
    label: 'Slots',
    item: 'symbol',
    items: 'Symbols',
    play: GAME_PLAYS.slots[0],
    plays: GAME_PLAYS.slots[1],
    command: '!slots',
    hint: 'Every prize is a reel symbol; three in a row on the payline wins it. Give each one an icon.',
  },
  claw: {
    icon: '🕹️',
    label: 'Claw',
    item: 'capsule',
    items: 'Capsules',
    play: GAME_PLAYS.claw[0],
    plays: GAME_PLAYS.claw[1],
    command: '!claw',
    hint: 'Every prize is a capsule in the pile, its icon inside; the claw grabs the one that was drawn.',
  },
  plinko: {
    icon: '🪙',
    label: 'Plinko',
    item: 'bin',
    items: 'Bins',
    play: GAME_PLAYS.plinko[0],
    plays: GAME_PLAYS.plinko[1],
    command: '!drop',
    hint: 'Bins from left to right. Mirror them: big prizes at the edges, the likeliest in the middle.',
  },
  gifts: {
    icon: '🎁',
    label: 'Gifts',
    item: 'gift',
    items: 'Gifts',
    play: GAME_PLAYS.gifts[0],
    plays: GAME_PLAYS.gifts[1],
    command: '!gift',
    hint: 'The gifts are shuffled and one is opened: the prize inside is drawn by weight.',
  },
};

/** "3 pulls", "1 spin". */
export const playCount = (game: GameType, count: number): string =>
  `${count} ${count === 1 ? GAME_INFO[game].play : GAME_INFO[game].plays}`;

export function Section(props: { title: string; aside?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section class="card">
      <header class="card-head">
        <h2>{props.title}</h2>
        {props.aside}
      </header>
      {props.children}
    </section>
  );
}

export function Field(props: {
  label: string;
  hint?: string;
  /** Shown instead of the hint, with the field outlined, while the value cannot be saved. */
  error?: string | null;
  wide?: boolean;
  children: ComponentChildren;
}) {
  return (
    <label class={`field${props.wide ? ' field--wide' : ''}${props.error ? ' field--error' : ''}`}>
      <span class="field-label">{props.label}</span>
      {props.children}
      {props.error ? (
        <span class="field-error" role="alert">
          {props.error}
        </span>
      ) : (
        props.hint && <span class="field-hint">{props.hint}</span>
      )}
    </label>
  );
}

export function Toggle(props: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label class="toggle">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
      <span class="toggle-track" aria-hidden="true" />
      <span>{props.label}</span>
    </label>
  );
}

/** Number input that keeps the user's text while typing and only commits valid numbers. */
export function NumberInput(props: {
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Allows an empty field, committed as null. */
  nullable?: boolean;
  placeholder?: string;
}) {
  const format = (v: number | null) => (v === null ? '' : String(v));
  const [text, setText] = useState(format(props.value));
  useEffect(() => {
    if (Number(text) !== props.value || (props.value === null && text !== '')) setText(format(props.value));
  }, [props.value]);

  return (
    <input
      type="number"
      inputMode="decimal"
      value={text}
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      placeholder={props.placeholder}
      onInput={(e) => {
        const raw = e.currentTarget.value;
        setText(raw);
        if (raw.trim() === '') {
          if (props.nullable) props.onChange(null);
          return;
        }
        const value = Number(raw);
        if (Number.isFinite(value)) props.onChange(value);
      }}
      onBlur={() => setText(format(props.value))}
    />
  );
}

export function Empty(props: { children: ComponentChildren }) {
  return <p class="empty">{props.children}</p>;
}

export function timeAgo(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

export function percent(value: number): string {
  if (value === 0) return '0%';
  if (value < 0.001) return '<0.1%';
  return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
}
