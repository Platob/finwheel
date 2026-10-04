# Configuration

- On first start, [`config/default.config.json`](https://github.com/Platob/finwheel/blob/main/config/default.config.json) is copied to
  `data/config.json`. Edit wheels in the dock (**Wheels** tab) or in that file while the server is stopped.
- Queue, raffle entrants and history survive restarts in `data/session.json`.
- Environment variables (see [`.env.example`](https://github.com/Platob/finwheel/blob/main/.env.example)): `PORT`, `HOST`, `FINWHEEL_DATA_DIR`,
  `FINWHEEL_TOKEN`, `FINWHEEL_ALLOWED_ORIGINS`, `TWITCH_BOT_USERNAME`, `TWITCH_OAUTH_TOKEN`.

## Security

The server listens on `127.0.0.1` only. It rejects requests whose `Host` is not local (DNS rebinding) and
cross-site `Origin`s, so a web page you visit cannot spin your wheel. If you expose it on the network
(`HOST=0.0.0.0`, e.g. a second streaming PC), set `FINWHEEL_TOKEN` and open the dock with
`/dock/?token=…`; the overlay keeps working without the token (read-only). API calls and the OBS script then
need it too: `-H 'Authorization: Bearer <token>'`, and the script's **Control token** field.
