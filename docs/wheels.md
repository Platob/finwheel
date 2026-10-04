# Wheels & prizes

Edit wheels in the dock (**Wheels** tab) or in `data/config.json` while the server is stopped.

## Default wheels

| Id            | Name            | Spins | What it does                                                                                                                                                                   |
| ------------- | --------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `broke-boi`   | Broke Boi Wheel | 3     | $2 – $10, no risk. 16 equal slices: cash, _×2 Total_, _×2 Next_, _$2 + Spin_ and _Free Spin_. The active wheel on first start.                                                 |
| `simp`        | Simp Wheel      | 3     | $10 – $50, bankrupt risk. Cash, _×2 Total_, _×3 Total_, _$10 + Spin_, _Free Spin_, _Lose Half_ and two _Bankrupt_ slices.                                                      |
| `whale`       | Whale Wheel     | 2     | $50 – $500, high risk. Cash up to $250, a _$500 Jackpot_ (half-size slice), _×2 Total_, _×5 Total_, _$50 + Spin_, _Lose Half_ and five _Bankrupt_ slices.                      |
| `grand`       | The Grand Wheel | 1     | Picks a category, then the player spins it: Broke Boi 36 %, Prize Vault 22 %, Simp 18 %, Streamer Dare 16 %, Whale 8 %. Raffle winners spin it.                                |
| `prize-vault` | Prize Vault     | 1     | Real rewards, some in limited stock: _Gift Sub_ (5), _Game Key_ (3), _Merch Pack_ (1), plus _VIP for a Week_, _Shoutout_, _Pick the Game_, _Discord Role_, _1v1 the Streamer_. |
| `dares`       | Dare Wheel      | 1     | Six streamer dares on equal slices.                                                                                                                                            |

**Spins** is the default number of spins per game; the dock and chat can choose another count. Ids are what chat
commands and the [HTTP API](api.md) use (`!spin @friend 5 simp`). Before going live, check a money wheel's payouts
in the dock: **Odds & payouts** in the **Play** tab, or **Avg / game**, **Best seen**, **Bankrupt** and **Pays $0**
under the wheel in the **Wheels** tab. The [live wheels](index.md) show the same simulation.

## Edit a wheel

In the **Wheels** tab, pick a wheel (or **New** / **Duplicate**), then set **Name**, **Subtitle**, **Slice size**
(_Matches the odds_ or _All equal_) and **Default spins** (1 to 20). Each slice has **Weight**, **Stock**, **Tier**,
**Cash $**, **× Total** and **× Next spin**; **More** holds **Description**, **+ Spins**, **Then spin** and
**Bankrupt**. **↑** / **↓** reorder slices, **+ Add slice** adds one, **Save wheels** applies the changes.

Limits: 32 wheels, 64 slices per wheel; ids use letters, numbers, `-` and `_`.

## Slice effects

| Field            | Dock            | Meaning                                                                                                                                                                                                             |
| ---------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cash`           | **Cash $**      | Added to the running total.                                                                                                                                                                                         |
| `multiplier`     | **× Total**     | Applied after adding `cash`: `2` doubles the total, `0.5` loses half.                                                                                                                                               |
| `nextMultiplier` | **× Next spin** | Multiplies the cash of the player's next spin (`2` = "×2 next", 1 to 100, `1` = off). Stacks, used up by the next spin, cleared by bankrupt, lost when the game ends: see [the ×N next rule](playing.md#next-rule). |
| `extraSpins`     | **+ Spins**     | Bonus spins on the same wheel (0 to 10).                                                                                                                                                                            |
| `bust`           | **Bankrupt**    | The total drops to zero and the game ends.                                                                                                                                                                          |
| `chainWheelId`   | **Then spin**   | Continue on another wheel (its default spin count), keeping the total.                                                                                                                                              |
| `weight`         | **Weight**      | Relative odds. With `sizing: "weight"` the slice size matches the odds.                                                                                                                                             |
| `stock`          | **Stock**       | Remaining quantity (`null` = unlimited). Sold-out prizes leave the wheel.                                                                                                                                           |
| `tier`           | **Tier**        | `common`, `rare`, `epic`, `legendary`, `jackpot`: size of the celebration, colour of the result card and of some slices (below).                                                                                    |
| `description`    | **Description** | Shown under the prize on its result card.                                                                                                                                                                           |
| `color`          | -               | Optional `#rrggbb` slice colour, overriding the look (set it in `data/config.json`).                                                                                                                                |

One spin turns the total into `(total + cash × boost) × multiplier`, where `boost` is the armed `×N next` (1 when
none). A slice that itself has `×N next` pays its cash as printed and passes the boost on to the spin after it.

## How money slices look { #how-money-slices-look }

Slices with money effects print their amount, computed from the fields above so the display always matches the
payout. Other slices (prizes, _Bankrupt_, _Lose Half_) print their label.

| Slice                             | Printed         |
| --------------------------------- | --------------- |
| `cash: 10`                        | `$10`           |
| `cash: 2`, `extraSpins: 1`        | `$2` BONUS SPIN |
| `multiplier: 2`                   | `×2` TOTAL      |
| `nextMultiplier: 2`               | `×2` NEXT       |
| `extraSpins: 1`                   | `+1` FREE SPIN  |
| `cash: 500`, label `$500 Jackpot` | `$500` JACKPOT  |

Glam prints the amount across the slice in white sticker lettering and the caption in small serif capitals toward
the hub (an amount without a caption gets a small `$` there instead). Casino prints the amount at the rim and the
caption toward the hub.

Slice colours, in order of priority:

| Slice                                  | Glam                                      | Casino                          |
| -------------------------------------- | ----------------------------------------- | ------------------------------- |
| _Bankrupt_                             | Dark plum, hot-pink lettering             | Black, red lettering            |
| `color` set                            | That colour                               | That colour                     |
| Jackpot tier                           | Metallic gold                             | Metallic gold                   |
| `×N total` or _Lose Half_ without cash | Gold                                      | By tier                         |
| `×N next` without cash                 | Lavender                                  | By tier                         |
| Legendary tier                         | Deep magenta, gold inlay                  | Bronze, gold inlay              |
| Rare / epic tier                       | Pink cycle                                | Blue / purple                   |
| Everything else                        | Hot pink, cream, pink, light pink in turn | Emerald, bordeaux, onyx in turn |

Neighbouring slices of the cycle never share a colour, the last and the first included.
