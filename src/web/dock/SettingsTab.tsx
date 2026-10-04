import { useState } from 'preact/hooks';
import { MAX_HUB_PHOTOS, MAX_PHOTO_URL, PHOTO_URL, ROLES, THEMES } from '../../shared/constants';
import type { Settings, ThemeId } from '../../shared/schema';
import type { AppState, Notice } from '../../shared/types';
import { pageToken } from '../common/socket';
import { useDraft } from './draft';
import type { Send } from './server';
import { Field, NumberInput, Section, Toggle } from './ui';

type Notify = (message: string, level?: Notice['level']) => void;

const ROLE_LABELS: Record<(typeof ROLES)[number], string> = {
  everyone: 'Everyone',
  subscriber: 'Subscribers',
  vip: 'VIPs',
  moderator: 'Moderators',
  broadcaster: 'Broadcaster only',
};

const THEME_LABELS: Record<ThemeId, { name: string; label: string }> = {
  glam: { name: 'Glam', label: 'Glam — pink & gold' },
  casino: { name: 'Casino', label: 'Casino — emerald & gold' },
};

/** Longest side of uploaded centre photos, in pixels. */
const PHOTO_MAX_PX = 1280;

export function SettingsTab({ state, send, notify }: { state: AppState; send: Send; notify: Notify }) {
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
  const otherTheme = THEMES.find((theme) => theme !== config.settings.overlay.theme) ?? 'casino';
  const links = [
    { label: 'Overlay (Browser Source)', url: `${origin}/overlay/` },
    {
      label: `Overlay, always the ${THEME_LABELS[otherTheme].name} look`,
      url: `${origin}/overlay/?theme=${otherTheme}`,
    },
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
          Moderators can type <kbd>{draft.twitch.spinCommand} @viewer [spins] [wheel-id]</kbd> and{' '}
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
        <Field label="Look">
          <select
            value={draft.overlay.theme}
            onChange={(e) => set((s) => (s.overlay.theme = e.currentTarget.value as ThemeId))}
          >
            {THEMES.map((theme) => (
              <option key={theme} value={theme}>
                {THEME_LABELS[theme].label}
              </option>
            ))}
          </select>
        </Field>
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

        <h3>Centre photos</h3>
        <HubPhotos
          photos={draft.overlay.hubPhotos}
          update={(mutate) => set((s) => mutate(s.overlay.hubPhotos))}
          notify={notify}
        />
        {draft.overlay.hubPhotos.length > 1 && (
          <div class="grid">
            <Field label="Seconds per photo">
              <NumberInput
                value={draft.overlay.hubPhotoSeconds}
                min={2}
                max={120}
                onChange={(v) => set((s) => (s.overlay.hubPhotoSeconds = Math.round(v ?? 8)))}
              />
            </Field>
          </div>
        )}

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
          Browser Source: 1080 × 1080, tick “Control audio via OBS”. Dock: Docks → Custom Browser Docks.
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

/** Centre photo list: thumbnails in display order, uploads and links. */
function HubPhotos({
  photos,
  update,
  notify,
}: {
  photos: string[];
  update: (mutate: (photos: string[]) => void) => void;
  notify: Notify;
}) {
  const [progress, setProgress] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const room = MAX_HUB_PHOTOS - photos.length;

  const add = (url: string) =>
    update((list) => {
      if (!list.includes(url) && list.length < MAX_HUB_PHOTOS) list.push(url);
    });

  const upload = async (files: File[]) => {
    const batch = files.slice(0, Math.max(0, room));
    if (batch.length < files.length) {
      notify(`Only ${MAX_HUB_PHOTOS} photos fit: ${files.length - batch.length} skipped`, 'error');
    }
    let added = 0;
    for (const [i, file] of batch.entries()) {
      setProgress(batch.length > 1 ? `Uploading ${i + 1}/${batch.length}…` : 'Uploading…');
      try {
        add(await uploadPhoto(await shrinkPhoto(file)));
        added++;
      } catch (error) {
        notify(`${file.name}: ${(error as Error).message}`, 'error');
      }
    }
    setProgress(null);
    if (added) notify(`${added === 1 ? 'Photo' : `${added} photos`} uploaded: press Save settings`);
  };

  const addLink = () => {
    const url = link.trim();
    if (url.length > MAX_PHOTO_URL || !PHOTO_URL.test(url)) {
      return notify('Use an http(s):// image URL or a /path on this server', 'error');
    }
    if (photos.includes(url)) return notify('That photo is already in the list', 'error');
    add(url);
    setLink('');
  };

  return (
    <>
      <p class="hint">
        Shown in the middle of the wheel, cropped to a circle. Several photos take turns, in this order.
      </p>
      <ul class="photos">
        {photos.map((url, i) => (
          <li class="photo" key={`${i}-${url}`} title={url}>
            <img
              src={url}
              alt=""
              loading="lazy"
              onError={(e) => e.currentTarget.parentElement?.classList.add('is-broken')}
            />
            <span class="photo-index">{i + 1}</span>
            <span class="photo-actions">
              <button
                class="icon-btn"
                title="Show earlier"
                disabled={i === 0}
                onClick={() => update((list) => list.splice(i - 1, 0, ...list.splice(i, 1)))}
              >
                ‹
              </button>
              <button class="icon-btn" title="Remove" onClick={() => update((list) => list.splice(i, 1))}>
                ×
              </button>
            </span>
          </li>
        ))}
        {room > 0 && (
          <li>
            <label class={`photo photo--add${progress ? ' is-busy' : ''}`}>
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={progress !== null}
                onChange={(e) => {
                  const files = [...(e.currentTarget.files ?? [])];
                  e.currentTarget.value = '';
                  void upload(files);
                }}
              />
              <span>{progress ?? 'Add photos…'}</span>
            </label>
          </li>
        )}
      </ul>
      <div class="row">
        <input
          class="grow"
          value={link}
          placeholder="…or an image URL (https://…)"
          onInput={(e) => setLink(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && addLink()}
        />
        <button class="btn btn--ghost btn--small" disabled={!link.trim() || room <= 0} onClick={addLink}>
          Add by URL
        </button>
      </div>
      <p class="small muted">
        {photos.length}/{MAX_HUB_PHOTOS} photos · uploads are resized to {PHOTO_MAX_PX} px
      </p>
    </>
  );
}

/** Downscales a picked image (upright, longest side ≤ PHOTO_MAX_PX): JPEG, or PNG when it is transparent. */
async function shrinkPhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('not an image this browser can open');
  }
  const scale = Math.min(1, PHOTO_MAX_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const type = file.type !== 'image/jpeg' && hasTransparency(ctx) ? 'image/png' : 'image/jpeg';
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('could not resize it'))), type, 0.9),
  );
}

function hasTransparency(ctx: CanvasRenderingContext2D): boolean {
  const { data } = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (let i = 3; i < data.length; i += 4) if (data[i]! < 255) return true;
  return false;
}

/** Sends an image to the server and returns its /media/… URL. */
async function uploadPhoto(image: Blob): Promise<string> {
  const token = pageToken();
  const res = await fetch('/api/media', {
    method: 'POST',
    headers: { 'Content-Type': image.type, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: image,
  });
  const reply = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !reply?.url) throw new Error(reply?.error ?? `upload failed (HTTP ${res.status})`);
  return reply.url;
}
