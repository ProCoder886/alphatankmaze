"use strict";
/* ================================================================
   ALPHA TANK : MAZE BOMBERS — js/coldopen.js
   THE SCRIPTED FIRST NINETY SECONDS
   ----------------------------------------------------------------
   The four-screen briefing taught well and converted badly: it asked a
   stranger to read six hundred words before they had a tank, and two
   thirds of them left instead. This teaches the same material by
   handing them the tank first and firing each lesson off the state that
   makes it relevant — you learn what a bomb is for while standing in
   front of a wall, not on a panel three screens earlier.

   Armed once, by autoDeploy(), for a save that has never onboarded. It
   disarms when the first sector is cleared and sets `onboarded` then,
   so the flag now means "has finished a first fight", which is what it
   was always supposed to mean.

   Nothing here is reachable in any later session, and nothing here
   changes a mode, a tier or a rule — it only softens the first wave and
   chooses when to speak.
   ================================================================ */
const COLDOPEN = {
  on: false,
  t: 0,
  beat: 0,
  firstKill: false,

  arm(){ this.on = true; this.t = 0; this.beat = 0; this.firstKill = false; },
  disarm(){
    if (!this.on) return;
    this.on = false;
    SAVE.data.onboarded = true;
    SAVE.persist();
  },

  /* Wave composition override. The generated first wave is still five or
     six tanks even on adaptive; a stranger needs three, spread out, of a
     class whose behaviour is legible from watching it once. */
  composition(wave){
    if (!this.on) return null;
    if (wave === 1) return ["grunt", "grunt", "grunt"];
    if (wave === 2) return ["grunt", "hunter", "scout", "grunt"];
    return null;                      // wave 3 onward generates normally
  },

  /* Called every fixed step from GAME.update. Beats fire in order and
     once each, every one gated on something the player can see rather
     than on a stopwatch. */
  update(dt){
    if (!this.on || GAME.state !== "playing") return;
    this.t += dt;
    const pl = WORLD.player;
    if (!pl || !pl.alive) return;

    // 1. Drive. Said once they have had a few seconds to be confused.
    if (this.beat === 0 && this.t > 3) {
      this.beat = 1;
      GAME.hint("co-move", INPUT.usingTouch
        ? "DRAG ANYWHERE ON THE LEFT TO DRIVE"
        : "W A S D TO DRIVE");
    }
    // 2. Fire — but only once something is actually in view to fire at.
    if (this.beat === 1 && WORLD.enemies.some(e =>
        e.alive && e.spawnT <= 0 && !WORLD.map.raycast(pl.x, pl.y, e.x, e.y).hit)) {
      this.beat = 2;
      GAME.hint("co-fire", INPUT.usingTouch
        ? "DRAG THE RIGHT SIDE TO AIM — HOLD TO FIRE"
        : "HOLD LEFT MOUSE TO FIRE");
      GAME.slowmo(0.55, 0.8);           // a beat to register the threat
    }
    // 3. Bombs, taught against a wall rather than in the abstract.
    if (this.beat === 2 && this.firstKill) {
      this.beat = 3;
      GAME.showBanner("HOSTILE DOWN", "Brick walls break — blast your own routes", 2.4);
      GAME.hint("co-bomb", INPUT.usingTouch
        ? "TAP THE LEFT SIDE TO DROP A BOMB — IT EXCAVATES BRICK"
        : "SPACE DROPS A BOMB — IT EXCAVATES BRICK");
    }
    // 4. Powers, once the rack holds enough to be worth spending.
    if (this.beat === 3 && this.t > 30 && POWERS.total() >= 3) {
      this.beat = 4;
      POWERS.grant("booster", 1);
      GAME.hint("co-power", INPUT.usingTouch
        ? "TAP A POWER CIRCLE, TOP RIGHT — IT LANDS ON YOUR AIM"
        : "KEYS 1-7 FIRE SUPERPOWERS — THEY LAND ON YOUR CROSSHAIR");
    }
  },

  /* Hooked from GAME.onEnemyDead. The first kill of a first session
     always drops something: an empty first kill teaches that killing is
     not worth doing, which is the opposite of the lesson. */
  onKill(e){
    if (!this.on || this.firstKill) return;
    this.firstKill = true;
    spawnPickup(e.x, e.y, "repair");
  },
};
