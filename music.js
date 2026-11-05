(function () {
  "use strict";

  var STORAGE_KEY = "mini_arcade_music";
  var BPM = 92;
  var STEP = 60 / BPM / 2;
  var LOOP = 32;

  var chords = [
    { bass: 110.0, notes: [220.0, 261.63, 329.63] },
    { bass: 87.31, notes: [174.61, 220.0, 261.63] },
    { bass: 130.81, notes: [261.63, 329.63, 392.0] },
    { bass: 98.0, notes: [196.0, 246.94, 293.66] }
  ];
  var arpOrder = [0, 1, 2, 1];

  var ctx = null;
  var master = null;
  var timer = null;
  var started = false;
  var nextTime = 0;
  var step = 0;
  var enabled = readEnabled();

  function readEnabled() {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "off";
    } catch (error) {
      return true;
    }
  }

  function saveEnabled() {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
    } catch (error) {}
  }

  function ensureContext() {
    if (ctx) return true;
    var AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return false;
    try {
      ctx = new AudioCtor();
    } catch (error) {
      return false;
    }
    master = ctx.createGain();
    master.gain.value = 0.14;
    master.connect(ctx.destination);
    return true;
  }

  function tone(freq, time, duration, type, level, cutoff) {
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    var filter = ctx.createBiquadFilter();

    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, time);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoff || 1200, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(time);
    osc.stop(time + duration + 0.05);

    osc.onended = function () {
      try {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch (error) {}
    };
  }

  function kick(time) {
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(130, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.5, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);

    osc.connect(gain);
    gain.connect(master);
    osc.start(time);
    osc.stop(time + 0.25);

    osc.onended = function () {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch (error) {}
    };
  }

  function playStep(index, time) {
    var bar = Math.floor(index / 8) % 4;
    var beat = index % 8;
    var chord = chords[bar];

    if (beat === 0) {
      tone(chord.bass, time, STEP * 7.5, "triangle", 0.3, 500);
      chord.notes.forEach(function (note) {
        tone(note, time, STEP * 7.4, "sine", 0.055, 900);
      });
    }

    if (beat === 4) {
      tone(chord.bass * 2, time, STEP * 3.2, "triangle", 0.11, 700);
    }

    var arp = chord.notes[arpOrder[(index + bar) % 4]] * (beat % 4 === 3 ? 2 : 1);
    tone(arp, time, STEP * 0.9, "triangle", 0.07, 2000);

    if (beat === 0 || beat === 4) kick(time);
    if (beat === 2 || beat === 6) tone(2400, time, 0.05, "square", 0.012, 4000);
  }

  function scheduler() {
    if (!ctx || !enabled || !started) return;
    if (ctx.state !== "running") return;
    try {
      while (nextTime < ctx.currentTime + 0.2) {
        playStep(step, nextTime);
        step = (step + 1) % LOOP;
        nextTime += STEP;
      }
    } catch (error) {
      stop();
    }
  }

  function start() {
    if (!enabled || !ensureContext()) return;
    try {
      if (ctx.state === "suspended") ctx.resume();
    } catch (error) {}
    if (started) return;
    started = true;
    step = 0;
    nextTime = ctx.currentTime + 0.12;
    timer = window.setInterval(scheduler, 25);
    scheduler();
  }

  function stop() {
    started = false;
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function updateButtons() {
    var buttons = document.querySelectorAll("[data-music-toggle]");
    Array.prototype.forEach.call(buttons, function (button) {
      button.classList.toggle("is-muted", !enabled);
      button.setAttribute("aria-pressed", enabled ? "true" : "false");
      var use = button.querySelector("use");
      if (use) use.setAttribute("href", enabled ? "#i-music" : "#i-music-off");
    });
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    saveEnabled();
    if (enabled) start();
    else stop();
    updateButtons();
  }

  function toggle() {
    setEnabled(!enabled);
  }

  function bind() {
    updateButtons();

    var buttons = document.querySelectorAll("[data-music-toggle]");
    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        toggle();
      });
    });

    document.addEventListener(
      "pointerdown",
      function unlock(event) {
        var target = event.target;
        if (target && target.closest && target.closest("[data-music-toggle]")) return;
        document.removeEventListener("pointerdown", unlock, true);
        if (!enabled || !ensureContext()) return;
        try {
          if (ctx.state === "suspended") ctx.resume();
        } catch (error) {}
        window.setTimeout(function () {
          if (enabled) start();
        }, 1000);
      },
      true
    );

    document.addEventListener("visibilitychange", function () {
      if (!ctx) return;
      if (document.hidden) {
        if (ctx.state === "running") {
          try {
            ctx.suspend();
          } catch (error) {}
        }
      } else if (enabled) {
        try {
          ctx.resume();
          nextTime = ctx.currentTime + 0.12;
        } catch (error) {}
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  window.GameMusic = {
    toggle: toggle,
    setEnabled: setEnabled,
    start: start,
    stop: stop,
    isEnabled: function () {
      return enabled;
    }
  };
})();
