# Development

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

## Documentation site

These pages are built with [MkDocs](https://www.mkdocs.org) and the Material theme, and published to GitHub Pages
by `.github/workflows/docs.yml` on every push to `main`.

```bash
pip install -r requirements-docs.txt
mkdocs serve        # live preview on http://127.0.0.1:8000
mkdocs build --strict
```
