import { useMemo, useState } from 'preact/hooks';
import { formatMoney, simulateTurns } from '../../shared/rules';
import { TIERS } from '../../shared/constants';
import type { Prize, Wheel } from '../../shared/schema';
import { TIER_STYLES } from '../../shared/tiers';
import type { AppState } from '../../shared/types';
import { useDraft } from './draft';
import type { Send } from './server';
import { Field, NumberInput, percent, Section } from './ui';

const randomId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 7)}`;

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
  const index = Math.max(
    0,
    wheels.findIndex((w) => w.id === selectedId),
  );
  const wheel = wheels[index]!;
  const money = (value: number) => formatMoney(value, config.settings.currency);

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
          ? { ...structuredClone(copy), id, name: `${copy.name} copy`.slice(0, 40) }
          : {
              id,
              name: 'New wheel',
              subtitle: '',
              sizing: 'weight',
              spinsPerTurn: 1,
              prizes: [newPrize(), newPrize()],
            },
      ),
    );
    setSelectedId(id);
  };

  const deleteWheel = () => {
    if (wheels.length <= 1 || !confirm(`Delete “${wheel.name}”?`)) return;
    update((all) => {
      all.splice(index, 1);
      for (const w of all) for (const p of w.prizes) if (p.chainWheelId === wheel.id) delete p.chainWheelId;
    });
    setSelectedId(wheels[index === 0 ? 1 : 0]!.id);
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
        <select value={wheel.id} onChange={(e) => setSelectedId(e.currentTarget.value)}>
          {wheels.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <p class="hint">
          Wheel id <kbd>{wheel.id}</kbd> for{' '}
          <kbd>
            {config.settings.twitch.spinCommand} @viewer [spins] {wheel.id}
          </kbd>{' '}
          and the API.
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
          <Field label="Slice size">
            <select
              value={wheel.sizing}
              onChange={(e) => editWheel((w) => (w.sizing = e.currentTarget.value as Wheel['sizing']))}
            >
              <option value="weight">Matches the odds</option>
              <option value="equal">All equal</option>
            </select>
          </Field>
          <Field label="Default spins" hint="Per game; choose another count when spinning">
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
        {wheel.sizing === 'equal' && new Set(wheel.prizes.map((p) => p.weight)).size > 1 && (
          <p class="hint warn">Slices look equal but the odds differ — viewers can't see the real chances.</p>
        )}
      </Section>

      <Section title={`Slices · ${wheel.prizes.length}`}>
        <ol class="prizes">
          {wheel.prizes.map((prize, i) => (
            <li key={prize.id} class={`prize prize--${prize.bust ? 'bust' : prize.tier}`}>
              <div class="prize-head">
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
                <Field label="+ Spins">
                  <NumberInput
                    value={prize.extraSpins}
                    min={0}
                    max={10}
                    onChange={(v) => editPrize(i, (p) => (p.extraSpins = Math.round(v ?? 0)))}
                  />
                </Field>
              </div>
              <details class="prize-more">
                <summary>
                  {prize.bust ? 'Bankrupt' : 'More'}
                  {prize.chainWheelId &&
                    ` · then ${wheels.find((w) => w.id === prize.chainWheelId)?.name ?? '?'}`}
                </summary>
                <div class="grid">
                  <Field label="Description" wide>
                    <input
                      value={prize.description}
                      maxLength={140}
                      onInput={(e) => editPrize(i, (p) => (p.description = e.currentTarget.value))}
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
          + Add slice
        </button>
      </Section>

      <div class={`savebar${dirty ? ' is-dirty' : ''}`}>
        <span class="muted small">
          {stale ? 'Changed on the server while you edit' : dirty ? 'Unsaved changes' : 'All changes saved'}
        </span>
        <button class="btn btn--ghost btn--small" disabled={!dirty} onClick={reset}>
          Revert
        </button>
        <button class="btn btn--gold btn--small" disabled={!dirty} onClick={save}>
          Save wheels
        </button>
      </div>
    </>
  );
}

function swap<T>(list: T[], a: number, b: number) {
  [list[a], list[b]] = [list[b]!, list[a]!];
}
