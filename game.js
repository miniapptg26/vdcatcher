/*
   ВЕЙП ДЕД · ЖИЖА — 8-бит ретро-мини-игра «поймай жидкость»
   Дед в бордовой кепке с чёрной бородой и вейпом ловит баночки жидкости.
   Фишки: PERFECT-ловля, ПАР-БОМБА, титулы-ранги.
   Статический Telegram Mini App: HTML + CSS + JS, без сервера.
*/
'use strict';

const CONFIG = {
  W: 480, H: 640,
  PLAYER_W: 104, PLAYER_H: 80, PLAYER_Y: 546,
  FOLLOW_SPEED: 13,
  LIVES: 3, MAX_LIVES: 5,
  START_SPAWN_MS: 1500, MIN_SPAWN_MS: 430, SPAWN_STEP_MS: 140,
  START_SPEED: 125, MAX_SPEED: 520, SPEED_STEP: 32,
  LEVEL_STEP: 250,
  COMBO_STEP: 5, COMBO_MAX_MULT: 3,
  MAGNET_RADIUS: 185, MAGNET_PULL: 340,
  SLOW_FACTOR: 0.45,
  TURBO_FACTOR: 2.0,
  DANGER_START_LEVEL: 2,
  PERFECT_X_DIST: 14,      /* точная поимка по центру деда */
  PERFECT_MULT: 1.25,
  BEST_KEY: 'vapeded_juice_best',
  FLAVORS: [
    { id: 'strawberry', emoji: '🍓', name: 'Клубника', score: 10, weight: 26, color: '#ff4d6d' },
    { id: 'watermelon', emoji: '🍉', name: 'Арбуз', score: 12, weight: 22, color: '#3ddc7a' },
    { id: 'lemon', emoji: '🍋', name: 'Лимон', score: 14, weight: 18, color: '#ffd800' },
    { id: 'blueberry', emoji: '🫐', name: 'Черника', score: 16, weight: 14, color: '#5c8aff' },
    { id: 'mint', emoji: '🌿', name: 'Мята', score: 20, weight: 10, color: '#4ee0b0' }
  ],
  GOLDEN: { id: 'golden', emoji: '✨', name: 'Золотая жижа', score: 50, weight: 4, color: '#ffc800' },
  DANGER: { id: 'danger', emoji: '🚬', name: 'Окурок', weight: 8 },
  BONUSES: [
    { id: 'life', emoji: '❤️', label: '+1 ЖИЗНЬ', duration: 0 },
    { id: 'slow', emoji: '⏳', label: 'ЗАМЕДЛЕНИЕ', duration: 6 },
    { id: 'magnet', emoji: '🧲', label: 'МАГНИТ', duration: 6 },
    { id: 'turbo', emoji: '⚡', label: 'ТУРБО', duration: 5 },
    { id: 'bomb', emoji: '💨', label: 'ПАР-БОМБА', duration: 0 }
  ],
  TITLES: [
    { score: 0, title: 'НОВИЧОК' },
    { score: 300, title: 'ЛАКОМКА' },
    { score: 800, title: 'ЛОВЕЦ БАНОК' },
    { score: 1600, title: 'ГРОЗА ОКУРКОВ' },
    { score: 2800, title: 'МАСТЕР ПАРА' },
    { score: 4500, title: 'ЛЕГЕНДА ЖИЖИ' }
  ],
  WEIGHTS: { flavor: 90, golden: 4, danger: 8, bonus: 6 }
};

/* ---- чистые игровые функции (тестируются в node) ---- */
const GameCore = {
  clamp(v, min, max) { return v < min ? min : (v > max ? max : v); },
  lerp(cur, target, k) { return cur + (target - cur) * k; },
  calculateLevel(score) { return 1 + Math.floor(score / CONFIG.LEVEL_STEP); },
  spawnIntervalMs(level) {
    return this.clamp(CONFIG.START_SPAWN_MS - (level - 1) * CONFIG.SPAWN_STEP_MS, CONFIG.MIN_SPAWN_MS, CONFIG.START_SPAWN_MS);
  },
  fallSpeed(level) {
    return this.clamp(CONFIG.START_SPEED + (level - 1) * CONFIG.SPEED_STEP, CONFIG.START_SPEED, CONFIG.MAX_SPEED);
  },
  comboMultiplier(combo) {
    return Math.min(1 + Math.floor(combo / CONFIG.COMBO_STEP) * 0.5, CONFIG.COMBO_MAX_MULT);
  },
  roundScore(raw) { return Math.max(1, Math.round(raw)); },
  titleFor(score) {
    let t = CONFIG.TITLES[0];
    for (const e of CONFIG.TITLES) if (score >= e.score) t = e;
    return t.title;
  },
  nextTitleGap(score) {
    for (const e of CONFIG.TITLES) if (e.score > score) return e.score - score;
    return 0;
  },
  collidesRectCircle(rx, ry, rw, rh, cx, cy, cr) {
    const nx = this.clamp(cx, rx, rx + rw);
    const ny = this.clamp(cy, ry, ry + rh);
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy <= cr * cr;
  },
  pickBonus(rnd) {
    return CONFIG.BONUSES[Math.floor(rnd() * CONFIG.BONUSES.length) % CONFIG.BONUSES.length];
  },
  pickDrop(rnd, level) {
    const dangerW = level >= CONFIG.DANGER_START_LEVEL ? CONFIG.WEIGHTS.danger : 0;
    const flavorW = CONFIG.WEIGHTS.flavor;
    const total = flavorW + CONFIG.WEIGHTS.golden + dangerW + CONFIG.WEIGHTS.bonus;
    let r = rnd() * total;
    if (r < flavorW) {
      let acc = 0;
      for (const f of CONFIG.FLAVORS) {
        acc += f.weight;
        if (r < acc) return { type: 'flavor', flavor: f };
      }
      return { type: 'flavor', flavor: CONFIG.FLAVORS[0] };
    }
    r -= flavorW;
    if (r < CONFIG.WEIGHTS.golden) return { type: 'golden' };
    r -= CONFIG.WEIGHTS.golden;
    if (r < dangerW) return { type: 'danger' };
    return { type: 'bonus', bonus: this.pickBonus(rnd) };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CONFIG, GameCore };
}

/* ================= браузерная часть ================= */
if (typeof document !== 'undefined') { run(); }

const PAL = {
  bg: '#10162a', bg2: '#16203f', star: '#e8f0ff',
  white: '#e8f0ff', yellow: '#ffd800', red: '#e8464c',
  green: '#3ddc7a', blue: '#4ec3e8', orange: '#ff9d00',
  skin: '#ffc98a', skin2: '#e8a860',
  beard: '#2b2b2b', beard2: '#171717',
  coat: '#2a3a78', coatD: '#1c2850', boot: '#3a2a1a', black: '#141414',
  cap: '#7a1f2e', capD: '#5a1622', vizor: '#1c2444', vizorEdge: '#3c4f96'
};

function run() {
  const $ = (id) => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const elScore = $('score'), elLevel = $('level'), elLives = $('lives');
  const elCombo = $('combo'), elBanner = $('banner');
  const screenStart = $('screen-start'), screenOver = $('screen-over');
  const elFinal = $('final-score'), elBest = $('best-score'), elNewBest = $('new-best');
  const elGreeting = $('greeting');
  const elStartBest = $('start-best');
  const elStartRank = $('start-rank'), elOverRank = $('over-rank');

  initTelegram(elGreeting);

  const S = {
    state: 'start',
    score: 0, lives: CONFIG.LIVES, combo: 0, level: 1,
    time: 0, spawnTimer: 700,
    player: { x: (CONFIG.W - CONFIG.PLAYER_W) / 2, targetX: (CONFIG.W - CONFIG.PLAYER_W) / 2 },
    drops: [], particles: [], popups: [], stars: [],
    bonuses: { slowTill: 0, magnetTill: 0, turboTill: 0 },
    best: 0, shake: 0, overReady: false
  };
  try { S.best = Number(localStorage.getItem(CONFIG.BEST_KEY) || 0); } catch (e) { S.best = 0; }
  elStartBest.textContent = S.best;
  updateRanks();
  for (let i = 0; i < 60; i++) {
    S.stars.push({ x: Math.floor(Math.random() * CONFIG.W), y: Math.floor(Math.random() * CONFIG.H), s: (Math.random() < 0.3 ? 2 : 1), sp: 6 + Math.random() * 14 });
  }

  /* ---- управление ---- */
  const toGameX = (clientX) => {
    const rect = canvas.getBoundingClientRect();
    return (clientX - rect.left) * (CONFIG.W / rect.width);
  };
  const setTarget = (gx) => {
    S.player.targetX = GameCore.clamp(gx - CONFIG.PLAYER_W / 2, 0, CONFIG.W - CONFIG.PLAYER_W);
  };
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); setTarget(toGameX(e.clientX)); });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || e.buttons === 1) setTarget(toGameX(e.clientX));
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') S.player.targetX -= 46;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') S.player.targetX += 46;
    S.player.targetX = GameCore.clamp(S.player.targetX, 0, CONFIG.W - CONFIG.PLAYER_W);
    if ((e.key === 'Enter' || e.key === ' ') && S.state === 'start') startGame();
    if ((e.key === 'Enter' || e.key === ' ') && S.state === 'over' && S.overReady) startGame();
  });
  $('btn-start').addEventListener('click', startGame);
  $('btn-restart').addEventListener('click', startGame);

  /* ---- звук ---- */
  let AC = null;
  function ac() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (AC && AC.state === 'suspended') AC.resume();
    return AC;
  }
  function sfx(freq, dur, type, vol, slideTo) {
    const a = ac(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, a.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 20), a.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.07, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + dur + 0.02);
  }
  const sfxCatch = () => { sfx(540 + Math.random() * 120, 0.07, 'square', 0.06); };
  const sfxPerfect = () => {
    sfx(880, 0.09, 'square', 0.07);
    setTimeout(() => sfx(1174, 0.12, 'square', 0.07), 90);
  };
  const sfxGolden = () => {
    sfx(660, 0.09, 'square', 0.06);
    setTimeout(() => sfx(880, 0.09, 'square', 0.06), 80);
    setTimeout(() => sfx(1100, 0.12, 'square', 0.06), 160);
  };
  const sfxMiss = () => sfx(220, 0.18, 'sawtooth', 0.08, 90);
  const sfxDanger = () => sfx(140, 0.22, 'sawtooth', 0.1, 60);
  const sfxBomb = () => { sfx(90, 0.22, 'sawtooth', 0.1, 40); setTimeout(() => sfx(70, 0.18, 'sawtooth', 0.09, 35), 120); };
  const sfxBonus = () => {
    sfx(660, 0.08, 'triangle', 0.08);
    setTimeout(() => sfx(990, 0.1, 'triangle', 0.08), 90);
  };
  const sfxLevel = () => { [440, 660, 880, 1320].forEach((f, i) => setTimeout(() => sfx(f, 0.09, 'square', 0.05), i * 90)); };
  const sfxOver = () => sfx(320, 0.5, 'triangle', 0.09, 70);

  /* ---- экран-подсказки и бонусы ---- */
  let bannerTimer = 0;
  function showBanner(text, ms) {
    elBanner.textContent = text;
    elBanner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => elBanner.classList.remove('show'), ms || 1400);
  }

  function pushPopup(text, x, y, color) {
    S.popups.push({ text, x, y, vx: (Math.random() - 0.5) * 10, color: color || PAL.white, life: 1.0, max: 1.0 });
  }

  function spawnDrop() {
    const d = GameCore.pickDrop(Math.random, S.level);
    const obj = {
      x: 34 + Math.random() * (CONFIG.W - 68), y: -40,
      r: d.type === 'bonus' ? 22 : 18,
      emoji: d.type === 'flavor' ? d.flavor.emoji : d.emoji,
      color: d.type === 'flavor' ? d.flavor.color : d.color,
      name: d.type === 'flavor' ? d.flavor.name : d.name,
      kind: d.type,
      bonus: d.bonus || null,
      score: d.type === 'flavor' ? d.flavor.score : (d.type === 'golden' ? CONFIG.GOLDEN.score : 0),
      vy: GameCore.fallSpeed(S.level) * (0.85 + Math.random() * 0.3),
      phase: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 2,
      bob: Math.random() * 10
    };
    S.drops.push(obj);
  }

  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (speed || 90) * (0.3 + Math.random());
      S.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0.55 + Math.random() * 0.3, max: 1, color, size: 2 + Math.random() * 3 });
    }
  }

  function addScore(v) {
    S.score += v;
    const nl = GameCore.calculateLevel(S.score);
    if (nl > S.level) { S.level = nl; sfxLevel(); showBanner('УРОВЕНЬ ' + nl, 1500); }
  }

  function catchDrop(d) {
    const idx = S.drops.indexOf(d);
    if (idx >= 0) S.drops.splice(idx, 1);
    const cx = S.player.x + CONFIG.PLAYER_W / 2;
    if (d.kind === 'flavor') {
      S.combo++;
      const mult = GameCore.comboMultiplier(S.combo);
      let gained = GameCore.roundScore(d.score * mult);
      const perfect = Math.abs(d.x - cx) < CONFIG.PERFECT_X_DIST;
      if (perfect) {
        gained = GameCore.roundScore(gained * CONFIG.PERFECT_MULT);
        pushPopup('PERFECT!', d.x, d.y - 40, PAL.yellow);
        burst(d.x, d.y, PAL.white, 6, 120);
        sfxPerfect();
      }
      addScore(gained);
      pushPopup('+' + gained, d.x, d.y - 26, '#e8f0ff');
      burst(d.x, d.y, d.color, 8);
      sfxCatch();
    } else if (d.kind === 'golden') {
      S.combo++;
      const mult = GameCore.comboMultiplier(S.combo);
      let gained = GameCore.roundScore(d.score * mult);
      const perfect = Math.abs(d.x - cx) < CONFIG.PERFECT_X_DIST;
      if (perfect) {
        gained = GameCore.roundScore(gained * CONFIG.PERFECT_MULT);
        pushPopup('PERFECT!', d.x, d.y - 44, PAL.yellow);
        sfxPerfect();
      }
      addScore(gained);
      pushPopup('+' + gained, d.x, d.y - 40, PAL.yellow);
      burst(d.x, d.y, '#ffc800', 14, 140);
      sfxGolden();
      showBanner('✨ ЗОЛОТАЯ!', 900);
    } else if (d.kind === 'danger') {
      S.lives--; S.combo = 0;
      S.shake = 0.45;
      burst(d.x, d.y, '#ff9d00', 10);
      sfxDanger();
      if (S.lives <= 0) { gameOver(); return; }
    } else if (d.kind === 'bonus') {
      if (d.bonus && d.bonus.id === 'bomb') bombBlast();
      else applyBonus(d.bonus);
    }
    updateHUD();
  }

  function bombBlast() {
    let n = 0, sum = 0;
    for (let i = S.drops.length - 1; i >= 0; i--) {
      const dd = S.drops[i];
      if (dd.kind === 'danger') {
        n++; sum += 10;
        burst(dd.x, dd.y, '#ff9d00', 10, 130);
        S.drops.splice(i, 1);
      }
    }
    if (n > 0) {
      addScore(sum);
      sfxBomb();
      showBanner('💨 ВЗРЫВ x' + n + '!', 1300);
      pushPopup('ВЗРЫВ!', S.player.x + CONFIG.PLAYER_W / 2, CONFIG.PLAYER_Y - 26, PAL.orange);
    } else {
      showBanner('💨 ПАР-БОМБА', 900);
      sfxBonus();
    }
  }

  function applyBonus(b) {
    const now = S.time;
    if (b.id === 'life') {
      S.lives = Math.min(S.lives + 1, CONFIG.MAX_LIVES);
      showBanner('❤️ +1 ЖИЗНЬ', 1200);
    } else if (b.id === 'slow') {
      S.bonuses.slowTill = now + b.duration;
      showBanner('⏳ МЕДЛЕННО', 1200);
    } else if (b.id === 'magnet') {
      S.bonuses.magnetTill = now + b.duration;
      showBanner('🧲 МАГНИТ', 1200);
    } else if (b.id === 'turbo') {
      S.bonuses.turboTill = now + b.duration;
      showBanner('⚡ ТУРБО', 1200);
    }
    sfxBonus();
  }

  function missDrop(d) {
    const idx = S.drops.indexOf(d);
    if (idx >= 0) S.drops.splice(idx, 1);
    if (d.kind === 'flavor' || d.kind === 'golden') {
      S.lives--; S.combo = 0;
      burst(d.x, CONFIG.H - 10, '#ff4d6d', 6);
      sfxMiss();
      if (S.lives <= 0) { gameOver(); return; }
    }
    updateHUD();
  }

  function updateRanks() {
    const t = GameCore.titleFor(S.best);
    elStartRank.textContent = t;
    elOverRank.textContent = t;
  }

  function startGame() {
    ac();
    S.state = 'play';
    S.score = 0; S.lives = CONFIG.LIVES; S.combo = 0; S.level = 1;
    S.spawnTimer = 700; S.time = 0;
    S.drops = []; S.particles = []; S.popups = [];
    S.bonuses = { slowTill: 0, magnetTill: 0, turboTill: 0 };
    S.player.x = S.player.targetX = (CONFIG.W - CONFIG.PLAYER_W) / 2;
    screenStart.classList.add('hidden');
    screenOver.classList.add('hidden');
    elNewBest.classList.add('hidden');
    showBanner('ЛОВИ ЖИЖУ! 💨', 1500);
    updateHUD();
  }

  function gameOver() {
    S.state = 'over';
    S.overReady = false;
    sfxOver();
    const isRecord = S.score > S.best;
    if (isRecord) {
      S.best = S.score;
      try { localStorage.setItem(CONFIG.BEST_KEY, String(S.best)); } catch (e) {}
    }
    elFinal.textContent = S.score;
    elBest.textContent = S.best;
    elStartBest.textContent = S.best;
    updateRanks();
    elNewBest.classList.toggle('hidden', !isRecord);
    screenOver.classList.remove('hidden');
    setTimeout(() => { S.overReady = true; }, 250);
  }

  /* ---- обновление ---- */
  function update(dt, now) {
    S.time += dt;
    const slow = now < S.bonuses.slowTill;
    const magnet = now < S.bonuses.magnetTill;
    const turbo = now < S.bonuses.turboTill;

    const p = S.player;
    const follow = (turbo ? CONFIG.FOLLOW_SPEED * CONFIG.TURBO_FACTOR : CONFIG.FOLLOW_SPEED) * dt;
    if (Math.abs(p.x - p.targetX) < 1) p.x = p.targetX;
    else p.x += (p.targetX - p.x) * Math.min(1, follow);

    S.spawnTimer -= dt * 1000;
    if (S.spawnTimer <= 0) {
      spawnDrop();
      S.spawnTimer = GameCore.spawnIntervalMs(S.level) * (0.75 + Math.random() * 0.5);
    }

    const pcx = p.x + CONFIG.PLAYER_W / 2;
    const pcy = CONFIG.PLAYER_Y + 30;
    for (let i = S.drops.length - 1; i >= 0; i--) {
      const d = S.drops[i];
      d.y += d.vy * (slow ? CONFIG.SLOW_FACTOR : 1) * dt;
      d.x += Math.sin(now * 2.4 + d.phase) * 16 * dt;
      d.rot += d.vrot * dt;
      if (magnet && (d.kind === 'flavor' || d.kind === 'golden')) {
        const dx = pcx - d.x, dy = pcy - d.y;
        const dist = Math.hypot(dx, dy);
        if (dist < CONFIG.MAGNET_RADIUS && dist > 1) {
          const pull = CONFIG.MAGNET_PULL * (1 - dist / CONFIG.MAGNET_RADIUS) * dt;
          d.x += (dx / dist) * pull;
          d.y += (dy / dist) * pull;
        }
      }
      if (GameCore.collidesRectCircle(p.x, CONFIG.PLAYER_Y - 16, CONFIG.PLAYER_W, CONFIG.PLAYER_H + 16, d.x, d.y, d.r)) {
        catchDrop(d);
        if (S.state !== 'play') return;
      } else if (d.y - d.r > CONFIG.H) {
        missDrop(d);
        if (S.state !== 'play') return;
      }
    }

    /* пар из вейпа */
    if (Math.random() < dt * 7) {
      S.particles.push({ x: p.x + CONFIG.PLAYER_W - 4, y: CONFIG.PLAYER_Y + 52, vx: 26 + Math.random() * 22, vy: -48 - Math.random() * 32, life: 0.65, max: 0.65, color: 'rgba(232,240,255,0.6)', size: 3 + Math.random() * 3 });
    }
    for (let i = S.particles.length - 1; i >= 0; i--) {
      const pt = S.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= (1 - 1.5 * dt);
      pt.vy *= (1 - 1.5 * dt);
      if (pt.life <= 0) S.particles.splice(i, 1);
    }

    for (let i = S.popups.length - 1; i >= 0; i--) {
      const pp = S.popups[i];
      pp.life -= dt;
      pp.y -= 26 * dt;
      pp.x += pp.vx * dt;
      if (pp.life <= 0) S.popups.splice(i, 1);
    }

    for (const st of S.stars) {
      st.y += st.sp * dt;
      if (st.y > CONFIG.H) { st.y = -4; st.x = Math.floor(Math.random() * CONFIG.W); }
    }

    if (S.shake > 0) S.shake -= dt;
    updateHUD();
  }

  function updateHUD() {
    elScore.textContent = S.score;
    elLevel.textContent = S.level;
    elLives.textContent = '❤️'.repeat(Math.max(0, S.lives)) + '🖤'.repeat(Math.max(0, CONFIG.MAX_LIVES - S.lives));
    const mult = GameCore.comboMultiplier(S.combo);
    if (S.combo >= 2) {
      elCombo.textContent = 'КОМБО ' + S.combo + ' · x' + mult;
      elCombo.classList.remove('hidden');
    } else {
      elCombo.classList.add('hidden');
    }
  }

  /* ---- пиксельный helper ---- */
  function px(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

  /* ---- отрисовка ---- */
  function draw(now) {
    ctx.clearRect(0, 0, CONFIG.W, CONFIG.H);
    px(0, 0, CONFIG.W, CONFIG.H, PAL.bg);

    for (const st of S.stars) {
      px(Math.floor(st.x), Math.floor(st.y), st.s, st.s, PAL.star);
    }

    if (S.shake > 0) { ctx.save(); ctx.translate(Math.floor((Math.random() - 0.5) * 12), Math.floor((Math.random() - 0.5) * 12)); }

    if (now < S.bonuses.magnetTill || now < S.bonuses.turboTill || now < S.bonuses.slowTill) {
      let c = PAL.white;
      if (now < S.bonuses.turboTill) c = PAL.yellow;
      else if (now < S.bonuses.slowTill) c = PAL.blue;
      ctx.strokeStyle = c;
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 12]);
      ctx.strokeRect(S.player.x - 8, CONFIG.PLAYER_Y - 8, CONFIG.PLAYER_W + 16, CONFIG.PLAYER_H + 16);
      ctx.setLineDash([]);
    }

    drawDrops(now);
    drawPlayer(now);
    drawParticles();
    drawPopups();
    if (S.shake > 0) ctx.restore();
  }

  function drawDrops(now) {
    for (const d of S.drops) {
      ctx.save();
      if (d.kind === 'flavor' || d.kind === 'golden') {
        ctx.translate(d.x, d.y + Math.sin(now * 3 + d.bob) * 2);
        ctx.rotate(Math.sin(now * 2 + d.phase) * 0.12);
        drawBottle(d);
      } else if (d.kind === 'bonus') {
        ctx.translate(d.x, d.y);
        drawBonus(d);
      } else {
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rot);
        drawCigarette();
      }
      ctx.restore();
    }
  }

  function drawBottle(d) {
    const c = d.color;
    const isGolden = d.kind === 'golden';
    px(-13, -19, 26, 7, '#3a3f54');
    px(-13, -19, 26, 2, '#5c6378');
    px(-13, -14, 26, 2, PAL.black);
    px(-15, -12, 30, 3, c);
    px(-17, -9, 34, 5, c);
    px(-17, -4, 34, 14, c);
    px(-17, 9, 34, 2, PAL.black);
    ctx.globalAlpha = 0.45;
    px(-12, -9, 3, 21, PAL.white);
    ctx.globalAlpha = 1;
    px(-10, -5, 20, 12, PAL.white);
    px(-10, -5, 20, 1, PAL.black);
    px(-10, 6, 20, 1, PAL.black);
    px(-10, -5, 1, 12, PAL.black);
    px(9, -5, 1, 12, PAL.black);
    px(-8, 1, 16, 3, c);
    ctx.font = '11px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.emoji, 0, -1);
    if (isGolden) {
      ctx.font = '10px serif';
      ctx.fillText('✨', 0, 10);
    }
  }

  function drawBonus(d) {
    px(-22, -22, 44, 44, '#1c2444');
    px(-22, -22, 44, 3, PAL.white);
    px(-22, 19, 44, 3, PAL.white);
    px(-22, -22, 3, 44, PAL.white);
    px(19, -22, 3, 44, PAL.white);
    px(-19, -19, 38, 38, '#10162a');
    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.emoji, 0, 0);
  }

  function drawCigarette() {
    px(-20, -6, 6, 12, '#9aa0b0');
    px(-18, -6, 4, 4, '#6a7080');
    px(-14, -6, 24, 12, '#f2e3c0');
    px(-14, -6, 24, 3, '#d9c9a0');
    px(10, -6, 10, 12, '#ffb050');
    px(10, -6, 10, 3, '#ffd080');
    px(8, -8, 6, 16, '#ff4d4d');
    px(-4, -12, 8, 2, PAL.red);
    px(-1, -14, 2, 6, PAL.red);
  }

  /* ---- пиксельный дед: бордовая кепка, чёрная борода, вейп ---- */
  function drawPlayer(now) {
    const x = S.player.x, y = CONFIG.PLAYER_Y;
    px(x + 6, y + 74, 92, 6, 'rgba(0,0,0,0.35)');
    /* кафтан */
    px(x + 8, y + 46, 88, 22, PAL.coat);
    px(x + 8, y + 46, 88, 3, '#3c4f96');
    px(x + 8, y + 66, 88, 3, PAL.white);
    px(x + 8, y + 58, 88, 4, PAL.coatD);
    px(x + 46, y + 58, 12, 4, PAL.yellow);
    /* левая рука */
    px(x + 0, y + 40, 16, 22, PAL.coat);
    px(x + 2, y + 58, 12, 8, PAL.skin);
    /* правая рука с вейпом */
    px(x + 80, y + 34, 20, 18, PAL.coat);
    px(x + 80, y + 34, 20, 3, '#3c4f96');
    px(x + 80, y + 48, 12, 8, PAL.skin);
    px(x + 88, y + 54, 16, 7, PAL.black);
    px(x + 88, y + 54, 16, 2, '#3a3f54');
    px(x + 100, y + 55, 5, 5, PAL.yellow);
    px(x + 104, y + 59, 4, 2, PAL.red);
    /* голова */
    px(x + 24, y + 14, 52, 36, PAL.skin);
    /* бордовая кепка */
    px(x + 22, y + 2, 52, 12, PAL.cap);
    px(x + 22, y + 2, 52, 3, PAL.capD);
    px(x + 46, y + 0, 4, 4, PAL.capD);
    px(x + 34, y + 4, 14, 3, '#8f3344');
    px(x + 20, y + 14, 56, 3, PAL.capD);
    /* козырёк */
    px(x + 18, y + 17, 60, 4, PAL.vizor);
    px(x + 18, y + 21, 60, 1, PAL.vizorEdge);
    /* брови */
    px(x + 24, y + 24, 12, 4, PAL.beard);
    px(x + 60, y + 24, 12, 4, PAL.beard);
    /* глаза */
    px(x + 28, y + 30, 6, 6, PAL.black);
    px(x + 62, y + 30, 6, 6, PAL.black);
    /* нос */
    px(x + 46, y + 34, 8, 7, PAL.skin2);
    /* чёрные усы */
    px(x + 24, y + 40, 52, 5, PAL.beard);
    px(x + 28, y + 42, 44, 3, PAL.beard2);
    /* чёрная борода */
    px(x + 20, y + 44, 56, 14, PAL.beard);
    px(x + 16, y + 47, 8, 12, PAL.beard);
    px(x + 72, y + 47, 8, 12, PAL.beard);
    px(x + 24, y + 53, 48, 6, PAL.beard2);
    /* пряди бороды */
    px(x + 30, y + 45, 4, 12, PAL.beard2);
    px(x + 42, y + 47, 4, 11, PAL.beard2);
    px(x + 54, y + 45, 4, 12, PAL.beard2);
    px(x + 62, y + 48, 4, 10, PAL.beard2);
    /* сапоги */
    px(x + 16, y + 69, 32, 7, PAL.boot);
    px(x + 48, y + 69, 32, 7, PAL.boot);
    /* мигающий кончик вейпа */
    const glow = 0.5 + 0.5 * Math.sin(now * 10);
    if (glow > 0.6) {
      px(x + 104, y + 53, 4, 4, '#ffe9a0');
    }
  }

  function drawParticles() {
    for (const pt of S.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.floor(pt.x - pt.size / 2), Math.floor(pt.y - pt.size / 2), Math.floor(pt.size), Math.floor(pt.size));
    }
    ctx.globalAlpha = 1;
  }

  function drawPopups() {
    ctx.font = '10px "Press Start 2P","Courier New",monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const pp of S.popups) {
      ctx.globalAlpha = Math.max(0, pp.life / pp.max);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(pp.text, Math.floor(pp.x) + 1, Math.floor(pp.y) + 1);
      ctx.fillStyle = pp.color;
      ctx.fillText(pp.text, Math.floor(pp.x), Math.floor(pp.y));
    }
    ctx.globalAlpha = 1;
  }

  /* ---- цикл ---- */
  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (S.state === 'play') update(dt, now / 1000);
    draw(now / 1000);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function initTelegram(el) {
  if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    try {
      tg.ready();
      tg.expand();
      tg.setHeaderColor('#10162a');
      tg.setBackgroundColor('#10162a');
    } catch (e) {}
    const u = tg.initDataUnsafe && tg.initDataUnsafe.user;
    if (u && u.first_name) {
      el.textContent = 'ПРИВЕТ, ' + u.first_name.toUpperCase() + '!';
    }
  }
}