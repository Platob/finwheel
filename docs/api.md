# HTTP API

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
(see [`src/shared/schema.ts`](https://github.com/Platob/finwheel/blob/main/src/shared/schema.ts)). `GET /api/state` returns the full state and
`GET /api/health` a liveness check.

## Overlay URL options

Overlay URL options: `?preview` adds a felt background to test in a normal browser, `?mute=1` silences one source.
