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
