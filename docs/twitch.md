# Twitch

## Connect Twitch chat

In the dock: **Settings → Twitch chat → Channel** = your channel name → **Save settings**. The badge turns
**connected** (reading chat needs no login). Try it in your chat:

| Type in chat           | What happens                                                       |
| ---------------------- | ------------------------------------------------------------------ |
| `!spin`                | You play the active wheel                                          |
| `!slots`               | You play Loser Slots (every wheel can have its own command)        |
| `!spin @friend 5 simp` | Mods: friend plays 5 spins on Simp Wheel (any order, all optional) |
| `!slots @friend 5`     | Mods: friend plays 5 pulls on Loser Slots                          |
| `!raffle open`         | Mods: open the raffle (`!raffle close` stops entries)              |
| `!join`                | Anyone: enter the raffle (subscribers get 2 tickets)               |
| `!raffle draw`         | Mods: draw a winner, who then spins The Grand Wheel                |

By default only mods and the broadcaster can play from chat. To let viewers type `!spin` and the wheel commands,
set **Who can spin** to _Everyone_, _Subscribers_ or _VIPs_.

<div class="grid-shots" markdown>

![Dock Twitch chat settings, connected](images/setup-dock-twitch.jpg){ width="380" }

![Raffle wheel filled with entrants and the !join badge](images/overlay-raffle.jpg){ width="420" }

</div>

## Chat commands { #chat-commands }

The bot reads the first word of each message, in any case. **Settings → Twitch chat → Spin command** (`!spin`)
plays the active wheel (the chip picked in the dock's **Play** tab). Every wheel can also have its own command,
which plays that wheel or game. The default wheels come with these:

| Command         | Wheel or game              | Wheel id         | Plays per game |
| --------------- | -------------------------- | ---------------- | -------------- |
| `!brokeboi`     | Broke Boi Wheel            | `broke-boi`      | 3 spins        |
| `!pathetic`     | Pathetic Wheel             | `pathetic`       | 3 spins        |
| `!simp`         | Simp Wheel                 | `simp`           | 3 spins        |
| `!loser`        | Loser Wheel                | `loser`          | 3 spins        |
| `!roulette`     | Roulette Wheel             | `roulette`       | 1 spin         |
| `!angel`        | Angel Wheel                | `angel`          | 1 spin         |
| `!allornothing` | All or Nothing             | `all-or-nothing` | 1 spin         |
| `!infinity`     | Infinity Wheel             | `infinity`       | 1 spin         |
| `!whale`        | Whale Wheel                | `whale`          | 2 spins        |
| `!slots`        | Loser Slots (slot machine) | `loser-slots`    | 3 pulls        |
| `!claw`         | Loser Claw (claw machine)  | `loser-claw`     | 3 grabs        |
| `!drop`         | Simp Drop (plinko)         | `simp-drop`      | 3 drops        |
| `!gift`         | Mystery Gifts              | `mystery-gifts`  | 1 gift         |
| `!grand`        | The Grand Wheel            | `grand`          | 1 spin         |
| none            | Prize Vault                | `prize-vault`    | 1 spin         |
| none            | Dare Wheel                 | `dares`          | 1 spin         |

The Prize Vault and the Dare Wheel have no command: players reach them through The Grand Wheel, or a mod names
them (`!spin @friend dares`). Each wheel's slices and odds are on [Wheels & prizes](wheels.md); the games are
described in [Playing](playing.md#games).

**Mods and the broadcaster** can add, in any order:

- a player: `@friend` or a bare name (the first word that is not a count or a wheel id). Without one, the mod
  plays;
- a count of 1 or 2 digits: the plays in this game, up to **Settings → Spin → Max spins per turn** (30 by
  default). Without one, the wheel's default;
- a wheel id in any case, after `!spin` only (`!spin simp`). A wheel command always plays its own wheel, so
  `!slots simp` plays Loser Slots.

**Who can spin** (even _Broadcaster only_), the cooldown and the queue check never stop mods.

**Viewers** need the rank set in **Who can spin** (_Everyone_, _Subscribers_, _VIPs_, _Moderators_ or
_Broadcaster only_; _Moderators_ by default). They always play the wheel's default count, as themselves, and
anything after the command is ignored. A viewer who already waits in the queue is ignored, and so is a viewer
within **Cooldown (s)** (60 by default) of their last game: one cooldown per viewer, shared by `!spin` and every
wheel command. Refused commands get no reply.

Every game from chat goes through the dock's **Queue**: it starts at once when nothing is playing (and **Play the
queue automatically** is on), otherwise it waits its turn.

To change or remove a wheel's command, open the dock's **Wheels** tab, pick the wheel, edit **Chat command** (empty
it to remove the command), then **Save wheels**. A command is `!` followed by up to 24 letters, numbers, `-` or `_`
(the dock lowercases it), and cannot be the spin command, the raffle keyword, `!raffle` or another wheel's
command. **Settings → Twitch chat** lists the current commands under _Game commands work the same way_.

## Announce results in chat (optional)

FinWheel posts with the account that owns the token (your channel or a bot account):

1. Turn on 2FA (Twitch **Settings → Security and Privacy**), then
   [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) → **Register Your Application**: any unique
   name, OAuth Redirect URL `http://localhost` → **Add**, Category _Chat Bot_, Client Type _Confidential_ →
   **Create**. Click **Manage** and copy the **Client ID**.
2. Logged in as the posting account, open this URL with your Client ID, then **Authorize**:

   ```text
   https://id.twitch.tv/oauth2/authorize?response_type=token&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost&scope=chat:read+chat:edit
   ```

   The page fails to load; its address bar shows `http://localhost/#access_token=abc123…&scope=…`. Copy only
   the part between `access_token=` and `&`.

3. In the `finwheel` folder, copy the example settings, then remove the `# ` in front of the two `TWITCH_`
   lines and fill them in:

   ```bash
   cp .env.example .env
   ```

   ```ini
   TWITCH_BOT_USERNAME=yourbot
   TWITCH_OAUTH_TOKEN=abc123yourtoken
   ```

   `TWITCH_BOT_USERNAME` is the login of the account you authorized. Restart `npm start`; the Twitch chat card
   no longer says _read-only_. Bot account? Type `/mod yourbot` in your chat so slow or followers-only mode can't
   block it.

With the token set and **Settings → Twitch chat → Announce results in chat** on, the bot posts results (it never
answers commands):

| When                       | Chat message                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A money game ends          | `💰 @Ana walks away with $19!`                                                                                               |
| A money game ends bankrupt | `💀 @Ana hit Bankrupt and lost $25!`                                                                                         |
| A prize, dare or category  | `🎰 @Ana won Loser Slots! Spinning again…`                                                                                   |
| Raffle                     | `🎟️ The raffle is open! Type !join to enter.`, `🎟️ The raffle is closed — 12 entries. Good luck!`, `🎟️ Ana wins the raffle!` |

The token lasts about 60 days. Check it with
`curl -H "Authorization: OAuth abc123yourtoken" https://id.twitch.tv/oauth2/validate`; when the badge says
**error**, chat commands stop too: repeat step 2 of [Announce results in chat](#announce-results-in-chat-optional), update `.env`, restart.

## Channel points and bits (optional, Affiliate/Partner)

- **Channel points:** [Creator Dashboard](https://dashboard.twitch.tv) → **Viewer Rewards → Channel Points →
  Manage Rewards → Add New Custom Reward**, turn on **Require Viewer to Enter Text** (other rewards never reach
  chat). Redeem it once, then in the dock **Settings → Channel points** click **Map**, pick a wheel,
  **Save settings**.
- **Bits:** **Settings → Cheers** → enable _Bits trigger a spin_, set the minimum and the wheel, **Save settings**.

A reward or a cheer can play any wheel or game (bits play the active wheel unless you pick one). The viewer plays
the wheel's default count; the cooldown, **Who can spin** and the queue check do not apply.
