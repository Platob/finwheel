# Development

```bash
npm run dev             # server with reload on :4747 + Vite on :5173 (open http://localhost:5173/dock/)
npm run check           # typecheck, lint, format check, tests
npm test
npm run build           # overlay and dock (dist/web) + server (dist/node)
npm run build:showcase  # live wheels of the documentation site (docs/live)
```

```
src/
  shared/     config schema, protocol types, wheel geometry, game rules + simulator
  server/     HTTP + WebSocket server, wheel engine, persistence, uploads, Twitch chat bot
  web/
    overlay/  canvas wheel, effects, sounds (OBS browser source)
      themes/ the glam and casino looks
    dock/     Preact control panel (OBS custom dock)
    showcase/ live wheels for the documentation home page
obs/          OBS Python script for hotkeys
config/       default wheels
scripts/      snap.mjs: overlay screenshots
docs/         this documentation (MkDocs)
```

The server owns all state and decides every result; the overlay only animates what it is told,
which keeps several overlays (or a reloaded one) in sync mid-spin. A look is a `WheelTheme`
(`src/web/overlay/themes/types.ts`) that paints the face, rim, hub and pointer, plus CSS for the signs around
the wheel (`overlay.css`, `overlay-glam.css`).

## Screenshots

`scripts/snap.mjs` starts the built server with a throwaway data folder, plays scenarios and screenshots the
overlay. It needs Playwright and Chromium (a global install is fine).

```bash
npm run build
node scripts/snap.mjs --out shots idle result:simp total raffle
node scripts/snap.mjs --out shots --theme casino idle
```

| Scenario         | Shows                                                |
| ---------------- | ---------------------------------------------------- |
| `idle[:wheel]`   | The wheel at rest.                                   |
| `spin[:wheel]`   | A 1-spin game, mid-spin.                             |
| `result[:wheel]` | The result card of a 1-spin game.                    |
| `bank[:wheel]`   | The first result of a 3-spin game (bank / stat row). |
| `total[:wheel]`  | The total screen of a 3-spin game.                   |
| `raffle`         | The raffle wheel with 12 entrants.                   |

Options: `--out DIR`, `--theme glam|casino`, `--size 1080`, `--photo URL` (repeat for several centre photos),
`--config file.json` (its `wheels` replace the saved ones, its `settings` are merged in), `--no-preview` (transparent background),
`--web DIR` / `--node DIR` (another build of the overlay or the server). Results are random, so run a scenario
again for another landing.

## Documentation site

These pages are built with [MkDocs](https://www.mkdocs.org) and the Material theme, and published to GitHub Pages
by `.github/workflows/docs.yml` on pushes to `main`. The home page embeds the real overlay wheels, built from
`src/web/showcase` into `docs/live` (ignored by git), so build them first:

```bash
pip install -r requirements-docs.txt
npm run build:showcase
mkdocs serve        # live preview on http://127.0.0.1:8000
mkdocs build --strict
```

Run `npm run build:showcase` again after changing the overlay code or `config/default.config.json`.
