# ALPHA TANK — MAZE BOMBERS

A complete, dependency-free HTML5 tactical tank combat game: adaptive AI,
destructible mazes, dynamic lighting, procedural audio. No external assets.

Open `index.html` (serve the folder over HTTP, e.g. `python3 -m http.server`)
and hit **Deploy**.

## Project structure

```
index.html          Page markup: canvas, CRT overlay, all UI screens, script loading
css/
  style.css         Tactical console UI: panels, buttons, settings, screens
js/
  crazygames.js     CrazyGames HTML5 SDK v3 integration (account, data, ads, banners)
js/                 Engine, split into 10 modules — load order matters
  config.js         CFG constants, quality tiers, math utilities, seeded RNG, SAVE
  audio.js          Procedural Web Audio SFX, UI feedback, generative adaptive score
  input.js          Keyboard, mouse, gamepad, dual virtual touch sticks
  camera.js         Follow camera, look-ahead, trauma shake, zoom
  effects.js        Pooled particles, FX helpers, 2D lighting, decals, AI hearing
  worldgen.js       Themes, tilemap (DDA raycast), braided maze gen, A* pathfinding
  combat.js         Shells (ricochet), bombs, mines, barrels, pickups, explosions
  tanks.js          Physics chassis, Player, enemy tactical FSM AI, boss phases
  game.js           Adaptive AI Director, WORLD simulation, minimap, game state/waves
  main.js           HUD, render pipeline, UI wiring, auto-quality, main loop, boot
```

The modules are classic scripts sharing top-level globals, so `index.html`
loads them in the order listed above.

## Content

**Superpowers** — seven activated powers on keys **1-7**, on the gamepad
(D-pad, B, Y, R3) and as tap targets on the HUD rack for touch. Each has its
own cooldown and a limited charge count earned by playing: kill streaks,
cleared waves, cleared sectors and boss kills all restock them.

| Key | Power | Effect |
|---|---|---|
| 1 | Booster Bomb | Ring of demolition charges around your tank |
| 2 | Freeze Strike | Flash-freezes every hostile in range |
| 3 | Explosive Shots | Your shells detonate on impact for 12s |
| 4 | Homing Missile | Fire-and-forget missile that hunts the nearest hostile |
| 5 | Time Bomb | Long fuse, very large blast radius |
| 6 | Atomic Strike | Telegraphed strike called down on your aim point |
| 7 | Guardian Drone | Escort drone that fights beside you for 16s |

The rack in the top-right corner shows every power as a coloured circle with
its key, its remaining charges and a cooldown sweep.

**Game modes** — Campaign, Survival, Time Attack, Quick Battle, Endless Run,
Free Run and Training, chosen on the menu's *Operation* tab and remembered
between sessions, along with a deployment **Location** (Random, rotating, or
any of the sixteen zones).

**First-run briefing** — the game always launches onto the command deck,
never straight into a run. A player who has not seen it gets four screens
first: the objective, the controls, the firepower and how to read the arena.
The controls screen shows keyboard or touch instructions depending on the
device in use. It can be skipped from any screen, replayed later from the
*Manual* tab, and the "seen" flag lives in the save — so it travels with the
player's CrazyGames account and a second device never repeats it.

**Audio** — everything is synthesized at runtime; there are still no audio
files. The menu and the briefing have their own unhurried *focus* score,
which crossfades on a bar line into the combat score when you deploy, shifts
to a darker, faster mode with a tritone drone for a boss wave, and drops
behind a filter (rather than cutting out) while the game is paused. A shared
feedback delay gives the whole mix depth, and the music bus filter opens as a
fight escalates. Sector clears, boss kills and run endings land musical
stingers keyed to whatever chord is playing. Every menu control answers with
its own voice — hover, click, select, tab, toggle, back, page turn, deploy,
and a muted thud when a control is disabled.

**Main menu** — one screen holds everything: Operation (mode + location +
optional bonus), Manual, Config and Record are tabs, not separate screens.
The backdrop is an animated command-deck: drifting grid, radar sweep,
rotating wireframe polygons, orbiting glow nodes and a scanning bar, with
layered glow and shadow on the panel. All of it stops under
`prefers-reduced-motion`.

**Hostiles** — thirteen tank classes: grunt, hunter, sniper, bomber, heavy,
scout (fast, rams), artillery (long-range splash), guardian (regenerating
shield), stealth (cloaks between shots), **light tank** (fast skirmisher),
**panzer** (steel-grey medium armour), **MBT** (olive main battle tank, twin
gun) and **support** (teal; repairs nearby hostiles). Five bosses rotate
across sectors: Command Unit, Titan Walker (ground-slam shockwaves), Siege
Platform (mortar barrage), Phantom Prototype (cloaks and blinks) and
**Overlord** (all four attack patterns).

**Emplacements** — static hostile structures spread across the arena with a
minimum spacing so it never feels crowded: **gun nests** that track and fire,
**lighthouses** whose sweeping beam reveals you to the AI, and **bunkers**
that soak damage. The HUD shows a live destroyed / total counter and clearing
them all pays a bonus.

**Arenas** — sixteen locations (including pink, orange, dark-green and black
zones) and eight arena shapes (grid, diamond, rotunda,
wedge, pentagon, hexagon, octagon, crossroad). Alongside brick there is
reinforced stone, which needs a real blast, and watchtowers, which never fall
and block line of sight.

Every generated arena is **repaired until it is fully drivable**: after the
maze, the rooms, the brick/stone scatter and the watchtowers are placed, any
pocket of floor a tank cannot drive to gets a breach corridor cut through the
destructible walls between it and the arena, two tiles wide so a squad drives
in abreast instead of queueing single file. Hostiles are then only ever
deployed into cells that are drivable from the player's position, so a wave can
never become unclearable and no tank can be stranded behind a wall it does not
break. Checking whether you could *shoot* your way into a pocket is not the
same question, and answering that one instead is what used to leave hostiles
jammed at the arena edge on every non-rectangular shape.

**Rewards** — kill-streak power charges, wave and sector-clear charges, boss
drops, salvage from crates, and four optional rewarded-ad offers (supply drop,
double clearance bonus, ordnance resupply, armour refit, salvage haul, revive
and emergency respawn) that rotate so the same prompt never repeats. Each has
an equal-value salvage alternative, except the salvage haul which is simply
skippable.

## CrazyGames SDK integration

The game integrates the [CrazyGames HTML5 SDK v3](https://docs.crazygames.com/sdk/intro/).
All SDK access is funnelled through `js/crazygames.js` (the `CG` object), so the
game stays fully playable when the SDK is absent, running off-platform
(`environment === "disabled"`), or blocked by an adblocker.

## CrazyGames account integration

The CrazyGames account is the **only** account this game has, per the
[account integration requirements](https://docs.crazygames.com/requirements/account-integration/).
There is no in-game account, no in-game username or avatar, no login form, no
external login provider and no log-out. The implemented scenario is **"Use
CrazyGames profile"**: the game has no back-end, so the player's identity is
read from the user module and all progress lives in the data module.

### Identity — SDK `user` module

| Requirement | How it is met |
|---|---|
| Check availability before any account call | `user.isUserAccountAvailable` is read first; when it is false (the game embedded on another domain) no account UI renders at all |
| Request the current account **every** launch | `user.getUser()` runs inside `CG.init()`, before any save data is read, so a shared device and a changed username/avatar are both picked up |
| Show the player's profile | The top-right card on the menu shows the CrazyGames username and `profilePictureUrl`; a broken avatar hides itself and leaves the name |
| Guests can play everything | A signed-out player is a guest — no gate, no prompt, nothing withheld |
| Login button allowed, but not the main CTA | Top-right corner, plain `.btn.small`, visually quieter than **Deploy**; it is the only entry point to `user.showAuthPrompt()` |
| Never open the auth prompt automatically | `showAuthPrompt()` is called from that button and nowhere else; `userCancelled`, `userAlreadySignedIn` and `showAuthPromptInProgress` are all handled |
| Detect a sign-in during play | `user.addAuthListener` re-reads the profile from the data module, refreshes the menu and tells the player in-run — the run is never interrupted |
| Log-out | Nothing to do: the platform reloads the page, so the game restarts from the menu |
| Friends | `user.listFriends()` fills the friends list in the *Record* tab (one active call, 250 ms apart, page size clamped to 1-50) |
| `userId` | Kept only to notice that a *different* account now owns the session; never used to authenticate anything, as `__dangerousUserId` must not be trusted |
| `getUserToken()` | Wrapped as `CG.account.token()`. Progress lives in the data module and this build has no back-end, so nothing calls it during play — it is the documented hook for linking a server account to a CrazyGames `userId`. It is never decoded client-side and never stored |

### Progress — SDK `data` module

Progress, settings, records, lifetime stats and salvage are one JSON document
saved through the data module, which syncs it across every device the player
signs in on. The requirement is to rely on it *fully* — for guests as well as
signed-in players — and not keep a local save beside it, so:

* the game never writes its own `localStorage` entry while the SDK is present;
* guest progress is handled by the SDK itself (it stores guests locally and
  moves that data onto the account the first time a guest signs in, which is why
  no linking or merging code is needed here);
* a save written by an older build of this game is copied into the data module
  **once**, on first run after the update, and never read again — existing cloud
  data always wins and is never overwritten;
* `dataModuleDisabled` (the *Progress Save* toggle missing from the submission
  flow) falls back to `localStorage` and says so in the console rather than
  silently losing every save.

`localStorage` is otherwise touched in exactly one case: no SDK on the page at
all — a self-hosted or offline copy of this repository — where there is no data
module to rely on.

### Local testing

Served from `localhost` / `127.0.0.1` the SDK returns its documented hardcoded
values, so every path can be exercised without deploying:

```
?user_response=logged_out           play as a guest (shows the login button)
?user_response=user2                a different account
?show_auth_prompt_response=user2    what the login button signs you in as
?show_auth_prompt_response=user_cancelled
?user_account_available=false       the game embedded on another domain
```

### Where ads appear

| Placement | Type | Trigger |
|---|---|---|
| Sector transition (**Advance**) | midgame | Level change — skipped if a rewarded ad just played |
| Restart after death (**Redeploy**) | midgame | Map change after the player died |
| Pre-deployment supply drop | rewarded | Player taps the offer on the main menu |
| Double clearance bonus | rewarded | Player taps the offer on the sector-cleared screen |
| Field repair drone (revive) | rewarded | Player taps the offer on the game-over screen |
| Main menu / game-over banner | responsive banner | Static screens only, never during play |

Ads are never triggered by navigational buttons (settings, records, menu), never
appear during active gameplay, and are never chained.

### Rewarded-ad rules honoured

* Every reward is **optional** — the normal Deploy / Advance / Redeploy buttons
  are always visible and use the same `.btn` styling.
* The ad button and the no-ad button are **identical** in size, font, colour,
  padding and letter-spacing; only a video glyph marks the ad option.
* Every reward has a **non-ad alternative**: salvage, earned from salvage crates
  and cleared sectors, buys exactly the same bonus.
* Rewards are granted **only** on the `adFinished` callback. On `adError` the
  player keeps playing and is told no ad was available.
* Offers are disabled with a visible reason while on cooldown (45 s), when an
  adblocker is detected, and hidden entirely off-platform — never clickable
  without effect.
* The UI is blocked from ad request until `adFinished`/`adError`, and audio is
  muted only once `adStarted` fires. A watchdog guarantees the game can never
  freeze waiting on an ad callback.

### Other SDK modules

* **game** — `loadingStart`/`loadingStop` at boot, `gameplayStart`/`gameplayStop`
  on every deploy, pause, resume, revive, sector end and death, `happytime` on a
  boss kill or new personal best, `reportGameCompletedPercentage` (sector 10 =
  100 %), `setGameContext`/`clearGameContext`, and the platform `muteAudio`
  setting applied at the master audio bus.
* **data** / **user** — see [CrazyGames account integration](#crazygames-account-integration)
  above. System info also supplies the device type, which picks the starting
  render-quality tier.
* **ad** — `hasAdblock` detection that gates only the ad-reward path, never play.

### Basic Launch behaviour

Ads are disabled platform-side during Basic Launch. The first `adError` with
code `adsDisabledBasicLaunch` permanently removes every ad button for the
session and stops further ad requests, so no rewarded button is ever clickable
without effect and nothing freezes between levels. The salvage path keeps all
bonuses reachable.

## Platform requirements compliance

| Requirement | How it is met |
|---|---|
| Readable at `devicePixelRatio: 1` on all listed iframe sizes | HUD scales with the viewport (`UIS`), verified from 800×450 to 1920×1080 |
| Consistent physics across refresh rates | Fixed 1/60 s timestep; hit-stop measured in seconds, not frames |
| Mouse must not leave the game frame | Pointer Lock during gameplay with a custom crosshair; ESC releases it |
| No page scroll / stray context menu | `wheel` and document-level `contextmenu` are prevented |
| Backgrounded tab | `visibilitychange` and `blur` pause the game and drop held input |
| iOS audio after interruption | `AudioContext` resumed from `touchend`/`click`, handling `interrupted` |
| Mobile selection / magnifier | `user-select` (all prefixes), `-webkit-touch-callout`, `touch-action: none` |
| CrazyGames App safe areas | `env(safe-area-inset-*)` applied to menus and to the canvas HUD |
| Land in gameplay fast | Single click from menu to gameplay; `gameplayStart` fires at real play. A first-time player sees the four-screen briefing first, skippable in one tap and never shown again |
| Chromebook / low-end devices | Four quality tiers (Ultra default on desktop); phones and tablets step down to High, and the floor/decal buffers scale with the tier |
| Whole arena visible | Minimap sits in the top-right corner and always fits the full map |
| Landscape only on phones | A rotate gate pauses the game and asks the player to turn the device; the layout compacts for short landscape screens and touch targets grow |
| No custom fullscreen button, no cross-promotion, no external ads | None present |
| AZERTY keyboards | Movement reads physical key codes, so WASD maps to ZQSD |

No sitelock is applied, since this repository is also intended to be playable
from its own hosting. Add the `isCrazyGames()` domain check from the Sitelock
guide if you want to restrict the build to CrazyGames domains.
