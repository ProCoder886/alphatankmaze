"use strict";
/* ================================================================
   ALPHA TANK : MAZE BOMBERS — js/safety.js
   CRASH CONTAINMENT
   ----------------------------------------------------------------
   Loaded BEFORE every other script so nothing can throw before the
   net is up.

   CrazyGames counts every uncaught error as a crash, and a crashed
   session is three losses at once: a play that never converted, a
   minute of playtime that never accrued, and a player who does not
   come back tomorrow. The Basic Launch report put that at 2.67% of
   loads and 1.24% of sessions, and the codebase had no global error
   handling of any kind, no timeout on the SDK handshake, and no null
   guard on any of its five getContext() calls.

   Nothing in here changes gameplay. Every function is a guard.
   ================================================================ */
const SAFETY = {
  errors: 0,
  last: "",
  /* Bumped by main.js once the boot sequence has actually finished, so
     an error can be attributed to load or to play. */
  booted: false,

  init(){
    window.addEventListener("error", (e) => this._log(e.message, e.error));
    window.addEventListener("unhandledrejection", (e) => this._log("promise", e.reason));
  },
  _log(msg, err){
    this.errors++;
    this.last = String(msg || "");
    /* Only the first few reach the console: a per-frame throw would
       otherwise flood it and slow the page down further, turning one
       bad frame into an unplayable session. */
    if (this.errors < 6) console.warn("[SAFE]" + (this.booted ? "" : " during boot:"), msg, err);
  },

  /* Runs fn, swallows any throw, returns fallback instead. */
  run(fn, fallback, tag){
    try { return fn(); }
    catch (e) { this._log(tag || "guard", e); return fallback; }
  },

  /* A promise that cannot stall the boot. Resolves to fallback on
     rejection OR on timeout — the SDK is allowed to be slow, it is not
     allowed to be infinite. A hung sdk.init() used to mean a permanent
     black screen, which the platform reports as a load crash. */
  deadline(promise, ms, fallback){
    let done = false;
    return Promise.race([
      Promise.resolve(promise).then(
        (v) => { done = true; return v; },
        (e) => { done = true; this._log("deadline", e); return fallback; }
      ),
      new Promise((res) => setTimeout(() => {
        if (!done) this._log("timeout:" + ms + "ms", null);
        res(fallback);
      }, ms)),
    ]);
  },

  /* Canvas allocation that never throws and never returns a broken
     pair. getContext returns null under memory pressure rather than
     throwing, so the crash lands on the *next* line — which is why it
     never looked like an allocation failure in the logs. */
  canvas(w, h){
    try {
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(w));
      cv.height = Math.max(1, Math.round(h));
      const cx = cv.getContext("2d");
      if (!cx) { this._log("canvas:noctx", Math.round(w) + "x" + Math.round(h)); return null; }
      return { cv, cx };
    } catch (e) { this._log("canvas", e); return null; }
  },

  /* Frees a canvas backing store immediately. Dropping the reference is
     not enough on iOS — the store survives until GC runs, and the next
     sector allocates its replacement long before that happens. */
  release(cv){
    if (!cv) return;
    try { cv.width = 1; cv.height = 1; } catch (e) {}
  },
};
SAFETY.init();
