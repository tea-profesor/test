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
  var hudCoinsValue = document.getElementById("hudCoinsValue");
  var coinPop = document.getElementById("coinPop");
  var flash = document.getElementById("gameFlash");
  var hint = document.getElementById("gameHint");
  var bossBar = document.getElementById("bossBar");
  var bossHpValue = document.getElementById("bossHp");
  var bossFill = document.getElementById("bossFill");

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
    bowKick: 0,
    bowEquipped: false,
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
  var swordGroup = null;
  var bowGroup = null;
  var weaponBowMaterial = null;
  var weaponStringMaterial = null;
  var enemies = [];
  var effects = [];
  var arrows = [];
  var boss = null;
  var BOSS_MAX_HP = 1000;

  var tmpForward = null;
  var tmpRight = null;
  var tmpVec = null;
  var upAxis = null;

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
    upAxis = new THREE.Vector3(0, 1, 0);
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
        phase: index * 1.7,
        baseY: 0
      });
    });
  }

  function addWeapon() {
    weapon = new THREE.Group();
    swordGroup = new THREE.Group();
    bowGroup = new THREE.Group();

    var bladeMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd166,
      emissive: 0xffb000,
      emissiveIntensity: 1.1,
      metalness: 0.85,
      roughness: 0.22
    });
    var gripMaterial = new THREE.MeshStandardMaterial({ color: 0x243447, roughness: 0.8 });
    var goldMaterial = new THREE.MeshStandardMaterial({
      color: 0xffc94a,
      emissive: 0x6a3b00,
      emissiveIntensity: 0.45,
      metalness: 0.8,
      roughness: 0.3
    });

    var blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.78, 0.05), bladeMaterial);
    blade.position.y = 0.52;
    swordGroup.add(blade);

    var tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 4), bladeMaterial);
    tip.position.y = 0.98;
    tip.rotation.y = Math.PI / 4;
    swordGroup.add(tip);

    var guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.08), goldMaterial);
    guard.position.y = 0.13;
    swordGroup.add(guard);

    var grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.28, 8), gripMaterial);
    grip.position.y = -0.02;
    swordGroup.add(grip);

    var woodMaterial = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.85 });
    var stringMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 });

    weaponBowMaterial = woodMaterial;
    weaponStringMaterial = stringMaterial;

    var bowArc = -Math.PI * 0.55;
    var bowSpan = Math.PI * 1.1;
    var bowRadius = 0.3;

    var limb = new THREE.Mesh(
      new THREE.TorusGeometry(bowRadius, 0.022, 6, 28, bowSpan),
      woodMaterial
    );
    limb.rotation.z = bowArc;
    bowGroup.add(limb);

    var pointA = new THREE.Vector3(
      Math.cos(bowArc) * bowRadius,
      Math.sin(bowArc) * bowRadius,
      0
    );
    var pointB = new THREE.Vector3(
      Math.cos(bowArc + bowSpan) * bowRadius,
      Math.sin(bowArc + bowSpan) * bowRadius,
      0
    );
    var stringGeometry = new THREE.BufferGeometry().setFromPoints([pointA, pointB]);
    bowGroup.add(new THREE.Line(stringGeometry, stringMaterial));

    var bowGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.16, 8), gripMaterial);
    bowGrip.position.set(bowRadius, 0, 0);
    bowGroup.add(bowGrip);

    bowGroup.position.set(-0.34, -0.26, -0.62);
    bowGroup.rotation.set(-0.18, 0.24, -0.12);
    bowGroup.visible = false;
    swordGroup.visible = true;

    weapon.add(swordGroup);
    weapon.add(bowGroup);

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
    if (state.bowEquipped) {
      shootArrow();
    } else {
      meleeAttack();
    }
  }

  function meleeAttack() {
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

      damageEnemy(enemy, 36);
      hitAny = true;
    });

    if (boss && boss.alive) {
      var bossDx = boss.group.position.x - origin.x;
      var bossDz = boss.group.position.z - origin.z;
      var bossDistance = Math.sqrt(bossDx * bossDx + bossDz * bossDz);
      if (bossDistance < 4.6 && bossDistance > 0.01) {
        var bossDot =
          (bossDx / bossDistance) * tmpForward.x + (bossDz / bossDistance) * tmpForward.z;
        if (bossDot > 0.25) {
          damageBoss(36);
          hitAny = true;
        }
      }
    }

    if (hitAny) haptic("light");
  }

  function makeArrow() {
    var group = new THREE.Group();

    var shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.82, 5),
      new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 })
    );
    group.add(shaft);

    var tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.045, 0.14, 4),
      new THREE.MeshStandardMaterial({
        color: 0xd8f6ff,
        emissive: 0x2fd9ff,
        emissiveIntensity: 1.1,
        metalness: 0.4,
        roughness: 0.3
      })
    );
    tip.position.y = 0.48;
    group.add(tip);

    var fletch = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.13, 4),
      new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.8 })
    );
    fletch.position.y = -0.42;
    fletch.rotation.x = Math.PI;
    group.add(fletch);

    return group;
  }

  function shootArrow() {
    state.attackT = 0.45;
    state.bowKick = 1;
    haptic("heavy");

    camera.updateMatrixWorld(true);
    camera.getWorldDirection(tmpForward);
    var direction = tmpForward.clone().normalize();
    var origin = camera.position.clone().addScaledVector(direction, 0.55);

    var mesh = makeArrow();
    mesh.position.copy(origin);
    mesh.quaternion.setFromUnitVectors(upAxis, direction);
    scene.add(mesh);

    arrows.push({ mesh: mesh, dir: direction, life: 2.6 });
  }

  function damageEnemy(enemy, amount) {
    if (!enemy.alive) return;
    enemy.hp -= amount;
    enemy.bodyMaterial.emissiveIntensity = 3;
    enemy.bodyMaterial.emissive.setHex(0xfff1c4);
    enemy.headMaterial.emissiveIntensity = 2.4;
    if (enemy.hp <= 0) killEnemy(enemy);
  }

  function killEnemy(enemy) {
    enemy.alive = false;
    enemy.group.visible = false;
    spawnRing(enemy.group.position);

    var remaining = enemies.filter(function (item) {
      return item.alive;
    }).length;
    if (!remaining) spawnBoss();
    else setHint("Врагов осталось: " + remaining);

    if (window.GameStore) {
      var reward = window.GameStore.registerKill();
      showCoinPop(reward);
      updateCoinHud();
    }
  }

  function spawnBoss() {
    if (boss || !scene) return;

    var group = new THREE.Group();
    var bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b1226,
      emissive: 0x2a0008,
      emissiveIntensity: 0.85,
      roughness: 0.6
    });
    var headMaterial = new THREE.MeshStandardMaterial({
      color: 0x6e0f1e,
      emissive: 0x1f0005,
      emissiveIntensity: 0.7,
      roughness: 0.65
    });
    var goldMaterial = new THREE.MeshStandardMaterial({
      color: 0xffc94a,
      emissive: 0x6a3b00,
      emissiveIntensity: 0.5,
      metalness: 0.8,
      roughness: 0.3
    });
    var eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0xff3b3b,
      emissive: 0xff1a1a,
      emissiveIntensity: 2.2
    });

    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.05, 2.4, 12), bodyMaterial);
    body.position.y = 1.5;
    group.add(body);

    var head = new THREE.Mesh(new THREE.SphereGeometry(0.76, 16, 14), headMaterial);
    head.position.y = 3.15;
    group.add(head);

    var hornLeft = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.95, 8), goldMaterial);
    hornLeft.position.set(-0.52, 3.7, 0);
    hornLeft.rotation.z = 0.55;
    group.add(hornLeft);
    var hornRight = hornLeft.clone();
    hornRight.position.x = 0.52;
    hornRight.rotation.z = -0.55;
    group.add(hornRight);

    var eyeLeft = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), eyeMaterial);
    eyeLeft.position.set(-0.26, 3.24, 0.63);
    group.add(eyeLeft);
    var eyeRight = eyeLeft.clone();
    eyeRight.position.x = 0.26;
    group.add(eyeRight);

    for (var i = 0; i < 5; i += 1) {
      var spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 6), goldMaterial);
      var spikeAngle = (i / 5) * Math.PI * 2;
      spike.position.set(Math.cos(spikeAngle) * 0.5, 3.82, Math.sin(spikeAngle) * 0.5);
      group.add(spike);
    }

    var aura = new THREE.Mesh(
      new THREE.RingGeometry(1.35, 1.6, 36),
      new THREE.MeshBasicMaterial({
        color: 0xff2a44,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide
      })
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.05;
    group.add(aura);

    var forwardX = -Math.sin(player.yaw);
    var forwardZ = -Math.cos(player.yaw);
    var spawnX = clamp(player.pos.x + forwardX * 14, -55, 55);
    var spawnZ = clamp(player.pos.z + forwardZ * 14, -55, 55);

    group.position.set(spawnX, 0, spawnZ);
    scene.add(group);

    boss = {
      group: group,
      bodyMaterial: bodyMaterial,
      headMaterial: headMaterial,
      aura: aura,
      hp: BOSS_MAX_HP,
      maxHp: BOSS_MAX_HP,
      alive: true,
      phase: 0
    };

    updateBossHealth();
    if (bossBar) bossBar.hidden = false;
    setHint("Главный босс! 1000 HP · атака 10");
    haptic("heavy");
  }

  function updateBossHealth() {
    if (!boss) return;
    var hp = Math.max(0, Math.ceil(boss.hp));
    if (bossFill) bossFill.style.width = clamp((hp / boss.maxHp) * 100, 0, 100) + "%";
    if (bossHpValue) bossHpValue.textContent = hp + " / " + boss.maxHp;
  }

  function damageBoss(amount) {
    if (!boss || !boss.alive) return;
    boss.hp -= amount;
    boss.bodyMaterial.emissiveIntensity = 2.6;
    boss.bodyMaterial.emissive.setHex(0xfff1c4);
    boss.headMaterial.emissiveIntensity = 2;
    updateBossHealth();
    if (boss.hp <= 0) killBoss();
  }

  function killBoss() {
    if (!boss || !boss.alive) return;

    boss.alive = false;
    boss.group.visible = false;
    spawnRing(boss.group.position);

    if (window.GameStore) {
      window.GameStore.registerKill();
      window.GameStore.addCoins(900);
      showCoinPop(1000);
      updateCoinHud();
    }

    setHint("Босс побеждён!");
    haptic("heavy");

    window.setTimeout(function () {
      if (bossBar && boss && !boss.alive) bossBar.hidden = true;
    }, 2500);
  }

  function updateBoss(dt) {
    if (!boss || !boss.alive) return;

    boss.group.position.y = Math.sin(state.time * 2.2 + boss.phase) * 0.09;

    var dx = player.pos.x - boss.group.position.x;
    var dz = player.pos.z - boss.group.position.z;
    var distance = Math.sqrt(dx * dx + dz * dz);

    boss.group.rotation.y = Math.atan2(dx, dz);

    if (distance > 2.6) {
      var speed = 1.7 * dt;
      boss.group.position.x += (dx / distance) * speed;
      boss.group.position.z += (dz / distance) * speed;
    }

    if (boss.bodyMaterial.emissiveIntensity > 0.85) {
      boss.bodyMaterial.emissiveIntensity -= dt * 5;
      boss.headMaterial.emissiveIntensity -= dt * 4;
    }
    if (boss.bodyMaterial.emissiveIntensity <= 0.85) {
      boss.bodyMaterial.emissiveIntensity = 0.85;
      boss.bodyMaterial.emissive.setHex(0x2a0008);
      boss.headMaterial.emissiveIntensity = 0.7;
    }

    if (boss.aura) {
      boss.aura.material.opacity = 0.4 + Math.sin(state.time * 4) * 0.15;
    }

    if (distance < 3.1 && player.pos.y < 3) {
      damagePlayer(10);
    }
  }

  function showCoinPop(amount) {
    if (!coinPop || !amount) return;
    coinPop.textContent = "+" + amount;
    coinPop.classList.remove("is-active");
    void coinPop.offsetWidth;
    coinPop.classList.add("is-active");
  }

  function updateCoinHud(snapshot) {
    if (!hudCoinsValue) return;
    var data = snapshot || (window.GameStore ? window.GameStore.get() : null);
    if (data) hudCoinsValue.textContent = String(data.coins);
  }

  function applyLoadout(snapshot) {
    if (!weapon) return;
    var bow = snapshot ? snapshot.bow : window.GameStore ? window.GameStore.hasBow() : false;
    state.bowEquipped = Boolean(bow);
    if (swordGroup) swordGroup.visible = !state.bowEquipped;
    if (bowGroup) bowGroup.visible = state.bowEquipped;

    if (window.GameStore) {
      var skinId = snapshot ? snapshot.skin : window.GameStore.get().skin;
      var skin = window.GameStore.getSkin(skinId);
      if (weaponBowMaterial) weaponBowMaterial.color.setHex(skin.primary);
      if (weaponStringMaterial) weaponStringMaterial.color.setHex(skin.accent);
      if (stage) stage.style.setProperty("--skin-accent", skin.css[0]);
    }
  }

  function removeArrow(index) {
    var arrow = arrows[index];
    scene.remove(arrow.mesh);
    arrow.mesh.traverse(function (child) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    arrows.splice(index, 1);
  }

  function findArrowHit(x, y, z) {
    for (var i = 0; i < enemies.length; i += 1) {
      var enemy = enemies[i];
      if (!enemy.alive) continue;
      var dx = x - enemy.group.position.x;
      var dz = z - enemy.group.position.z;
      var dy = y - (enemy.group.position.y + 0.9);
      if (dx * dx + dz * dz < 0.36 && Math.abs(dy) < 1) return enemy;
    }

    if (boss && boss.alive) {
      var bossDx = x - boss.group.position.x;
      var bossDz = z - boss.group.position.z;
      var bossDy = y - (boss.group.position.y + 1.9);
      if (bossDx * bossDx + bossDz * bossDz < 2.1 && Math.abs(bossDy) < 2.2) return boss;
    }

    return null;
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

    if (!boss) {
      var anyEnemyAlive = enemies.some(function (item) {
        return item.alive;
      });
      if (!anyEnemyAlive) spawnBoss();
    }

    if (state.attackT > 0) state.attackT = Math.max(0, state.attackT - dt);

    if (state.bowEquipped) {
      state.bowKick = Math.max(0, state.bowKick - dt * 5);
      weapon.position.z += (weaponBase.pz + state.bowKick * 0.12 - weapon.position.z) * 0.3;
      weapon.rotation.z += (weaponBase.z - weapon.rotation.z) * 0.2;
      weapon.rotation.x += (weaponBase.x - weapon.rotation.x) * 0.2;
      weapon.position.y += (weaponBase.py - weapon.position.y) * 0.2;
    } else {
      var swing = state.attackT > 0 ? Math.sin((1 - state.attackT / 0.28) * Math.PI) : 0;
      weapon.rotation.z = weaponBase.z - swing * 1.35;
      weapon.rotation.x = weaponBase.x + swing * 0.45;
      weapon.position.z = weaponBase.pz - swing * 0.22;
      weapon.position.y = weaponBase.py + swing * 0.08;
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
      if (!enemy.alive) return;

      enemy.group.position.y = Math.sin(state.time * 2 + enemy.phase) * 0.06;
      if (enemy.bodyMaterial.emissiveIntensity > 0.6) {
        enemy.bodyMaterial.emissiveIntensity -= dt * 6;
        enemy.headMaterial.emissiveIntensity -= dt * 5;
      }
      if (enemy.bodyMaterial.emissiveIntensity <= 0.6) {
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

    updateBoss(dt);

    for (var a = arrows.length - 1; a >= 0; a -= 1) {
      var arrow = arrows[a];
      arrow.life -= dt;
      var step = 34 * dt;
      var midX = arrow.mesh.position.x + arrow.dir.x * step * 0.5;
      var midY = arrow.mesh.position.y + arrow.dir.y * step * 0.5;
      var midZ = arrow.mesh.position.z + arrow.dir.z * step * 0.5;
      arrow.mesh.position.addScaledVector(arrow.dir, step);

      var hit = findArrowHit(midX, midY, midZ) || findArrowHit(
        arrow.mesh.position.x,
        arrow.mesh.position.y,
        arrow.mesh.position.z
      );

      if (hit) {
        if (hit === boss) {
          damageBoss(50);
        } else {
          damageEnemy(hit, 50);
        }
        removeArrow(a);
        continue;
      }

      if (
        arrow.life <= 0 ||
        Math.abs(arrow.mesh.position.x) > 80 ||
        Math.abs(arrow.mesh.position.z) > 80 ||
        arrow.mesh.position.y < -1 ||
        arrow.mesh.position.y > 45
      ) {
        removeArrow(a);
      }
    }

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
    if (!(lobby && !lobby.hidden)) update(dt);
    updateNetwork(dt);
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
    applyLoadout();
    updateCoinHud();
    setHint(state.bowEquipped ? "Лук · стрелы бесконечны · свайп — обзор" : "Джойстик — движение · свайп — обзор");
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

  var NET_URL = "wss://broker.hivemq.com:8884/mqtt";
  var NET_TOPIC = "miniarcade/v1/room/";
  var NET_MAX = 5;
  var NET_STALE = 6000;
  var NET_SEND_MS = 120;
  var NET_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var NET_ID_KEY = "mini_arcade_net_id";

  var netBtn = document.getElementById("netBtn");
  var netLabel = document.getElementById("netLabel");
  var lobby = document.getElementById("lobby");
  var lobbyClose = document.getElementById("lobbyClose");
  var lobbySetup = document.getElementById("lobbySetup");
  var lobbyRoom = document.getElementById("lobbyRoom");
  var roomCode = document.getElementById("roomCode");
  var roomCount = document.getElementById("roomCount");
  var roomPlayers = document.getElementById("roomPlayers");
  var lobbyStatus = document.getElementById("lobbyStatus");
  var roomInput = document.getElementById("roomInput");
  var createRoomBtn = document.getElementById("createRoomBtn");
  var joinRoomBtn = document.getElementById("joinRoomBtn");
  var copyCodeBtn = document.getElementById("copyCodeBtn");
  var leaveRoomBtn = document.getElementById("leaveRoomBtn");

  var net = {
    client: null,
    room: "",
    status: "offline",
    connected: false,
    id: netIdentity(),
    name: "Игрок",
    skin: "scout",
    remote: {},
    sendAcc: 0
  };

  function netIdentity() {
    try {
      var saved = localStorage.getItem(NET_ID_KEY);
      if (saved) return saved;
    } catch (error) {}
    var id = "p" + Math.random().toString(36).slice(2, 10);
    try {
      localStorage.setItem(NET_ID_KEY, id);
    } catch (error) {}
    return id;
  }

  function netPlayerName() {
    var user = tg && tg.initDataUnsafe ? tg.initDataUnsafe.user : null;
    var name = user && (user.first_name || user.username);
    return String(name || "Игрок").trim().slice(0, 16) || "Игрок";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function netSkinId(id) {
    return window.GameStore ? window.GameStore.getSkin(id).id : "scout";
  }

  function netSetStatus(text, isError) {
    net.statusText = text;
    if (!lobbyStatus) return;
    lobbyStatus.textContent = text;
    lobbyStatus.classList.toggle("is-error", Boolean(isError));
  }

  function netUpdateUi() {
    if (netLabel) {
      netLabel.textContent = net.room ? "Комната " + net.room : "Сеть";
    }
    if (netBtn) {
      netBtn.classList.toggle("is-online", net.status === "online");
    }
    if (!lobby) return;

    if (lobbySetup) lobbySetup.hidden = Boolean(net.room);
    if (lobbyRoom) lobbyRoom.hidden = !net.room;
    if (roomCode) roomCode.textContent = net.room || "—";

    if (net.room) {
      var count = 1 + Object.keys(net.remote).length;
      if (roomCount) roomCount.textContent = count + "/" + NET_MAX;
      netRenderPlayers();
    }

    if (net.status === "offline" && !net.room && !net.statusText) {
      netSetStatus("Создайте комнату или введите код");
    }
  }

  function netRenderPlayers() {
    if (!roomPlayers) return;
    var rows = [{ id: net.id, name: net.name, skin: net.skin, self: true }];

    Object.keys(net.remote).forEach(function (id) {
      var remote = net.remote[id];
      rows.push({ id: id, name: remote.name, skin: remote.skin, self: false });
    });

    roomPlayers.innerHTML = rows
      .map(function (row) {
        var skin = window.GameStore ? window.GameStore.getSkin(row.skin) : null;
        var color = skin ? skin.css[0] : "#3ee08f";
        return (
          '<div class="room-player' +
          (row.self ? " is-self" : "") +
          '">' +
          '<span class="swatch" style="background:' +
          color +
          '"></span>' +
          '<span>' +
          escapeHtml(row.name) +
          "</span>" +
          '<span class="tag badge">' +
          (row.self ? "ВЫ" : "ОНЛАЙН") +
          "</span></div>"
        );
      })
      .join("");
  }

  function makeRoomCode() {
    var code = "";
    for (var i = 0; i < 5; i += 1) {
      code += NET_ALPHABET[Math.floor(Math.random() * NET_ALPHABET.length)];
    }
    return code;
  }

  function openLobby() {
    if (!lobby) return;
    lobby.hidden = false;
    net.name = netPlayerName();
    if (window.GameStore) net.skin = window.GameStore.get().skin;
    netUpdateUi();
    if (net.status === "offline") {
      netSetStatus("Создайте комнату или введите код");
    } else if (net.status === "online") {
      netSetStatus("Вы в комнате");
    }
  }

  function closeLobby() {
    if (lobby) lobby.hidden = true;
  }

  function netOnMessage(payload) {
    var msg;
    try {
      msg = JSON.parse(String(payload));
    } catch (error) {
      return;
    }

    if (!msg || typeof msg.id !== "string" || msg.id === net.id) return;
    var now = Date.now();

    if (msg.leave) {
      netRemoveRemote(msg.id);
      return;
    }

    if (
      typeof msg.x !== "number" ||
      typeof msg.z !== "number" ||
      typeof msg.yaw !== "number"
    ) {
      return;
    }

    var known = net.remote[msg.id];
    if (!known && Object.keys(net.remote).length >= NET_MAX - 1) return;

    var skin = netSkinId(msg.skin);
    var name = String(msg.name || "Игрок").slice(0, 16);
    var x = clamp(msg.x, -64, 64);
    var z = clamp(msg.z, -64, 64);
    var y = clamp(Number(msg.y) || 1.72, 0, 6);
    var yaw = Number(msg.yaw) || 0;

    if (known) {
      known.x = x;
      known.z = z;
      known.y = y;
      known.yaw = yaw;
      known.seen = now;
      known.name = name;
      if (known.skin !== skin) {
        known.skin = skin;
        netApplyAvatarSkin(known);
      }
      return;
    }

    if (!scene) return;

    var avatar = makeRemoteAvatar(name, skin);
    avatar.group.position.set(x, Math.max(0, y - 1.72), z);
    avatar.group.rotation.y = yaw + Math.PI;
    scene.add(avatar.group);

    net.remote[msg.id] = {
      id: msg.id,
      name: name,
      skin: skin,
      x: x,
      y: y,
      z: z,
      yaw: yaw,
      seen: now,
      avatar: avatar
    };

    netUpdateUi();
  }

  function makeRemoteAvatar(name, skinId) {
    var skin = window.GameStore
      ? window.GameStore.getSkin(skinId)
      : { primary: 0x3ee08f, secondary: 0x0f3b26, accent: 0x43e7ff, css: ["#3ee08f", "#0f3b26", "#43e7ff"] };

    var group = new THREE.Group();

    var bodyMaterial = new THREE.MeshStandardMaterial({
      color: skin.primary,
      emissive: skin.secondary,
      emissiveIntensity: 0.6,
      roughness: 0.55,
      metalness: 0.1
    });
    var headMaterial = new THREE.MeshStandardMaterial({
      color: skin.accent,
      emissive: skin.primary,
      emissiveIntensity: 0.35,
      roughness: 0.45
    });
    var visorMaterial = new THREE.MeshStandardMaterial({
      color: 0x0b1220,
      emissive: skin.accent,
      emissiveIntensity: 1.5,
      roughness: 0.2,
      metalness: 0.4
    });

    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.45, 1.05, 10), bodyMaterial);
    body.position.y = 0.62;
    group.add(body);

    var head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 14, 12), headMaterial);
    head.position.y = 1.32;
    group.add(head);

    var visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.08), visorMaterial);
    visor.position.set(0, 1.35, 0.27);
    group.add(visor);

    var ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.58, 28),
      new THREE.MeshBasicMaterial({
        color: skin.accent,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    group.add(ring);

    var sprite = makeNameSprite(name);
    group.add(sprite);

    return {
      group: group,
      bodyMaterial: bodyMaterial,
      headMaterial: headMaterial,
      visorMaterial: visorMaterial,
      ring: ring,
      sprite: sprite
    };
  }

  function makeNameSprite(text) {
    var canvasName = document.createElement("canvas");
    canvasName.width = 256;
    canvasName.height = 64;
    var context = canvasName.getContext("2d");

    context.fillStyle = "rgba(4, 10, 8, 0.55)";
    context.fillRect(8, 12, 240, 40);
    context.fillStyle = "#eafff4";
    context.font = "600 28px system-ui, -apple-system, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(text).slice(0, 18), 128, 32, 230);

    var texture = new THREE.CanvasTexture(canvasName);
    texture.encoding = THREE.sRGBEncoding;

    var sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
    );
    sprite.scale.set(2.2, 0.55, 1);
    sprite.position.y = 2.05;
    return sprite;
  }

  function netApplyAvatarSkin(remote) {
    if (!remote.avatar || !window.GameStore) return;
    var skin = window.GameStore.getSkin(remote.skin);
    remote.avatar.bodyMaterial.color.setHex(skin.primary);
    remote.avatar.bodyMaterial.emissive.setHex(skin.secondary);
    remote.avatar.headMaterial.color.setHex(skin.accent);
    remote.avatar.headMaterial.emissive.setHex(skin.primary);
    remote.avatar.visorMaterial.emissive.setHex(skin.accent);
    remote.avatar.ring.material.color.setHex(skin.accent);
    netRenderPlayers();
  }

  function netRemoveRemote(id) {
    var remote = net.remote[id];
    if (!remote) return;

    if (remote.avatar) {
      scene.remove(remote.avatar.group);
      remote.avatar.group.traverse(function (child) {
        if (child.isSprite) {
          if (child.material) {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
          return;
        }
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
    }

    delete net.remote[id];
    netUpdateUi();
  }

  function netClearRemote() {
    Object.keys(net.remote).forEach(function (id) {
      netRemoveRemote(id);
    });
  }

  function netSend() {
    if (!net.client || !net.connected || !net.room) return;

    net.skin = window.GameStore ? window.GameStore.get().skin : net.skin;
    var payload = JSON.stringify({
      id: net.id,
      name: net.name,
      skin: net.skin,
      x: Math.round(player.pos.x * 100) / 100,
      y: Math.round(player.pos.y * 100) / 100,
      z: Math.round(player.pos.z * 100) / 100,
      yaw: Math.round(player.yaw * 1000) / 1000,
      ts: Date.now()
    });

    try {
      net.client.publish(NET_TOPIC + net.room, payload, { qos: 0 });
    } catch (error) {}
  }

  function updateNetwork(dt) {
    if (!net.client) return;

    if (net.connected) {
      net.sendAcc += dt * 1000;
      if (net.sendAcc >= NET_SEND_MS) {
        net.sendAcc = 0;
        netSend();
      }
    }

    var now = Date.now();
    Object.keys(net.remote).forEach(function (id) {
      var remote = net.remote[id];
      if (now - remote.seen > NET_STALE) {
        netRemoveRemote(id);
        return;
      }

      var avatar = remote.avatar;
      if (!avatar) return;

      var k = Math.min(1, dt * 9);
      avatar.group.position.x += (remote.x - avatar.group.position.x) * k;
      avatar.group.position.z += (remote.z - avatar.group.position.z) * k;
      avatar.group.position.y +=
        (Math.max(0, remote.y - 1.72) - avatar.group.position.y) * k;

      var targetYaw = remote.yaw + Math.PI;
      var diff = Math.atan2(
        Math.sin(targetYaw - avatar.group.rotation.y),
        Math.cos(targetYaw - avatar.group.rotation.y)
      );
      avatar.group.rotation.y += diff * Math.min(1, dt * 10);
    });
  }

  function netConnect(code) {
    if (!window.mqtt) {
      netSetStatus("Сетевой модуль не загрузился", true);
      return;
    }

    netLeave(true);
    net.room = code;
    net.name = netPlayerName();
    net.skin = window.GameStore ? window.GameStore.get().skin : "scout";
    net.status = "connecting";
    net.statusText = "";
    net.sendAcc = 0;
    netUpdateUi();
    netSetStatus("Подключение…");

    var client;
    try {
      client = window.mqtt.connect(NET_URL, {
        clientId: net.id,
        clean: true,
        keepalive: 30,
        reconnectPeriod: 2500,
        connectTimeout: 9000,
        protocolVersion: 4
      });
    } catch (error) {
      net.status = "offline";
      netSetStatus("Не удалось подключиться", true);
      netUpdateUi();
      return;
    }

    net.client = client;

    client.on("connect", function () {
      if (net.client !== client) return;
      net.connected = true;
      net.status = "online";
      net.sendAcc = NET_SEND_MS;
      netSetStatus("Вы в комнате");
      netUpdateUi();
      netSend();

      client.subscribe(NET_TOPIC + net.room, { qos: 0 }, function (error) {
        if (error && net.client === client) {
          netSetStatus("Ошибка подписки на комнату", true);
        }
      });

      setHint("Комната " + net.room + " · до " + NET_MAX + " игроков");
    });

    client.on("message", function (topic, payload) {
      if (net.client !== client) return;
      netOnMessage(payload);
    });

    client.on("close", function () {
      if (net.client !== client || net.status === "offline") return;
      net.connected = false;
      net.status = "connecting";
      netSetStatus("Переподключение…");
      netUpdateUi();
    });

    client.on("error", function () {
      if (net.client !== client || net.status === "offline") return;
      net.connected = false;
      net.status = "connecting";
      netSetStatus("Сеть недоступна, пробуем снова…", true);
      netUpdateUi();
    });
  }

  function netLeave(quiet) {
    var client = net.client;
    var room = net.room;

    if (client) {
      try {
        if (client.connected && room) {
          client.publish(
            NET_TOPIC + room,
            JSON.stringify({ id: net.id, leave: true, ts: Date.now() }),
            { qos: 0 }
          );
        }
      } catch (error) {}

      window.setTimeout(function () {
        try {
          client.end(true);
        } catch (error) {}
      }, 120);
    }

    net.client = null;
    net.connected = false;
    net.room = "";
    net.status = "offline";
    net.statusText = "";
    net.sendAcc = 0;
    netClearRemote();
    netUpdateUi();

    if (!quiet) {
      netSetStatus("Вы вышли из сети");
      setHint("Сеть отключена");
    }
  }

  function copyRoomCode() {
    if (!net.room) return;
    var value = net.room;

    function done() {
      netSetStatus("Код скопирован: " + value);
      haptic("light");
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(done, fallback);
      return;
    }

    fallback();

    function fallback() {
      try {
        var area = document.createElement("textarea");
        area.value = value;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
        done();
      } catch (error) {
        netSetStatus("Код: " + value);
      }
    }
  }

  if (netBtn) {
    netBtn.addEventListener("click", function () {
      haptic("light");
      openLobby();
    });
  }

  if (lobbyClose) {
    lobbyClose.addEventListener("click", function () {
      haptic("light");
      closeLobby();
    });
  }

  if (createRoomBtn) {
    createRoomBtn.addEventListener("click", function () {
      haptic("medium");
      netConnect(makeRoomCode());
    });
  }

  if (joinRoomBtn) {
    joinRoomBtn.addEventListener("click", function () {
      haptic("medium");
      var code = (roomInput ? roomInput.value : "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 5);
      if (code.length !== 5) {
        netSetStatus("Код комнаты — 5 символов", true);
        return;
      }
      netConnect(code);
    });
  }

  if (roomInput) {
    roomInput.addEventListener("input", function () {
      roomInput.value = roomInput.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 5);
    });
    roomInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        if (joinRoomBtn) joinRoomBtn.click();
      }
    });
  }

  if (copyCodeBtn) copyCodeBtn.addEventListener("click", copyRoomCode);

  if (leaveRoomBtn) {
    leaveRoomBtn.addEventListener("click", function () {
      haptic("medium");
      netLeave(false);
    });
  }

  window.addEventListener("mini:lobby", function () {
    openLobby();
  });

  window.addEventListener("pagehide", function () {
    netLeave(true);
  });

  if (window.GameStore) {
    window.GameStore.onChange(function (snapshot) {
      updateCoinHud(snapshot);
      applyLoadout(snapshot);
      if (net.room) {
        net.skin = snapshot.skin;
        netRenderPlayers();
      }
    });
  }

  window.addEventListener("mini:screen", function (event) {
    if (!event.detail) return;
    if (event.detail.name === "play") {
      start();
    } else {
      stop();
      closeLobby();
      netLeave(true);
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
