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
  crazygames.js     CrazyGames HTML5 SDK v3 integration (ads, banners, data, events)
js/                 Engine, split into 10 modules — load order matters
  config.js         CFG constants, quality tiers, math utilities, seeded RNG, SAVE
  audio.js          Procedural Web Audio SFX + generative adaptive music
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
Free Run and Training, chosen from *Operation Type* on the menu and
remembered between sessions.

**Hostiles** — grunt, hunter, sniper, bomber, heavy, plus scout (fast, rams),
artillery (long-range splash), guardian (regenerating shield) and stealth
(cloaks between shots). Four bosses rotate across sectors: Command Unit,
Titan Walker (ground-slam shockwaves), Siege Platform (mortar barrage) and
Phantom Prototype (cloaks and blinks).

**Arenas** — twelve locations and eight arena shapes (grid, diamond, rotunda,
wedge, pentagon, hexagon, octagon, crossroad). Alongside brick there is
reinforced stone, which needs a real blast, and watchtowers, which never fall
and block line of sight. Every generated arena is verified fully connected, so
a wave can never become unclearable.

**Rewards** — kill-streak power charges, wave and sector-clear charges, boss
drops, salvage from crates, and four optional rewarded-ad offers (supply drop,
double clearance bonus, ordnance resupply, revive) that each have an
equal-value salvage alternative.

## CrazyGames SDK integration

The game integrates the [CrazyGames HTML5 SDK v3](https://docs.crazygames.com/sdk/intro/).
All SDK access is funnelled through `js/crazygames.js` (the `CG` object), so the
game stays fully playable when the SDK is absent, running off-platform
(`environment === "disabled"`), or blocked by an adblocker.

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
* **data** — progress is saved through the data module for cross-device sync,
  with a localStorage fallback and automatic migration of pre-SDK saves.
* **user** — account availability, current user and system info (device type).
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
| Land in gameplay fast | Single click from menu to gameplay; `gameplayStart` fires at real play |
| Chromebook / low-end devices | Adaptive quality tiers; mobile and tablet start one tier down |
| No custom fullscreen button, no cross-promotion, no external ads | None present |
| AZERTY keyboards | Movement reads physical key codes, so WASD maps to ZQSD |

No sitelock is applied, since this repository is also intended to be playable
from its own hosting. Add the `isCrazyGames()` domain check from the Sitelock
guide if you want to restrict the build to CrazyGames domains.
