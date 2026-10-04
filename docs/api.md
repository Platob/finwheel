# HTTP API

## Commands

Everything the dock does is available at `POST /api/command` with a JSON body, handy for Stream Deck
or scripts:

```bash
curl -X POST http://localhost:4747/api/command \
  -H 'Content-Type: application/json' \
  -d '{"type":"spin","player":"VelvetViper","spins":3,"wheelId":"broke-boi"}'
```

Commands: `spin`, `spinNext`, `queue.add`, `queue.remove`, `queue.clear`, `wheel.select`,
`raffle.open`, `raffle.close`, `raffle.draw`, `raffle.add`, `raffle.remove`, `raffle.clear`,
`overlay.show`, `overlay.hide`, `overlay.toggle`, `result.dismiss`, `history.clear`, `config.save`
(see [`src/shared/schema.ts`](https://github.com/Platob/finwheel/blob/main/src/shared/schema.ts)). `config.save`
replaces the whole `settings` object it is given: start from the current one (`GET /api/state`, `config.settings`),
since missing settings fall back to their defaults.

`GET /api/state` returns the full state and `GET /api/health` a liveness check.

## Upload a photo { #upload-a-photo }

`POST /api/media` stores an image for the [centre photos](looks.md#centre-photos). The body is the raw file and
`Content-Type` its type:

```bash
curl -X POST http://localhost:4747/api/media -H 'Content-Type: image/jpeg' --data-binary @photo.jpg
# {"ok":true,"url":"/media/c4e68110a1fb3d653f151212.jpg"}
```

- Types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`. The file content must match the declared type.
- Size: 8 MB at most. Unlike the dock, the API stores the file as sent (no resizing).
- The file lands in `data/media/`, named after a hash of its content: the same image always gets the same URL.
- With `FINWHEEL_TOKEN` set, send the token like any control call (`-H 'Authorization: Bearer <token>'`).

Uploading does not show the photo yet: add the returned `url` to the centre photos (dock **Settings → Overlay →
Centre photos**, paste it, **Add by URL**, **Save settings**).

| Status | `error`                                                                 |
| ------ | ----------------------------------------------------------------------- |
| 401    | `Missing or bad token`                                                  |
| 405    | `Use POST`                                                              |
| 413    | `Images are limited to 8 MB`                                            |
| 415    | `Upload a JPEG, PNG, WebP or GIF image` (unsupported `Content-Type`)    |
| 415    | `The file is not a JPEG, PNG, WebP or GIF image of the declared type`   |

`GET /media/<file>` serves an uploaded image (no token needed, cached by browsers for a year since the name
changes with the content); unknown names return 404.

## Overlay URL options { #overlay-url-options }

Add them to `http://localhost:4747/overlay/`, joined with `&` (`/overlay/?theme=casino&backdrop`):

| Option                       | Effect                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `?theme=glam`, `?theme=casino` | Forces this [look](looks.md) on this source, whatever **Settings → Overlay → Look** says. |
| `?preview`                   | Paints the look's backdrop, to test the overlay in a normal browser.                        |
| `?backdrop`                  | The same backdrop, for an OBS scene with nothing behind the wheel.                          |
| `?mute=1`                    | Silences this source.                                                                       |

The dock takes `?token=…` when the server has a [control token](configuration.md#security).
