# Configuration

## Data folder

Everything FinWheel saves lives in `data/` (or the folder set by `FINWHEEL_DATA_DIR`; `npm start` prints it as
**Data folder**):

| Path                | Holds                                                                                                                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data/config.json`  | Wheels and settings. On first start, [`config/default.config.json`](https://github.com/Platob/finwheel/blob/main/config/default.config.json) is copied here. Edit wheels in the dock (**Wheels** tab) or in this file while the server is stopped. |
| `data/session.json` | Queue, raffle entrants and history, so they survive restarts.                                                                                                                                                                                      |
| `data/media/`       | [Centre photos](looks.md#centre-photos) uploaded from the dock or the [API](api.md#upload-a-photo), served at `/media/<file>`.                                                                                                                     |

## The config file

`data/config.json` has these keys:

| Key                  | Holds                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `version`            | Always `1`.                                                                                                                |
| `activeWheelId`      | The wheel picked in the dock: shown on the overlay when idle and played by the spin command. `broke-boi` on a new install. |
| `wheels`             | 1 to 32 wheels and games, in the dock's order ([fields below](#wheel-fields)).                                             |
| `settings`           | Everything under **Settings** in the dock ([below](#settings)).                                                            |
| `knownDefaults`      | Ids of the default wheels this install has already been offered ([updates](#updates)).                                     |
| `knownDefaultPhotos` | The default centre photos this install has already been offered.                                                           |

The server checks the file when it starts. If something is wrong, it prints the problem and stops: fix the file,
or delete it to start again from the default config.

## Wheel fields { #wheel-fields }

A game is a wheel with a `game` field: slots, claw, plinko and gifts take the same fields, odds and effects as a
wheel. [Wheels & prizes](wheels.md#edit-a-wheel) explains each field and its name in the dock.

| Field          | Default  | Limits                                                                                                                  |
| -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `id`           | required | 1 to 40 letters, numbers, `-` and `_`, starting with a letter or number. Unique.                                        |
| `name`         | required | 1 to 40 characters.                                                                                                     |
| `subtitle`     | `""`     | 60 characters.                                                                                                          |
| `game`         | `wheel`  | `wheel`, `slots`, `claw`, `plinko` or `gifts`.                                                                          |
| `command`      | none     | `!` then 1 to 24 lowercase letters, numbers, `-` or `_`. Unique, and not the spin command, raffle keyword or `!raffle`. |
| `sizing`       | `weight` | `weight` (slices or capsules follow the odds) or `equal`.                                                               |
| `spinsPerTurn` | `1`      | 1 to 20 plays per game.                                                                                                 |
| `prizes`       | required | 64 at most, in order: clockwise on a wheel, left to right on a plinko board.                                            |

Each prize ([effects](wheels.md#slice-effects)):

| Field            | Default            | Limits                                                      |
| ---------------- | ------------------ | ----------------------------------------------------------- |
| `id`             | required           | Like a wheel id. Unique in its wheel.                       |
| `label`          | required           | 1 to 48 characters.                                         |
| `description`    | `""`               | 140 characters.                                             |
| `weight`         | required           | Above 0, up to 1,000,000.                                   |
| `stock`          | `null` (unlimited) | A whole number, 0 or more. At 0 the prize leaves the wheel. |
| `tier`           | `common`           | `common`, `rare`, `epic`, `legendary` or `jackpot`.         |
| `color`          | none               | `#rrggbb`.                                                  |
| `icon`           | none               | 1 to 8 characters.                                          |
| `chainWheelId`   | none               | The id of a wheel in the file.                              |
| `cash`           | `0`                | 0 to 1,000,000.                                             |
| `multiplier`     | `1`                | 0 to 1,000.                                                 |
| `nextMultiplier` | `1`                | 1 to 100.                                                   |
| `extraSpins`     | `0`                | 0 to 10.                                                    |
| `bust`           | `false`            | `true` makes the slice a _Bankrupt_.                        |

- **`game`** only changes the show: the server draws the prize the same way for every game and applies the same
  effects. Bonus spins replay the same game; `chainWheelId` can lead to a game, which then plays its own
  `spinsPerTurn`. See [Playing](playing.md#games) for what each game looks like.
- **`command`** is a chat command that plays this wheel, with the spin command's permission, cooldown and
  moderator arguments ([Twitch](twitch.md#chat-commands)). The file may use capitals: the server lowercases it.
- **`icon`** is an emoji or short symbol shown by the games: reel symbols, claw capsules, plinko bins and gifts. The
  wheel does not draw it. An emoji counts as one character, a combined emoji such as 👩‍👩‍👧‍👦 as several.
- **`color`** replaces the look's colour for this slice on the wheel, and for its prize in the games (reel
  symbol, capsule, plinko bin, the card that rises out of a gift; gift boxes keep the look's papers). The dock has no field for it: set it here. Seven default money wheels use it
  ([How money slices look](wheels.md#how-money-slices-look)).

A game from the default config, shortened to two of its eight prizes without their descriptions (a field left out
takes its default):

```json
{
  "id": "loser-slots",
  "name": "Loser Slots",
  "subtitle": "Three in a row or cry about it",
  "sizing": "weight",
  "spinsPerTurn": 3,
  "game": "slots",
  "command": "!slots",
  "prizes": [
    { "id": "c2", "label": "$2", "icon": "🍑", "weight": 6, "cash": 2 },
    {
      "id": "jackpot",
      "label": "$50 Jackpot",
      "icon": "👑",
      "weight": 0.75,
      "tier": "jackpot",
      "cash": 50
    }
  ]
}
```

## Settings { #settings }

In the dock: **Settings**, then **Save settings**. In `data/config.json` they sit under `settings`. **Default** is
the value of a new install. A setting missing from the file takes the same value, except `hubPhotos` (`[]`),
`subscriberTickets` (`1`) and `prizeWheelId` (`""`, nothing).

### Overlay settings

**Settings → Overlay**, under `settings.overlay` (currency under `settings.currency`):

| Setting             | Dock                         | Default                     | Limits                                                                                     |
| ------------------- | ---------------------------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| `theme`             | **Look**                     | `glam`                      | `glam` or `casino` ([Looks & photos](looks.md)). Applies to the wheel and the games.       |
| `hubPhotos`         | **Centre photos**            | 4 shipped photos (`/hub/…`) | 12 photos; each an `http(s)://` URL or a path on this server (`/media/…`), 500 characters. |
| `hubPhotoSeconds`   | **Seconds per photo**        | `8`                         | 2 to 120; shown in the dock once there are two photos.                                     |
| `autoHide`          | **Hide the wheel when idle** | off                         | An open raffle wheel stays visible.                                                        |
| `showRaffleBadge`   | **Show the raffle badge**    | on                          |                                                                                            |
| `sound`             | **Sound effects**            | on                          |                                                                                            |
| `volume`            | **Volume**                   | `0.6`                       | 0 to 1 (the dock shows 0 to 100 %).                                                        |
| `currency.symbol`   | **Currency symbol**          | `$`                         | 4 characters.                                                                              |
| `currency.position` | **Symbol position**          | `before`                    | `before` (_Before ($10)_) or `after` (_After (10 €)_).                                     |

### Spin settings

**Settings → Spin**, under `settings.spin`:

| Setting            | Dock                             | Default | Limits                                                                                                                                 |
| ------------------ | -------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `durationMs`       | **Duration (s)**                 | `8000`  | 2,000 to 30,000 ms. A wheel spin or a claw grab takes this long, a gift 90 %, a plinko drop 85 % (10 s at most) and a slots pull 70 %. |
| `resultHoldMs`     | **Result shown (s)**             | `7000`  | 1,000 to 120,000 ms.                                                                                                                   |
| `followUpHoldMs`   | **Between turn spins (s)**       | `3500`  | 1,000 to 60,000 ms: how long a result stays up when the same player's game goes on.                                                    |
| `maxSpinsPerTurn`  | **Max spins per turn**           | `30`    | 1 to 100 (the dock stops at 50). Caps the plays of one game, bonus spins and chained wheels included.                                  |
| `minTurns`         | **Min revolutions**              | `5`     | 1 to 30.                                                                                                                               |
| `maxTurns`         | **Max revolutions**              | `8`     | 1 to 40, not below `minTurns`.                                                                                                         |
| `autoAdvanceQueue` | **Play the queue automatically** | on      |                                                                                                                                        |

### Raffle settings

**Settings → Raffle**, under `settings.raffle`:

| Setting             | Dock                                  | Default | Limits                         |
| ------------------- | ------------------------------------- | ------- | ------------------------------ |
| `keyword`           | **Chat keyword**                      | `!join` | 1 to 25 characters.            |
| `subscriberTickets` | **Subscriber tickets**                | `2`     | 1 to 10.                       |
| `removeWinner`      | **Remove the winner from the raffle** | on      |                                |
| `prizeWheelId`      | **Winner then spins**                 | `grand` | A wheel id; `""` is _Nothing_. |

### Twitch settings

**Settings → Twitch chat**, under `settings.twitch` ([Twitch](twitch.md)):

| Setting           | Dock                                             | Default             | Limits                                                                  |
| ----------------- | ------------------------------------------------ | ------------------- | ----------------------------------------------------------------------- |
| `channel`         | **Channel**                                      | `""` (chat off)     | Up to 25 letters, numbers and `_`.                                      |
| `spinCommand`     | **Spin command**                                 | `!spin`             | 1 to 25 characters, and not a wheel's `command`.                        |
| `spinPermission`  | **Who can spin**                                 | `moderator`         | `everyone`, `subscriber`, `vip`, `moderator` or `broadcaster`.          |
| `spinCooldownSec` | **Cooldown (s)**                                 | `60`                | 0 to 86,400, per viewer, shared by the spin command and wheel commands. |
| `announceResults` | **Announce results in chat (needs a bot token)** | on                  |                                                                         |
| `bits.enabled`    | **Bits trigger a spin**                          | off                 |                                                                         |
| `bits.minimum`    | **Minimum bits**                                 | `500`               | 1 to 1,000,000.                                                         |
| `bits.wheelId`    | **Wheel**                                        | `""` (active wheel) | Any wheel or game id.                                                   |
| `rewards`         | **Channel points**                               | `[]`                | 20 at most, each `{ "rewardId", "wheelId", "label" }`.                  |

## Updates and new default wheels { #updates }

Updating FinWheel never changes the wheels or settings you already have. At each start, the server compares your
config with `config/default.config.json` and adds, once:

- **Default wheels your install has never been offered**, at the end of the list in default order (32 wheels at
  most). If an added wheel's `command` is already taken, or its `chainWheelId` names a wheel you do not have, that
  field is dropped.
- **Default centre photos your install has never been offered**, at the end of the photo list (12 at most).

The terminal says what it added: `[finwheel] Added new default wheels: …` and `[finwheel] Added default centre
photos: …`. The ids and photos offered are kept in `knownDefaults` and `knownDefaultPhotos`, so a default wheel or
photo you delete stays deleted.

A wheel you already have keeps its old version, even when the default with the same id has changed. An install
from before the games keeps its 16-slice _Broke Boi Wheel_, its Grand Wheel never leads to a game, and none of its
wheels gets a chat command. To get the current defaults, stop the server and delete `data/config.json` (this also
resets your settings), or copy the wheels you want from `config/default.config.json` by hand.

## Environment variables

See [`.env.example`](https://github.com/Platob/finwheel/blob/main/.env.example): `PORT`, `HOST`,
`FINWHEEL_DATA_DIR`, `FINWHEEL_TOKEN`, `FINWHEEL_ALLOWED_ORIGINS`, `TWITCH_BOT_USERNAME`, `TWITCH_OAUTH_TOKEN`.

## Security

The server listens on `127.0.0.1` only. It rejects requests whose `Host` is not local (DNS rebinding) and
cross-site `Origin`s, so a web page you visit cannot spin your wheel. If you expose it on the network
(`HOST=0.0.0.0`, e.g. a second streaming PC), set `FINWHEEL_TOKEN` and open the dock with
`/dock/?token=…`; the overlay keeps working without the token (read-only). API calls and the OBS script then
need it too: `-H 'Authorization: Bearer <token>'`, and the script's **Control token** field.
