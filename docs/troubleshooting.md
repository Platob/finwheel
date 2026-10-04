# Troubleshooting

| Problem                       | Fix                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overlay is empty              | Is `npm start` running? Check `curl http://localhost:4747/api/health`, then in the source's **Properties** click **Refresh cache of current page**.                             |
| No sound                      | Tick **Control audio via OBS** and unmute `FinWheel` in the Audio Mixer. To hear it yourself: **Edit → Advanced Audio Properties** → `FinWheel` → **Monitor and Output**.       |
| Chat commands ignored         | The **Settings** badge must say _connected_. By default only the broadcaster and mods can `!spin`; viewers get one game per cooldown (60 s) and none while already queued.      |
| Badge says _error_            | The Twitch token expired or is wrong: redo [step 2 of Announce results in chat](twitch.md#announce-results-in-chat-optional), update `.env`, restart `npm start`.               |
| Channel-point reward ignored  | The reward must **require viewer text**.                                                                                                                                        |
| `Port 4747 is already in use` | FinWheel is already running: use that one (or stop it with Ctrl+C). Another app owns 4747? `PORT=4848 npm start` (PowerShell: `$env:PORT=4848; npm start`) and use 4848 in OBS. |
| Look does not change          | That browser source has `?theme=` in its URL, which wins over **Settings → Overlay → Look**: remove it.                                                                         |

## Photos { #photos }

| Problem                    | Fix                                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Centre photo not showing   | Press **Save settings** after adding photos, without leaving the **Settings** tab first. A thumbnail reading _No preview_ does not load: a URL must open the image itself (try it in a browser tab).         |
| One photo is skipped       | The overlay drops a photo that fails to load or takes more than 10 seconds, and logs `[finwheel] Could not load centre photo <url>` in the browser console (open the overlay with `?preview` and press F12). |
| Photo missing after a move | Uploads live in `data/media/` of the data folder; a new `FINWHEEL_DATA_DIR` starts without them. Copy the `media` folder over.                                                                               |

When a photo is refused, the dock shows why (after the file name for an upload):

| Message                                                                                        | Fix                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| _not an image this browser can open_                                                           | The dock's browser cannot decode the file (HEIC, for instance): save it as JPEG or PNG first.                          |
| _Only 12 photos fit_                                                                           | Remove some photos (**×**) first.                                                                                      |
| _already in the list_                                                                          | That exact image is already a centre photo.                                                                            |
| _Upload stopped: Settings was closed before saving_                                            | Stay on **Settings** until the upload ends, then **Save settings**.                                                    |
| _Missing or bad token_                                                                         | The server has `FINWHEEL_TOKEN`: open the dock with `/dock/?token=…`.                                                  |
| _Images are limited to 8 MB_, _Upload a JPEG, PNG, WebP or GIF image_, _…of the declared type_ | Seen with [API](api.md#upload-a-photo) uploads: send a JPEG, PNG, WebP or GIF under 8 MB with its real `Content-Type`. |
| _Use an http(s):// image URL or a /path on this server_                                        | **Add by URL** takes `https://…`, `http://…` or a path such as `/media/…` (500 characters at most).                    |
