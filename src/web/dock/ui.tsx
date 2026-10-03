import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';

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

export function Field(props: { label: string; hint?: string; wide?: boolean; children: ComponentChildren }) {
  return (
    <label class={`field${props.wide ? ' field--wide' : ''}`}>
      <span class="field-label">{props.label}</span>
      {props.children}
      {props.hint && <span class="field-hint">{props.hint}</span>}
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
