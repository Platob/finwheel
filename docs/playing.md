# Playing

## Start a game

In the dock's **Play** tab: pick a wheel chip, type a player (optional), set the number of spins with **−** / **+**
(the wheel's default spins to start with, 20 at most), press **Spin**. While a game runs the button reads **Queue**:
the request waits in the **Queue** and plays automatically when the game ends (or one by one with **Spin next** if
**Settings → Spin → Play the queue automatically** is off). Chat (`!spin`), channel points, bits and the
[HTTP API](api.md) start games the same way.

**Now** follows the game (`Bank $5 spin 2 of 3 · ×2 next`); **Dismiss** closes a result or total screen early.
**Odds & payouts** under the Spin button simulates the selected wheel with the chosen spin count: average, median
and best payout, and how often it pays nothing.

<div class="grid-shots" markdown>

![Dock Play tab: wheel chips, player name, spins stepper, Spin button, queue and history](images/dock.jpg){ width="300" }

</div>

## Stat row and bank badge

A money game (any wheel with cash, `×N` or bankrupt slices) keeps a running total, shown differently by each
[look](looks.md):

| Look   | Where                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------- |
| Glam   | **Stat row** above the wheel: **spins left**, **total**, **next spin** (`×1`; `×2` in lavender once a boost is armed). |
| Casino | **Bank** badge, top left: `Bank · Spin 2 of 3` and the running total.                                         |

Bonus spins and chained wheels raise the spin count as they are won. When the glam overlay is idle on a money
wheel, the stat row previews the next game: the wheel's default spins, `$0`, `×1`. The status line under it shows
the wheel's subtitle, or _Spinning for_ the player during a game (casino puts both on the plaque under the wheel).

## The ×N next rule { #next-rule }

A slice with **× Next spin** (`nextMultiplier`) set, like the _×2 Next_ slice of the Broke Boi Wheel, multiplies
the cash of the player's **next** spin:

- **Stacks:** two _×2 Next_ in a row make `×4`; _×2_ then _×3_ make `×6`.
- **Used up by the next spin, whatever it lands on.** A _Free Spin_ or a _×2 Total_ (no cash) uses the boost
  without paying more. Boosted cash is added before a `×N total` on the same slice: the total becomes
  `(total + cash × boost) × multiplier`.
- **Cleared by bankrupt**, together with the total.
- **Lost when the game ends.** A _×2 Next_ on the last spin has nothing left to boost: its card says
  _No spins left for the boost_.

A slice with both cash and `×N next` pays its own cash as printed and multiplies the boost for the spin after it.

Worked example, a 3-spin game on the Broke Boi Wheel:

| Spin | Lands on  | Pays  | Total | Stat row **next spin** |
| ---- | --------- | ----- | ----- | ---------------------- |
| 1    | `$5`      | `$5`  | `$5`  | `×1`                   |
| 2    | `×2 Next` | -     | `$5`  | `×2`                   |
| 3    | `$7`      | `$14` | `$19` | game over              |

Spin 2 shows the **Boost!** card. Spin 3's card reads **Cash out**, **Final total** `$19` `+$14 · ×2 boost`, and the
total screen lists `$5`, `×2 next`, `$14`.

## Result cards

Every spin ends on a card with the slice, its description and, in money games, the bank line: **Total** (or
**Final total** on the last spin, **Lost** on bankrupt) and what changed (`+$14 · ×2 boost`, `×2`). Under it,
what comes next: `+1 free spin`, `Next: Simp Wheel`, `Next spin coming up`.

| Heading                  | When                                                                         |
| ------------------------ | ---------------------------------------------------------------------------- |
| **Winner**               | A slice for a named player.                                                  |
| **The wheel has spoken** | A slice with no player name.                                                 |
| **Boost!**               | A `×N next` slice armed a boost (the card says _Your next spin pays ×2_ unless the slice has a description). |
| **Cash out**             | The last spin of a money game.                                               |
| **Bankrupt**             | A bankrupt slice. With nothing in the bank: _Lucky break — nothing in the bank to lose_. |
| **Raffle winner**        | A raffle draw.                                                               |

A `×N total` slice on an empty bank says _Nothing in the bank to multiply yet_.

<div class="grid-shots" markdown>

![Glam overlay mid-game: a result card, with the stat row above the wheel](images/overlay-result.jpg){ width="360" }

![The Boost! card after landing on ×2 Next, the stat row showing ×2 next spin](images/overlay-boost.jpg){ width="360" }

</div>

## Total screen

A money game that ends after 2 or more spins (last spin played, or bankrupt) shows its last card for
**Between turn spins (s)**, then the total screen for **Result shown (s)** (both in **Settings → Spin**):

- the heading: **Total winnings**, **Bankrupt**, or **Game over** when it paid nothing;
- the player and the total, counting up;
- one chip per spin (boosted cash shows what it paid: `$14` for a `$7` slice at `×2`) and the spin count.

A game that ends on its first spin (a 1-spin game, or bankrupt on spin 1) ends on its result card. The dock's
**Now** shows `VelvetViper finished with $19 · $5 › ×2 next › $14`.

<div class="grid-shots" markdown>

![Total winnings screen after a 3-spin game](images/overlay-total.jpg){ width="360" }

</div>

## Raffles

In the dock's **Raffle** tab press **Open entries**; viewers type `!join` in chat (or add names with **Add**).
While entries are open and someone has entered, the overlay shows the raffle wheel, one slice per entrant (subscribers get
**Settings → Raffle → Subscriber tickets**, so bigger slices), and the `!join` badge. **Draw winner** spins it; the
winner then spins the wheel set in **Winner then spins** (The Grand Wheel by default). Chat commands for mods are
on the [Twitch](twitch.md#connect-twitch-chat) page.

What each slice does is described in [Wheels & prizes](wheels.md).
