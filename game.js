'use strict';

/* ================= ЧИСТАЯ ЛОГИКА (тестируется в node) ================= */
var CUBE = 90;            // размер коробки, мировые px
var GAME_WIDTH = 540;     // ширина игровой площадки
var BOUND = GAME_WIDTH / 2 - CUBE / 2; // 225 — границы движения по X/Z
var AXIS_SWITCH = 6;      // каждые N слоёв ось движения меняется

var FLAVORS = [
  { name: 'МЯТА',      c1: '#14c9ae', c2: '#0b7f6b', ct: '#b8f7e2', cd: '#084b41' },
  { name: 'ВИНОГРАД',  c1: '#8e4fd8', c2: '#5b2a94', ct: '#dcc3ff', cd: '#3c1a68' },
  { name: 'МАНГО',     c1: '#ff9f2e', c2: '#e05a00', ct: '#ffd9a8', cd: '#9c3c00' },
  { name: 'КЛУБНИКА',  c1: '#ff5f87', c2: '#c11f4d', ct: '#ffd0dc', cd: '#7d1133' },
  { name: 'ЧЕРНИКА',   c1: '#3b66ff', c2: '#1d2f8f', ct: '#b8caff', cd: '#121f6b' },
  { name: 'ЛИМОН',     c1: '#ffd94a', c2: '#d49a00', ct: '#fff3c0', cd: '#8f6200' }
];

function flavorFor(level) {
  return FLAVORS[Math.floor(level / 3) % FLAVORS.length];
}
function speedFor(level) {
  return Math.min(3.4 + level * 0.16, 9.2);
}
function axisFor(level) {
  return Math.floor(level / AXIS_SWITCH) % 2 === 0 ? 'x' : 'z';
}
/* Перекрытие интервалов [a, a+sa] и [b, b+sb]; null если нет пересечения */
function overlap1d(a, sa, b, sb) {
  var lo = Math.max(a, b);
  var hi = Math.min(a + sa, b + sb);
  if (hi - lo <= 0.02) return null;
  return { start: lo, size: hi - lo };
}

/* Экспорт для node-тестов */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CUBE: CUBE, GAME_WIDTH: GAME_WIDTH, BOUND: BOUND, AXIS_SWITCH: AXIS_SWITCH, FLAVORS: FLAVORS, flavorFor: flavorFor, speedFor: speedFor, axisFor: axisFor, overlap1d: overlap1d };
}

/* ================= БРАУЗЕРНАЯ ЧАСТЬ ================= */
if (typeof window !== 'undefined') {
  window.addEventListener('load', function () { initGame(); });
}

var scene, camera, hudScore, tapHint, perfect;
var state = 'menu', level = 0, best = 0;
var stack = [];       // слои {x, z, sx, sz, y}
var moving = null;    // {el, x, z, sx, sz, y, dir, speed}
var debris = [];      // {el, x, y, z, vx, vy, vrx, vrz, rotX, rotZ, life}
var camY = 40, camYTarget = 40;
var busy = false, rafId = 0, lastT = 0;
var sfx = null, muted = loadMuted();

function $(id) { return document.getElementById(id); }

function loadMuted() {
  try { return localStorage.getItem('vapeded_muted') === '1'; } catch (e) { return false; }
}
function saveBest() {
  try { localStorage.setItem('vapeded_best', String(best)); } catch (e) { /* ignore */ }
}
function loadBest() {
  try { return parseInt(localStorage.getItem('vapeded_best') || '0', 10) || 0; } catch (e) { return 0; }
}

/* ---------- Звук (Web Audio, без файлов) ---------- */
function Sfx() {
  this.ctx = null;
  var self = this;
  this.ensure = function () {
    if (!this.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  };
  this.beep = function (freq, dur, type, vol, slideTo) {
    this.ensure();
    if (muted || !this.ctx) return;
    var t0 = this.ctx.currentTime;
    var o = this.ctx.createOscillator();
    var g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol || 0.06, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  };
  this.noise = function (dur, vol, freq) {
    this.ensure();
    if (muted || !this.ctx) return;
    var t0 = this.ctx.currentTime;
    var len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = this.ctx.createBufferSource(); src.buffer = buf;
    var f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 900;
    var g = this.ctx.createGain(); g.gain.value = vol || 0.12;
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start(t0);
  };
  this.click = function () { this.beep(520, 0.05, 'square', 0.05); };
  this.land = function () { this.beep(230, 0.09, 'triangle', 0.1, 190); };
  this.perfect = function () { this.beep(660, 0.08, 'square', 0.05); this.beep(880, 0.1, 'square', 0.05, 990); };
  this.fail = function () { this.beep(320, 0.25, 'sawtooth', 0.07, 90); this.noise(0.3, 0.1, 500); };
}

/* ---------- 3D-коробка ---------- */
function makeCube(w, d, flavor, cls) {
  var h = CUBE;
  var cube = document.createElement('div');
  cube.className = 'cube' + (cls ? ' ' + cls : '');
  cube.style.setProperty('--c1', flavor.c1);
  cube.style.setProperty('--c2', flavor.c2);
  cube.style.setProperty('--ct', flavor.ct);
  cube.style.setProperty('--cd', flavor.cd);

  var faces = [
    { cls: 'face face-front', w: w, h: h, t: 'translateZ(' + (d / 2) + 'px)' },
    { cls: 'face face-back face-dark', w: w, h: h, t: 'rotateY(180deg) translateZ(' + (d / 2) + 'px)' },
    { cls: 'face face-side', w: d, h: h, t: 'rotateY(90deg) translateZ(' + (w / 2) + 'px)' },
    { cls: 'face face-side', w: d, h: h, t: 'rotateY(-90deg) translateZ(' + (w / 2) + 'px)' },
    { cls: 'face face-top', w: w, h: d, t: 'rotateX(90deg) translateZ(' + (h / 2) + 'px)' },
    { cls: 'face face-dark', w: w, h: d, t: 'rotateX(-90deg) translateZ(' + (h / 2) + 'px)' }
  ];
  for (var i = 0; i < faces.length; i++) {
    var f = faces[i];
    var el = document.createElement('div');
    el.className = f.cls;
    el.style.width = f.w + 'px';
    el.style.height = f.h + 'px';
    el.style.transform = f.t;
    el.style.marginLeft = (-f.w / 2) + 'px';
    el.style.marginTop = (-f.h / 2) + 'px';
    if (f.cls.indexOf('face-front') >= 0 && w >= 64) {
      var brand = document.createElement('div');
      brand.className = 'brand';
      brand.innerHTML = 'ВЕЙП<span>ДЕД</span>';
      el.appendChild(brand);
      var meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = '30МЛ · 3МГ';
      el.appendChild(meta);
    }
    cube.appendChild(el);
  }
  return cube;
}

/* ---------- Позиционирование слоя ---------- */
function placeLayer(el, x, y, z) {
  el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,' + z + 'px)';
}

/* ---------- Спавн базы и движущейся коробки ---------- */
function spawnBase() {
  var f = flavorFor(0);
  var el = makeCube(CUBE, CUBE, f, '');
  camera.appendChild(el);
  var l = { x: -CUBE / 2, z: -CUBE / 2, sx: CUBE, sz: CUBE, y: 0, el: el };
  placeLayer(el, l.x, 0, l.z);
  stack.push(l);
}

function spawnMoving() {
  var f = flavorFor(level);
  var el = makeCube(CUBE, CUBE, f, '');
  camera.appendChild(el);
  var axis = axisFor(level);
  var prev = stack[stack.length - 1];
  var dir = Math.random() < 0.5 ? 1 : -1;
  var s = f.sx, s2 = f.sz;
  var x = prev.x, z = prev.z;
  if (axis === 'x') {
    x = prev.x + dir * 150;
    if (x < -BOUND) x = -BOUND;
    if (x > BOUND - CUBE + 0.01) x = BOUND - CUBE;
  } else {
    z = prev.z + dir * 150;
    if (z < -BOUND) z = -BOUND;
    if (z > BOUND - CUBE + 0.01) z = BOUND - CUBE;
  }
  moving = { el: el, x: x, z: z, sx: CUBE, sz: CUBE, dir: dir, speed: speedFor(level), y: (level + 1) * CUBE + CUBE * 1.6 };
  placeLayer(el, x, moving.y, z);
}

/* ---------- Обломки ---------- */
function spawnDebris(x, z, w, d, y, vy) {
  var f = flavorFor(level);
  var el = makeCube(w, d, f, 'debris');
  camera.appendChild(el);
  debris.push({
    el: el, x: x, y: y, z: z,
    vx: (Math.random() - 0.5) * 60,
    vy: vy || 260,
    vrx: (Math.random() - 0.5) * 420,
    vrz: (Math.random() - 0.5) * 420,
    rotX: Math.random() * 30, rotZ: Math.random() * 30, life: 1
  });
}

/* ---------- Игровые действия ---------- */
function startGame() {
  state = 'playing';
  level = 0;
  stack = [];
  debris = [];
  busy = false;
  camY = 40; camYTarget = 40;
  while (camera.firstChild) camera.removeChild(camera.firstChild);
  camera.appendChild($('podium'));
  camera.appendChild($('glow'));
  spawnBase();
  $('score').textContent = '0';
  $('tapHint').classList.remove('hidden');
  $('startOverlay').classList.add('hidden');
  $('overOverlay').classList.add('hidden');
  spawnMoving();
  hudScore = $('score');
}

function camTarget() {
  return level * CUBE * 0.848 + 40;
}

function drop() {
  if (state !== 'playing' || busy || !moving) return;
  busy = true;
  sfx.click();
  var targetY = (level + 1) * CUBE;
  var t0 = null;
  var fallDur = 190;
  function tick(ts) {
    if (!t0) t0 = ts;
    var k = Math.min((ts - t0) / fallDur, 1);
    var ease = k * k * (3 - 2 * k);
    var y = moving.y - ease * (moving.y - targetY);
    placeLayer(moving.el, moving.x, y, moving.z);
    if (k < 1) {
      rafId = requestAnimationFrame(tick);
    } else {
      place();
    }
  }
  rafId = requestAnimationFrame(tick);
}

function place() {
  var prev = stack[stack.length - 1];
  var axis = axisFor(level);
  var newY = (level + 1) * CUBE;
  var ok = true, ov = null, pieceStart = 0, pieceSize = 0, nx = prev.x, nz = prev.z, nsx = prev.sx, nsz = prev.sz;

  if (axis === 'x') {
    ov = overlap1d(moving.x, CUBE, prev.x, prev.sx);
    if (!ov) { ok = false; } else {
      nx = ov.start; nsx = ov.size; nz = prev.z; nsz = prev.sz;
      pieceSize = CUBE - ov.size;
      pieceStart = moving.x < ov.start ? ov.start + ov.size : ov.start - pieceSize;
      if (pieceStart < moving.x) pieceStart = moving.x;
    }
  } else {
    ov = overlap1d(moving.z, CUBE, prev.z, prev.sz);
    if (!ov) { ok = false; } else {
      nz = ov.start; nsz = ov.size; nx = prev.x; nsx = prev.sx;
      pieceSize = CUBE - ov.size;
      pieceStart = moving.z < ov.start ? ov.start + ov.size : ov.start - pieceSize;
      if (pieceStart < moving.z) pieceStart = moving.z;
    }
  }

  if (!ok) { gameOver(); return; }

  var flavor = flavorFor(level);
  var el = makeCube(nsx, nsz, flavor, '');
  camera.appendChild(el);
  placeLayer(el, nx, newY, nz);
  stack.push({ x: nx, z: nz, sx: nsx, sz: nsz, y: newY, el: el });
  camera.removeChild(moving.el);
  moving = null;

  if (pieceSize > 2) {
    var py = newY - CUBE * 0.5;
    spawnDebris(pieceStart, axis === 'x' ? nz : nx, pieceSize, axis === 'x' ? nsz : nsx, py, 200 + Math.random() * 90);
    sfx.noise(0.12, 0.08, 1100);
  }
  var perfectHit = pieceSize <= 2;
  if (perfectHit) {
    sfx.perfect();
    showPerfect();
  } else {
    sfx.land();
  }

  level++;
  $('score').textContent = String(level);
  camYTarget = camTarget();
  spawnMoving();
  busy = false;
}

function gameOver() {
  state = 'over';
  busy = false;
  var f = flavorFor(level);
  var el = makeCube(moving.sx, moving.sz, f, 'debris');
  camera.appendChild(el);
  var mx = moving.x, mz = moving.z, my = moving.y;
  camera.removeChild(moving.el);
  debris.push({ el: el, x: mx, y: my, z: mz, vx: moving.dir * 80, vy: 380, vrx: 520, vrz: 340, rotX: 0, rotZ: 0, life: 1 });
  moving = null;
  sfx.fail();
  if (level > best) {
    best = level;
    saveBest();
  }
  setTimeout(function () {
    $('finalScore').textContent = String(level);
    $('finalBest').textContent = String(best);
    $('score').textContent = String(level);
    $('tapHint').classList.add('hidden');
    $('overOverlay').classList.remove('hidden');
    $('overOverlay').classList.add('fade-in');
  }, 650);
}

function showPerfect() {
  perfect.classList.remove('hidden');
  perfect.classList.add('fade-in');
  clearTimeout(showPerfect._t);
  showPerfect._t = setTimeout(function () {
    perfect.classList.add('hidden');
    perfect.classList.remove('fade-in');
  }, 600);
}

function toMenu() {
  state = 'menu';
  while (camera.firstChild) camera.removeChild(camera.firstChild);
  camera.appendChild($('podium'));
  camera.appendChild($('glow'));
  stack = []; debris = []; moving = null;
  camY = 40; camYTarget = 40;
  $('overOverlay').classList.add('hidden');
  $('startOverlay').classList.remove('hidden');
  $('startOverlay').classList.add('fade-in');
  $('tapHint').classList.add('hidden');
}

/* ---------- Главный цикл ---------- */
function frame(ts) {
  rafId = requestAnimationFrame(frame);
  var dt = lastT ? Math.min((ts - lastT) / 1000, 0.05) : 0.016;
  lastT = ts;

  // камера
  camY += (camYTarget - camY) * 0.12;
  camera.style.transform = 'translateY(' + camY.toFixed(1) + 'px) rotateX(-32deg)';

  // движущаяся коробка
  if (state === 'playing' && !busy && moving) {
    var axis = axisFor(level);
    if (axis === 'x') {
      moving.x += moving.dir * moving.speed * dt * 60;
      if (moving.x < -BOUND) { moving.x = -BOUND; moving.dir = 1; }
      if (moving.x > BOUND - CUBE + 0.01) { moving.x = BOUND - CUBE; moving.dir = -1; }
    } else {
      moving.z += moving.dir * moving.speed * dt * 60;
      if (moving.z < -BOUND) { moving.z = -BOUND; moving.dir = 1; }
      if (moving.z > BOUND - CUBE + 0.01) { moving.z = BOUND - CUBE; moving.dir = -1; }
    }
    placeLayer(moving.el, moving.x, moving.y, moving.z);
  }

  // обломки
  for (var i = debris.length - 1; i >= 0; i--) {
    var d = debris[i];
    d.vy += 1500 * dt;
    d.y += d.vy * dt;
    d.x += d.vx * dt;
    d.z += d.vx * dt * 0.35;
    d.rotX += d.vrx * dt;
    d.rotZ += d.vrz * dt;
    d.el.style.transform = 'translate3d(' + d.x + 'px,' + d.y + 'px,' + d.z + 'px) rotateX(' + d.rotX.toFixed(1) + 'deg) rotateZ(' + d.rotZ.toFixed(1) + 'deg)';
    if (d.y > 1900 || d.life-- < -120) {
      camera.removeChild(d.el);
      debris.splice(i, 1);
    }
  }
}

/* ---------- Инициализация ---------- */
function initGame() {
  scene = $('scene');
  camera = $('camera');
  hudScore = $('score');
  tapHint = $('tapHint');
  perfect = $('perfect');
  sfx = new Sfx();
  best = loadBest();
  $('best').textContent = String(best);

  // приветствие из initData Telegram (без бэкенда, просто показ имени)
  try {
    var params = new URLSearchParams(location.search);
    var userRaw = params.get('user');
    if (userRaw) {
      var user = JSON.parse(decodeURIComponent(userRaw));
      if (user && user.first_name) $('greet').textContent = 'Привет, ' + user.first_name + '!';
    }
  } catch (e) { /* ignore */ }

  $('muteBtn').textContent = muted ? '🔇' : '🔊';
  $('muteBtn').addEventListener('click', function () {
    muted = !muted;
    try { localStorage.setItem('vapeded_muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
    $('muteBtn').textContent = muted ? '🔇' : '🔊';
  });
  $('startBtn').addEventListener('click', function () { sfx.ensure(); startGame(); });
  $('restartBtn').addEventListener('click', function () { sfx.ensure(); startGame(); });
  $('menuBtn').addEventListener('click', toMenu);

  scene.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.overlay')) return;
    sfx.ensure();
    drop();
  });

  camera.style.transform = 'translateY(40px) rotateX(-32deg)';
  startGame();
  lastT = 0;
  rafId = requestAnimationFrame(frame);
}