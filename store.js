(function () {
  "use strict";

  var KEY = "mini_arcade_state_v1";
  var BOW_PRICE = 300;
  var KILL_REWARD = 100;
  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  var SKINS = [
    {
      id: "scout",
      name: "Разведчик",
      price: 0,
      primary: 0x3ee08f,
      secondary: 0x0f3b26,
      accent: 0x43e7ff,
      css: ["#3ee08f", "#0f3b26", "#43e7ff"]
    },
    {
      id: "neon",
      name: "Неон",
      price: 400,
      primary: 0x43e7ff,
      secondary: 0x1b1f4d,
      accent: 0x7b5cff,
      css: ["#43e7ff", "#1b1f4d", "#7b5cff"]
    },
    {
      id: "emerald",
      name: "Изумруд",
      price: 600,
      primary: 0x58e06a,
      secondary: 0x0d3b1e,
      accent: 0xb8ff7a,
      css: ["#58e06a", "#0d3b1e", "#b8ff7a"]
    },
    {
      id: "crimson",
      name: "Алый",
      price: 800,
      primary: 0xff4d5e,
      secondary: 0x3a0a14,
      accent: 0xffa36b,
      css: ["#ff4d5e", "#3a0a14", "#ffa36b"]
    },
    {
      id: "gold",
      name: "Золото",
      price: 900,
      primary: 0xffd166,
      secondary: 0x3a2a00,
      accent: 0xfff1c4,
      css: ["#ffd166", "#3a2a00", "#fff1c4"]
    },
    {
      id: "shadow",
      name: "Тень",
      price: 1200,
      primary: 0x9a7bff,
      secondary: 0x140f2e,
      accent: 0xff4fd8,
      css: ["#9a7bff", "#140f2e", "#ff4fd8"]
    }
  ];

  var SKIN_MAP = {};
  var SKIN_IDS = SKINS.map(function (skin) {
    SKIN_MAP[skin.id] = skin;
    return skin.id;
  });

  var state = { coins: 0, bow: false, kills: 0, skins: ["scout"], skin: "scout", updatedAt: 0 };
  var listeners = [];
  var cloudTimer = null;

  function clampInt(value) {
    var number = Math.floor(Number(value) || 0);
    return number < 0 ? 0 : number;
  }

  function cleanSkinList(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var result = [];
    list.forEach(function (id) {
      if (SKIN_IDS.indexOf(id) >= 0 && result.indexOf(id) < 0) result.push(id);
    });
    if (result.indexOf("scout") < 0) result.unshift("scout");
    return result;
  }

  function sanitize(raw) {
    if (!raw || typeof raw !== "object") return null;
    var skins = cleanSkinList(raw.skins);
    var skin = SKIN_IDS.indexOf(raw.skin) >= 0 ? raw.skin : "scout";
    if (skins.indexOf(skin) < 0) skin = "scout";
    return {
      coins: clampInt(raw.coins),
      bow: Boolean(raw.bow),
      kills: clampInt(raw.kills),
      skins: skins,
      skin: skin,
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
      skins: state.skins.slice(),
      skin: state.skin,
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
    var skins = cleanSkinList((local.skins || []).concat(cloud.skins || []));
    var skin = skins.indexOf(base.skin) >= 0 ? base.skin : "scout";
    return {
      coins: base.coins,
      bow: Boolean(local.bow || cloud.bow),
      kills: Math.max(local.kills || 0, cloud.kills || 0),
      skins: skins,
      skin: skin,
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
    SKINS: SKINS,
    get: get,
    getSkin: function (id) {
      return SKIN_MAP[id] || SKIN_MAP.scout;
    },
    hasBow: function () {
      return Boolean(state.bow);
    },
    hasSkin: function (id) {
      return state.skins.indexOf(id) >= 0;
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
    buySkin: function (id) {
      var skin = SKIN_MAP[id];
      if (!skin) return { ok: false, reason: "unknown" };
      if (state.skins.indexOf(id) >= 0) return { ok: false, reason: "owned" };
      if (state.coins < skin.price) return { ok: false, reason: "coins" };
      state.coins -= skin.price;
      state.skins.push(id);
      state.skin = id;
      persist();
      return { ok: true };
    },
    equipSkin: function (id) {
      if (state.skins.indexOf(id) < 0) return { ok: false, reason: "locked" };
      state.skin = id;
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
