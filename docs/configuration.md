# Configuration

## Data folder

Everything FinWheel saves lives in `data/` (or the folder set by `FINWHEEL_DATA_DIR`; `npm start` prints it as
**Data folder**):

| Path                | Holds                                                                                                                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data/config.json`  | Wheels and settings. On first start, [`config/default.config.json`](https://github.com/Platob/finwheel/blob/main/config/default.config.json) is copied here. Edit wheels in the dock (**Wheels** tab) or in this file while the server is stopped. |
| `data/session.json` | Queue, raffle entrants and history, so they survive restarts.                                                                                                                                                                                      |
| `data/media/`       | [Centre photos](looks.md#centre-photos) uploaded from the dock or the [API](api.md#upload-a-photo), served at `/media/<file>`.                                                                                                                     |

## Overlay settings

In the dock: **Settings → Overlay**, then **Save settings**. In `data/config.json` they sit under `settings.overlay`
(currency under `settings.currency`).

| Setting             | Dock                         | Default                     | Limits                                                                                    |
| ------------------- | ---------------------------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| `theme`             | **Look**                     | `glam`                      | `glam` or `casino` ([Looks & photos](looks.md))                                           |
| `hubPhotos`         | **Centre photos**            | 4 shipped photos (`/hub/…`) | 12 photos; each an `http(s)://` URL or a path on this server (`/media/…`), 500 characters |
| `hubPhotoSeconds`   | **Seconds per photo**        | `8`                         | 2 to 120; shown in the dock once there are two photos                                     |
| `autoHide`          | **Hide the wheel when idle** | off                         | An open raffle wheel stays visible                                                        |
| `showRaffleBadge`   | **Show the raffle badge**    | on                          |                                                                                           |
| `sound`             | **Sound effects**            | on                          |                                                                                           |
| `volume`            | **Volume**                   | `0.6`                       | 0 to 1 (the dock shows 0 to 100 %)                                                        |
| `currency.symbol`   | **Currency symbol**          | `$`                         | 4 characters                                                                              |
| `currency.position` | **Symbol position**          | before                      | _Before ($10)_ or _After (10 €)_                                                          |

## Environment variables

See [`.env.example`](https://github.com/Platob/finwheel/blob/main/.env.example): `PORT`, `HOST`,
`FINWHEEL_DATA_DIR`, `FINWHEEL_TOKEN`, `FINWHEEL_ALLOWED_ORIGINS`, `TWITCH_BOT_USERNAME`, `TWITCH_OAUTH_TOKEN`.

## Security

The server listens on `127.0.0.1` only. It rejects requests whose `Host` is not local (DNS rebinding) and
cross-site `Origin`s, so a web page you visit cannot spin your wheel. If you expose it on the network
(`HOST=0.0.0.0`, e.g. a second streaming PC), set `FINWHEEL_TOKEN` and open the dock with
`/dock/?token=…`; the overlay keeps working without the token (read-only). API calls and the OBS script then
need it too: `-H 'Authorization: Bearer <token>'`, and the script's **Control token** field.
