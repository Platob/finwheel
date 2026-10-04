# Troubleshooting

| Problem                       | Fix                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overlay is empty              | Is `npm start` running? Check `curl http://localhost:4747/api/health`, then in the source's **Properties** click **Refresh cache of current page**.                             |
| No sound                      | Tick **Control audio via OBS** and unmute `FinWheel` in the Audio Mixer. To hear it yourself: **Edit → Advanced Audio Properties** → `FinWheel` → **Monitor and Output**.       |
| Chat commands ignored         | The **Settings** badge must say _connected_. By default only the broadcaster and mods can `!spin`; viewers get one game per cooldown (60 s) and none while already queued.      |
| Badge says _error_            | The Twitch token expired or is wrong: redo [step 2 of Announce results in chat](twitch.md#announce-results-in-chat-optional), update `.env`, restart `npm start`.               |
| Channel-point reward ignored  | The reward must **require viewer text**.                                                                                                                                        |
| `Port 4747 is already in use` | FinWheel is already running: use that one (or stop it with Ctrl+C). Another app owns 4747? `PORT=4848 npm start` (PowerShell: `$env:PORT=4848; npm start`) and use 4848 in OBS. |
