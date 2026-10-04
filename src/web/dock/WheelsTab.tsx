import { useMemo, useState } from 'preact/hooks';
import { wheelCommandIssue, type CommandWords } from '../../shared/chat-commands';
import { GAMES, TIERS } from '../../shared/constants';
import { formatMoney, simulateTurns } from '../../shared/rules';
import type { GameType, Prize, Wheel } from '../../shared/schema';
import { TIER_STYLES } from '../../shared/tiers';
import type { AppState } from '../../shared/types';
import { useDraft } from './draft';
import type { Send } from './server';
import { Field, GAME_INFO, NumberInput, percent, Section } from './ui';

const randomId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 7)}`;

/** Quick picks for prize icons, in the glam money-game spirit. */
const ICON_PICKS = ['🐷', '💰', '👑', '👠', '🎀', '💋', '💎', '💀', '🍑', '🧾', '💸', '🔥', '🎁'];
/** Longest icon, in characters (code points, as the config schema counts them). */
const ICON_MAX = 8;

const iconIssue = (icon: string | undefined): string | null =>
  icon !== undefined && [...icon].length > ICON_MAX ? `${ICON_MAX} characters at most` : null;

/** Games whose look depends on the slice size setting, and how they name it. */
const SIZING_FIELD: Partial<
  Record<GameType, { label: string; weight: string; equal: string; warn: string }>
> = {
  wheel: {
    label: 'Slice size',
    weight: 'Matches the odds',
    equal: 'All equal',
    warn: "Slices look equal but the odds differ — viewers can't see the real chances.",
  },
  claw: {
    label: 'Capsules',
    weight: 'More for likelier prizes',
    equal: 'Same for every prize',
    warn: "Every prize has as many capsules but the odds differ — viewers can't see the real chances.",
  },
};

/** First thing that stops the wheels from being saved, if any. */
function firstProblem(wheels: Wheel[], words: CommandWords): string | null {
  for (const [w, wheel] of wheels.entries()) {
    const command = wheelCommandIssue(wheels, w, words);
    if (command) return `${wheel.name}: ${command}`;
    const icon = wheel.prizes.find((p) => iconIssue(p.icon));
    if (icon) return `${wheel.name} · ${icon.label}: icon of ${ICON_MAX} characters at most`;
  }
  return null;
}

function newPrize(): Prize {
  return {
    id: randomId('p'),
    label: 'New prize',
    description: '',
    weight: 1,
    stock: null,
    tier: 'common',
    cash: 0,
    multiplier: 1,
    nextMultiplier: 1,
    extraSpins: 0,
    bust: false,
  };
}

export function WheelsTab({ state, send }: { state: AppState; send: Send }) {
  const { config } = state;
  const { draft: wheels, dirty, stale, update, reset, saved } = useDraft(config.wheels);
  const [selectedId, setSelectedId] = useState(config.activeWheelId);
  /** Prize whose icon picker is open. */
  const [iconFor, setIconFor] = useState<string | null>(null);
  const index = Math.max(
    0,
    wheels.findIndex((w) => w.id === selectedId),
  );
  const wheel = wheels[index]!;
  const money = (value: number) => formatMoney(value, config.settings.currency);
  const game = GAME_INFO[wheel.game];
  const sizing = SIZING_FIELD[wheel.game];
  const words: CommandWords = {
    spinCommand: config.settings.twitch.spinCommand,
    raffleKeyword: config.settings.raffle.keyword,
  };
  const commandError = wheelCommandIssue(wheels, index, words);
  const problem = firstProblem(wheels, words);

  const stats = useMemo(
    () => simulateTurns({ wheels, settings: config.settings }, wheel.id, 10000),
    [wheels, wheel.id, config.settings],
  );
  const totalWeight = wheel.prizes
    .filter((p) => p.stock === null || p.stock > 0)
    .reduce((sum, p) => sum + p.weight, 0);

  const editWheel = (mutate: (wheel: Wheel) => void) => update((all) => mutate(all[index]!));
  const editPrize = (i: number, mutate: (prize: Prize) => void) => editWheel((w) => mutate(w.prizes[i]!));

  const addWheel = (copy?: Wheel) => {
    const id = randomId('wheel');
    update((all) =>
      all.push(
        copy
          ? // A copy keeps the game but not the chat command, which must stay unique.
            { ...structuredClone(copy), id, name: `${copy.name} copy`.slice(0, 40), command: undefined }
          : {
              id,
              name: 'New wheel',
              subtitle: '',
              sizing: 'weight',
              spinsPerTurn: 1,
              game: 'wheel',
              prizes: [newPrize(), newPrize()],
            },
      ),
    );
    setSelectedId(id);
    setIconFor(null);
  };

  const deleteWheel = () => {
    if (wheels.length <= 1 || !confirm(`Delete “${wheel.name}”?`)) return;
    update((all) => {
      all.splice(index, 1);
      for (const w of all) for (const p of w.prizes) if (p.chainWheelId === wheel.id) delete p.chainWheelId;
    });
    setSelectedId(wheels[index === 0 ? 1 : 0]!.id);
    setIconFor(null);
  };

  const save = () => {
    send({ type: 'config.save', wheels });
    saved();
  };

  return (
    <>
      <Section
        title="Wheels"
        aside={
          <div class="row">
            <button class="btn btn--ghost btn--small" onClick={() => addWheel()}>
              New
            </button>
            <button class="btn btn--ghost btn--small" onClick={() => addWheel(wheel)}>
              Duplicate
            </button>
            <button
              class="btn btn--ghost btn--small btn--danger"
              disabled={wheels.length <= 1}
              onClick={deleteWheel}
            >
              Delete
            </button>
          </div>
        }
      >
        <select
          value={wheel.id}
          onChange={(e) => {
            setSelectedId(e.currentTarget.value);
            setIconFor(null);
          }}
        >
          {wheels.map((w) => (
            <option key={w.id} value={w.id}>
              {GAME_INFO[w.game].icon} {w.name}
            </option>
          ))}
        </select>
        <p class="hint">
          Wheel id <kbd>{wheel.id}</kbd> for{' '}
          <kbd>
            {config.settings.twitch.spinCommand} @viewer [spins] {wheel.id}
          </kbd>{' '}
          and the API
          {wheel.command && !commandError ? (
            <>
              , or <kbd>{wheel.command}</kbd> in chat
            </>
          ) : null}
          .
        </p>
        <div class="grid">
          <Field label="Name">
            <input
              value={wheel.name}
              maxLength={40}
              onInput={(e) => editWheel((w) => (w.name = e.currentTarget.value))}
            />
          </Field>
          <Field label="Subtitle">
            <input
              value={wheel.subtitle}
              maxLength={60}
              onInput={(e) => editWheel((w) => (w.subtitle = e.currentTarget.value))}
            />
          </Field>
          <Field label="Game">
            <select
              value={wheel.game}
              onChange={(e) => editWheel((w) => (w.game = e.currentTarget.value as GameType))}
            >
              {GAMES.map((g) => (
                <option key={g} value={g}>
                  {GAME_INFO[g].icon} {GAME_INFO[g].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Chat command" hint="Optional, same rules as the spin command" error={commandError}>
            <input
              value={wheel.command ?? ''}
              placeholder={`e.g. ${game.command}`}
              maxLength={25}
              spellcheck={false}
              autoComplete="off"
              aria-invalid={commandError ? true : undefined}
              onInput={(e) => {
                const value = e.currentTarget.value.trim().toLowerCase();
                editWheel((w) => {
                  if (value) w.command = value;
                  else delete w.command;
                });
              }}
            />
          </Field>
          {sizing && (
            <Field label={sizing.label}>
              <select
                value={wheel.sizing}
                onChange={(e) => editWheel((w) => (w.sizing = e.currentTarget.value as Wheel['sizing']))}
              >
                <option value="weight">{sizing.weight}</option>
                <option value="equal">{sizing.equal}</option>
              </select>
            </Field>
          )}
          <Field label={`Default ${game.plays}`} hint="Per game; choose another count when playing">
            <NumberInput
              value={wheel.spinsPerTurn}
              min={1}
              max={20}
              onChange={(v) => editWheel((w) => (w.spinsPerTurn = Math.round(v ?? 1)))}
            />
          </Field>
        </div>
        {stats && stats.maxPayout > 0 && (
          <div class="stats">
            <div>
              <span>Avg / game</span>
              <strong>{money(stats.averagePayout)}</strong>
            </div>
            <div>
              <span>Best seen</span>
              <strong>{money(stats.maxPayout)}</strong>
            </div>
            <div>
              <span>Bankrupt</span>
              <strong>{percent(stats.bustRate)}</strong>
            </div>
            <div>
              <span>Pays {money(0)}</span>
              <strong>{percent(stats.zeroRate)}</strong>
            </div>
          </div>
        )}
        {sizing && wheel.sizing === 'equal' && new Set(wheel.prizes.map((p) => p.weight)).size > 1 && (
          <p class="hint warn">{sizing.warn}</p>
        )}
      </Section>

      <Section title={`${game.items} · ${wheel.prizes.length}`}>
        {game.hint && <p class="hint">{game.hint}</p>}
        <ol class="prizes">
          {wheel.prizes.map((prize, i) => (
            <li key={prize.id} class={`prize prize--${prize.bust ? 'bust' : prize.tier}`}>
              <div class="prize-head">
                <button
                  type="button"
                  class={`prize-icon${prize.icon ? '' : ' is-empty'}${iconIssue(prize.icon) ? ' is-invalid' : ''}`}
                  title={prize.icon ? `Icon ${prize.icon}` : 'Add an icon'}
                  aria-label="Icon"
                  aria-expanded={iconFor === prize.id}
                  onClick={() => setIconFor(iconFor === prize.id ? null : prize.id)}
                >
                  {prize.icon ?? '+'}
                </button>
                <input
                  class="prize-label"
                  value={prize.label}
                  maxLength={48}
                  onInput={(e) => editPrize(i, (p) => (p.label = e.currentTarget.value))}
                />
                <span class="prize-chance">
                  {prize.stock === 0 ? 'out' : percent(prize.weight / totalWeight)}
                </span>
                <button
                  class="icon-btn"
                  title="Move up"
                  disabled={i === 0}
                  onClick={() => editWheel((w) => swap(w.prizes, i, i - 1))}
                >
                  ↑
                </button>
                <button
                  class="icon-btn"
                  title="Move down"
                  disabled={i === wheel.prizes.length - 1}
                  onClick={() => editWheel((w) => swap(w.prizes, i, i + 1))}
                >
                  ↓
                </button>
                <button
                  class="icon-btn"
                  title="Remove"
                  disabled={wheel.prizes.length <= 1}
                  onClick={() => editWheel((w) => w.prizes.splice(i, 1))}
                >
                  ×
                </button>
              </div>
              {iconFor === prize.id && (
                <IconPicker
                  icon={prize.icon}
                  game={wheel.game}
                  onChange={(icon) =>
                    editPrize(i, (p) => {
                      if (icon) p.icon = icon;
                      else delete p.icon;
                    })
                  }
                />
              )}
              <div class="grid grid--3">
                <Field label="Weight">
                  <NumberInput
                    value={prize.weight}
                    min={0.01}
                    step={0.5}
                    onChange={(v) => editPrize(i, (p) => (p.weight = v ?? 1))}
                  />
                </Field>
                <Field label="Stock">
                  <NumberInput
                    value={prize.stock}
                    min={0}
                    nullable
                    placeholder="∞"
                    onChange={(v) => editPrize(i, (p) => (p.stock = v === null ? null : Math.round(v)))}
                  />
                </Field>
                <Field label="Tier">
                  <select
                    value={prize.tier}
                    onChange={(e) => editPrize(i, (p) => (p.tier = e.currentTarget.value as Prize['tier']))}
                  >
                    {TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {TIER_STYLES[tier].label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={`Cash ${config.settings.currency.symbol}`}>
                  <NumberInput
                    value={prize.cash}
                    min={0}
                    onChange={(v) => editPrize(i, (p) => (p.cash = v ?? 0))}
                  />
                </Field>
                <Field label="× Total">
                  <NumberInput
                    value={prize.multiplier}
                    min={0}
                    step={0.5}
                    onChange={(v) => editPrize(i, (p) => (p.multiplier = v ?? 1))}
                  />
                </Field>
                <Field label="× Next spin">
                  <NumberInput
                    value={prize.nextMultiplier}
                    min={1}
                    max={100}
                    step={0.5}
                    onChange={(v) => editPrize(i, (p) => (p.nextMultiplier = v ?? 1))}
                  />
                </Field>
              </div>
              <details class="prize-more">
                <summary>{prizeSummary(prize, wheels)}</summary>
                <div class="grid">
                  <Field label="Description" wide>
                    <input
                      value={prize.description}
                      maxLength={140}
                      onInput={(e) => editPrize(i, (p) => (p.description = e.currentTarget.value))}
                    />
                  </Field>
                  <Field label="+ Spins">
                    <NumberInput
                      value={prize.extraSpins}
                      min={0}
                      max={10}
                      onChange={(v) => editPrize(i, (p) => (p.extraSpins = Math.round(v ?? 0)))}
                    />
                  </Field>
                  <Field label="Then spin">
                    <select
                      value={prize.chainWheelId ?? ''}
                      onChange={(e) =>
                        editPrize(i, (p) => {
                          if (e.currentTarget.value) p.chainWheelId = e.currentTarget.value;
                          else delete p.chainWheelId;
                        })
                      }
                    >
                      <option value="">—</option>
                      {wheels
                        .filter((w) => w.id !== wheel.id)
                        .map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Bankrupt">
                    <select
                      value={prize.bust ? 'yes' : 'no'}
                      onChange={(e) => editPrize(i, (p) => (p.bust = e.currentTarget.value === 'yes'))}
                    >
                      <option value="no">No</option>
                      <option value="yes">Lose total, end turn</option>
                    </select>
                  </Field>
                </div>
              </details>
            </li>
          ))}
        </ol>
        <button class="btn btn--ghost btn--block" onClick={() => editWheel((w) => w.prizes.push(newPrize()))}>
          + Add {game.item}
        </button>
      </Section>

      <div class={`savebar${dirty ? ' is-dirty' : ''}`}>
        <span class={`small ${problem && dirty ? 'bad' : 'muted'}`}>
          {problem && dirty
            ? problem
            : stale
              ? 'Changed on the server while you edit'
              : dirty
                ? 'Unsaved changes'
                : 'All changes saved'}
        </span>
        <button class="btn btn--ghost btn--small" disabled={!dirty} onClick={reset}>
          Revert
        </button>
        <button class="btn btn--gold btn--small" disabled={!dirty || problem !== null} onClick={save}>
          Save wheels
        </button>
      </div>
    </>
  );
}

/** Icon of a prize: any emoji or short symbol, or one of the quick picks. */
function IconPicker(props: { icon: string | undefined; game: GameType; onChange: (icon: string) => void }) {
  return (
    <div class="icon-picker">
      <Field
        label="Icon"
        error={iconIssue(props.icon)}
        hint={
          props.game === 'wheel'
            ? 'Shown by the mini-games (slots, claw, plinko, gifts)'
            : 'Emoji or short symbol'
        }
      >
        <input
          value={props.icon ?? ''}
          placeholder="Emoji"
          autoComplete="off"
          onInput={(e) => props.onChange(e.currentTarget.value.trim())}
        />
      </Field>
      <div class="icon-picks" role="group" aria-label="Quick picks">
        {ICON_PICKS.map((icon) => (
          <button
            key={icon}
            type="button"
            class={`icon-pick${props.icon === icon ? ' is-active' : ''}`}
            title={icon}
            onClick={() => props.onChange(icon)}
          >
            {icon}
          </button>
        ))}
        <button
          type="button"
          class="icon-pick icon-pick--none"
          disabled={!props.icon}
          title="No icon"
          onClick={() => props.onChange('')}
        >
          ∅
        </button>
      </div>
    </div>
  );
}

/** Title of a slice's "More" section: what its hidden settings do ("More · +1 spin · then Vault"). */
function prizeSummary(prize: Prize, wheels: Wheel[]): string {
  if (prize.bust) return 'Bankrupt';
  const parts = ['More'];
  if (prize.extraSpins > 0) parts.push(`+${prize.extraSpins} spin${prize.extraSpins > 1 ? 's' : ''}`);
  if (prize.chainWheelId) parts.push(`then ${wheels.find((w) => w.id === prize.chainWheelId)?.name ?? '?'}`);
  return parts.join(' · ');
}

function swap<T>(list: T[], a: number, b: number) {
  [list[a], list[b]] = [list[b]!, list[a]!];
}
