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
    bindNavigation();
    setupChat();
    setUser();
    setPlatform();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
