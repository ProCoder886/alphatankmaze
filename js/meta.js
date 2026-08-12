"use strict";
/* ================================================================
   ALPHA TANK : MAZE BOMBERS — js/meta.js
   EVERYTHING THAT SURVIVES A RUN
   ----------------------------------------------------------------
   The shipped build stored ten scores and a pile of lifetime counters,
   and gave a player who had just finished a run no reason at all to
   open the tab tomorrow. That is what a 1.2% day-one retention and a
   2.16% return rate look like from the inside.

   This module is the reason to come back:

     · an operator level that always advances, so no run is wasted
     · a daily operation — the same maze, shape and zone for every
       player in the world for 24 hours, because genLevel() is already
       a pure function of its seed
     · a streak with a cost to breaking it
     · three daily contracts, scored off stats the game already keeps
     · a sector checkpoint, so death is a setback rather than a reset

   All of it lives inside SAVE.data.meta, so it travels through the
   CrazyGames data module to every device the player signs in on — no
   second account system, no external leaderboard, one extra key in the
   existing save document, comfortably inside the 1MB cap.
   ================================================================ */
const META = {
  data: null,          // alias to SAVE.data.meta

  defaults(){
    return {
      xp: 0, lvl: 1,
      checkpoint: 0,
      unlocks: [],
      daily: { day: 0, played: false, best: 0, streak: 0, lastDay: 0 },
      contracts: { day: 0, list: [] },
    };
  },
  /* Called at boot and again whenever a different CrazyGames account
     takes over the session, since that swaps the whole save document. */
  bind(){
    const base = this.defaults();
    const cur = SAVE.data.meta;
    SAVE.data.meta = (cur && typeof cur === "object") ? Object.assign(base, cur) : base;
    this.data = SAVE.data.meta;
    /* Nested objects survive Object.assign as whole replacements, so a
       save written by an older build can arrive missing their newer
       fields. Fill them rather than trusting the shape. */
    this.data.daily = Object.assign(base.daily, this.data.daily || {});
    this.data.contracts = Object.assign(base.contracts, this.data.contracts || {});
    if (!Array.isArray(this.data.unlocks)) this.data.unlocks = [];
    this.rollDailyIfNeeded();
  },

  /* ---- the day, in UTC so every player shares one ---- */
  dayKey(){
    const d = new Date();
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  },
  msToReset(){
    const n = new Date();
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1) - n.getTime();
  },
  hoursToReset(){ return Math.max(1, Math.ceil(this.msToReset() / 3.6e6)); },
  /* One line of arithmetic is the whole daily-operation feature: the
     generator is deterministic, so the same key reproduces the same
     maze, arena shape and deployment zone for everyone, everywhere. */
  dailySeed(){ return (this.dayKey() * 2654435761) >>> 0; },

  /* ---- operator level ---- */
  XP_CURVE(lvl){ return Math.round(400 * Math.pow(1.28, Math.max(0, lvl - 1))); },
  UNLOCKS: {
    2:  { id: "mode_survival", label: "SURVIVAL unlocked" },
    3:  { id: "cap_powers",    label: "Deeper ordnance racks" },
    5:  { id: "mode_basewar",  label: "BASE ASSAULT unlocked" },
    7:  { id: "perk_slot",     label: "Field refits now offer four choices" },
    10: { id: "mode_endless",  label: "ENDLESS RUN unlocked" },
    13: { id: "loadout_bombs", label: "Deploy with two extra bombs" },
    16: { id: "loadout_hull",  label: "Deploy with +20 hull" },
    20: { id: "mode_team",     label: "TEAM BATTLE unlocked" },
  },
  addXp(n){
    const before = this.data.lvl;
    this.data.xp += Math.max(0, n | 0);
    const gained = [];
    let guard = 0;
    while (this.data.xp >= this.XP_CURVE(this.data.lvl) && guard++ < 100) {
      this.data.xp -= this.XP_CURVE(this.data.lvl);
      this.data.lvl++;
      const u = this.UNLOCKS[this.data.lvl];
      if (u && this.data.unlocks.indexOf(u.id) < 0) { this.data.unlocks.push(u.id); gained.push(u); }
    }
    SAVE.persist();
    return { levels: this.data.lvl - before, unlocked: gained };
  },
  has(id){ return this.data.unlocks.indexOf(id) >= 0; },
  /* Progress toward the current level, 0..1 — the results-screen bar. */
  levelPct(){ return clamp(this.data.xp / this.XP_CURVE(this.data.lvl), 0, 1); },
  /* What the results screen teases: the next named thing, always. */
  nextUnlock(){
    for (let l = this.data.lvl + 1; l <= 40; l++) if (this.UNLOCKS[l]) return Object.assign({ lvl: l }, this.UNLOCKS[l]);
    return null;
  },

  /* ---- daily operation + streak ---- */
  rollDailyIfNeeded(){
    const k = this.dayKey();
    if (this.data.daily.day === k) return;
    this.data.daily.day = k;
    this.data.daily.played = false;
    this.data.daily.best = 0;
    this.rollContracts(k);
    SAVE.persist();
  },
  dailyDone(){ return this.data.daily.day === this.dayKey() && this.data.daily.played; },
  STREAK_PAY: [0, 120, 180, 260, 360, 500, 700, 1000],
  /* Escalating for a week, then flat — a ladder you can finish beats a
     tax that compounds forever on the day you miss. */
  streakPay(n){ return this.STREAK_PAY[Math.min(this.STREAK_PAY.length - 1, Math.max(1, n | 0))]; },
  completeDaily(score){
    const d = this.data.daily;
    d.best = Math.max(d.best | 0, score | 0);
    if (d.played) { SAVE.persist(); return 0; }
    d.played = true;
    /* The streak continues only if the last completed day was yesterday.
       Anything older starts the ladder again. */
    d.streak = (d.lastDay && d.lastDay === d.day - 1) ? (d.streak | 0) + 1 : 1;
    d.lastDay = d.day;
    const reward = this.streakPay(d.streak);
    GAME.addSalvage(reward);
    POWERS.grantAll(1);
    this.addXp(300 + d.streak * 60);
    SAVE.persist();
    return reward;
  },

  /* ---- daily contracts ----
     Three errands drawn from the stats the game already collects, so
     nothing new has to be tracked during play. */
  CONTRACT_POOL: [
    { id: "kills40",   text: "Destroy 40 hostiles",        stat: "kills",     goal: 40,  pay: 220 },
    { id: "bombs15",   text: "Land 15 demolition bombs",   stat: "bombs",     goal: 15,  pay: 180 },
    { id: "bricks120", text: "Raze 120 wall sections",     stat: "bricks",    goal: 120, pay: 200 },
    { id: "powers12",  text: "Fire 12 superpowers",        stat: "powers",    goal: 12,  pay: 200 },
    { id: "emp6",      text: "Level 6 emplacements",       stat: "obstacles", goal: 6,   pay: 240 },
    { id: "sector4",   text: "Reach sector 4 in one run",  stat: "_level",    goal: 4,   pay: 320 },
    { id: "combo6",    text: "Reach a x6 combo",           stat: "_combo",    goal: 6,   pay: 260 },
    { id: "acc45",     text: "Finish a run at 45% accuracy", stat: "_acc",    goal: 45,  pay: 280 },
  ],
  rollContracts(dayKey){
    /* Seeded off the day, so the three are identical for every player
       and a reload cannot reroll into easier ones. */
    const rng = mulberry32(dayKey ^ 0x5EED);
    const pool = this.CONTRACT_POOL.slice();
    const list = [];
    for (let i = 0; i < 3 && pool.length; i++)
      list.push(Object.assign({ done: false, at: 0 }, pool.splice((rng() * pool.length) | 0, 1)[0]));
    this.data.contracts = { day: dayKey, list };
  },
  /* Progress is measured per run, not cumulatively: "40 kills" means
     forty in one operation, which is a target rather than an inevitability. */
  contractValue(c){
    if (c.stat === "_level") return GAME.level;
    if (c.stat === "_combo") return GAME.combo.best;
    if (c.stat === "_acc") return GAME.stats.shots ? Math.round(100 * GAME.stats.hits / GAME.stats.shots) : 0;
    return GAME.stats[c.stat] | 0;
  },
  /* Called once at the end of every run. */
  scoreContracts(){
    const paid = [];
    const list = (this.data.contracts && this.data.contracts.list) || [];
    for (const c of list) {
      if (c.done) continue;
      c.at = Math.max(c.at | 0, this.contractValue(c));
      if (c.at >= c.goal) { c.done = true; GAME.addSalvage(c.pay); this.addXp(150); paid.push(c); }
    }
    SAVE.persist();
    return paid;
  },

  /* ---- XP awarded for a completed run ---- */
  runXp(){
    return Math.round(GAME.score / 40) + GAME.stats.kills * 6 + GAME.level * 40;
  },
};
