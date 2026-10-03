import { useState } from 'preact/hooks';
import type { AppState } from '../../shared/types';
import type { Send } from './server';
import { Empty, percent, Section } from './ui';

export function RaffleTab({ state, send }: { state: AppState; send: Send }) {
  const { raffle, config, stage } = state;
  const [name, setName] = useState('');
  const [filter, setFilter] = useState('');
  const prizeWheel = config.wheels.find((w) => w.id === config.settings.raffle.prizeWheelId);
  const entrants = raffle.entrants.filter((e) =>
    e.displayName.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <>
      <Section
        title="Raffle"
        aside={
          <span class={`pill ${raffle.open ? 'pill--live' : ''}`}>{raffle.open ? 'Open' : 'Closed'}</span>
        }
      >
        <p class="lead">
          {raffle.open ? (
            <>
              Viewers enter by typing <kbd>{raffle.keyword}</kbd> in chat.
            </>
          ) : (
            <>
              Open entries, then viewers type <kbd>{raffle.keyword}</kbd> in chat to join.
            </>
          )}
        </p>
        <div class="stats">
          <div>
            <span>Entrants</span>
            <strong>{raffle.entrants.length}</strong>
          </div>
          <div>
            <span>Tickets</span>
            <strong>{raffle.totalTickets}</strong>
          </div>
        </div>
        <div class="row row--stretch">
          {raffle.open ? (
            <button class="btn" onClick={() => send({ type: 'raffle.close' })}>
              Close entries
            </button>
          ) : (
            <button class="btn" onClick={() => send({ type: 'raffle.open' })}>
              Open entries
            </button>
          )}
          <button
            class="btn btn--gold"
            disabled={raffle.entrants.length === 0 || stage !== 'idle'}
            onClick={() => send({ type: 'raffle.draw' })}
          >
            Draw winner
          </button>
        </div>
        <p class="hint">
          {prizeWheel
            ? `The winner then spins “${prizeWheel.name}”.`
            : 'No prize wheel after the draw (set one in Settings).'}{' '}
          Subscribers get {config.settings.raffle.subscriberTickets} ticket
          {config.settings.raffle.subscriberTickets > 1 ? 's' : ''}.
        </p>
      </Section>

      <Section
        title="Entrants"
        aside={
          raffle.entrants.length > 0 && (
            <button
              class="btn btn--ghost btn--small"
              onClick={() => confirm('Remove every entrant?') && send({ type: 'raffle.clear' })}
            >
              Clear
            </button>
          )
        }
      >
        <form
          class="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            send({ type: 'raffle.add', name: name.trim() });
            setName('');
          }}
        >
          <input
            class="grow"
            value={name}
            placeholder="Add a name manually"
            onInput={(e) => setName(e.currentTarget.value)}
          />
          <button class="btn" type="submit">
            Add
          </button>
        </form>
        {raffle.entrants.length > 8 && (
          <input
            class="search"
            value={filter}
            placeholder="Search entrants"
            onInput={(e) => setFilter(e.currentTarget.value)}
          />
        )}
        {raffle.entrants.length === 0 ? (
          <Empty>No entrants yet.</Empty>
        ) : (
          <ol class="list list--scroll">
            {entrants.map((entrant) => (
              <li key={entrant.login} class="list-row">
                <span class="grow">
                  <strong>{entrant.displayName}</strong>
                </span>
                <span class="muted small">
                  {entrant.tickets > 1 ? `${entrant.tickets} tickets · ` : ''}
                  {percent(entrant.tickets / raffle.totalTickets)}
                </span>
                <button
                  class="icon-btn"
                  title="Remove"
                  onClick={() => send({ type: 'raffle.remove', login: entrant.login })}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}
