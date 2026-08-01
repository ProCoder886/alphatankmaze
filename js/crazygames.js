"use strict";
/* ================================================================
   ALPHA TANK : MAZE BOMBERS — js/crazygames.js
   CRAZYGAMES HTML5 SDK v3 INTEGRATION
   ----------------------------------------------------------------
   Implements the official CrazyGames SDK modules:
     ad     — midgame + rewarded video ads, adblock detection
     banner — responsive banners on static (non-gameplay) screens
     game   — gameplay start/stop, loading start/stop, happytime,
              completion %, game context, muteAudio setting
     user   — the game's ONLY account system: availability, current
              user, auth prompt, auth listener, friends, token
     data   — the game's ONLY progress store, synced across devices

   Docs: https://docs.crazygames.com/sdk/intro/
         https://docs.crazygames.com/requirements/account-integration/
   All SDK access funnels through this module so the rest of the
   game never touches window.CrazyGames directly, and so the game
   stays fully playable when the SDK is absent, disabled (non
   CrazyGames domain) or blocked by an adblocker.
   ================================================================ */
const CG = {
  /* ---- state ---- */
  ready: false,          // SDK.init() resolved
  env: "disabled",       // "local" | "crazygames" | "disabled"
  available: false,      // SDK usable (local or crazygames)
  adblock: false,        // adblocker detected
  adsDisabled: false,    // platform reported ads off (Basic Launch)
  adPending: false,      // ad requested, awaiting adStarted/adError
  adPlaying: false,      // ad actually on screen (audio muted, game paused)
  sdkMute: false,        // platform muteAudio setting
  device: "desktop",     // "desktop" | "tablet" | "mobile"
  appType: "web",        // "web" | "pwa" | "google_play_store" | "apple_store"
  /* Set by main.js. Called when the player signs in while the game is
     already running, so the UI and the loaded profile can follow. */
  onAccountChange: null,

  _gameplayOn: false,
  _lastRewardT: -1e9,    // performance.now()/1000 of last rewarded ad shown
  _bannerT: {},          // containerId -> last request time (s)
  _watchdog: null,

  /* Rewarded ads must not be offered too often (SDK requirement).
     While cooling down the offer button is disabled and shows the timer. */
  REWARD_COOLDOWN: 45,

  /* ================================================================
     INIT
     Awaited before the game reads any saved data: the data module
     preloads the player's progress during SDK.init().
     ================================================================ */
  async init(){
    await this._connect();
    // Always runs, SDK or not: it decides whether progress lives in the
    // data module or in the off-platform localStorage fallback.
    this.storage.init();
  },
  async _connect(){
    const sdk = window.CrazyGames && window.CrazyGames.SDK;
    if (!sdk) {
      // SDK script unavailable (offline, self-hosted build, blocked): play on.
      this.env = "disabled";
      this.available = false;
      return;
    }
    try {
      await sdk.init();
      this.ready = true;
      this.env = sdk.environment || "disabled";
      this.available = this.env === "local" || this.env === "crazygames";
    } catch (e) {
      this.env = "disabled";
      this.available = false;
      console.warn("[CG] SDK init failed, continuing without SDK:", e);
      return;
    }
    if (!this.available) return;

    // platform audio setting takes priority over the in-game audio sliders
    try {
      const s = sdk.game.settings;
      if (s) this.sdkMute = !!s.muteAudio;
      sdk.game.addSettingsChangeListener((ns) => {
        this.sdkMute = !!(ns && ns.muteAudio);
        this.applyMute();
      });
    } catch (e) { /* settings unsupported — ignore */ }

    // the CrazyGames account: read on every launch, before any save data
    await this.account.init();

    // adblock detection: never block play, only gate the ad-reward path
    try {
      this.adblock = await sdk.ad.hasAdblock();
    } catch (e) { this.adblock = false; }
  },

  sdk(){ return this.available ? window.CrazyGames.SDK : null; },

  /* ================================================================
     USER MODULE — the CrazyGames account is the game's only identity
     ----------------------------------------------------------------
     Integration scenario: "Use CrazyGames profile" (account-integration
     requirements). The game has no back-end and no in-game account, so
     per the requirements:
       · the operator name and avatar come from the CrazyGames account,
         there is no separate in-game username or avatar
       · a signed-out player is a guest and can play everything
       · the only way to sign in is the platform auth prompt, offered as
         an optional secondary button — never the main CTA, and never
         opened automatically
       · there is no in-game login form, no external login provider
         (Facebook / Google / email) and no log-out
       · signing in mid-session is picked up by the auth listener
     ================================================================ */
  account: {
    available: false,     // user.isUserAccountAvailable
    user: null,           // { __dangerousUserId, username, profilePictureUrl }
    /* The CrazyGames userId, kept only to notice that a *different*
       account now owns the session (several players share one device).
       It is never used to authenticate anything — the docs are explicit
       that __dangerousUserId must not be trusted for that. */
    id: null,
    systemInfo: null,
    _prompting: false,
    _friendsBusy: false,
    _friendsT: -1e9,

    mod(){
      const s = CG.sdk();
      return s && s.user ? s.user : null;
    },
    isGuest(){ return !this.user; },
    name(){ return this.user ? this.user.username : null; },
    avatar(){ return this.user ? this.user.profilePictureUrl : null; },

    async init(){
      const u = this.mod();
      if (!u) return;
      try {
        this.systemInfo = u.systemInfo || null;
        const info = this.systemInfo;
        if (info && info.device && info.device.type) CG.device = info.device.type;
        if (info && info.applicationType) CG.appType = info.applicationType;
      } catch (e) { /* system info unsupported — defaults stand */ }
      /* The account system is unavailable on other domains that embed the
         game, so availability is checked before any account call. */
      try { this.available = !!u.isUserAccountAvailable; } catch (e) { this.available = false; }
      if (!this.available) return;
      /* The current account is requested on every launch, as required:
         one device can be shared by several players, and a player can
         change their username or avatar between sessions. */
      try { this.user = await u.getUser(); } catch (e) { this.user = null; }
      this.id = this.user ? this.user.__dangerousUserId : null;
      /* A log-in while the game is open reaches the game here. A log-out
         never does — the platform reloads the whole page in that case,
         so the game simply starts again from the beginning. */
      try { u.addAuthListener((nu) => this._onAuth(nu)); } catch (e) {}
    },

    _onAuth(user){
      const prevId = this.id;
      this.user = user || null;
      this.id = this.user ? this.user.__dangerousUserId : null;
      if (typeof CG.onAccountChange === "function")
        CG.onAccountChange(this.user, prevId !== this.id);
    },

    /* Player-initiated sign-in, from the optional menu button only.
       Resolves to the user, or null when nothing changed. */
    async login(){
      const u = this.mod();
      if (!u || !this.available || this._prompting) return null;
      this._prompting = true;
      try {
        const user = await u.showAuthPrompt();
        this._onAuth(user);
        return user;
      } catch (e) {
        const code = e && e.code;
        if (code === "userAlreadySignedIn") {
          // already signed in elsewhere on the page — just re-read them
          try { this._onAuth(await u.getUser()); } catch (e2) {}
        } else if (code !== "userCancelled" && code !== "showAuthPromptInProgress") {
          console.warn("[CG] auth prompt failed:", e);
        }
        return null;
      } finally {
        this._prompting = false;
      }
    },

    /* The player's CrazyGames friends, shown in the service record.
       Honours the documented limits: one active call, 250ms between
       calls, page size 1-50. */
    async friends(size){
      const u = this.mod();
      if (!u || !this.available || !this.user || this._friendsBusy) return null;
      const now = performance.now();
      if (now - this._friendsT < 300) return null;
      this._friendsT = now;
      this._friendsBusy = true;
      try {
        return await u.listFriends({ page: 1, size: clamp(size || 10, 1, 50) });
      } catch (e) {
        // userNotAuthenticated / rateLimited / requestInProgress / other
        console.warn("[CG] list friends failed:", e);
        return null;
      } finally {
        this._friendsBusy = false;
      }
    },

    /* Signed JWT identifying the player, for a game back-end to verify
       server-side with the CrazyGames public key. This build stores all
       progress in the data module and has no back-end of its own, so
       nothing calls it during play — it is the documented hook for
       linking a server account to a CrazyGames userId. The token is
       never decoded on the client, and never stored: the SDK refreshes
       it, so it is fetched again whenever it is needed. */
    async token(){
      const u = this.mod();
      if (!u || !this.available) return null;
      try {
        return await u.getUserToken();
      } catch (e) {
        // userNotAuthenticated (guest) / unexpectedError
        return null;
      }
    },
  },

  /* ================================================================
     DATA MODULE — the only place this game stores progress
     ----------------------------------------------------------------
     The requirements are explicit: rely fully on the data module for
     BOTH guests and signed-in players, and do not keep a local save
     alongside it. The SDK itself keeps guest progress in localStorage
     and moves it onto the account the moment a guest signs in, so none
     of that has to be handled here.

     localStorage is touched in exactly two cases:
       · the one-time migration of a pre-SDK save into the data module
       · there is no SDK on the page at all (self-hosted / offline copy),
         where there is no data module to rely on
     ================================================================ */
  storage: {
    MIGRATED: "atmb_data_migrated",
    PREFIX: "atmb_",
    usingData: false,     // false = off-platform localStorage fallback

    _mod(){
      const s = CG.sdk();
      return s && s.data ? s.data : null;
    },
    _lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } },
    _lsSet(k, v){ try { localStorage.setItem(k, v); } catch (e) {} },
    _lsDel(k){ try { localStorage.removeItem(k); } catch (e) {} },

    /* Moves a pre-SDK localStorage save into the data module once, so a
       player who played this game before it used the data module keeps
       their progress. Cloud data always wins: an existing key is never
       overwritten. After this the game never reads localStorage again. */
    init(){
      const m = this._mod();
      this.usingData = !!m;
      if (!m) return;
      try {
        if (m.getItem(this.MIGRATED)) return;
        const keys = [];
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.indexOf(this.PREFIX) === 0) keys.push(k);
          }
        } catch (e) { /* storage blocked — nothing to migrate */ }
        for (const k of keys) {
          if (m.getItem(k) != null) continue;
          const v = this._lsGet(k);
          if (v !== null) m.setItem(k, v);
        }
        m.setItem(this.MIGRATED, "1");
      } catch (e) { this._fail(e); }
    },

    /* dataModuleDisabled means the "Progress Save" toggle was not set in
       the submission flow. Losing every save is worse than the fallback,
       so the game keeps saving locally and says so in the console. */
    _fail(e){
      if (e && e.code === "dataModuleDisabled") {
        console.warn("[CG] data module disabled — select the Data Module option in the submission flow");
        this.usingData = false;
      } else {
        // dataLimitExcedeed (1MB) or other — this save is ~2KB
        console.warn("[CG] data module error:", e);
      }
    },

    getItem(key){
      const m = this.usingData ? this._mod() : null;
      if (!m) return this._lsGet(key);
      try {
        const v = m.getItem(key);
        return v === undefined ? null : v;
      } catch (e) {
        this._fail(e);
        return this.usingData ? null : this._lsGet(key);
      }
    },
    setItem(key, value){
      const m = this.usingData ? this._mod() : null;
      if (!m) { this._lsSet(key, value); return; }
      try { m.setItem(key, value); }
      catch (e) { this._fail(e); if (!this.usingData) this._lsSet(key, value); }
    },
    removeItem(key){
      const m = this.usingData ? this._mod() : null;
      if (!m) { this._lsDel(key); return; }
      try { m.removeItem(key); }
      catch (e) { this._fail(e); if (!this.usingData) this._lsDel(key); }
    },
  },

  /* ================================================================
     GAME MODULE — lifecycle events
     ================================================================ */
  loadingStart(){ const s = this.sdk(); if (s) { try { s.game.loadingStart(); } catch (e) {} } },
  loadingStop(){ const s = this.sdk(); if (s) { try { s.game.loadingStop(); } catch (e) {} } },

  /* Called whenever the player starts or resumes playing
     (deploy, resume from pause, revive, next sector). */
  gameplayStart(){
    if (this._gameplayOn) return;
    this._gameplayOn = true;
    const s = this.sdk();
    if (s) { try { s.game.gameplayStart(); } catch (e) {} }
  },
  /* Called on every break in play (pause, sector end, death, menu). */
  gameplayStop(){
    if (!this._gameplayOn) return;
    this._gameplayOn = false;
    const s = this.sdk();
    if (s) { try { s.game.gameplayStop(); } catch (e) {} }
  },
  /* Celebration on the platform — used sparingly (boss kill, new record). */
  happytime(){ const s = this.sdk(); if (s) { try { s.game.happytime(); } catch (e) {} } },
  /* Endless game: sector 10 is treated as 100% completion. */
  reportProgress(pct){
    const s = this.sdk();
    if (!s) return;
    try { s.game.reportGameCompletedPercentage(clamp(Math.round(pct), 0, 100)); } catch (e) {}
  },
  setContext(obj){ const s = this.sdk(); if (s) { try { s.game.setGameContext(obj); } catch (e) {} } },
  clearContext(){ const s = this.sdk(); if (s) { try { s.game.clearGameContext(); } catch (e) {} } },

  /* ================================================================
     AD MODULE
     Per SDK requirements: the UI is blocked from the moment the ad
     is requested until adFinished/adError, audio is muted only once
     the ad actually starts, and an unfilled/blocked ad must never
     leave the game stuck or reward the player.
     ================================================================ */
  adsAvailable(){ return this.available && !this.adblock && !this.adsDisabled; },
  /* True when the game runs inside the CrazyGames mobile app. */
  isApp(){ return this.appType === "google_play_store" || this.appType === "apple_store"; },

  /* Resolves { ok:true } only when the ad played to completion. */
  requestAd(type){
    return new Promise((resolve) => {
      const s = this.sdk();
      if (!s) { resolve({ ok: false, error: { code: "sdkUnavailable" } }); return; }

      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(this._watchdog);
        this._watchdog = null;
        this.adPending = false;
        if (this.adPlaying) { this.adPlaying = false; this.applyMute(); }
        this.hideAdOverlay();
        resolve(result);
      };

      this.adPending = true;
      INPUT.setPointerLock(false);   // hand the cursor back for the ad
      this.showAdOverlay("Loading advertisement");
      // Safety net: the game must never freeze waiting on an ad callback.
      this._watchdog = setTimeout(() => finish({ ok: false, error: { code: "timeout" } }), 45000);

      try {
        s.ad.requestAd(type, {
          adStarted: () => {
            this.adPlaying = true;
            this.applyMute();               // mute only when the ad really starts
            this.showAdOverlay("Advertisement playing");
          },
          adFinished: () => finish({ ok: true }),
          adError: (error) => {
            // Ads are switched off platform-side during Basic Launch. Stop
            // offering them entirely so no ad button is ever clickable
            // without effect, and no further requests are made.
            if (error && error.code === "adsDisabledBasicLaunch") this.adsDisabled = true;
            console.warn("[CG] ad error (" + type + "):", error);
            finish({ ok: false, error: error || { code: "other" } });
          },
        });
      } catch (e) {
        finish({ ok: false, error: { code: "other", message: String(e) } });
      }
    });
  },

  /* Midgame ad — only at natural breaks (sector transition, restart
     after death). The SDK enforces its own frequency cap, so an
     ignored request is harmless and the game must simply continue. */
  async midgame(){
    if (!this.adsAvailable()) return false;
    const r = await this.requestAd("midgame");
    return r.ok;
  },

  /* Rewarded ad — player-initiated only. Resolves true only when the
     ad completed, which is the only case where a reward may be given. */
  async rewarded(){
    if (!this.adsAvailable()) return false;
    const r = await this.requestAd("rewarded");
    if (r.ok) this._lastRewardT = performance.now() / 1000;
    return r.ok;
  },

  rewardCooldownLeft(){
    const left = this.REWARD_COOLDOWN - (performance.now() / 1000 - this._lastRewardT);
    return left > 0 ? Math.ceil(left) : 0;
  },

  /* Why a rewarded offer can't be taken right now (null = it can). */
  rewardBlockedReason(){
    if (!this.available) return "Rewards are available on CrazyGames.";
    if (this.adsDisabled) return "Ad rewards are unavailable right now.";
    if (this.adblock) return "Ad blocker detected — disable it to claim ad rewards.";
    const cd = this.rewardCooldownLeft();
    if (cd > 0) return "Next ad reward available in " + cd + "s.";
    if (this.adPending || this.adPlaying) return "Advertisement in progress…";
    return null;
  },

  /* ================================================================
     BANNER MODULE
     Responsive banners on static screens only (never during play).
     Honours the 30s per-container refresh limit.
     ================================================================ */
  showBanner(containerId){
    const s = this.sdk();
    if (!s) return;
    if (this.adPending || this.adPlaying) return;   // videoAdPlaying error otherwise
    const el = document.getElementById(containerId);
    if (!el) return;
    const now = performance.now() / 1000;
    if (this._bannerT[containerId] && now - this._bannerT[containerId] < 31) return;
    this._bannerT[containerId] = now;
    el.classList.add("has-banner");
    try {
      s.banner.requestResponsiveBanner(containerId).catch((e) => {
        console.warn("[CG] banner request failed", e);
        el.classList.remove("has-banner");
      });
    } catch (e) { el.classList.remove("has-banner"); }
  },
  clearBanner(containerId){
    const s = this.sdk();
    const el = document.getElementById(containerId);
    if (el) el.classList.remove("has-banner");
    if (!s) return;
    try { s.banner.clearBanner(containerId); } catch (e) {}
  },
  clearAllBanners(){
    const s = this.sdk();
    document.querySelectorAll(".cg-banner").forEach(el => el.classList.remove("has-banner"));
    if (!s) return;
    try { s.banner.clearAllBanners(); } catch (e) {}
  },

  /* ================================================================
     AUDIO MUTE — platform setting OR an ad currently playing
     ================================================================ */
  audioMuted(){ return this.sdkMute || this.adPlaying; },
  applyMute(){ if (typeof AUDIO !== "undefined") AUDIO.setMuted(this.audioMuted()); },

  /* ================================================================
     BLOCKING AD OVERLAY
     Prevents any interaction (and any game progress) while an ad is
     being requested or shown, as required by the SDK guidelines.
     ================================================================ */
  showAdOverlay(text){
    const ov = document.getElementById("ad-overlay");
    if (!ov) return;
    const label = document.getElementById("ad-ov-title");
    if (label) label.textContent = text;
    ov.classList.add("active");
    ov.setAttribute("aria-hidden", "false");
  },
  hideAdOverlay(){
    const ov = document.getElementById("ad-overlay");
    if (!ov) return;
    ov.classList.remove("active");
    ov.setAttribute("aria-hidden", "true");
  },

  /* True while an ad request/playback is in flight — the main loop
     and input handling must stay frozen for this duration. */
  busy(){ return this.adPending || this.adPlaying; },
};
