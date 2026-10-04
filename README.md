# FinWheel

A prize wheel for OBS and Twitch: money games, prize categories and chat raffles, rendered as a transparent
browser-source overlay and driven from an OBS dock. The server picks every result with a cryptographic RNG and
tells each overlay where to land, so several scenes always agree.

**[Documentation and live wheels: platob.github.io/finwheel](https://platob.github.io/finwheel/)**: spin the real
wheels in your browser, then follow the full setup, Twitch and wheel-building guide.

<p align="center">
  <img src="docs/images/overlay-wheel.jpg" width="320" alt="Glam overlay: Broke Boi Wheel with amounts on every slice" />
  <img src="docs/images/overlay-total.jpg" width="320" alt="Total winnings screen after a 3-spin game" />
  <img src="docs/images/dock.jpg" width="156" alt="Control dock, Play tab" />
</p>

## Features

- **Two looks.** _Glam_ (pink & gold, the default) or _Casino_ (emerald & gold), picked in the dock or per
  browser source with `?theme=`.
- **Money games.** Choose how many spins a player gets. Slices add cash (`$5`), multiply the total (`×2 total`),
  double the next spin's cash (`×2 next`), grant bonus spins or go **Bankrupt**. A game that lasts 2+ spins ends
  on a total screen.
- **Wheel categories.** _The Grand Wheel_ sends players on to _Broke Boi_, _Simp_ or _Whale_ (money, from no risk
  to high risk), the _Prize Vault_ or the _Dare Wheel_. The dock simulates each wheel's payouts and bust rate.
- **Raffles.** Viewers type `!join`, entrants fill the wheel live, and the winner can go straight to a prize wheel.
- **Centre photos.** Upload photos from the dock; they fill the hub of the wheel and take turns.
- **Twitch.** Chat commands, channel-point rewards, bit cheers and optional chat announcements.
- **OBS.** Browser source, custom dock and a Python script for hotkeys.

## Quick start

You need [Node.js](https://nodejs.org) 22.13+, [git](https://git-scm.com) and OBS Studio 30+.

```bash
git clone https://github.com/Platob/finwheel.git
cd finwheel
npm install
npm run build
npm start
```

Keep the terminal open, then in OBS:

| Add                                             | URL                              | Notes                                                          |
| ----------------------------------------------- | -------------------------------- | -------------------------------------------------------------- |
| Browser source (**Sources → + → Browser**)      | `http://localhost:4747/overlay/` | Width / Height `1080` / `1080`, tick **Control audio via OBS** |
| Custom dock (**Docks → Custom Browser Docks…**) | `http://localhost:4747/dock/`    | Pick a wheel, type a player, press **Spin**                    |

Next steps (Twitch chat, channel points, hotkeys, your own wheels): see the
[guide](https://platob.github.io/finwheel/setup/).

## Development

```bash
npm run dev        # server with reload on :4747 + Vite on :5173 (open http://localhost:5173/dock/)
npm run check      # typecheck, lint, format check, tests
```

The server (`src/server`) owns all state and decides every result; the overlay (`src/web/overlay`) only animates
what it is told, and the dock (`src/web/dock`) sends commands. Project layout, screenshots and the documentation
site: [Development](https://platob.github.io/finwheel/development/).
