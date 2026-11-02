(function () {
  "use strict";

  var screen = document.querySelector('[data-screen="play"]');
  if (!screen) return;

  var canvas = document.getElementById("gameCanvas");
  var stage = document.getElementById("gameStage");
  var joystick = document.getElementById("joystick");
  var knob = document.getElementById("joystickKnob");
  var hpValue = document.getElementById("hpValue");
  var hpFill = document.getElementById("hpFill");
  var hudHealth = document.getElementById("hudHealth");
  var flash = document.getElementById("gameFlash");
  var hint = document.getElementById("gameHint");

  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  var state = {
    initialized: false,
    running: false,
    raf: 0,
    last: 0,
    time: 0,
    walk: 0,
    attackT: 0,
    damageCd: 0,
    hintTimer: 0
  };

  var player = {
    pos: null,
    yaw: 0,
    pitch: 0,
    vy: 0,
    onGround: true,
    hp: 100
  };

  var input = { x: 0, y: 0 };
  var joy = { id: null, cx: 0, cy: 0, max: 38 };
  var look = { id: null, x: 0, y: 0 };

  var renderer = null;
  var scene = null;
  var camera = null;
  var weapon = null;
  var weaponBase = null;
  var enemies = [];
  var effects = [];

  var tmpForward = null;
  var tmpRight = null;
  var tmpVec = null;

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function haptic(style) {
    if (!tg || !tg.HapticFeedback) return;
    try {
      tg.HapticFeedback.impactOccurred(style || "light");
    } catch (error) {}
  }

  function setHint(text) {
    if (!hint) return;
    hint.textContent = text;
    hint.classList.remove("is-hidden");
    clearTimeout(state.hintTimer);
    state.hintTimer = setTimeout(function () {
      hint.classList.add("is-hidden");
    }, 4500);
  }

  function makeGroundTexture() {
    var size = 512;
    var c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    var ctx = c.getContext("2d");

    ctx.fillStyle = "#2f7d3a";
    ctx.fillRect(0, 0, size, size);

    for (var i = 0; i < 1400; i += 1) {
      var x = Math.random() * size;
      var y = Math.random() * size;
      var r = 1 + Math.random() * 5;
      var light = Math.random() > 0.5;
      ctx.fillStyle = light ? "rgba(150, 220, 140, 0.09)" : "rgba(10, 45, 20, 0.12)";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
    ctx.lineWidth = 1;
    for (var line = 0; line <= size; line += 64) {
      ctx.beginPath();
      ctx.moveTo(line, 0);
      ctx.lineTo(line, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, line);
      ctx.lineTo(size, line);
      ctx.stroke();
    }

    var texture = new THREE.CanvasTexture(c);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(26, 26);
    texture.encoding = THREE.sRGBEncoding;
    return texture;
  }

  function buildWorld() {
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xbfe8c8, 36, 135);

    camera = new THREE.PerspectiveCamera(74, 1, 0.1, 320);
    camera.rotation.order = "YXZ";
    scene.add(camera);

    var hemi = new THREE.HemisphereLight(0xe4fff0, 0x1b3a24, 0.95);
    scene.add(hemi);

    var sun = new THREE.DirectionalLight(0xffffff, 0.85);
    sun.position.set(24, 40, 16);
    scene.add(sun);

    var fill = new THREE.DirectionalLight(0xbfe8ff, 0.25);
    fill.position.set(-20, 12, -24);
    scene.add(fill);

    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(320, 320),
      new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 1, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    addMountains();
    addTreesAndRocks();
    addEnemies();
    addWeapon();

    player.pos = new THREE.Vector3(0, 1.72, 0);
    tmpForward = new THREE.Vector3();
    tmpRight = new THREE.Vector3();
    tmpVec = new THREE.Vector3();
  }

  function addMountains() {
    var material = new THREE.MeshStandardMaterial({ color: 0x2c5a3a, roughness: 1 });
    for (var i = 0; i < 12; i += 1) {
      var angle = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
      var distance = 105 + Math.random() * 25;
      var height = 26 + Math.random() * 26;
      var radius = 20 + Math.random() * 14;
      var mountain = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 7), material);
      mountain.position.set(Math.cos(angle) * distance, height / 2 - 2, Math.sin(angle) * distance);
      mountain.rotation.y = Math.random() * Math.PI;
      scene.add(mountain);
    }
  }

  function addTreesAndRocks() {
    var trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 });
    var leafColors = [0x2e8b57, 0x3fa66a, 0x256b45, 0x46b877];
    var rockMaterial = new THREE.MeshStandardMaterial({ color: 0x7c8a80, roughness: 1, flatShading: true });

    for (var i = 0; i < 46; i += 1) {
      var angle = Math.random() * Math.PI * 2;
      var distance = 9 + Math.random() * 52;
      var x = Math.cos(angle) * distance;
      var z = Math.sin(angle) * distance;

      var tree = new THREE.Group();
      var scale = 0.75 + Math.random() * 0.8;
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.5, 6), trunkMaterial);
      trunk.position.y = 0.75;
      tree.add(trunk);

      var leafMaterial = new THREE.MeshStandardMaterial({
        color: leafColors[i % leafColors.length],
        roughness: 0.9,
        flatShading: true
      });

      var lower = new THREE.Mesh(new THREE.ConeGeometry(1.15, 2.1, 7), leafMaterial);
      lower.position.y = 2.15;
      tree.add(lower);

      var upper = new THREE.Mesh(new THREE.ConeGeometry(0.82, 1.6, 7), leafMaterial);
      upper.position.y = 3.15;
      tree.add(upper);

      tree.position.set(x, 0, z);
      tree.scale.setScalar(scale);
      tree.rotation.y = Math.random() * Math.PI;
      scene.add(tree);
    }

    for (var j = 0; j < 30; j += 1) {
      var rockAngle = Math.random() * Math.PI * 2;
      var rockDistance = 7 + Math.random() * 50;
      var rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + Math.random() * 0.5, 0), rockMaterial);
      rock.position.set(
        Math.cos(rockAngle) * rockDistance,
        0.25,
        Math.sin(rockAngle) * rockDistance
      );
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.scale.y = 0.6 + Math.random() * 0.5;
      scene.add(rock);
    }
  }

  function addEnemies() {
    var spots = [
      [10, -8],
      [-12, -7],
      [16, 12],
      [-15, 14],
      [24, 2],
      [-24, -2]
    ];

    spots.forEach(function (spot, index) {
      var group = new THREE.Group();

      var bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0xd94b4b,
        emissive: 0x3a0a0a,
        emissiveIntensity: 0.6,
        roughness: 0.7
      });
      var headMaterial = new THREE.MeshStandardMaterial({
        color: 0xb83a3a,
        emissive: 0x2a0606,
        emissiveIntensity: 0.5,
        roughness: 0.7
      });

      var body = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.46, 1.05, 10), bodyMaterial);
      body.position.y = 0.62;
      group.add(body);

      var head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), headMaterial);
      head.position.y = 1.35;
      group.add(head);

      var eyeMaterial = new THREE.MeshStandardMaterial({
        color: 0xffe066,
        emissive: 0xffc93c,
        emissiveIntensity: 1.4
      });
      var eyeLeft = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), eyeMaterial);
      eyeLeft.position.set(-0.11, 1.4, 0.3);
      group.add(eyeLeft);
      var eyeRight = eyeLeft.clone();
      eyeRight.position.x = 0.11;
      group.add(eyeRight);

      var hornMaterial = new THREE.MeshStandardMaterial({ color: 0xffe0b3, roughness: 0.8 });
      var hornLeft = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 6), hornMaterial);
      hornLeft.position.set(-0.17, 1.66, 0);
      hornLeft.rotation.z = 0.4;
      group.add(hornLeft);
      var hornRight = hornLeft.clone();
      hornRight.position.x = 0.17;
      hornRight.rotation.z = -0.4;
      group.add(hornRight);

      var x = spot[0] + (Math.random() - 0.5) * 3;
      var z = spot[1] + (Math.random() - 0.5) * 3;
      group.position.set(x, 0, z);
      scene.add(group);

      enemies.push({
        group: group,
        bodyMaterial: bodyMaterial,
        headMaterial: headMaterial,
        hp: 100,
        alive: true,
        respawnAt: 0,
        phase: index * 1.7,
        baseY: 0
      });
    });
  }

  function addWeapon() {
    weapon = new THREE.Group();

    var bladeMaterial = new THREE.MeshStandardMaterial({
      color: 0xbdf6ff,
      emissive: 0x2fd9ff,
      emissiveIntensity: 0.9,
      metalness: 0.5,
      roughness: 0.25
    });
    var gripMaterial = new THREE.MeshStandardMaterial({ color: 0x243447, roughness: 0.8 });

    var blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.78, 0.05), bladeMaterial);
    blade.position.y = 0.52;
    weapon.add(blade);

    var tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 4), bladeMaterial);
    tip.position.y = 0.98;
    tip.rotation.y = Math.PI / 4;
    weapon.add(tip);

    var guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.08), gripMaterial);
    guard.position.y = 0.13;
    weapon.add(guard);

    var grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.28, 8), gripMaterial);
    grip.position.y = -0.02;
    weapon.add(grip);

    weapon.position.set(0.4, -0.42, -0.62);
    weapon.rotation.set(-0.35, -0.3, -0.42);
    weaponBase = {
      x: weapon.rotation.x,
      y: weapon.rotation.y,
      z: weapon.rotation.z,
      px: weapon.position.x,
      py: weapon.position.y,
      pz: weapon.position.z
    };

    camera.add(weapon);
  }

  function initGame() {
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (error) {
      stage.classList.add("is-error");
      return false;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setClearColor(0x000000, 0);

    buildWorld();
    bindControls();
    updateHealth();
    resize();
    state.initialized = true;
    return true;
  }

  function resize() {
    if (!renderer || !camera || !stage) return;
    var width = stage.clientWidth || window.innerWidth;
    var height = stage.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  function bindControls() {
    canvas.addEventListener("pointerdown", onLookStart);
    canvas.addEventListener("pointermove", onLookMove);
    canvas.addEventListener("pointerup", onLookEnd);
    canvas.addEventListener("pointercancel", onLookEnd);

    joystick.addEventListener("pointerdown", onJoyStart);
    joystick.addEventListener("pointermove", onJoyMove);
    joystick.addEventListener("pointerup", onJoyEnd);
    joystick.addEventListener("pointercancel", onJoyEnd);

    document.getElementById("jumpBtn").addEventListener("pointerdown", function (event) {
      event.preventDefault();
      jump();
    });
    document.getElementById("attackBtn").addEventListener("pointerdown", function (event) {
      event.preventDefault();
      attack();
    });

    window.addEventListener("resize", resize);
  }

  function onLookStart(event) {
    if (look.id !== null) return;
    look.id = event.pointerId;
    look.x = event.clientX;
    look.y = event.clientY;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (error) {}
    event.preventDefault();
  }

  function onLookMove(event) {
    if (event.pointerId !== look.id) return;
    var dx = event.clientX - look.x;
    var dy = event.clientY - look.y;
    look.x = event.clientX;
    look.y = event.clientY;
    player.yaw -= dx * 0.0042;
    player.pitch = clamp(player.pitch - dy * 0.0036, -1.15, 1.15);
    event.preventDefault();
  }

  function onLookEnd(event) {
    if (event.pointerId !== look.id) return;
    look.id = null;
  }

  function onJoyStart(event) {
    if (joy.id !== null) return;
    joy.id = event.pointerId;
    var rect = joystick.getBoundingClientRect();
    joy.cx = rect.left + rect.width / 2;
    joy.cy = rect.top + rect.height / 2;
    joy.max = Math.max(20, rect.width / 2 - knob.offsetWidth / 2 - 3);
    try {
      joystick.setPointerCapture(event.pointerId);
    } catch (error) {}
    onJoyMove(event);
    event.preventDefault();
  }

  function onJoyMove(event) {
    if (event.pointerId !== joy.id) return;
    var dx = event.clientX - joy.cx;
    var dy = event.clientY - joy.cy;
    var length = Math.sqrt(dx * dx + dy * dy);
    if (length > joy.max) {
      dx = (dx / length) * joy.max;
      dy = (dy / length) * joy.max;
    }
    knob.style.transform = "translate(" + dx + "px, " + dy + "px)";
    input.x = dx / joy.max;
    input.y = dy / joy.max;
    event.preventDefault();
  }

  function onJoyEnd(event) {
    if (event.pointerId !== joy.id) return;
    joy.id = null;
    input.x = 0;
    input.y = 0;
    knob.style.transform = "translate(0px, 0px)";
  }

  function jump() {
    if (!state.running || !player.onGround) return;
    player.vy = 5.4;
    player.onGround = false;
    haptic("medium");
  }

  function attack() {
    if (!state.running || state.attackT > 0) return;
    state.attackT = 0.28;
    haptic("heavy");

    tmpForward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    var origin = player.pos;
    var hitAny = false;

    enemies.forEach(function (enemy) {
      if (!enemy.alive) return;
      var dx = enemy.group.position.x - origin.x;
      var dz = enemy.group.position.z - origin.z;
      var distance = Math.sqrt(dx * dx + dz * dz);
      if (distance > 3.6 || distance < 0.01) return;
      var dot = (dx / distance) * tmpForward.x + (dz / distance) * tmpForward.z;
      if (dot < 0.35) return;

      enemy.hp -= 36;
      enemy.bodyMaterial.emissiveIntensity = 3;
      enemy.bodyMaterial.emissive.setHex(0xfff1c4);
      enemy.headMaterial.emissiveIntensity = 2.4;
      hitAny = true;

      if (enemy.hp <= 0) {
        enemy.alive = false;
        enemy.group.visible = false;
        enemy.respawnAt = state.time + 5;
        spawnRing(enemy.group.position);
      }
    });

    if (hitAny) haptic("light");
  }

  function spawnRing(position) {
    var ring = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.5, 26),
      new THREE.MeshBasicMaterial({
        color: 0xffd166,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(position.x, 0.06, position.z);
    scene.add(ring);
    effects.push({ mesh: ring, life: 0.55, max: 0.55 });
  }

  function updateHealth() {
    var hp = clamp(player.hp, 0, 100);
    if (hpValue) hpValue.textContent = String(Math.round(hp));
    if (hpFill) hpFill.style.width = hp + "%";
    if (hudHealth) hudHealth.classList.toggle("is-low", hp <= 30);
  }

  function damagePlayer(amount) {
    if (state.damageCd > 0) return;
    state.damageCd = 0.9;
    player.hp -= amount;
    haptic("heavy");
    updateHealth();

    if (flash) {
      flash.classList.remove("is-active");
      void flash.offsetWidth;
      flash.classList.add("is-active");
    }

    if (player.hp <= 0) {
      player.hp = 100;
      player.pos.set(0, 1.72, 0);
      player.yaw = 0;
      player.pitch = 0;
      player.vy = 0;
      player.onGround = true;
      updateHealth();
      setHint("Вы возродились");
    }
  }

  function update(dt) {
    state.time += dt;
    if (state.damageCd > 0) state.damageCd -= dt;

    if (state.attackT > 0) {
      state.attackT = Math.max(0, state.attackT - dt);
      var k = 1 - state.attackT / 0.28;
      var swing = Math.sin(k * Math.PI);
      weapon.rotation.z = weaponBase.z - swing * 1.35;
      weapon.rotation.x = weaponBase.x + swing * 0.45;
      weapon.position.z = weaponBase.pz - swing * 0.22;
      weapon.position.y = weaponBase.py + swing * 0.08;
    } else {
      weapon.rotation.z += (weaponBase.z - weapon.rotation.z) * 0.2;
      weapon.rotation.x += (weaponBase.x - weapon.rotation.x) * 0.2;
      weapon.position.z += (weaponBase.pz - weapon.position.z) * 0.2;
      weapon.position.y += (weaponBase.py - weapon.position.y) * 0.2;
    }

    tmpForward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    tmpRight.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));

    var magnitude = Math.sqrt(input.x * input.x + input.y * input.y);
    if (magnitude > 0.08) {
      var driveX = clamp(input.x, -1, 1);
      var driveY = clamp(input.y, -1, 1);
      if (magnitude > 1) {
        driveX /= magnitude;
        driveY /= magnitude;
      }
      var speed = 4.6 * Math.min(magnitude, 1) * dt;
      player.pos.x += (tmpForward.x * -driveY + tmpRight.x * driveX) * speed;
      player.pos.z += (tmpForward.z * -driveY + tmpRight.z * driveX) * speed;
      state.walk += dt * (1 + magnitude);
    }

    player.pos.x = clamp(player.pos.x, -62, 62);
    player.pos.z = clamp(player.pos.z, -62, 62);

    if (!player.onGround) {
      player.vy -= 15 * dt;
      player.pos.y += player.vy * dt;
      if (player.pos.y <= 1.72) {
        player.pos.y = 1.72;
        player.vy = 0;
        player.onGround = true;
      }
    }

    enemies.forEach(function (enemy) {
      if (!enemy.alive) {
        if (state.time >= enemy.respawnAt) {
          enemy.alive = true;
          enemy.hp = 100;
          enemy.group.visible = true;
          var angle = Math.random() * Math.PI * 2;
          var distance = 12 + Math.random() * 20;
          enemy.group.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
        }
        return;
      }

      enemy.group.position.y = Math.sin(state.time * 2 + enemy.phase) * 0.06;
      if (enemy.bodyMaterial.emissiveIntensity > 0.6) {
        enemy.bodyMaterial.emissiveIntensity -= dt * 6;
        enemy.headMaterial.emissiveIntensity -= dt * 5;
      }
      if (enemy.bodyMaterial.emissiveIntensity < 0.6) {
        enemy.bodyMaterial.emissiveIntensity = 0.6;
        enemy.bodyMaterial.emissive.setHex(0x3a0a0a);
        enemy.headMaterial.emissiveIntensity = 0.5;
      }

      var dx = enemy.group.position.x - player.pos.x;
      var dz = enemy.group.position.z - player.pos.z;
      if (dx * dx + dz * dz < 1.8 && player.pos.y < 2.6) {
        damagePlayer(12);
      }
    });

    for (var i = effects.length - 1; i >= 0; i -= 1) {
      var effect = effects[i];
      effect.life -= dt;
      var progress = 1 - effect.life / effect.max;
      var scale = 1 + progress * 5;
      effect.mesh.scale.setScalar(scale);
      effect.mesh.material.opacity = Math.max(0, 0.95 * (1 - progress));
      if (effect.life <= 0) {
        scene.remove(effect.mesh);
        effect.mesh.geometry.dispose();
        effect.mesh.material.dispose();
        effects.splice(i, 1);
      }
    }

    var bob = player.onGround && magnitude > 0.08 ? Math.sin(state.walk * 9) * 0.035 : 0;
    camera.position.set(player.pos.x, player.pos.y + bob, player.pos.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
  }

  function loop(now) {
    if (!state.running) return;
    var dt = Math.min((now - state.last) / 1000, 0.05);
    state.last = now;
    update(dt);
    renderer.render(scene, camera);
    state.raf = window.requestAnimationFrame(loop);
  }

  function start() {
    if (!state.initialized && !initGame()) return;
    if (state.running) return;
    state.running = true;
    state.last = window.performance.now();
    resize();
    updateHealth();
    setHint("Джойстик — движение · свайп — обзор");
    renderer.render(scene, camera);
    state.raf = window.requestAnimationFrame(loop);
  }

  function stop() {
    state.running = false;
    if (state.raf) window.cancelAnimationFrame(state.raf);
    state.raf = 0;
    look.id = null;
    joy.id = null;
    input.x = 0;
    input.y = 0;
    if (knob) knob.style.transform = "translate(0px, 0px)";
  }

  window.addEventListener("mini:screen", function (event) {
    if (!event.detail) return;
    if (event.detail.name === "play") {
      start();
    } else {
      stop();
    }
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      stop();
    } else if (screen.classList.contains("is-active")) {
      start();
    }
  });

  window.addEventListener("resize", function () {
    if (state.running) resize();
  });
})();
