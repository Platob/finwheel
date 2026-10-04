import { useEffect, useMemo, useState } from 'preact/hooks';
import { formatMoney, simulateTurns } from '../../shared/rules';
import type { AppState, SpinResult } from '../../shared/types';
import type { Send } from './server';
import { Empty, GAME_INFO, percent, playCount, Section, timeAgo } from './ui';

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Dock',
  chat: 'Chat',
  reward: 'Points',
  bits: 'Bits',
  raffle: 'Raffle',
  chain: 'Turn',
  api: 'API',
};

export function PlayTab({ state, send }: { state: AppState; send: Send }) {
  const { config, stage, spin, result, turn, summary, queue, history } = state;
  const [player, setPlayer] = useState('');
  const activeWheel = config.wheels.find((w) => w.id === config.activeWheelId) ?? config.wheels[0]!;
  const [spins, setSpins] = useState(activeWheel.spinsPerTurn);
  useEffect(() => setSpins(activeWheel.spinsPerTurn), [activeWheel.id, activeWheel.spinsPerTurn]);
  const maxSpins = Math.min(20, config.settings.spin.maxSpinsPerTurn);
  const money = (value: number) => formatMoney(value, config.settings.currency);
  const busy = stage !== 'idle';

  const spinNow = () => {
    send({ type: 'spin', wheelId: activeWheel.id, player: player.trim() || undefined, spins });
    setPlayer('');
  };

  return (
    <>
      <Section title="Wheel">
        <div class="chips">
          {config.wheels.map((wheel) => (
            <button
              key={wheel.id}
              class={`chip${wheel.id === activeWheel.id ? ' is-active' : ''}`}
              title={`${GAME_INFO[wheel.game].label}${wheel.command ? ` · ${wheel.command} in chat` : ''}`}
              onClick={() => send({ type: 'wheel.select', wheelId: wheel.id })}
            >
              <span class="chip-icon" aria-hidden="true">
                {GAME_INFO[wheel.game].icon}
              </span>
              {wheel.name}
            </button>
          ))}
        </div>
        <form
          class="spin-form"
          onSubmit={(e) => {
            e.preventDefault();
            spinNow();
          }}
        >
          <input
            class="spin-player"
            value={player}
            placeholder="Player name (optional)"
            maxLength={40}
            onInput={(e) => setPlayer(e.currentTarget.value)}
          />
          <div class="stepper" title={`Number of ${GAME_INFO[activeWheel.game].plays} in this game`}>
            <button type="button" class="icon-btn" disabled={spins <= 1} onClick={() => setSpins(spins - 1)}>
              −
            </button>
            <span>
              <strong>{spins}</strong>{' '}
              {spins === 1 ? GAME_INFO[activeWheel.game].play : GAME_INFO[activeWheel.game].plays}
            </span>
            <button
              type="button"
              class="icon-btn"
              disabled={spins >= maxSpins}
              onClick={() => setSpins(spins + 1)}
            >
              +
            </button>
          </div>
          <button class="btn btn--gold btn--big" type="submit">
            {busy ? 'Queue' : activeWheel.game === 'wheel' ? 'Spin' : 'Play'}
          </button>
        </form>
        <Odds wheelId={activeWheel.id} state={state} spins={spins} />
      </Section>

      <Section
        title="Now"
        aside={
          (stage === 'result' || stage === 'total') && (
            <button class="btn btn--ghost btn--small" onClick={() => send({ type: 'result.dismiss' })}>
              Dismiss
            </button>
          )
        }
      >
        <div class={`now now--${stage}`}>
          {stage === 'idle' && <span class="muted">Waiting for a spin…</span>}
          {stage === 'spinning' && spin && (
            <span>
              {spin.wheel.game === 'wheel' ? 'Spinning' : 'Playing'} <strong>{spin.wheel.name}</strong>
              {spin.player && (
                <>
                  {' '}
                  for <strong>{spin.player}</strong>
                </>
              )}
              …
            </span>
          )}
          {stage === 'result' && result && <ResultLine result={result} money={money} />}
          {stage === 'total' && summary && (
            <span>
              <strong>{summary.player || 'Player'}</strong> finished with{' '}
              <strong class={summary.total > 0 ? 'good' : 'bad'}>{money(summary.total)}</strong>
              <span class="muted"> · {summary.log.map((entry) => entry.chip).join(' › ')}</span>
            </span>
          )}
          {turn?.money && stage !== 'total' && (
            <div class="bank-line">
              <span>Bank</span>
              <strong>{money(turn.total)}</strong>
              <span class="muted">
                {GAME_INFO[spin?.wheel.game ?? 'wheel'].play} {turn.spinNumber} of {turn.spinsPlanned}
                {turn.nextMultiplier > 1 && ` · ×${turn.nextMultiplier} next`}
              </span>
            </div>
          )}
        </div>
      </Section>

      <Section
        title={`Queue · ${queue.length}`}
        aside={
          <div class="row">
            <button
              class="btn btn--ghost btn--small"
              disabled={busy || queue.length === 0}
              onClick={() => send({ type: 'spinNext' })}
            >
              Spin next
            </button>
            <button
              class="btn btn--ghost btn--small"
              disabled={queue.length === 0}
              onClick={() => send({ type: 'queue.clear' })}
            >
              Clear
            </button>
          </div>
        }
      >
        {queue.length === 0 ? (
          <Empty>No one is waiting. Chat commands, channel points and bits add players here.</Empty>
        ) : (
          <ol class="list">
            {queue.map((item) => {
              const wheel = config.wheels.find((w) => w.id === item.wheelId);
              return (
                <li key={item.id} class="list-row">
                  <span class="tag">{SOURCE_LABELS[item.source] ?? item.source}</span>
                  <span class="grow">
                    <strong>{item.player || 'Anonymous'}</strong>
                    <span class="muted">
                      {' '}
                      · {wheel ? `${GAME_INFO[wheel.game].icon} ${wheel.name}` : item.wheelId}
                      {item.spins ? ` · ${playCount(wheel?.game ?? 'wheel', item.spins)}` : ''}
                    </span>
                  </span>
                  <button
                    class="icon-btn"
                    title="Remove"
                    onClick={() => send({ type: 'queue.remove', id: item.id })}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {!config.settings.spin.autoAdvanceQueue && queue.length > 0 && (
          <p class="hint">Auto-advance is off: press “Spin next” to play the queue.</p>
        )}
      </Section>

      <Section
        title="History"
        aside={
          history.length > 0 && (
            <button class="btn btn--ghost btn--small" onClick={() => send({ type: 'history.clear' })}>
              Clear
            </button>
          )
        }
      >
        {history.length === 0 ? (
          <Empty>Results will appear here.</Empty>
        ) : (
          <ol class="list">
            {history.slice(0, 30).map((entry) => (
              <li key={entry.id} class="list-row">
                <span class={`dot dot--${entry.money?.bust ? 'bust' : entry.tier}`} />
                <span class="grow">
                  <ResultLine result={entry} money={money} compact />
                </span>
                <span class="muted small">{timeAgo(entry.at)}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}

function ResultLine({
  result,
  money,
  compact,
}: {
  result: SpinResult;
  money: (v: number) => string;
  compact?: boolean;
}) {
  if (result.kind === 'raffle') {
    return (
      <span>
        <strong>{result.label}</strong> won the raffle
      </span>
    );
  }
  const who = result.player ? <strong>{result.player}</strong> : 'The wheel';
  const payout = result.money?.bust ? (
    <span class="bad"> · lost {money(result.money.before)}</span>
  ) : result.payout !== null ? (
    <span class="good"> · cashed out {money(result.payout)}</span>
  ) : result.money ? (
    <span class="muted"> · total {money(result.money.after)}</span>
  ) : null;
  return (
    <span>
      {who} {result.player ? 'hit' : 'landed on'} <strong class="gold">{result.label}</strong>
      {!compact && <span class="muted"> on {result.wheelName}</span>}
      {payout}
    </span>
  );
}

function Odds({ wheelId, state, spins }: { wheelId: string; state: AppState; spins: number }) {
  const { config } = state;
  const wheel = config.wheels.find((w) => w.id === wheelId);
  const stats = useMemo(
    () => simulateTurns(config, wheelId, 20000, Math.random, spins),
    [config, wheelId, spins],
  );
  if (!wheel) return null;
  const { play } = GAME_INFO[wheel.game];
  const per = spins === 1 ? `per ${play}` : `per ${spins}-${play} game`;
  const available = wheel.prizes.filter((p) => p.stock === null || p.stock > 0);
  const total = available.reduce((sum, p) => sum + p.weight, 0);
  const money = (value: number) => formatMoney(value, config.settings.currency);

  return (
    <details class="odds">
      <summary>
        Odds &amp; payouts
        {stats && stats.maxPayout > 0 && (
          <span class="muted">
            {' '}
            · avg {money(stats.averagePayout)} {per} · bust {percent(stats.bustRate)}
          </span>
        )}
      </summary>
      {stats && stats.maxPayout > 0 && (
        <div class="stats">
          <div>
            <span>Average</span>
            <strong>{money(stats.averagePayout)}</strong>
          </div>
          <div>
            <span>Median</span>
            <strong>{money(stats.medianPayout)}</strong>
          </div>
          <div>
            <span>Best seen</span>
            <strong>{money(stats.maxPayout)}</strong>
          </div>
          <div>
            <span>Pays {money(0)}</span>
            <strong>{percent(stats.zeroRate)}</strong>
          </div>
        </div>
      )}
      <table class="odds-table">
        <tbody>
          {wheel.prizes.map((prize) => {
            const out = prize.stock === 0;
            return (
              <tr key={prize.id} class={out ? 'is-out' : ''}>
                <td>
                  <span class={`dot dot--${prize.bust ? 'bust' : prize.tier}`} />{' '}
                  {prize.icon && `${prize.icon} `}
                  {prize.label}
                </td>
                <td class="num">{out ? 'out' : percent(prize.weight / total)}</td>
                <td class="num muted">{prize.stock === null ? '∞' : `${prize.stock} left`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {stats && (
        <p class="hint">
          Simulated over {stats.turns.toLocaleString()} games of {playCount(wheel.game, spins)} (
          {stats.averageSpins.toFixed(1)} on average with bonus {GAME_INFO[wheel.game].plays} and bankrupts).
        </p>
      )}
    </details>
  );
}
