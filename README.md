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
