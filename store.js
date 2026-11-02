(function () {
  "use strict";

  var KEY = "mini_arcade_state_v1";
  var BOW_PRICE = 300;
  var KILL_REWARD = 100;
  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  var state = { coins: 0, bow: false, kills: 0, updatedAt: 0 };
  var listeners = [];
  var cloudTimer = null;

  function clampInt(value) {
    var number = Math.floor(Number(value) || 0);
    return number < 0 ? 0 : number;
  }

  function sanitize(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      coins: clampInt(raw.coins),
      bow: Boolean(raw.bow),
      kills: clampInt(raw.kills),
      updatedAt: clampInt(raw.updatedAt)
    };
  }

  function parse(text) {
    try {
      return sanitize(JSON.parse(text));
    } catch (error) {
      return null;
    }
  }

  function get() {
    return {
      coins: state.coins,
      bow: state.bow,
      kills: state.kills,
      updatedAt: state.updatedAt
    };
  }

  function emit() {
    var snapshot = get();
    listeners.slice().forEach(function (listener) {
      try {
        listener(snapshot);
      } catch (error) {}
    });
  }

  function merge(local, cloud) {
    if (!local) return cloud;
    if (!cloud) return local;
    var base = (cloud.updatedAt || 0) >= (local.updatedAt || 0) ? cloud : local;
    return {
      coins: base.coins,
      bow: Boolean(local.bow || cloud.bow),
      kills: Math.max(local.kills || 0, cloud.kills || 0),
      updatedAt: Math.max(local.updatedAt || 0, cloud.updatedAt || 0)
    };
  }

  function writeLocal() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (error) {}
  }

  function readLocal() {
    try {
      return parse(localStorage.getItem(KEY));
    } catch (error) {
      return null;
    }
  }

  function cloudAvailable() {
    return Boolean(
      tg &&
        tg.CloudStorage &&
        typeof tg.CloudStorage.getItem === "function" &&
        typeof tg.CloudStorage.setItem === "function"
    );
  }

  function scheduleCloud() {
    if (!cloudAvailable() || cloudTimer) return;
    cloudTimer = setTimeout(function () {
      cloudTimer = null;
      try {
        tg.CloudStorage.setItem(KEY, JSON.stringify(state), function () {});
      } catch (error) {}
    }, 700);
  }

  function persist() {
    state.updatedAt = Date.now();
    writeLocal();
    scheduleCloud();
    emit();
  }

  function loadCloud() {
    if (!cloudAvailable()) return;
    try {
      tg.CloudStorage.getItem(KEY, function (error, value) {
        if (error || !value) return;
        var cloud = parse(value);
        if (!cloud) return;
        var local = get();
        var localNewer = (local.updatedAt || 0) > (cloud.updatedAt || 0);
        state = merge(local, cloud);
        writeLocal();
        emit();
        if (localNewer) scheduleCloud();
      });
    } catch (error) {}
  }

  var local = readLocal();
  if (local) state = merge(state, local);
  emit();

  if (document.readyState === "complete") {
    loadCloud();
  } else {
    window.addEventListener("load", loadCloud);
  }

  window.GameStore = {
    BOW_PRICE: BOW_PRICE,
    KILL_REWARD: KILL_REWARD,
    get: get,
    hasBow: function () {
      return Boolean(state.bow);
    },
    addCoins: function (amount) {
      var value = clampInt(amount);
      if (!value) return;
      state.coins += value;
      persist();
    },
    registerKill: function () {
      state.kills += 1;
      state.coins += KILL_REWARD;
      persist();
      return KILL_REWARD;
    },
    buyBow: function () {
      if (state.bow) return { ok: false, reason: "owned" };
      if (state.coins < BOW_PRICE) return { ok: false, reason: "coins" };
      state.coins -= BOW_PRICE;
      state.bow = true;
      persist();
      return { ok: true };
    },
    onChange: function (listener) {
      if (typeof listener !== "function") return function () {};
      listeners.push(listener);
      try {
        listener(get());
      } catch (error) {}
      return function () {
        var index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    }
  };
})();
