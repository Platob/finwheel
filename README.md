# FinWheel

A classy casino-style prize wheel for OBS and Twitch: money games, prize categories and chat raffles,
rendered as a transparent browser-source overlay and driven from an OBS dock.

<p align="center">
  <img src="docs/overlay-wheel.jpg" width="320" alt="Lucky Dollars wheel with amounts on every slice" />
  <img src="docs/overlay-total.jpg" width="320" alt="Total winnings screen after a 3-spin game" />
  <img src="docs/dock.jpg" width="156" alt="Control dock" />
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

## Setup: OBS + Twitch in 10 minutes

You need [Node.js](https://nodejs.org) 22.13+ (24 LTS recommended), [git](https://git-scm.com) and OBS Studio
30+ (on Linux use the official Flatpak or PPA: some distro packages lack the Browser source).

### 1. Start the server

```bash
git clone https://github.com/Platob/finwheel.git
cd finwheel
npm install
npm run build
npm start
```

Keep this terminal open while you stream. Check it from a second terminal (`curl.exe` in Windows PowerShell):

```bash
curl http://localhost:4747/api/health
# {"ok":true,"name":"finwheel","version":"0.1.0"}
```

### 2. Add the wheel to a scene

In OBS: **Sources → + → Browser**, name it `FinWheel`, then set:

| Field                     | Value                            |
| ------------------------- | -------------------------------- |
| URL                       | `http://localhost:4747/overlay/` |
| Width / Height            | `1080` / `1080`                  |
| **Control audio via OBS** | ticked (wheel sounds go to OBS)  |

The background stays transparent. Run a 3-spin test game and watch it play in OBS:

```bash
curl -X POST http://localhost:4747/api/command -H 'Content-Type: application/json' \
  -d '{"type":"spin","player":"VelvetViper","spins":3}'
```

```powershell
# Windows PowerShell
Invoke-RestMethod -Method Post http://localhost:4747/api/command -ContentType 'application/json' -Body '{"type":"spin","player":"VelvetViper","spins":3}'
```

<p align="center"><img src="docs/overlay-result.jpg" width="420" alt="Overlay during a 3-spin game: $5 won, bank at $8 (preview background)" /></p>

### 3. Add the control dock

In OBS: **Docks → Custom Browser Docks…**, Dock Name `FinWheel`, URL `http://localhost:4747/dock/`, **Apply**.
It opens floating: drag it into place. To play: pick a wheel, type a player, set the spins, press **Spin**.

<p align="center"><img src="docs/setup-dock-play.jpg" width="380" alt="Dock Play tab: wheel chips, player name, spins stepper and Spin button" /></p>

### 4. Connect Twitch chat

In the dock: **Settings → Twitch chat → Channel** = your channel name → **Save settings**. The badge turns
**connected** (reading chat needs no login). Try it in your chat:

| Type in chat                  | What happens                                                        |
| ----------------------------- | ------------------------------------------------------------------- |
| `!spin`                       | You play the active wheel                                           |
| `!spin @friend 5 high-roller` | Mods: friend plays 5 spins on High Roller (any order, all optional) |
| `!raffle open`                | Mods: open the raffle (`!raffle close` stops entries)               |
| `!join`                       | Anyone: enter the raffle (subscribers get 2 tickets)                |
| `!raffle draw`                | Mods: draw a winner, who then spins The Grand Wheel                 |

Wheel ids (shown in the dock's **Wheels** tab): `lucky-dollars`, `high-roller`, `diamond-table`, `grand`,
`prize-vault`, `dares`. To let viewers type `!spin`, set **Who can spin** to _Everyone_ or _Subscribers_.

<p align="center">
  <img src="docs/setup-dock-twitch.jpg" width="380" alt="Dock Twitch chat settings, connected" />
  <img src="docs/overlay-raffle.jpg" width="420" alt="Raffle wheel filled with entrants and the !join badge" />
</p>

### 5. Announce results in chat (optional)

FinWheel posts with the account that owns the token (your channel or a bot account):

1. Turn on 2FA (Twitch **Settings → Security and Privacy**), then
   [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) → **Register Your Application**: any unique
   name, OAuth Redirect URL `http://localhost` → **Add**, Category _Chat Bot_, Client Type _Confidential_ →
   **Create**. Click **Manage** and copy the **Client ID**.
2. Logged in as the posting account, open this URL with your Client ID, then **Authorize**:

   ```text
   https://id.twitch.tv/oauth2/authorize?response_type=token&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost&scope=chat:read+chat:edit
   ```

   The page fails to load; its address bar shows `http://localhost/#access_token=abc123…&scope=…`. Copy only
   the part between `access_token=` and `&`.

3. In the `finwheel` folder, copy the example settings, then remove the `# ` in front of the two `TWITCH_`
   lines and fill them in:

   ```bash
   cp .env.example .env
   ```

   ```ini
   TWITCH_BOT_USERNAME=yourbot
   TWITCH_OAUTH_TOKEN=abc123yourtoken
   ```

   `TWITCH_BOT_USERNAME` is the login of the account you authorized. Restart `npm start`; the Twitch chat card
   no longer says _read-only_. Bot account? Type `/mod yourbot` in your chat so slow or followers-only mode can't
   block it.

The token lasts about 60 days. Check it with
`curl -H "Authorization: OAuth abc123yourtoken" https://id.twitch.tv/oauth2/validate`; when the badge says
**error**, chat commands stop too: repeat 5.2, update `.env`, restart.

### 6. Channel points and bits (optional, Affiliate/Partner)

- **Channel points:** [Creator Dashboard](https://dashboard.twitch.tv) → **Viewer Rewards → Channel Points →
  Manage Rewards → Add New Custom Reward**, turn on **Require Viewer to Enter Text** (other rewards never reach
  chat). Redeem it once, then in the dock **Settings → Channel points** click **Map**, pick a wheel,
  **Save settings**.
- **Bits:** **Settings → Cheers** → enable _Bits trigger a spin_, set the minimum and the wheel, **Save settings**.

### 7. OBS hotkeys (optional)

1. Windows/macOS: install [Python 3.12](https://www.python.org/downloads/release/python-31210/) (64-bit; OBS
   30–32 cannot load 3.13+). In OBS **Tools → Scripts → Python Settings**, pick the folder that holds
   `python312.dll` (usually `%LOCALAPPDATA%\Programs\Python\Python312`) or `/Library/Frameworks` on macOS.
   Linux: skip, OBS uses the system Python.
2. **Tools → Scripts → +** → `obs/finwheel_hotkeys.py`. Changed `PORT` or set `FINWHEEL_TOKEN`? Fill in the
   script's **Server URL** / **Control token**.
3. **Settings → Hotkeys** → type `FinWheel` in **Filter** → bind _FinWheel: Spin the active wheel_, _Spin next in
   queue_, _Draw raffle winner_, … (macOS: allow OBS in **Privacy & Security → Input Monitoring** so hotkeys work
   while a game has focus).

### Troubleshooting

| Problem                       | Fix                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overlay is empty              | Is `npm start` running? Check `curl http://localhost:4747/api/health`, then in the source's **Properties** click **Refresh cache of current page**.                             |
| No sound                      | Tick **Control audio via OBS** and unmute `FinWheel` in the Audio Mixer. To hear it yourself: **Edit → Advanced Audio Properties** → `FinWheel` → **Monitor and Output**.       |
| Chat commands ignored         | The **Settings** badge must say _connected_. By default only the broadcaster and mods can `!spin`; viewers get one game per cooldown (60 s) and none while already queued.      |
| Badge says _error_            | The Twitch token expired or is wrong: redo step 5.2, update `.env`, restart `npm start`.                                                                                        |
| Channel-point reward ignored  | The reward must **require viewer text**.                                                                                                                                        |
| `Port 4747 is already in use` | FinWheel is already running: use that one (or stop it with Ctrl+C). Another app owns 4747? `PORT=4848 npm start` (PowerShell: `$env:PORT=4848; npm start`) and use 4848 in OBS. |

Overlay URL options: `?preview` adds a felt background to test in a normal browser, `?mute=1` silences one source.

## Playing

Each spin shows its slice and the running **bank** (top-left badge). When a game of 2+ spins ends (last spin
or bankrupt), the **total winnings** screen lists every spin; a 1-spin game ends on its result card. Requests
that arrive mid-game wait in the **queue** and play automatically (or one by one with _Spin next_ if
auto-advance is off).

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
`/dock/?token=…`; the overlay keeps working without the token (read-only). API calls and the OBS script then
need it too: `-H 'Authorization: Bearer <token>'`, and the script's **Control token** field.

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
