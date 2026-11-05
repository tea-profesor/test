(function () {
  "use strict";

  var BOT_URL = "https://t.me/ligigark_bot";
  var CHAT_URL = "";
  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  var tgUser = tg && tg.initDataUnsafe ? tg.initDataUnsafe.user : null;

  var screens = {};
  var currentScreen = "menu";
  var navStack = [];
  var toastTimer = null;
  var isTelegram = Boolean(tgUser) || Boolean(tg && tg.initData);

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function haptic(style) {
    if (!tg || !tg.HapticFeedback) return;
    try {
      tg.HapticFeedback.impactOccurred(style || "light");
    } catch (error) {}
  }

  function notify(text) {
    var toast = $("#toast");
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 2200);
  }

  function showFatal(message) {
    var box = $("#fatal");
    var text = $("#fatalText");
    if (!box || !text) return;
    text.textContent = message || "Неизвестная ошибка";
    box.hidden = false;
  }

  window.MiniFatal = showFatal;

  window.addEventListener("error", function (event) {
    if (event && event.message) showFatal("Ошибка: " + event.message);
  });

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event && event.reason;
    var message = reason && reason.message ? reason.message : String(reason || "Promise rejection");
    showFatal("Ошибка: " + message);
  });

  function bindFatalActions() {
    var reset = $("#fatalReset");
    var reload = $("#fatalReload");

    if (reset) {
      reset.addEventListener("click", function () {
        try {
          if (window.GameStore && window.GameStore.resetRun) window.GameStore.resetRun();
        } catch (error) {}
        window.location.reload();
      });
    }

    if (reload) {
      reload.addEventListener("click", function () {
        window.location.reload();
      });
    }
  }

  function showScreen(name, options) {
    var target = screens[name];
    if (!target || name === currentScreen) return;

    var push = !options || options.push !== false;
    if (push) navStack.push(currentScreen);
    currentScreen = name;

    Object.keys(screens).forEach(function (key) {
      screens[key].classList.toggle("is-active", key === name);
    });

    var section = $(".screen--section.is-active");
    if (section) section.scrollTop = 0;

    var chip = $("#userChip");
    if (chip) chip.hidden = name !== "menu";

    if (tg && tg.BackButton) {
      try {
        if (name === "menu") {
          tg.BackButton.hide();
        } else {
          tg.BackButton.show();
        }
      } catch (error) {}
    }

    if (name === "menu") {
      window.setTimeout(restartMenuAnimation, 60);
    }

    window.dispatchEvent(new CustomEvent("mini:screen", { detail: { name: name } }));
  }

  function goBack() {
    if (currentScreen === "menu") return;
    var previous = navStack.pop() || "menu";
    showScreen(previous, { push: false });
  }

  function restartMenuAnimation() {
    $all(".menu-btn").forEach(function (button, index) {
      button.style.animation = "none";
      void button.offsetWidth;
      button.style.animation = "";
      button.style.animationDelay = (index * 70 + 60) + "ms";
    });
  }

  function setUser() {
    var chip = $("#userChip");
    var avatar = $("#userAvatar");
    var name = $("#userName");
    var handle = $("#userHandle");

    if (!chip) return;
    chip.hidden = false;

    if (tgUser) {
      var first = tgUser.first_name || "";
      var last = tgUser.last_name || "";
      var fullName = (first + " " + last).trim() || tgUser.username || "Игрок";

      name.textContent = fullName;
      handle.textContent = tgUser.username ? "@" + tgUser.username : "Telegram";

      if (tgUser.photo_url) {
        var img = document.createElement("img");
        img.src = tgUser.photo_url;
        img.alt = fullName;
        img.referrerPolicy = "no-referrer";
        img.addEventListener("error", function () {
          avatar.textContent = initials(first, last);
        });
        avatar.textContent = "";
        avatar.appendChild(img);
      } else {
        avatar.textContent = initials(first, last);
      }
    } else {
      name.textContent = "Гость";
      handle.textContent = isTelegram ? "Telegram" : "не в Telegram";
      avatar.textContent = "?";
    }
  }

  function initials(first, last) {
    var value = ((first || "").charAt(0) + (last || "").charAt(0)).toUpperCase();
    return value || "TG";
  }

  function setPlatform() {
    var label = $("#platformLabel");
    if (!label) return;

    if (!tg) {
      label.textContent = "Browser";
      return;
    }

    var names = {
      android: "Android",
      ios: "iOS",
      tdesktop: "Desktop",
      macos: "macOS",
      web: "Web",
      webk: "Web",
      weba: "Web",
      unigram: "Unigram"
    };

    var key = String(tg.platform || "").toLowerCase();
    label.textContent = isTelegram ? "Telegram · " + (names[key] || "Mini App") : "Browser";
  }

  function openExternal(url) {
    try {
      if (tg && tg.openTelegramLink && url.indexOf("https://t.me/") === 0) {
        tg.openTelegramLink(url);
      } else {
        window.open(url, "_blank", "noopener");
      }
    } catch (error) {
      copyText(url);
      notify("Ссылка скопирована");
    }
  }

  function invite() {
    haptic("medium");
    var share = "https://t.me/share/url?url=" + encodeURIComponent(BOT_URL) + "&text=" + encodeURIComponent("Залетай в Mini Arcade!");
    openExternal(share);
  }

  function openChat() {
    haptic("medium");
    if (!CHAT_URL) {
      openExternal(BOT_URL);
      notify("Чат ещё не подключён");
      return;
    }
    openExternal(CHAT_URL);
  }

  function setupChat() {
    if (!CHAT_URL) return;

    var badge = $("#chatBadge");
    var title = $("#chatTitle");
    var text = $("#chatText");
    var label = $("#openChatLabel");

    if (badge) {
      badge.textContent = "онлайн";
      badge.classList.add("badge--live");
    }
    if (title) title.textContent = "Общий чат";
    if (text) text.textContent = "Общайтесь с другими игроками, задавайте вопросы и делитесь рекордами.";
    if (label) label.textContent = "Открыть чат";
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {});
    }
  }

  function bindNavigation() {
    $all("[data-nav]").forEach(function (button) {
      button.addEventListener("click", function () {
        var target = button.getAttribute("data-nav");
        haptic(target === "play" ? "medium" : "light");
        showScreen(target);

        if (button.hasAttribute("data-lobby")) {
          window.setTimeout(function () {
            window.dispatchEvent(new CustomEvent("mini:lobby"));
          }, 140);
        }
      });
    });

    $all("[data-back]").forEach(function (button) {
      button.addEventListener("click", function () {
        haptic("light");
        goBack();
      });
    });

    var inviteBtn = $("#inviteBtn");
    if (inviteBtn) inviteBtn.addEventListener("click", invite);

    var openChatBtn = $("#openChatBtn");
    if (openChatBtn) openChatBtn.addEventListener("click", openChat);

    if (tg && tg.BackButton) {
      try {
        tg.BackButton.onClick(function () {
          haptic("light");
          goBack();
        });
        tg.BackButton.hide();
      } catch (error) {}
    }
  }

  function renderSkins(snapshot) {
    var grid = $("#skinsGrid");
    if (!grid || !GameStore) return;

    grid.innerHTML = GameStore.SKINS.map(function (skin) {
      var owned = snapshot.skins.indexOf(skin.id) >= 0;
      var equipped = snapshot.skin === skin.id;
      var affordable = snapshot.coins >= skin.price;
      var disabled = equipped || (!owned && !affordable);
      var label = equipped ? "Выбран" : owned ? "Выбрать" : "Купить";
      var price = owned ? (equipped ? "Активен" : "Куплен") : skin.price + " монет";

      return (
        '<article class="skin-card' +
        (equipped ? " is-equipped" : "") +
        '">' +
        '<div class="skin-preview" style="--skin-a:' +
        skin.css[0] +
        ";--skin-b:" +
        skin.css[1] +
        ";--skin-c:" +
        skin.css[2] +
        '"></div>' +
        '<div class="skin-meta"><div class="skin-name">' +
        skin.name +
        '</div><div class="skin-price">' +
        price +
        "</div></div>" +
        '<button class="buy-btn" data-skin="' +
        skin.id +
        '"' +
        (disabled ? " disabled" : "") +
        ">" +
        label +
        "</button></article>"
      );
    }).join("");
  }

  function updateShop(snapshot) {
    var balance = $("#shopBalance");
    var item = $("#bowItem");
    var button = $("#buyBowBtn");
    var hint = $("#bowHint");

    renderSkins(snapshot);

    if (balance) balance.textContent = String(snapshot.coins);
    if (item) item.classList.toggle("is-owned", snapshot.bow);

    if (button) {
      button.disabled = snapshot.bow || snapshot.coins < GameStore.BOW_PRICE;
      button.textContent = snapshot.bow ? "Куплено" : "Купить";
    }

    if (hint) {
      if (snapshot.bow) {
        hint.textContent = "В инвентаре · стрелы бесконечны";
        hint.className = "shop-note is-owned";
      } else if (snapshot.coins >= GameStore.BOW_PRICE) {
        hint.textContent = "Можно купить";
        hint.className = "shop-note is-ready";
      } else {
        hint.textContent = "Не хватает " + (GameStore.BOW_PRICE - snapshot.coins) + " монет";
        hint.className = "shop-note";
      }
    }
  }

  function setupShop() {
    if (!window.GameStore) return;

    var button = $("#buyBowBtn");
    if (button) {
      button.addEventListener("click", function () {
        haptic("medium");
        var result = window.GameStore.buyBow();
        if (result.ok) {
          haptic("heavy");
          notify("Лук куплен! Стрелы бесконечны.");
        } else if (result.reason === "coins") {
          notify("Не хватает монет");
        } else {
          notify("Лук уже куплен");
        }
      });
    }

    var grid = $("#skinsGrid");
    if (grid) {
      grid.addEventListener("click", function (event) {
        var button = event.target.closest("[data-skin]");
        if (!button || button.disabled) return;
        var id = button.getAttribute("data-skin");
        haptic("medium");

        if (window.GameStore.hasSkin(id)) {
          window.GameStore.equipSkin(id);
          notify("Скин выбран");
          return;
        }

        var result = window.GameStore.buySkin(id);
        if (result.ok) {
          haptic("heavy");
          notify("Скин куплен и надет");
        } else if (result.reason === "coins") {
          notify("Не хватает монет");
        }
      });
    }

    var resetBtn = $("#resetRunBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        haptic("medium");
        var run = window.GameStore.getRun ? window.GameStore.getRun() : null;
        if (!run) {
          notify("Сохранённого боя нет");
          return;
        }

        var reset = function () {
          window.GameStore.resetRun();
          window.dispatchEvent(new CustomEvent("mini:reset-run"));
          notify("Бой начнётся заново");
        };

        if (tg && tg.showConfirm) {
          tg.showConfirm("Начать бой заново? Враги и босс вернутся.", function (confirmed) {
            if (confirmed) reset();
          });
        } else if (window.confirm("Начать бой заново?")) {
          reset();
        }
      });
    }

    window.GameStore.onChange(updateShop);
  }

  function bindTelegram() {
    if (!tg) return;

    try {
      tg.ready();
      tg.expand();
      if (tg.setHeaderColor) tg.setHeaderColor("#05070f");
      if (tg.setBackgroundColor) tg.setBackgroundColor("#05070f");
      
    } catch (error) {}

    try {
      tg.onEvent("themeChanged", function () {
        if (tg.setHeaderColor) tg.setHeaderColor("#05070f");
        if (tg.setBackgroundColor) tg.setBackgroundColor("#05070f");
      });
    } catch (error) {}
  }

  function init() {
    $all(".screen").forEach(function (screen) {
      screens[screen.getAttribute("data-screen")] = screen;
    });

    bindTelegram();
    bindFatalActions();
    bindNavigation();
    setupChat();
    setupShop();
    setUser();
    setPlatform();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
