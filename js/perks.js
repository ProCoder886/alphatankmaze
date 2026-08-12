"use strict";
/* ================================================================
   ALPHA TANK : MAZE BOMBERS — js/perks.js
   RUN-SCOPED UPGRADE DRAFT
   ----------------------------------------------------------------
   Three choices at every sector clear.

   Every run in the shipped build was mechanically identical, so there
   was never a reason to push deeper than the last one — which is most
   of why the median session ended at four minutes. A perk is a pure
   function of the player object and a few run flags, so nothing here
   is persisted: the run ends, the build goes with it, and the next run
   drafts a different one. The variance is the point.

   Perks come in two kinds, and the distinction matters:

     · `hull(pl)` mutates the tank. WORLD.reset() builds a brand-new
       Player for every sector and every revive, so these have to be
       replayed onto each one — the whole drafted build is re-applied
       from base stats at the top of every sector.
     · `once()` sets a run-level flag. These must NOT be replayed, or a
       multiplier like the Ordnance Bay blast radius would compound
       once per sector until a single bomb cleared the arena.

   Perks are read in seven places across game.js, tanks.js, powers.js
   and combat.js, all of them guarded with `|| 1` defaults so a run that
   drafts nothing behaves exactly as before.
   ================================================================ */
const PERKS = {
  taken: [],          // ids drafted this run, in order
  offer: [],          // the three currently on screen
  flags: {},          // cross-cutting effects the DEFS cannot apply directly

  DEFS: [
    { id: "ricochet",   name: "BANK SHOT",       color: "#8ffff6", max: 2,
      desc: "Your shells bounce one extra time off steel.",
      hull(pl){ pl.shell.bounces += 1; } },

    { id: "calibre",    name: "HEAVY CALIBRE",   color: "#ffd05c", max: 3,
      desc: "+25% shell damage and +1 brick damage.",
      hull(pl){ pl.shell.dmg = Math.round(pl.shell.dmg * 1.25); pl.shell.brickDmg += 1; } },

    { id: "autoloader", name: "AUTOLOADER",      color: "#ff9a3c", max: 3,
      desc: "18% faster reload.",
      hull(pl){ pl.reload *= 0.82; } },

    { id: "hull",       name: "COMPOSITE HULL",  color: "#7be27a", max: 3,
      desc: "+30 max hull, and repaired to full right now.",
      hull(pl){ pl.maxHp += 30; pl.hp = pl.maxHp; } },

    { id: "lifesteal",  name: "SALVAGE INTAKE",  color: "#7affd6", max: 2,
      desc: "Recover 4 hull from every kill.",
      once(){ PERKS.flags.lifesteal = (PERKS.flags.lifesteal || 0) + 4; } },

    { id: "ordnance",   name: "ORDNANCE BAY",    color: "#ff7a45", max: 2,
      desc: "+2 bomb capacity and 40% wider blasts.",
      hull(pl){ pl.maxBombs += 2; pl.bombs = Math.min(pl.maxBombs, pl.bombs + 2); },
      once(){ PERKS.flags.blast = (PERKS.flags.blast || 1) * 1.4; } },

    { id: "turbine",    name: "TURBINE",         color: "#46e0d8", max: 2,
      desc: "+12% speed, and overdrive recharges twice as fast.",
      hull(pl){ pl.speed *= 1.12; },
      once(){ PERKS.flags.boostRegen = 2; } },

    { id: "capacitor",  name: "CAPACITOR",       color: "#c98aff", max: 3,
      desc: "25% shorter superpower cooldowns.",
      once(){ PERKS.flags.cdMul = (PERKS.flags.cdMul || 1) * 0.75; } },

    { id: "magazine",   name: "DEEP MAGAZINE",   color: "#ffa8d8", max: 2,
      desc: "+1 charge cap on every superpower, and +1 charge now.",
      once(){ PERKS.flags.capBonus = (PERKS.flags.capBonus || 0) + 1; POWERS.grantAll(1); } },

    { id: "scavenger",  name: "SCAVENGER",       color: "#ffe27a", max: 2,
      desc: "Hostiles drop field supplies twice as often.",
      once(){ PERKS.flags.dropMul = (PERKS.flags.dropMul || 1) * 2; } },

    { id: "reactive",   name: "REACTIVE ARMOUR", color: "#7ec8ff", max: 2,
      desc: "Start every sector with a shield.",
      once(){ PERKS.flags.sectorShield = true; } },

    { id: "overwatch",  name: "OVERWATCH",       color: "#b6ff7a", max: 1,
      desc: "A guardian drone escorts you for the rest of the run.",
      once(){ PERKS.flags.permaDrone = true; } },
  ],

  /* Cleared at the start of every run. POWERS caps are restored here
     because DEEP MAGAZINE mutates the shared DEFS table, and a cap that
     leaked between runs would compound forever. */
  reset(){
    this.taken = [];
    this.offer = [];
    this.flags = {};
    if (this._baseCaps) {
      for (let i = 0; i < POWERS.DEFS.length; i++) POWERS.DEFS[i].cap = this._baseCaps[i];
    } else {
      this._baseCaps = POWERS.DEFS.map(p => p.cap);
    }
  },
  count(id){ let n = 0; for (const t of this.taken) if (t === id) n++; return n; },

  /* Effective charge cap for a power: the base, plus DEEP MAGAZINE for
     this run, plus the permanent operator-level unlock. */
  cap(p){
    return p.cap + (this.flags.capBonus || 0) +
      ((typeof META !== "undefined" && META.data && META.has("cap_powers")) ? 1 : 0);
  },

  /* Three distinct perks that still have room to stack. */
  roll(n){
    const want = n || 3;
    const pool = this.DEFS.filter(p => this.count(p.id) < p.max);
    const out = [];
    while (out.length < want && pool.length) {
      const i = (Math.random() * pool.length) | 0;
      out.push(pool.splice(i, 1)[0]);
    }
    this.offer = out;
    return out;
  },
  take(id){
    const p = this.DEFS.find(d => d.id === id);
    if (!p || this.count(p.id) >= p.max) return false;
    this.taken.push(id);
    /* The tank half lands immediately so the choice is felt at once;
       the flag half fires exactly here and nowhere else. */
    if (p.hull && WORLD.player) SAFETY.run(() => p.hull(WORLD.player), null, "perk:" + id);
    if (p.once) SAFETY.run(() => p.once(), null, "perk-once:" + id);
    AUDIO.powerUp();
    if (WORLD.player) fxPickupSparkle(WORLD.player.x, WORLD.player.y, p.color);
    return true;
  },

  /* Applied at the top of every sector by GAME.applyLoadout().

     The drafted build is replayed onto the new tank from base stats:
     WORLD.reset() constructs a fresh Player for every sector and every
     revive, so without this a run's upgrades silently evaporated the
     moment the player pressed Advance. Replaying is safe because each
     hull() is a pure mutation of a freshly built tank — and the flag
     half is deliberately not replayed, or the multipliers would
     compound once per sector. */
  onSectorStart(pl){
    if (!pl) return;
    for (const id of this.taken) {
      const p = this.DEFS.find(d => d.id === id);
      if (p && p.hull) SAFETY.run(() => p.hull(pl), null, "perk-replay:" + id);
    }
    if (this.flags.sectorShield) { pl.shieldHp = 45; pl.shieldT = 12; }
    if (this.flags.permaDrone && !WORLD.drones.some(d => d.perma)) {
      WORLD.drones.push({
        owner: pl, team: pl.team, ang: rand(0, TAU), orbit: 54,
        x: pl.x, y: pl.y, life: 1e9, fireT: 0, tAngle: 0,
        postX: pl.x, postY: pl.y, postT: 0, perma: true,
      });
    }
  },
};
