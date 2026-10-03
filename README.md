# FinWheel

A classy casino-style prize wheel for OBS and Twitch: money games, prize categories and chat raffles,
rendered as a transparent browser-source overlay and driven from an OBS dock.

<p align="center">
  <img src="docs/overlay-wheel.jpg" width="360" alt="Lucky Dollars wheel with amounts on every slice" />
  <img src="docs/overlay-total.jpg" width="360" alt="Total winnings screen after a 3-spin game" />
  <img src="docs/dock.jpg" width="176" alt="Control dock" />
</p>

## Features

- **Money games.** Pick how many spins a player gets; every slice can add cash (`$5`), multiply the
  running total (`×2`), grant bonus spins or go **Bankrupt**. Once all spins have run, the overlay shows
  the **total winnings** with every spin listed.
- **Risk ladder out of the box.** _Lucky Dollars_ ($2 – $10, no risk), _High Roller_ ($10 – $50, bankrupt
  slices) and _Diamond Table_ ($50 – $500, high risk). The dock simulates each wheel so you know the
  average payout, the bust rate and the best case before going live.
- **Wheel categories.** A prize can chain into another wheel: _The Grand Wheel_ picks a category
  (money tables, _Prize Vault_, _Dare Wheel_) and the player keeps spinning there.
- **Raffles.** Viewers type `!join`, entrants fill the wheel live, subscribers can get extra tickets, and the
  winner can go straight to a prize wheel.
- **Casino look.** Gold rim with chasing marquee bulbs, ruby pointer that flicks on every peg, emerald /
  bordeaux / onyx slices, Cinzel typography, gold confetti and coin showers, synthesized sounds.
- **Fair and server-authoritative.** The server picks results with a cryptographic RNG and tells every
  overlay exactly where to land, so multiple scenes always agree. Prize stock is tracked automatically.
- **Twitch integration.** Chat commands, channel-point rewards, bit cheers, optional chat announcements.
- **OBS integration.** Browser source + custom dock, plus a Python script that adds OBS hotkeys.

## Quick start

Requires Node.js 20.12 or newer.

```bash
npm install
npm run build
npm start
```

The server prints its URLs (default port `4747`):

| What           | URL                              | In OBS                                                        |
| -------------- | -------------------------------- | ------------------------------------------------------------- |
| Overlay        | `http://localhost:4747/overlay/` | **Browser Source**, 1080 × 1080, tick _Control audio via OBS_ |
| Control dock   | `http://localhost:4747/dock/`    | **View → Docks → Custom Browser Docks**                       |
| Preview in tab | `…/overlay/?preview`             | Adds a felt background for testing in a normal browser        |

Overlay URL options: `?preview` (felt background), `?mute=1` (no sound for this source).

### Hotkeys (optional)

In OBS: **Tools → Scripts → Python Settings** (point it at a Python 3 install), then add
[`obs/finwheel_hotkeys.py`](obs/finwheel_hotkeys.py). Bind the _FinWheel_ actions in **Settings → Hotkeys**:
spin, spin next in queue, dismiss result, open / close / draw the raffle, show / hide the overlay.

## Playing

1. Pick a wheel in the dock's **Play** tab, type the player's name, choose the number of spins, press **Spin**.
2. Each spin shows its slice and the running **bank** (top-left badge on the overlay).
3. After the last spin (or a bankrupt), the **total winnings** screen appears.

Requests that arrive while a game is running wait in the **queue** and play automatically (or one by
one with _Spin next_ if auto-advance is off).

### Slice effects

| Field          | Meaning                                                                   |
| -------------- | ------------------------------------------------------------------------- |
| `cash`         | Added to the running total.                                               |
| `multiplier`   | Applied after adding `cash`: `2` doubles the total, `0.5` loses half.     |
| `extraSpins`   | Bonus spins on the same wheel.                                            |
| `bust`         | Bankrupt: the total drops to zero and the game ends.                      |
| `chainWheelId` | Continue on another wheel (its default spin count), keeping the total.    |
| `weight`       | Relative odds. With `sizing: "weight"` the slice size matches the odds.   |
| `stock`        | Remaining quantity (`null` = unlimited). Sold-out prizes leave the wheel. |
| `tier`         | `common`, `rare`, `epic`, `legendary`, `jackpot`: colour and celebration. |

Money slices print their amount on the wheel automatically (`$10`, `×2 TOTAL`, `+1 FREE SPIN`), computed
from these fields so the display always matches the payout.

## Twitch

Set the channel in **Settings → Twitch chat**. Reading chat needs no credentials. To announce results in
chat, create `.env` from [`.env.example`](.env.example) and set `TWITCH_BOT_USERNAME` and
`TWITCH_OAUTH_TOKEN` (a chat token for that account).

| Chat                            | Who                    | Effect                                                        |
| ------------------------------- | ---------------------- | ------------------------------------------------------------- |
| `!join`                         | everyone, raffle open  | Enter the raffle (keyword is configurable)                    |
| `!spin`                         | configurable, cooldown | Queue a game for yourself on the active wheel                 |
| `!spin @viewer 5 high-roller`   | moderators             | Queue a game for someone: spins and wheel optional, any order |
| `!raffle open \| close \| draw` | moderators             | Run the raffle from chat                                      |
| Channel-point reward            | everyone               | Mapped reward → game on a chosen wheel                        |
| Cheer ≥ minimum bits            | everyone               | Game on a chosen wheel                                        |

Channel-point rewards reach chat only when the reward **requires viewer input**. Redeem it once; the
dock lists the unknown reward id with a _Map_ button.

## HTTP API

Everything the dock does is available at `POST /api/command` with a JSON body, handy for Stream Deck
or scripts:

```bash
curl -X POST http://localhost:4747/api/command \
  -H 'Content-Type: application/json' \
  -d '{"type":"spin","player":"VelvetViper","spins":3,"wheelId":"lucky-dollars"}'
```

Commands: `spin`, `spinNext`, `queue.add`, `queue.remove`, `queue.clear`, `wheel.select`,
`raffle.open`, `raffle.close`, `raffle.draw`, `raffle.add`, `raffle.remove`, `raffle.clear`,
`overlay.show`, `overlay.hide`, `overlay.toggle`, `result.dismiss`, `history.clear`, `config.save`
(see [`src/shared/schema.ts`](src/shared/schema.ts)). `GET /api/state` returns the full state and
`GET /api/health` a liveness check.

## Configuration

- On first start, [`config/default.config.json`](config/default.config.json) is copied to
  `data/config.json`. Edit wheels in the dock (**Wheels** tab) or in that file while the server is stopped.
- Queue, raffle entrants and history survive restarts in `data/session.json`.
- Environment variables (see [`.env.example`](.env.example)): `PORT`, `HOST`, `FINWHEEL_DATA_DIR`,
  `FINWHEEL_TOKEN`, `FINWHEEL_ALLOWED_ORIGINS`, `TWITCH_BOT_USERNAME`, `TWITCH_OAUTH_TOKEN`.

### Security

The server listens on `127.0.0.1` only. It rejects requests whose `Host` is not local (DNS rebinding) and
cross-site `Origin`s, so a web page you visit cannot spin your wheel. If you expose it on the network
(`HOST=0.0.0.0`, e.g. a second streaming PC), set `FINWHEEL_TOKEN` and open the dock with
`/dock/?token=…`; the overlay keeps working without the token (read-only).

## Development

```bash
npm run dev        # server with reload on :4747 + Vite on :5173 (open http://localhost:5173/dock/)
npm run check      # typecheck, lint, format check, tests
npm test
```

```
src/
  shared/   config schema, protocol types, wheel geometry, game rules + simulator
  server/   HTTP + WebSocket server, wheel engine, persistence, Twitch chat bot
  web/
    overlay/  canvas wheel, effects, sounds (OBS browser source)
    dock/     Preact control panel (OBS custom dock)
obs/        OBS Python script for hotkeys
config/     default wheels
```

The server owns all state and decides every result; the overlay only animates what it is told,
which keeps several overlays (or a reloaded one) in sync mid-spin.
