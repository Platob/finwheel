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
  shared/     config schema, protocol types, wheel geometry, game rules + simulator, chat commands
  server/     HTTP + WebSocket server, wheel engine, persistence, uploads, Twitch chat bot
  web/
    overlay/  canvas wheel, effects, sounds (OBS browser source)
      games/  slot machine, claw machine, plinko board, gifts, and the director that picks the stage
      themes/ the glam and casino looks
    dock/     Preact control panel (OBS custom dock)
    showcase/ live wheels and games for the documentation site
obs/          OBS Python script for hotkeys
config/       default wheels and games
scripts/      snap.mjs: overlay screenshots
docs/         this documentation (MkDocs)
```

The server owns all state and decides every result; the overlay only animates what it is told, which keeps
several overlays (or a reloaded one) in sync mid-spin. A game is a wheel with a `game` field: the server draws the
prize the same way and sends a random `seed` with the play. The overlay's director
(`src/web/overlay/games/director.ts`) gives the play to the stage of that game, which animates its way to the
prize from the plan, the seed and the clock alone, so every overlay plays it the same. A look is a `WheelTheme`
(`src/web/overlay/themes/types.ts`) that paints the face, rim, hub and pointer, the games' cabinets
(`palette`) and their prizes (`prizeStyle`), plus CSS for the signs around the wheel (`overlay.css`,
`overlay-glam.css`).

## Screenshots

`scripts/snap.mjs` starts the built server with a throwaway data folder, plays scenarios and screenshots the
overlay. It needs Playwright and Chromium (a global install is fine).

The throwaway config is the default one, so it has the four shipped centre photos. Screenshots for the
documentation must not show them: pass a config that empties the list.

```bash
npm run build
echo '{"settings":{"overlay":{"hubPhotos":[]}}}' > no-photos.json
node scripts/snap.mjs --out shots --config no-photos.json idle result:simp total raffle
node scripts/snap.mjs --out shots --config no-photos.json idle:loser-slots result:simp-drop
node scripts/snap.mjs --out shots --config no-photos.json --theme casino idle
```

| Scenario         | Shows                                                |
| ---------------- | ---------------------------------------------------- |
| `idle[:wheel]`   | The wheel or game at rest.                           |
| `spin[:wheel]`   | A 1-spin game, mid-play.                             |
| `result[:wheel]` | The result card of a 1-spin game.                    |
| `bank[:wheel]`   | The first result of a 3-spin game (bank / stat row). |
| `total[:wheel]`  | The total screen of a 3-spin game.                   |
| `raffle`         | The raffle wheel with 12 entrants.                   |

`wheel` is any wheel or game id (the active wheel when left out). Each shot is saved as `<scenario>.png`, or
`<scenario>.<theme>.png` with `--theme`, with the `:` turned into `_` (`result:simp` gives `result_simp.png`).

Options: `--out DIR`, `--theme glam|casino`, `--size 1080`, `--photo URL` (repeat for several centre photos),
`--config file.json` (its `wheels` replace the saved ones, its `settings` are merged in; a list such as
`hubPhotos` replaces the saved one), `--no-preview` (transparent background), `--web DIR` / `--node DIR` (another
build of the overlay or the server). Results are random, so run a scenario again for another landing.

## Documentation site

These pages are built with [MkDocs](https://www.mkdocs.org) and the Material theme, and published to GitHub Pages
by `.github/workflows/docs.yml` on pushes to `main`: it runs `npm run build:showcase`, then
`mkdocs build --strict`. Do the same locally:

```bash
pip install -r requirements-docs.txt
npm run build:showcase   # live wheels into docs/live (ignored by git)
mkdocs serve             # live preview on http://127.0.0.1:8000
mkdocs build --strict
```

`mkdocs serve` does not build the live wheels: run `npm run build:showcase` first, and again after changing the
overlay code or `config/default.config.json`. `--strict` fails on a broken link or anchor. Markdown pages go
through Prettier with the rest of the code (`npm run check`): run `npx prettier --write docs/<page>.md` after
editing one.

### Live wheels { #live-wheels }

`npm run build:showcase` builds `src/web/showcase` into `docs/live/showcase.js` and
`docs/live/assets/showcase.css`, which `mkdocs.yml` loads on every page (`extra_javascript` as a module,
`extra_css`), plus the cards themselves in `docs/live/assets/live-<hash>.js`, fetched only by a page that shows
some. The script fills every element with the class `fw-live` with live cards: the real overlay stages
(wheel, slot machine, claw, plinko, gifts), played in the browser with the default config's wheels and odds,
without the centre photos. A page without such an element loads nothing more. Write the HTML straight into the
Markdown, with no `<script>` or `<link>` tag:

| Markup                                                | Shows                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `<div class="fw-live"></div>`                         | Every default wheel, under the headings _Money wheels_, _Games_ and _Prize wheels_.                                             |
| `<div class="fw-live" data-wheels="broke-boi whale">` | Only these default wheels (ids, space-separated), in this order, as a grid. An unknown id is skipped with a console warning.    |
| `data-wheels=""`                                      | No cards. With `data-toolbar`, a toolbar on its own.                                                                            |
| `data-toolbar`                                        | The **Glam** / **Casino** and **Sound** buttons. One look for the whole page, remembered by the browser.                        |
| `data-details="wheels/"`                              | A **Slices & odds** link on each card, to `wheels/#<wheel id>`. The path is relative to the page: `../wheels/` on a guide page. |

The home page has `<div class="fw-live" data-toolbar data-details="wheels/"></div>`; there, each card also takes
its wheel id as an HTML id (unless the page already uses it), so `/#whale` scrolls to the Whale Wheel. Follow a
mount point with `<noscript>The live wheels need JavaScript.</noscript>`. Cards play once on their own when they
scroll into view (unless the reader prefers reduced motion), then on every tap.

To put one wheel beside its facts, as in [Wheels & prizes](wheels.md), wrap the card and the text in
`fw-wheel-doc` (the `md_in_html` extension, on in `mkdocs.yml`, renders the Markdown inside; keep the blank lines
around it):

<!-- prettier-ignore -->
```html
<div class="fw-wheel-doc" markdown>
<div class="fw-live" data-wheels="broke-boi"></div>
<div markdown>

`!brokeboi` · id `broke-boi` · 3 spins a game

</div>
</div>
```

The card sits beside the text when the content column has room for both, and above it otherwise
(`docs/stylesheets/extra.css`).

`src/shared/docs.test.ts`, part of `npm test`, keeps `docs/wheels.md` in step with `config/default.config.json`.
For every default wheel the page needs a heading ending in `{ #<wheel id> }` that contains the wheel's name, a
`fw-live` embed whose `data-wheels` has the id, and the wheel's chat command in backticks. A money wheel or a
plinko board also needs its slices as printed, in config order, on a line starting `On the wheel, clockwise:` or
`Bins, left to right:`. Embeds may name only default wheels. Add, rename or remove a default wheel, or change its
slices, and the test fails until the page follows.
