# HTTP API

The server's HTTP API does everything the dock does, which makes it handy for a Stream Deck or a script. It
answers on `http://localhost:4747` (or your `PORT`).

| Request               | Does                                                                        |
| --------------------- | --------------------------------------------------------------------------- |
| `POST /api/command`   | Runs a [command](#commands): spin, queue, raffle, overlay, save the config. |
| `GET /api/state`      | The [full state](#state): config, what the overlay shows, queue and raffle. |
| `GET /api/health`     | A liveness check: `{"ok":true,"name":"finwheel","version":"0.1.0"}`.        |
| `POST /api/media`     | [Uploads a photo](#upload-a-photo) for the centre photos.                   |
| `GET /media/<file>`   | Serves an uploaded photo.                                                   |
| `/overlay/`, `/dock/` | The overlay and the dock (`/` redirects to the dock).                       |

With [`FINWHEEL_TOKEN`](configuration.md#security) set, `POST /api/command` and `POST /api/media` need the
token: `-H 'Authorization: Bearer <token>'` (or an `X-FinWheel-Token` header, or `?token=` in the URL). Reading
the state and the photos never needs it.

## Commands { #commands }

`POST /api/command` takes one command as a JSON body:

```bash
curl -X POST http://localhost:4747/api/command \
  -H 'Content-Type: application/json' \
  -d '{"type":"spin","player":"VelvetViper","spins":3,"wheelId":"broke-boi"}'
```

```powershell
# Windows PowerShell
Invoke-RestMethod -Method Post http://localhost:4747/api/command -ContentType 'application/json' -Body '{"type":"spin","player":"VelvetViper","wheelId":"loser-slots"}'
```

| `type`                                           | Other fields                            | Does                                                                                                            |
| ------------------------------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `spin`                                           | `wheelId`, `player`, `spins`            | Plays a game now, or queues it while another one runs. All fields are optional.                                 |
| `queue.add`                                      | `player` (required), `wheelId`, `spins` | Adds a game to the queue. It starts at once when nothing is playing and **Play the queue automatically** is on. |
| `spinNext`                                       |                                         | Starts the next game in the queue.                                                                              |
| `queue.remove`                                   | `id`                                    | Removes a queued game (ids are in the state's `queue`).                                                         |
| `queue.clear`                                    |                                         | Empties the queue.                                                                                              |
| `wheel.select`                                   | `wheelId` (required)                    | Makes it the active wheel: shown when idle and played by the spin command.                                      |
| `raffle.open`, `raffle.close`                    |                                         | Opens or closes raffle entries.                                                                                 |
| `raffle.draw`                                    |                                         | Spins the raffle wheel when nothing is playing. The winner then plays the **Winner then spins** wheel, if any.  |
| `raffle.add`, `raffle.remove`                    | `name` / `login`                        | Adds or removes an entrant.                                                                                     |
| `raffle.clear`                                   |                                         | Removes every entrant.                                                                                          |
| `overlay.show`, `overlay.hide`, `overlay.toggle` |                                         | Shows or hides the overlay.                                                                                     |
| `result.dismiss`                                 |                                         | Ends the result card or total screen early.                                                                     |
| `history.clear`                                  |                                         | Clears the history.                                                                                             |
| `config.save`                                    | `wheels`, `settings`                    | Replaces the whole wheel list and/or the whole `settings` object. See [below](#save-the-config).                |

- **`wheelId`** is the id of any wheel, games included: `loser-slots` plays the slot machine, `simp-drop` the
  plinko board. Without it, the active wheel plays. The default ids are listed in
  [Default wheels](wheels.md#default-wheels); the dock's **Wheels** tab shows the id of each of yours, and
  `GET /api/state` lists them under `config.wheels`.
- **`spins`** is the number of plays in this game, 1 to 20 (never more than **Max spins per turn**). Without it,
  the wheel's default count.
- **`player`** is the name on the overlay, up to 40 characters; a leading `@` is dropped.

The reply is `{"ok":true,"notice":null}`, or carries a message for the dock:

- `spin` while a game runs: `{"ok":true,"notice":{"level":"info","message":"A spin is running — added to the queue"}}`
- `config.save`: `{"ok":true,"notice":{"level":"success","message":"Saved"}}`

| Status | `error`                                                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------------------------------- |
| 400    | The JSON or command is invalid (`Invalid command: …`), or it cannot run now (`Unknown wheel "x"`, `The queue is empty`, …). |
| 401    | `Missing or bad token`                                                                                                      |
| 403    | `Host not allowed` or `Origin not allowed` (see [Security](configuration.md#security))                                      |
| 405    | `Use POST`                                                                                                                  |
| 413    | `Request body too large` (1 MB)                                                                                             |
| 415    | `Content-Type must be application/json`                                                                                     |

A queued game that cannot start later, for example because every prize is sold out, is skipped: the dock shows
`Skipped spin for <player>: "<wheel>" has no prizes left`.

### Save the config { #save-the-config }

`config.save` replaces what it is given and keeps the rest:

- `settings` replaces the whole `settings` object: start from the current one (`GET /api/state`,
  `config.settings`), since missing settings fall back to their defaults.
- `wheels` replaces the whole wheel list, in order. If the active wheel is no longer in it, the first wheel
  becomes active.

The new config is checked like `data/config.json` ([Configuration](configuration.md#wheel-fields)), chat
commands included. Nothing is saved when something is wrong: the reply is a 400 with `Not saved:` and the
problems.

## State { #state }

`GET /api/state` returns everything the dock and the overlay show, as JSON. The main keys:

| Key        | Holds                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `config`   | The whole config: `wheels` (with `game`, `command` and each prize's `icon`), `settings`, `activeWheelId`.        |
| `stage`    | `idle`, `spinning`, `result` or `total`.                                                                         |
| `display`  | The wheel on screen when idle, with its `game` and its slices as drawn.                                          |
| `spin`     | The play running now: its `wheel` (with `game`), `player`, winning `segmentIndex`, `durationMs`, `seed`, `turn`. |
| `result`   | The last result: `label`, `tier`, money change, bonus spins, the wheel that follows.                             |
| `turn`     | The current player's game: `total`, `spinNumber`, `spinsPlanned`, `nextMultiplier`.                              |
| `summary`  | The total screen of a finished game.                                                                             |
| `queue`    | Waiting games: `id`, `player`, `wheelId`, `spins`, `source`.                                                     |
| `history`  | Recent results.                                                                                                  |
| `raffle`   | `open`, `keyword`, `entrants`, `totalTickets`.                                                                   |
| `twitch`   | Chat connection `state` and `message`, channel-point rewards not mapped yet.                                     |
| `readOnly` | `true` when the server has a token and the request did not send it.                                              |

The overlay and the dock get the same state pushed live over a WebSocket at `/ws`.

## Upload a photo { #upload-a-photo }

`POST /api/media` stores an image for the [centre photos](looks.md#centre-photos). The body is the raw file and
`Content-Type` its type:

```bash
curl -X POST http://localhost:4747/api/media -H 'Content-Type: image/jpeg' --data-binary @photo.jpg
# {"ok":true,"url":"/media/c4e68110a1fb3d653f151212.jpg"}
```

- Types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`. The file content must match the declared type.
- Size: 8 MB at most. Unlike the dock, the API stores the file as sent (no resizing).
- The file lands in `data/media/`, named after a hash of its content (24 hex characters and the extension): the
  same image always gets the same URL.

Uploading does not show the photo yet: add the returned `url` to the centre photos (dock **Settings → Overlay →
Centre photos**, paste it, **Add by URL**, **Save settings**), or to `hubPhotos` with `config.save`.

| Status | `error`                                                               |
| ------ | --------------------------------------------------------------------- |
| 401    | `Missing or bad token`                                                |
| 405    | `Use POST`                                                            |
| 413    | `Images are limited to 8 MB`                                          |
| 415    | `Upload a JPEG, PNG, WebP or GIF image` (unsupported `Content-Type`)  |
| 415    | `The file is not a JPEG, PNG, WebP or GIF image of the declared type` |

`GET /media/<file>` (or `HEAD`) serves an uploaded image. It needs no token, and browsers cache it for a year since
the name changes with the content. Unknown names return 404.

## Overlay URL options { #overlay-url-options }

Add them to `http://localhost:4747/overlay/`, joined with `&` (`/overlay/?theme=casino&backdrop`):

| Option                         | Effect                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `?theme=glam`, `?theme=casino` | Forces this [look](looks.md) on this source, whatever **Settings → Overlay → Look** says. |
| `?preview`                     | Paints the look's backdrop, to test the overlay in a normal browser.                      |
| `?backdrop`                    | The same backdrop, for an OBS scene with nothing behind the wheel.                        |
| `?mute=1`                      | Silences this source.                                                                     |

The dock takes `?token=…` when the server has a [control token](configuration.md#security).
