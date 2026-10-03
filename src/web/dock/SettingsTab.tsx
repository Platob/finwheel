import { ROLES } from '../../shared/constants';
import type { Settings } from '../../shared/schema';
import type { AppState } from '../../shared/types';
import { pageToken } from '../common/socket';
import { useDraft } from './draft';
import type { Send } from './server';
import { Field, NumberInput, Section, Toggle } from './ui';

const ROLE_LABELS: Record<(typeof ROLES)[number], string> = {
  everyone: 'Everyone',
  subscriber: 'Subscribers',
  vip: 'VIPs',
  moderator: 'Moderators',
  broadcaster: 'Broadcaster only',
};

export function SettingsTab({
  state,
  send,
  notify,
}: {
  state: AppState;
  send: Send;
  notify: (m: string) => void;
}) {
  const { config, twitch } = state;
  const { draft, dirty, stale, update, reset, saved } = useDraft(config.settings);
  const set = (mutate: (settings: Settings) => void) => update(mutate);
  const wheelOptions = (allowNone: string) => (
    <>
      <option value="">{allowNone}</option>
      {config.wheels.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </>
  );

  const origin = location.origin;
  const token = pageToken();
  const links = [
    { label: 'Overlay (Browser Source)', url: `${origin}/overlay/` },
    { label: 'Control dock', url: `${origin}/dock/${token ? `?token=${encodeURIComponent(token)}` : ''}` },
  ];

  return (
    <>
      <Section title="Twitch chat" aside={<span class={`pill pill--${twitch.state}`}>{twitch.state}</span>}>
        <p class="hint">{twitch.message}</p>
        <div class="grid">
          <Field label="Channel" hint="Leave empty to disable chat">
            <input
              value={draft.twitch.channel}
              placeholder="yourchannel"
              onInput={(e) => set((s) => (s.twitch.channel = e.currentTarget.value.trim().toLowerCase()))}
            />
          </Field>
          <Field label="Spin command">
            <input
              value={draft.twitch.spinCommand}
              onInput={(e) => set((s) => (s.twitch.spinCommand = e.currentTarget.value))}
            />
          </Field>
          <Field label="Who can spin">
            <select
              value={draft.twitch.spinPermission}
              onChange={(e) =>
                set(
                  (s) =>
                    (s.twitch.spinPermission = e.currentTarget.value as Settings['twitch']['spinPermission']),
                )
              }
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cooldown (s)" hint="Per viewer">
            <NumberInput
              value={draft.twitch.spinCooldownSec}
              min={0}
              onChange={(v) => set((s) => (s.twitch.spinCooldownSec = Math.round(v ?? 0)))}
            />
          </Field>
        </div>
        <Toggle
          label="Announce results in chat (needs a bot token)"
          checked={draft.twitch.announceResults}
          onChange={(v) => set((s) => (s.twitch.announceResults = v))}
        />
        <p class="hint">
          Moderators can type <kbd>{draft.twitch.spinCommand} @viewer [wheel-id]</kbd> and{' '}
          <kbd>!raffle open|close|draw</kbd>.
        </p>

        <h3>Cheers</h3>
        <Toggle
          label="Bits trigger a spin"
          checked={draft.twitch.bits.enabled}
          onChange={(v) => set((s) => (s.twitch.bits.enabled = v))}
        />
        <div class="grid">
          <Field label="Minimum bits">
            <NumberInput
              value={draft.twitch.bits.minimum}
              min={1}
              onChange={(v) => set((s) => (s.twitch.bits.minimum = Math.round(v ?? 1)))}
            />
          </Field>
          <Field label="Wheel">
            <select
              value={draft.twitch.bits.wheelId}
              onChange={(e) => set((s) => (s.twitch.bits.wheelId = e.currentTarget.value))}
            >
              {wheelOptions('Active wheel')}
            </select>
          </Field>
        </div>

        <h3>Channel points</h3>
        <p class="hint">
          Create a reward that <em>requires viewer input</em>, redeem it once, then map it here.
        </p>
        {draft.twitch.rewards.map((reward, i) => (
          <div class="row" key={i}>
            <input
              class="grow mono"
              value={reward.rewardId}
              placeholder="Reward id"
              onInput={(e) => set((s) => (s.twitch.rewards[i]!.rewardId = e.currentTarget.value.trim()))}
            />
            <select
              value={reward.wheelId}
              onChange={(e) => set((s) => (s.twitch.rewards[i]!.wheelId = e.currentTarget.value))}
            >
              {config.wheels.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <button class="icon-btn" title="Remove" onClick={() => set((s) => s.twitch.rewards.splice(i, 1))}>
              ×
            </button>
          </div>
        ))}
        {twitch.unmappedRewards.length > 0 && (
          <ul class="list">
            {twitch.unmappedRewards
              .filter((r) => !draft.twitch.rewards.some((m) => m.rewardId === r.rewardId))
              .map((r) => (
                <li class="list-row" key={r.rewardId}>
                  <span class="grow small">
                    Seen from <strong>{r.user}</strong>{' '}
                    <span class="mono muted">{r.rewardId.slice(0, 8)}…</span>
                  </span>
                  <button
                    class="btn btn--ghost btn--small"
                    onClick={() =>
                      set((s) =>
                        s.twitch.rewards.push({
                          rewardId: r.rewardId,
                          wheelId: config.activeWheelId,
                          label: '',
                        }),
                      )
                    }
                  >
                    Map
                  </button>
                </li>
              ))}
          </ul>
        )}
      </Section>

      <Section title="Spin">
        <div class="grid">
          <Field label="Duration (s)">
            <NumberInput
              value={draft.spin.durationMs / 1000}
              min={2}
              max={30}
              step={0.5}
              onChange={(v) => set((s) => (s.spin.durationMs = Math.round((v ?? 8) * 1000)))}
            />
          </Field>
          <Field label="Result shown (s)">
            <NumberInput
              value={draft.spin.resultHoldMs / 1000}
              min={1}
              max={120}
              step={0.5}
              onChange={(v) => set((s) => (s.spin.resultHoldMs = Math.round((v ?? 7) * 1000)))}
            />
          </Field>
          <Field label="Between turn spins (s)">
            <NumberInput
              value={draft.spin.followUpHoldMs / 1000}
              min={1}
              max={60}
              step={0.5}
              onChange={(v) => set((s) => (s.spin.followUpHoldMs = Math.round((v ?? 3.5) * 1000)))}
            />
          </Field>
          <Field label="Max spins per turn">
            <NumberInput
              value={draft.spin.maxSpinsPerTurn}
              min={1}
              max={50}
              onChange={(v) => set((s) => (s.spin.maxSpinsPerTurn = Math.round(v ?? 12)))}
            />
          </Field>
          <Field label="Min revolutions">
            <NumberInput
              value={draft.spin.minTurns}
              min={1}
              max={30}
              onChange={(v) => set((s) => (s.spin.minTurns = Math.round(v ?? 5)))}
            />
          </Field>
          <Field label="Max revolutions">
            <NumberInput
              value={draft.spin.maxTurns}
              min={1}
              max={40}
              onChange={(v) => set((s) => (s.spin.maxTurns = Math.round(v ?? 8)))}
            />
          </Field>
        </div>
        <Toggle
          label="Play the queue automatically"
          checked={draft.spin.autoAdvanceQueue}
          onChange={(v) => set((s) => (s.spin.autoAdvanceQueue = v))}
        />
      </Section>

      <Section title="Raffle">
        <div class="grid">
          <Field label="Chat keyword">
            <input
              value={draft.raffle.keyword}
              onInput={(e) => set((s) => (s.raffle.keyword = e.currentTarget.value))}
            />
          </Field>
          <Field label="Subscriber tickets">
            <NumberInput
              value={draft.raffle.subscriberTickets}
              min={1}
              max={10}
              onChange={(v) => set((s) => (s.raffle.subscriberTickets = Math.round(v ?? 1)))}
            />
          </Field>
          <Field label="Winner then spins" wide>
            <select
              value={draft.raffle.prizeWheelId}
              onChange={(e) => set((s) => (s.raffle.prizeWheelId = e.currentTarget.value))}
            >
              {wheelOptions('Nothing')}
            </select>
          </Field>
        </div>
        <Toggle
          label="Remove the winner from the raffle"
          checked={draft.raffle.removeWinner}
          onChange={(v) => set((s) => (s.raffle.removeWinner = v))}
        />
      </Section>

      <Section title="Overlay">
        <Toggle
          label="Hide the wheel when idle"
          checked={draft.overlay.autoHide}
          onChange={(v) => set((s) => (s.overlay.autoHide = v))}
        />
        <Toggle
          label="Show the raffle badge"
          checked={draft.overlay.showRaffleBadge}
          onChange={(v) => set((s) => (s.overlay.showRaffleBadge = v))}
        />
        <Toggle
          label="Sound effects"
          checked={draft.overlay.sound}
          onChange={(v) => set((s) => (s.overlay.sound = v))}
        />
        <Field label={`Volume · ${Math.round(draft.overlay.volume * 100)}%`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={draft.overlay.volume}
            onInput={(e) => set((s) => (s.overlay.volume = Number(e.currentTarget.value)))}
          />
        </Field>
        <div class="grid">
          <Field label="Currency symbol">
            <input
              value={draft.currency.symbol}
              maxLength={4}
              onInput={(e) => set((s) => (s.currency.symbol = e.currentTarget.value))}
            />
          </Field>
          <Field label="Symbol position">
            <select
              value={draft.currency.position}
              onChange={(e) =>
                set((s) => (s.currency.position = e.currentTarget.value as Settings['currency']['position']))
              }
            >
              <option value="before">Before ($10)</option>
              <option value="after">After (10 €)</option>
            </select>
          </Field>
        </div>
        <div class="row row--stretch">
          <button class="btn" onClick={() => send({ type: state.visible ? 'overlay.hide' : 'overlay.show' })}>
            {state.visible ? 'Hide overlay now' : 'Show overlay'}
          </button>
        </div>
      </Section>

      <Section title="OBS links">
        {links.map((link) => (
          <div class="link-row" key={link.url}>
            <span class="small muted">{link.label}</span>
            <div class="row">
              <input class="grow mono" readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
              <button
                class="btn btn--ghost btn--small"
                onClick={() => navigator.clipboard?.writeText(link.url).then(() => notify('Copied'))}
              >
                Copy
              </button>
            </div>
          </div>
        ))}
        <p class="hint">
          Browser Source: 1080 × 1080, tick “Control audio via OBS”. Dock: View → Docks → Custom Browser
          Docks.
        </p>
      </Section>

      <div class={`savebar${dirty ? ' is-dirty' : ''}`}>
        <span class="muted small">
          {stale ? 'Changed on the server while you edit' : dirty ? 'Unsaved changes' : 'All changes saved'}
        </span>
        <button class="btn btn--ghost btn--small" disabled={!dirty} onClick={reset}>
          Revert
        </button>
        <button
          class="btn btn--gold btn--small"
          disabled={!dirty}
          onClick={() => {
            send({ type: 'config.save', settings: draft });
            saved();
          }}
        >
          Save settings
        </button>
      </div>
    </>
  );
}
