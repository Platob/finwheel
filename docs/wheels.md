# Wheels & prizes

FinWheel ships with 16 wheels: nine money wheels, four games and three prize wheels. Each one below is a live copy
with the server's odds: tap it to play. Edit wheels in the dock (**Wheels** tab) or in `data/config.json` while the
server is stopped.

<div class="fw-live" data-toolbar data-wheels=""></div>
<noscript>The live wheels need JavaScript.</noscript>

## Default wheels

| Wheel                             | Kind          | Command         | Per game | Pays                                  | Average    |
| --------------------------------- | ------------- | --------------- | -------- | ------------------------------------- | ---------- |
| [Broke Boi Wheel](#broke-boi)     | Wheel         | `!brokeboi`     | 3 spins  | $2 – $10, ×2 total, ×2 next           | about $17  |
| [Pathetic Wheel](#pathetic)       | Wheel         | `!pathetic`     | 3 spins  | $1 – $10, ×2 total, bonus spins       | about $20  |
| [Simp Wheel](#simp)               | Wheel         | `!simp`         | 3 spins  | $10 – $50, ×2 or ×3 total, bankrupt   | about $45  |
| [Loser Wheel](#loser)             | Wheel         | `!loser`        | 3 spins  | $10 – $100, ×2 total                  | about $140 |
| [Roulette Wheel](#roulette)       | Wheel         | `!roulette`     | 1 spin   | $10 – $44                             | about $20  |
| [Angel Wheel](#angel)             | Wheel         | `!angel`        | 1 spin   | $11 – $111                            | about $61  |
| [All or Nothing](#all-or-nothing) | Wheel         | `!allornothing` | 1 spin   | $10 or $100                           | about $32  |
| [Infinity Wheel](#infinity)       | Wheel         | `!infinity`     | 1 spin   | $2 – $15, bonus spins                 | about $38  |
| [Whale Wheel](#whale)             | Wheel         | `!whale`        | 2 spins  | $69 – $300, ×2 total                  | about $330 |
| [Loser Slots](#loser-slots)       | Slot machine  | `!slots`        | 3 pulls  | $2 – $50, ×2 total, ×2 next           | about $22  |
| [Loser Claw](#loser-claw)         | Claw machine  | `!claw`         | 3 grabs  | $3 – $40, ×2 total, ×2 next, bankrupt | about $25  |
| [Simp Drop](#simp-drop)           | Plinko        | `!drop`         | 3 drops  | $5 – $50, ×2 total, ×2 next, bankrupt | about $34  |
| [Mystery Gifts](#mystery-gifts)   | Mystery gifts | `!gift`         | 1 gift   | $2 – $50, ×2 next                     | about $13  |
| [The Grand Wheel](#grand)         | Wheel         | `!grand`        | 1 spin   | Another wheel or game                 | about $35  |
| [Prize Vault](#prize-vault)       | Wheel         | -               | 1 spin   | Real rewards, some in limited stock   | -          |
| [Dare Wheel](#dares)              | Wheel         | -               | 1 spin   | A dare for the streamer               | -          |

**Per game** is the default number of plays; the dock and moderators can choose another count. Each wheel's chat
command plays that wheel, and `!spin` plays the active wheel (the Broke Boi Wheel on a fresh install). Moderators can
add a player and a count, in any order: `!slots @friend 5`, or `!spin @friend 5 simp` with the wheel id. Ids (given
in each section) are also what the [HTTP API](api.md) and **Then spin** use. [Twitch](twitch.md#chat-commands) covers
who may use the commands.

**Average** is the mean payout of a game at the default count, simulated over 100,000 games with the server's rules,
bonus spins and bankrupts included. Before going live, check a wheel's payouts in the dock: **Odds & payouts** in the
**Play** tab, or **Avg / game**, **Best seen**, **Bankrupt** and **Pays $0** under the wheel in the **Wheels** tab. The
dock and the [live wheels](index.md) run the same simulation over fewer games, so their figures can differ a little,
**Best seen** most of all.

Updating FinWheel keeps your wheels: default wheels your install has never had are added at the end of the list, and
the wheels you already have are never changed. A default wheel you deleted stays deleted. To start again from the
current defaults, stop the server and delete `data/config.json` (this also resets your settings).

## Money wheels

Each spin adds to the player's running total, multiplies it or wipes it out; the player walks away with the total
when the game ends. [Playing](playing.md) explains the stat row, the ×N next rule and the result cards.

### Broke Boi Wheel { #broke-boi }

<div class="fw-wheel-doc" markdown>
<div class="fw-live" data-wheels="broke-boi"></div>
<div markdown>

`!brokeboi` · id `broke-boi` · 3 spins a game

On the wheel, clockwise: $2 · $10 · $4 · ×2 TOTAL · $6 · $3 · $8 · $5 · ×2 NEXT · $9 · $7

| Slice                         | Chance | Effect                       |
| ----------------------------- | ------ | ---------------------------- |
| _$2_ to _$10_, one slice each | 81.8 % | Adds its amount              |
| _×2 Total_                    | 9.1 %  | Doubles the total            |
| _×2 Next_                     | 9.1 %  | Doubles the next spin's cash |

About $17 a game (best seen $40), never bankrupt. The safe wheel, and the active wheel on a fresh install: `!spin`
plays it.

</div>
</div>

### Pathetic Wheel { #pathetic }

<div class="fw-wheel-doc" markdown>
<div class="fw-live" data-wheels="pathetic"></div>
<div markdown>

`!pathetic` · id `pathetic` · 3 spins a game

On the wheel, clockwise: $10 · $1 BONUS SPIN · ×2 TOTAL · $4 · $6 · $10 · $1 BONUS SPIN · ×2 TOTAL · $4 · $6

| Slice                              | Chance | Effect                   |
| ---------------------------------- | ------ | ------------------------ |
| _$4_, _$6_, _$10_, two slices each | 60 %   | Adds its amount          |
| _$1 + spin_, two slices            | 20 %   | Adds $1 and a bonus spin |
| _×2 Total_, two slices             | 20 %   | Doubles the total        |

About $20 a game (best seen $68), never bankrupt; the bonus spins make it nearly 4 spins a game. Pink and white
slices of its own; the two _×2 Total_ slices keep the look's colour (gold in glam).

</div>
</div>

### Simp Wheel { #simp }

<div class="fw-wheel-doc" markdown>
<div class="fw-live" data-wheels="simp"></div>
<div markdown>

`!simp` · id `simp` · 3 spins a game

On the wheel, clockwise: $10 · $25 · Bankrupt · $15 · ×2 TOTAL · $50 · $10 BONUS SPIN · $20 · Lose Half · $30 ·
Bankrupt · $15 · ×3 TOTAL · $40 · +1 FREE SPIN · $20

| Slice                       | Chance | Effect                    |
| --------------------------- | ------ | ------------------------- |
| _$10_ to _$50_, nine slices | 56.3 % | Adds its amount           |
| _$10 + Spin_                | 6.3 %  | Adds $10 and a bonus spin |
| _Free Spin_                 | 6.3 %  | A bonus spin              |
| _×2 Total_                  | 6.3 %  | Doubles the total         |
| _×3 Total_                  | 6.3 %  | Triples the total         |
| _Lose Half_                 | 6.3 %  | Halves the total          |
| _Bankrupt_, two slices      | 12.5 % | Total to $0, game over    |

About $45 a game (median $40, best seen $540), bankrupt in 37 % of games. The risky wheel: two _Bankrupt_ slices
and _Lose Half_.

</div>
</div>

### Loser Wheel { #loser }

<div class="fw-wheel-doc" markdown>
<div class="fw-live" data-wheels="loser"></div>
<div markdown>

`!loser` · id `loser` · 3 spins a game

On the wheel, clockwise: $100 10000 BITS · $10 1000 BITS · ×2 TOTAL · $50 5000 BITS · $44 4400 BITS ·
$25 2500 BITS · $75 7500 BITS · $25 2500 BITS

| Slice                                              | Chance | Effect            |
| -------------------------------------------------- | ------ | ----------------- |
| _$10/1000 bits_ to _$100/10000 bits_, seven slices | 87.5 % | Adds its amount   |
| _×2 Total_                                         | 12.5 % | Doubles the total |

About $140 a game (best seen $400), never bankrupt. The total is in dollars; each cash slice's label also gives
its amount in bits (_$100/10000 bits_), for paying out in bits instead, and the wheel prints the bits as the
caption. Red and white slices.

</div>
</div>

### Roulette Wheel { #roulette }

<div class="fw-wheel-doc" markdown>
<div class="fw-live" data-wheels="roulette"></div>
<div markdown>

`!roulette` · id `roulette` · 1 spin a game

On the wheel, clockwise, red and black in turn: $15 · $20 · $10 · $15 · $44 · $20 · $10 · $25

| Slice                     | Chance | Effect   |
| ------------------------- | ------ | -------- |
| _$10_, two red slices     | 25 %   | Adds $10 |
| _$15_, one red, one black | 25 %   | Adds $15 |
| _$20_, two black slices   | 25 %   | Adds $20 |
| _$25_, black              | 12.5 % | Adds $25 |
| _$44_, red                | 12.5 % | Adds $44 |

About $20 a game (best seen $44). One spin, cash only, never bankrupt.

</div>
</div>

### Angel Wheel { #angel }

<div class="fw-wheel-doc" markdown>
<div class="fw-live" data-wheels="angel"></div>
<div markdown>

`!angel` · id `angel` · 1 spin a game

On the wheel, clockwise: $11 · $111 · $99 · $88 · $77 · $66 · $55 · $44 · $33 · $22

Ten cash slices, one for each angel number from _$11_ to _$111_, 10 % each.

About $61 a game (median $55, best seen $111). One spin, never bankrupt. Lilac and white slices.

</div>
</div>

### All or Nothing { #all-or-nothing }

<div class="fw-wheel-doc" markdown>
<div class="fw-live" data-wheels="all-or-nothing"></div>
<div markdown>

`!allornothing` · id `all-or-nothing` · 1 spin a game

On the wheel, clockwise: $10 · $10 · $10 · $100 · $10 · $10 · $100 · $10 · $10 · $100 · $10 · $10

| Slice                | Chance | Effect    |
| -------------------- | ------ | --------- |
| _$10_, nine slices   | 75 %   | Adds $10  |
| _$100_, three slices | 25 %   | Adds $100 |

About $32 a game: three games in four pay $10, one in four pays $100. Blue and white slices.

</div>
</div>

### Infinity Wheel { #infinity }

<div class="fw-wheel-doc" markdown>
<div class="fw-live" data-wheels="infinity"></div>
<div markdown>

`!infinity` · id `infinity` · 1 spin a game, plus bonus spins

On the wheel, clockwise: $4 BONUS SPIN · $10 · $2 BONUS SPIN · $10 BONUS SPIN · $3 BONUS SPIN · $4 BONUS SPIN ·
$8 BONUS SPIN · $15 · $6 BONUS SPIN · $3 BONUS SPIN · $10 BONUS SPIN · $2 BONUS SPIN

| Slice                                   | Chance | Effect                           |
| --------------------------------------- | ------ | -------------------------------- |
| _$2 + spin_ to _$10 + spin_, ten slices | 83.3 % | Adds its amount and a bonus spin |
| _$10_, _$15_                            | 16.7 % | Adds its amount, no bonus spin   |

The game goes on until it lands on _$10_ or _$15_ (or reaches **Max spins per turn**, 30 by default): about 6 spins
and $38 a game (median $29, best seen $210), never bankrupt. Pastel blue, pink, green and yellow slices.

</div>
</div>

### Whale Wheel { #whale }

<div class="fw-wheel-doc" markdown>
<div class="fw-live" data-wheels="whale"></div>
<div markdown>

`!whale` · id `whale` · 2 spins a game

On the wheel, clockwise: $100 · $140 · $125 · $125 · $100 BONUS SPIN · $300 · $169 · $250 · $200 · $69 · ×2 TOTAL ·
$150

| Slice                       | Chance | Effect                     |
| --------------------------- | ------ | -------------------------- |
| _$69_ to _$300_, ten slices | 83.3 % | Adds its amount            |
| _$100 + spin_               | 8.3 %  | Adds $100 and a bonus spin |
| _×2 Total_                  | 8.3 %  | Doubles the total          |

About $330 a game (best seen $1,300), never bankrupt. The high roller: blue and purple slices, and _$300_ is jackpot
tier, so it gets the biggest celebration.

</div>
</div>

## Games

A game is a wheel with another way to show the result. The server draws the prize by weight, exactly as on a wheel,
and the stage animates its way to it: effects, totals, bonus plays and bankrupts work the same. The overlay says
pull, grab, drop or gift instead of spin. [Playing](playing.md#games) shows how each game plays, and **Game** in the
dock turns any wheel into one.

### Loser Slots { #loser-slots }

<div class="fw-wheel-doc" markdown>
<div class="fw-live" data-wheels="loser-slots"></div>
<div markdown>

`!slots` · id `loser-slots` · 3 pulls a game

| Prize            | Chance | Effect                       |
| ---------------- | ------ | ---------------------------- |
| 🍑 _$2_          | 22 %   | Adds $2                      |
| 💋 _$4_          | 22 %   | Adds $4                      |
| 🎀 _$6_          | 18.3 % | Adds $6                      |
| 🐷 _$8 + Spin_   | 9.2 %  | Adds $8 and a bonus pull     |
| 👠 _$12_         | 11 %   | Adds $12                     |
| 🔥 _×2 Total_    | 5.5 %  | Doubles the total            |
| 💖 _×2 Next_     | 9.2 %  | Doubles the next pull's cash |
| 👑 _$50 Jackpot_ | 2.8 %  | Adds $50                     |

All three reels stop on the drawn prize's symbol, three in a row on the payline; in 40 % of pulls the last reel
stops one symbol short first, then crawls in. About $22 a game (median $16, best seen $232), never bankrupt.

</div>
</div>

### Loser Claw { #loser-claw }

<div class="fw-wheel-doc" markdown>
<div class="fw-live" data-wheels="loser-claw"></div>
<div markdown>

`!claw` · id `loser-claw` · 3 grabs a game

| Prize          | Chance | Effect                       |
| -------------- | ------ | ---------------------------- |
| 🧾 _$3_        | 19 %   | Adds $3                      |
| 🍑 _$5_        | 19 %   | Adds $5                      |
| 💋 _$8_        | 15.9 % | Adds $8                      |
| 🎀 _$12_       | 12.7 % | Adds $12                     |
| 🐷 _$5 + Grab_ | 7.9 %  | Adds $5 and a bonus grab     |
| 💸 _$20_       | 7.9 %  | Adds $20                     |
| 🔥 _×2 Total_  | 4.8 %  | Doubles the total            |
| 💖 _×2 Next_   | 6.3 %  | Doubles the next grab's cash |
| 💎 _$40_       | 3.2 %  | Adds $40                     |
| 💀 _Bankrupt_  | 3.2 %  | Total to $0, game over       |

The claw grabs a capsule of the drawn prize, and the grab always holds. **Capsules** is _More for likelier prizes_:
the likelier a prize, the more capsules of it in the pile. About $25 a game (median $23, best seen $180), bankrupt
in about 10 % of games.

</div>
</div>

### Simp Drop { #simp-drop }

<div class="fw-wheel-doc" markdown>
<div class="fw-live" data-wheels="simp-drop"></div>
<div markdown>

`!drop` · id `simp-drop` · 3 drops a game

Bins, left to right: Bankrupt · $50 · ×2 TOTAL · $15 · $5 · $15 · ×2 NEXT · $50 · Bankrupt

| Prize                     | Chance | Effect                       |
| ------------------------- | ------ | ---------------------------- |
| 💀 _Bankrupt_, both edges | 6.3 %  | Total to $0, game over       |
| 💎 _$50_, two bins        | 7.9 %  | Adds $50                     |
| 🔥 _×2 Total_             | 7.9 %  | Doubles the total            |
| 💸 _$15_, two bins        | 38.1 % | Adds $15                     |
| 🍑 _$5_, the middle bin   | 31.7 % | Adds $5                      |
| 💖 _×2 Next_              | 7.9 %  | Doubles the next drop's cash |

The coin's path is planned to end in the drawn prize's bin, and every bin is the same width whatever its odds. About
$34 a game (median $30, best seen $200), bankrupt in 18 % of games.

</div>
</div>

### Mystery Gifts { #mystery-gifts }

<div class="fw-wheel-doc" markdown>
<div class="fw-live" data-wheels="mystery-gifts"></div>
<div markdown>

`!gift` · id `mystery-gifts` · 1 gift a game, plus bonus gifts

| Prize               | Chance | Effect                                         |
| ------------------- | ------ | ---------------------------------------------- |
| 🧾 _$2 Receipt_     | 18.2 % | Adds $2                                        |
| 💋 _$5_             | 22.7 % | Adds $5                                        |
| 🎀 _$10_            | 20.5 % | Adds $10                                       |
| 👠 _$15_            | 15.9 % | Adds $15                                       |
| 💸 _$25_            | 9.1 %  | Adds $25                                       |
| 🎁 _×2 Next + Gift_ | 9.1 %  | A bonus gift that pays double (prints ×2 NEXT) |
| 👑 _$50 Jackpot_    | 4.5 %  | Adds $50                                       |

Five gift boxes are shuffled and one opens on the drawn prize; the others then open on other prizes of the wheel,
picked at random for show. The viewer does not choose the box. About $13 a game (median $10), never bankrupt;
_×2 Next + Gift_ several times in a row stacks the boost, so the best seen is $800.

</div>
</div>

## Prize wheels

Their slices pay no money themselves: the slice is the prize, or a ticket to another wheel or game.

### The Grand Wheel { #grand }

<div class="fw-wheel-doc" markdown>
<div class="fw-live" data-wheels="grand"></div>
<div markdown>

`!grand` · id `grand` · 1 spin, then the wheel it lands on

On the wheel, clockwise, sized by their odds: Broke Boi · Loser Slots · Prize Vault · Loser Claw · Simp · Simp Drop ·
Streamer Dare · Mystery Gifts · Whale

| Slice           | Then plays                              | Chance |
| --------------- | --------------------------------------- | ------ |
| _Broke Boi_     | [Broke Boi Wheel](#broke-boi), 3 spins  | 24.3 % |
| _Loser Slots_   | [Loser Slots](#loser-slots), 3 pulls    | 9.5 %  |
| _Prize Vault_   | [Prize Vault](#prize-vault), 1 spin     | 14.9 % |
| _Loser Claw_    | [Loser Claw](#loser-claw), 3 grabs      | 8.1 %  |
| _Simp_          | [Simp Wheel](#simp), 3 spins            | 12.2 % |
| _Simp Drop_     | [Simp Drop](#simp-drop), 3 drops        | 6.8 %  |
| _Streamer Dare_ | [Dare Wheel](#dares), 1 spin            | 10.8 % |
| _Mystery Gifts_ | [Mystery Gifts](#mystery-gifts), 1 gift | 8.1 %  |
| _Whale_         | [Whale Wheel](#whale), 2 spins          | 5.4 %  |

The next wheel plays in the same turn, on its own stage. Raffle winners spin The Grand Wheel
(**Settings → Raffle → Winner then spins**). A game pays about $35 (median $14, best seen $1,000); about a third of
games pay $0 (Prize Vault, Dare Wheel or bankrupt), and 6.5 % end bankrupt.

</div>
</div>

### Prize Vault { #prize-vault }

<div class="fw-wheel-doc" markdown>
<div class="fw-live" data-wheels="prize-vault"></div>
<div markdown>

id `prize-vault` · no chat command · 1 spin

| Prize                    | Chance | Description                           |
| ------------------------ | ------ | ------------------------------------- |
| _VIP for a Week_         | 14.8 % | The diamond badge is yours for 7 days |
| _Shoutout_               | 18.5 % | A proper on-stream shoutout           |
| _Gift Sub_, 5 in stock   | 11.1 % | A gifted sub, on the house            |
| _Pick the Game_          | 14.8 % | You choose what we play next          |
| _Game Key_, 3 in stock   | 7.4 %  | A game key from the vault             |
| _Discord Role_           | 18.5 % | A shiny custom role                   |
| _1v1 the Streamer_       | 11.1 % | Winner takes bragging rights          |
| _Merch Pack_, 1 in stock | 3.7 %  | Shipped to your door                  |

Each win of a stocked prize takes one off its **Stock**. At 0 the prize leaves the wheel and the others share its
odds; the chances above are with everything in stock. FinWheel shows the prize; handing it out is up to you. Players
reach it from The Grand Wheel; moderators can also play it directly with `!spin @friend prize-vault`.

</div>
</div>

### Dare Wheel { #dares }

<div class="fw-wheel-doc" markdown>
<div class="fw-live" data-wheels="dares"></div>
<div markdown>

id `dares` · no chat command · 1 spin

Six equal slices (**Slice size** _All equal_), 16.7 % each:

| Dare                 | Description                             |
| -------------------- | --------------------------------------- |
| _No HUD_             | Play the next 10 minutes without a HUD  |
| _Fancy Accent_       | Speak with a posh accent for 10 minutes |
| _Inverted Mouse_     | Inverted controls for one round         |
| _Only Rhymes_        | Every sentence must rhyme for 5 minutes |
| _Chat Picks Loadout_ | Chat decides the next loadout           |
| _10 Squats_          | Right now, on camera                    |

Players reach it from The Grand Wheel's _Streamer Dare_ slice.

</div>
</div>

## Edit a wheel

In the **Wheels** tab, pick a wheel (or **New** / **Duplicate**; a duplicate keeps the game but not the chat
command), change it, then **Save wheels** (**Revert** drops the changes). The wheel's fields, with their names in
`data/config.json`:

| Field          | Dock                                                                                           | Meaning                                                                                                                                                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | Hint under the wheel picker                                                                    | Used by `!spin @viewer [spins] <id>`, the [HTTP API](api.md), **Then spin** and the raffle. The dock picks one for a new wheel.                                                                                                                                             |
| `name`         | **Name**                                                                                       | Up to 40 characters.                                                                                                                                                                                                                                                        |
| `subtitle`     | **Subtitle**                                                                                   | Up to 60 characters, shown under the name.                                                                                                                                                                                                                                  |
| `game`         | **Game**                                                                                       | How the result is shown: _Wheel_, _Slots_, _Claw_, _Plinko_ or _Gifts_ (`wheel`, `slots`, `claw`, `plinko`, `gifts`). The prizes, odds and effects stay the same.                                                                                                           |
| `command`      | **Chat command**                                                                               | Optional: `!` then 1 to 24 lowercase letters, numbers, `-` or `_`. Unique, and never the spin command, the raffle keyword or `!raffle`. Works like the spin command: **Who can spin**, the per-viewer cooldown (shared with `!spin`) and the moderators' `@viewer [spins]`. |
| `sizing`       | **Slice size** (wheel), **Capsules** (claw)                                                    | `weight`: slices or capsules follow the odds (_Matches the odds_, _More for likelier prizes_). `equal`: all the same (_All equal_, _Same for every prize_). Slots, plinko and gifts have no such field.                                                                     |
| `spinsPerTurn` | **Default spins** (**Default pulls**, **Default grabs**, **Default drops**, **Default gifts**) | Plays per game, 1 to 20. The dock and moderators can choose another count.                                                                                                                                                                                                  |
| `prizes`       | **Slices** (**Symbols**, **Capsules**, **Bins**, **Gifts**)                                    | The prizes, in order: clockwise on a wheel, left to right on a plinko board.                                                                                                                                                                                                |

Each slice has an icon button (it opens the **Icon** picker: an emoji or short symbol, a few quick picks, **∅** for
none), its label and chance (`out` once sold out), **Weight**, **Stock**, **Tier**, **Cash $**, **× Total** and
**× Next spin**; **More** holds **Description**, **+ Spins**, **Then spin** and **Bankrupt**. **↑** / **↓** reorder
slices, **×** removes one, **+ Add slice** (**+ Add symbol**, **+ Add capsule**, **+ Add bin**, **+ Add gift**) adds
one. Under the fields, a wheel that can pay money (The Grand Wheel included) shows **Avg / game**, **Best seen**,
**Bankrupt** and **Pays $0**. **Save wheels** stays off while a chat command or an icon is wrong, and the bar names the
wheel and the problem (`Loser Slots: "!spin" is already the spin command`). Anything else the server refuses comes
back as a `Not saved:` error.

Limits: 32 wheels, 64 slices per wheel; ids up to 40 letters, numbers, `-` and `_`; labels up to 48 characters,
descriptions 140, icons 8.

## Slice effects

| Field            | Dock            | Meaning                                                                                                                                                                                                             |
| ---------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`          | Name field      | Name of the slice on its result card, in the dock and in chat announcements. Printed on slices without money effects.                                                                                               |
| `cash`           | **Cash $**      | Added to the running total.                                                                                                                                                                                         |
| `multiplier`     | **× Total**     | Applied after adding `cash`: `2` doubles the total, `0.5` loses half.                                                                                                                                               |
| `nextMultiplier` | **× Next spin** | Multiplies the cash of the player's next spin (`2` = "×2 next", 1 to 100, `1` = off). Stacks, used up by the next spin, cleared by bankrupt, lost when the game ends: see [the ×N next rule](playing.md#next-rule). |
| `extraSpins`     | **+ Spins**     | Bonus plays on the same wheel or game (0 to 10).                                                                                                                                                                    |
| `bust`           | **Bankrupt**    | The total drops to zero and the game ends.                                                                                                                                                                          |
| `chainWheelId`   | **Then spin**   | Continue on another wheel or game (its default count), keeping the total.                                                                                                                                           |
| `weight`         | **Weight**      | Relative odds. With `sizing: "weight"` the slice size (or the claw's capsule count) matches the odds.                                                                                                               |
| `stock`          | **Stock**       | Remaining quantity (`null` = unlimited). Sold-out prizes leave the wheel.                                                                                                                                           |
| `tier`           | **Tier**        | `common`, `rare`, `epic`, `legendary`, `jackpot`: size of the celebration, colour of the result card and of some slices (below).                                                                                    |
| `description`    | **Description** | Shown under the prize on its result card.                                                                                                                                                                           |
| `icon`           | **Icon**        | Optional emoji or short symbol (8 characters at most) shown by the games: reel symbols, capsules, plinko bins and gifts. The wheel itself does not draw it.                                                         |
| `color`          | -               | Optional `#rrggbb` colour of the slice, and of its prize in the games, overriding the look (set it in `data/config.json`).                                                                                          |

One spin turns the total into `(total + cash × boost) × multiplier`, where `boost` is the armed `×N next` (1 when
none). A slice that itself has `×N next` pays its cash as printed and passes the boost on to the spin after it.

## How money slices look { #how-money-slices-look }

Slices with money effects print their amount, computed from the fields above so the display always matches the
payout. Other slices (prizes, _Bankrupt_, _Lose Half_) print their label. Extra words in the label after the amount
become the caption when nothing else does.

| Slice                                | Printed           | Example                          |
| ------------------------------------ | ----------------- | -------------------------------- |
| `cash: 10`                           | `$10`             | _$10_ (Broke Boi Wheel)          |
| `cash: 1`, `extraSpins: 1`           | `$1` BONUS SPIN   | _$1 + spin_ (Pathetic Wheel)     |
| `multiplier: 2`                      | `×2` TOTAL        | _×2 Total_                       |
| `nextMultiplier: 2`                  | `×2` NEXT         | _×2 Next_                        |
| `extraSpins: 1`                      | `+1` FREE SPIN    | _Free Spin_ (Simp Wheel)         |
| `cash: 50`, label `$50 Jackpot`      | `$50` JACKPOT     | _$50 Jackpot_ (Loser Slots)      |
| `cash: 100`, label `$100/10000 bits` | `$100` 10000 BITS | _$100/10000 bits_ (Loser Wheel)  |
| `nextMultiplier: 2`, `extraSpins: 1` | `×2` NEXT         | _×2 Next + Gift_ (Mystery Gifts) |

Glam prints the amount in white sticker lettering, across the slice (along it when the slice is too thin), and the
caption in small serif capitals toward the hub (an amount without a caption gets a small `$` there instead). Casino
prints the amount at the rim and the caption toward the hub. The games print the same amount and caption on capsules,
plinko bins, the opened gift and the slot machine's display (a reel symbol with an icon shows the icon and the amount
only), so _$5 + Grab_ reads `$5` BONUS SPIN too.

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

Neighbouring slices of the cycle never share a colour, the last and the first included. The games paint each prize
like its slice: reel symbols, capsules, plinko bins and the card that rises out of an opened gift. A gift box's
wrapping paper does not depend on what is inside.

Seven default wheels set `color` on their slices: Pathetic (pinks and white), Loser (red and white), Roulette (red
and black), Angel (lilac and white), All or Nothing (blue and white), Infinity (pastel blue, pink, green and yellow)
and Whale (blues and purples). On light colours, casino turns all the lettering dark; glam keeps the amount in white
sticker lettering, outlined in plum, and turns only the caption dark. A slice without `color` on these wheels follows
the table, like the Pathetic Wheel's _×2 Total_.
