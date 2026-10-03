import { useEffect, useState } from 'preact/hooks';
import type { Stage } from '../../shared/types';
import { PlayTab } from './PlayTab';
import { RaffleTab } from './RaffleTab';
import { useServer } from './server';
import { SettingsTab } from './SettingsTab';
import { WheelsTab } from './WheelsTab';

const TABS = [
  { id: 'play', label: 'Play' },
  { id: 'raffle', label: 'Raffle' },
  { id: 'wheels', label: 'Wheels' },
  { id: 'settings', label: 'Settings' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const STAGE_LABELS: Record<Stage, string> = {
  idle: 'Ready',
  spinning: 'Spinning',
  result: 'Result',
  total: 'Total',
};

function initialTab(): TabId {
  try {
    const saved = localStorage.getItem('finwheel.tab');
    if (TABS.some((t) => t.id === saved)) return saved as TabId;
  } catch {
    // Storage can be unavailable; fall back to the first tab.
  }
  return 'play';
}

export function App() {
  const { state, connected, send, toasts, dismiss, notify } = useServer();
  const [tab, setTab] = useState<TabId>(initialTab);

  useEffect(() => {
    try {
      localStorage.setItem('finwheel.tab', tab);
    } catch {
      // Ignore storage errors.
    }
  }, [tab]);

  return (
    <div class="app">
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true" />
          <span class="brand-name">FinWheel</span>
        </div>
        {state?.raffle.open && <span class="pill pill--live">Raffle</span>}
        <span class={`status ${connected ? 'is-on' : ''}`} title={connected ? 'Connected' : 'Disconnected'}>
          {connected ? STAGE_LABELS[state?.stage ?? 'idle'] : 'Offline'}
        </span>
      </header>

      <nav class="tabs">
        {TABS.map((t) => (
          <button key={t.id} class={`tab${tab === t.id ? ' is-active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main class="content">
        {!state ? (
          <p class="empty">{connected ? 'Loading…' : 'Connecting to the FinWheel server…'}</p>
        ) : (
          <>
            {state.readOnly && (
              <p class="banner">Read-only: this server needs a token. Open the dock with ?token=…</p>
            )}
            {tab === 'play' && <PlayTab state={state} send={send} />}
            {tab === 'raffle' && <RaffleTab state={state} send={send} />}
            {tab === 'wheels' && <WheelsTab state={state} send={send} />}
            {tab === 'settings' && (
              <SettingsTab
                state={state}
                send={send}
                notify={(message) => notify({ level: 'success', message })}
              />
            )}
          </>
        )}
      </main>

      <div class="toasts" role="status">
        {toasts.map((toast) => (
          <button key={toast.id} class={`toast toast--${toast.level}`} onClick={() => dismiss(toast.id)}>
            {toast.message}
          </button>
        ))}
      </div>
    </div>
  );
}
