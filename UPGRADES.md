# ALPHA TANK — MAZE BOMBERS · Upgrade Roadmap

Thirty proposed upgrades across three tracks, written against the current
codebase — each one names the system it plugs into, so the implementation
path is already known before any work starts.

Nothing here is implemented yet. This document is the agreed plan.

---

## 🎮 10 New Main Game Upgrades

*Retention, session length, repeat visits, hook from the first minute*

### 1. Between-Sector Perk Draft (roguelite build loop)
After every sector clear, offer 3 random run-scoped upgrades — +1 shell ricochet, wider bomb radius, faster reload, lifesteal on kills — picked in the existing `levelComplete()` screen beside the ad offer. This is the single biggest retention lever: every run becomes a different build, and "one more run" comes from wanting a different one.

### 2. Operator Progression & Unlock Ladder
Award XP for kills, sectors and objectives, stored in the data module next to `SAVE.data.stats`, with each level unlocking a concrete thing (a chassis, a mode, a higher power cap). A visible always-advancing bar means no run is ever wasted, even a bad one.

### 3. Tank Garage — Multiple Playable Chassis
Add Scout / Assault / Siege hulls with real trade-offs (speed vs armour vs bomb capacity), bought with salvage and defined exactly like the `ENEMY_TYPES` stat blocks. Cheap to build because the chassis system already exists, and it multiplies replay value across every mode shipped.

### 4. Daily Operation — One Seeded Arena For Everyone
`genLevel()` already accepts a seed, so derive it from the date and every player worldwide gets the identical maze, shape and zone for 24 hours. One scored attempt per day is the strongest "come back tomorrow" mechanic in browser gaming.

### 5. Contracts — Daily & Weekly Missions
Three rotating objectives ("40 bomb kills", "clear a sector undamaged", "level 3 HQs"), each paying salvage and XP, tracked off the stats already collected in `GAME.stats`. Checklists convert aimless play into intentional sessions and reliably lift sessions-per-week.

### 6. Superpower Mastery Tracks
Every use and kill with each of the 7 powers accrues mastery that unlocks permanent buffs — extra charge cap, shorter cooldown, larger radius. It turns a fixed power set into a long-term progression surface players grind toward deliberately.

### 7. Deep Sector — Endless Ladder With Banked Checkpoints
A mode that never resets: reach sector 15, bank it, and resume from that checkpoint in the next session via the data module. This converts one long session into a multi-day commitment, which is exactly what cross-device cloud saves are for.

### 8. Boss Rush + Boss Of The Week
The five bosses already exist with distinct attack sets; chain them in a dedicated ladder with escalating modifiers and rotate a bonus-paying "boss of the week". It gives veterans high-intensity content once the campaign is exhausted, plus a weekly return hook.

### 9. Threat Rating & Red Zone Sectors
Persist `DIRECTOR.skill` between runs as a visible Threat rating, and let high threat unlock higher-paying Red Zone sectors with elite enemy variants. Mastery becomes visible status rather than a hidden number, which is what makes players chase it.

### 10. Authored First-Run Cold Open + Anti-Quit Safety Net
Script the first 60 seconds — full power rack free, a telegraphed wall-breach moment, a guaranteed near-death save, a boss silhouette on the horizon — and add a pity system that improves drops after repeated deaths. First-session retention is decided in the first minute, and the game currently opens on a generic wave.

---

## 💎 10 New Exclusive & Unique Upgrades

*Features no other tank/maze game in this category has*

### 1. Arena Scar Memory — Your Destruction Persists
`DECALS` and destroyed tiles are currently thrown away every sector; instead persist a compact scar map per zone so a returning arena still shows the craters, rubble and burn marks left behind. No maze shooter remembers what the player did to the world — this makes the arena feel like *your* battlefield.

### 2. Sound As A Weapon — True Acoustic Stealth
The `NOISES` system already gives enemies hearing, but the player cannot see it; expose it as a visible noise ring, add a silent "prowler" crawl and throwable decoy noisemakers. Every engagement becomes a loud-or-quiet decision, which is unheard of in arcade tank games.

### 3. Music That Composes Around Your Playstyle
`AUDIO._musicStep()` already gates layers by combat intensity — extend it to shift key, scale and instrumentation based on the player's aggression profile. A stealth player and a rusher would literally hear different soundtracks, generated live with zero audio files.

### 4. The AI Director As A Named On-Screen Antagonist
Surface the hidden `DIRECTOR.skill` model as "OVERSEER", a commander who taunts the player and announces counter-measures ("You favour bombs — deploying blast shielding"). Being *watched and adapted to* by a named intelligence is psychologically far stickier than any difficulty slider.

### 5. Rewind Ghost Of Your Own Best Run
Record a sparse position track of the best run per zone into the data module and replay it as a translucent ghost tank racing the player in real time. Ghosts are standard in racing games and essentially nonexistent in maze tank shooters.

### 6. Shareable Arena Seed Codes
`genLevel(level, {seed, shape, theme})` is already fully parameterised, so expose a 6-character code that reproduces any exact arena. Instant user-generated content and viral sharing for almost no new code.

### 7. Structural Collapse — The Maze As A Weapon
Give stone and watchtower tiles structural roles so destroying a support collapses an entire span onto whatever is underneath it. It turns walls from cover into ordnance and produces the spectacular emergent moments players clip and share.

### 8. Boss Abilities Looted From Boss Kills
Killing a boss lets the player keep one of its signature attacks — shockwave, blink, barrage — as a temporary 8th power slot for the rest of the run. Wielding the thing that just nearly killed you is a uniquely satisfying trophy loop.

### 9. Friend Ghosts & Score Haunts Via The CrazyGames Account
The friends list is already fetched — drop a friend's best-run marker and score line into the arena as a live target to beat. Real social pressure with zero multiplayer netcode and no servers.

### 10. 120-Second Blitz Fragment With An Auto-Generated Result Card
A daily two-minute arena with one authored twist, ending in a canvas-rendered result card built for sharing. Short-session dopamine plus built-in virality, in a genre that almost exclusively ships long runs.

---

## 🎨 10 New UI & Visual Upgrades

*All additive polish layers — the existing layout, panels and structure stay exactly as they are*

### 1. Zone-Reactive Menu Theming
Drive the CSS custom properties (`--friend`, `--hostile`, `--edge`) from the selected deployment zone so choosing Crimson Waste or Cryo Vault recolours the entire menu. Identical layout, sixteen distinct moods, and it makes the zone picker feel consequential.

### 2. Depth Pass — Layered Shadows & Inner Glow
Give `.panel`, `.mode-card` and `.offer` a soft ambient shadow, a tight contact shadow and a 1px inner highlight so the chamfered glass reads as physical hardware. Pure CSS, no markup change, and it instantly lifts perceived production value.

### 3. Unified Magnetic Hover Language
Extend the sweep `.mode-card` already has into a consistent hover treatment across `.btn`, `.tab` and the account chip — 2px lift, brightened edge, cursor-tracking specular highlight. Rich hover feedback is the fastest way to make a UI feel expensive.

### 4. Animated Count-Up On All Result Screens
Score, kills and accuracy currently appear as finished text; roll them up with easing, staggered rows and a ticking sound. This is the highest-value dopamine upgrade available in the whole interface and takes very little code.

### 5. Screen Transition Choreography
Replace the flat 0.28s fade with an authored sequence — panel slides out, HUD elements fly in from their own screen edges, a brief scanline wipe. Entering a run should feel like a launch, not a cut.

### 6. Animated Mode Card Previews
On hover or focus, each mode card plays a tiny live diagram of what it is: two squads converging, a clock draining, waves stacking. Players choose modes they can visualise, which raises mode variety per session.

### 7. Progression Toast Stack
A small queued top-right stack for "Contract complete", "Level 7 — Panzer unlocked", "New personal record", auto-dismissing in sequence. Progression that is not announced does not register psychologically, no matter how much of it is awarded.

### 8. Telemetry-Grade HUD Bars & Directional Damage
Add tick marks, segment dividers and a glass sheen to the hull/boost bars, plus directional damage arcs at the screen edges. It reads as more professional *and* removes the "where did that shot come from" frustration.

### 9. Records Tab As A Dashboard
Turn the two plain text lines into a compact dashboard: a sparkline of the last 20 run scores, per-mode bests, and a zone heat grid. Visualised history makes past effort feel owned, which is what pulls players back to a save file.

### 10. Motion-Safe Micro-Interaction Pass
Button press ripple, sliding tab underline, offers that expand rather than snap, accent-matched focus rings — each with a `prefers-reduced-motion` fallback. Twenty small motions accumulate into one unmistakably professional product.

---

## Suggested build order

If only three ship first: **Perk Draft (Main #1)** + **Daily Operation (Main #4)** +
**Count-Up Result Screens (UI #4)**. That combination hits the three distinct
psychological loops — build variety within a run, a reason to return tomorrow,
and reward feedback at the moment of highest emotion — for the least code.

A sensible staging after that:

| Stage | Contents | Why this order |
|---|---|---|
| 1 | Main 1, 4 · UI 4, 7 | Core loop + the feedback that makes progression visible |
| 2 | Main 2, 5, 6 | Meta progression, once there is something to award it for |
| 3 | Main 3, 9, 10 · UI 1, 2, 3, 10 | Content breadth and the presentation pass |
| 4 | Main 7, 8 · Exclusive 6, 8, 10 | Long-tail modes for players who finished the campaign |
| 5 | Exclusive 1, 2, 3, 4, 5, 7, 9 · UI 5, 6, 8, 9 | The differentiators, on a proven base |

## Technical constraints found in the codebase

- The CrazyGames data module caps storage at **1MB per player**, so the ghost
  recordings (Exclusive #5) and scar maps (Exclusive #1) need sparse sampling
  and quantised coordinates rather than raw position dumps.
- Anything social must stay inside the CrazyGames account system. Friend ghosts
  and score haunts work, but a custom login or an external leaderboard account
  would breach the account-integration requirements the game already implements.
- The arena generator guarantees every floor cell is drivable from the player's
  spawn. Structural collapse (Exclusive #7) only ever opens tiles, so it cannot
  break that guarantee — but scar memory (Exclusive #1) must replay its scars
  **before** the connectivity pass, not after.
