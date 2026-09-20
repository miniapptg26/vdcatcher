/*
   ВЕЙП ДЕД · ЖИЖА — ретро-мини-игра «поймай жидкость»
   Статический Telegram Mini App: HTML + CSS + JS, без сервера.
   Деплой: GitHub Pages → BotFather.
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
  BEST_KEY: 'vapeded_juice_best',
  FLAVORS: [
    { id: 'strawberry', emoji: '🍓', name: 'Клубника', score: 10, weight: 26, color: '#ff5d8f' },
    { id: 'watermelon', emoji: '🍉', name: 'Арбуз', score: 12, weight: 22, color: '#ff7b8a' },
    { id: 'lemon', emoji: '🍋', name: 'Лимон', score: 14, weight: 18, color: '#ffe066' },
    { id: 'blueberry', emoji: '🫐', name: 'Черника', score: 16, weight: 14, color: '#8a7cff' },
    { id: 'mint', emoji: '🌿', name: 'Мята', score: 20, weight: 10, color: '#4ade80' }
  ],
  GOLDEN: { id: 'golden', emoji: '✨', name: 'Золотая жижа', score: 50, weight: 4, color: '#ffd700' },
  DANGER: { id: 'danger', emoji: '🚬', name: 'Окурок', weight: 8 },
  BONUSES: [
    { id: 'life', emoji: '❤️', label: '+1 ЖИЗНЬ', duration: 0 },
    { id: 'slow', emoji: '⏳', label: 'ЗАМЕДЛЕНИЕ', duration: 6 },
    { id: 'magnet', emoji: '🧲', label: 'МАГНИТ', duration: 6 },
    { id: 'turbo', emoji: '⚡', label: 'ТУРБО', duration: 5 }
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

function run() {
  const $ = (id) => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const stage = $('stage');
  const elScore = $('score'), elLevel = $('level'), elLives = $('lives');
  const elCombo = $('combo'), elBanner = $('banner');
  const screenStart = $('screen-start'), screenOver = $('screen-over');
  const elFinal = $('final-score'), elBest = $('best-score'), elNewBest = $('new-best');
  const elGreeting = $('greeting');
  const elStartBest = $('start-best');

  initTelegram(elGreeting);

  const S = {
    state: 'start',
    score: 0, lives: CONFIG.LIVES, combo: 0, level: 1,
    time: 0, spawnTimer: 700,
    player: { x: (CONFIG.W - CONFIG.PLAYER_W) / 2, targetX: (CONFIG.W - CONFIG.PLAYER_W) / 2 },
    drops: [], particles: [], stars: [],
    bonuses: { slowTill: 0, magnetTill: 0, turboTill: 0 },
    best: 0, shake: 0, overReady: false
  };
  try { S.best = Number(localStorage.getItem(CONFIG.BEST_KEY) || 0); } catch (e) { S.best = 0; }
  elStartBest.textContent = S.best;
  for (let i = 0; i < 60; i++) {
    S.stars.push({ x: Math.random() * CONFIG.W, y: Math.random() * CONFIG.H, s: 1 + Math.random() * 2, sp: 6 + Math.random() * 14 });
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
  const sfxGolden = () => {
    sfx(660, 0.09, 'square', 0.06);
    setTimeout(() => sfx(880, 0.09, 'square', 0.06), 80);
    setTimeout(() => sfx(1100, 0.12, 'square', 0.06), 160);
  };
  const sfxMiss = () => sfx(220, 0.18, 'sawtooth', 0.08, 90);
  const sfxDanger = () => sfx(140, 0.22, 'sawtooth', 0.1, 60);
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

  function spawnDrop() {
    const d = GameCore.pickDrop(Math.random, S.level);
    const obj = {
      x: 34 + Math.random() * (CONFIG.W - 68), y: -34,
      r: d.type === 'bonus' ? 21 : 17,
      emoji: d.type === 'flavor' ? d.flavor.emoji : d.emoji,
      color: d.type === 'flavor' ? d.flavor.color : d.color,
      name: d.type === 'flavor' ? d.flavor.name : d.name,
      kind: d.type,
      bonus: d.bonus || null,
      score: d.type === 'flavor' ? d.flavor.score : (d.type === 'golden' ? CONFIG.GOLDEN.score : 0),
      vy: GameCore.fallSpeed(S.level) * (0.85 + Math.random() * 0.3),
      phase: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 2
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
    if (d.kind === 'flavor') {
      S.combo++;
      const mult = GameCore.comboMultiplier(S.combo);
      const gained = GameCore.roundScore(d.score * mult);
      addScore(gained);
      burst(d.x, d.y, d.color, 8);
      sfxCatch();
    } else if (d.kind === 'golden') {
      S.combo++;
      const mult = GameCore.comboMultiplier(S.combo);
      const gained = GameCore.roundScore(d.score * mult);
      addScore(gained);
      burst(d.x, d.y, '#ffd700', 14, 140);
      sfxGolden();
      showBanner('✨ +' + gained, 900);
    } else if (d.kind === 'danger') {
      S.lives--; S.combo = 0;
      S.shake = 0.45;
      burst(d.x, d.y, '#ff9a3c', 10);
      sfxDanger();
      if (S.lives <= 0) { gameOver(); return; }
    } else if (d.kind === 'bonus') {
      applyBonus(d.bonus);
    }
    updateHUD();
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

  function startGame() {
    ac();
    S.state = 'play';
    S.score = 0; S.lives = CONFIG.LIVES; S.combo = 0; S.level = 1;
    S.spawnTimer = 700; S.time = 0;
    S.drops = []; S.particles = [];
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

    if (Math.random() < dt * 6) {
      S.particles.push({ x: p.x + CONFIG.PLAYER_W - 4, y: CONFIG.PLAYER_Y + 24, vx: 24 + Math.random() * 20, vy: -46 - Math.random() * 30, life: 0.7, max: 0.7, color: 'rgba(190,170,255,0.55)', size: 3 + Math.random() * 3 });
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

    for (const st of S.stars) {
      st.y += st.sp * dt;
      if (st.y > CONFIG.H) { st.y = -4; st.x = Math.random() * CONFIG.W; }
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

  /* ---- отрисовка ---- */
  function draw(now) {
    ctx.clearRect(0, 0, CONFIG.W, CONFIG.H);
    const grad = ctx.createLinearGradient(0, 0, 0, CONFIG.H);
    grad.addColorStop(0, '#1a0b33');
    grad.addColorStop(0.55, '#12051f');
    grad.addColorStop(1, '#0b0216');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CONFIG.W, CONFIG.H);

    ctx.fillStyle = '#b99bff';
    for (const st of S.stars) {
      ctx.globalAlpha = 0.35 + (st.s - 1) * 0.3;
      ctx.fillRect(st.x, st.y, st.s, st.s);
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(150,110,255,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= CONFIG.W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CONFIG.H); ctx.stroke(); }
    for (let y = 0; y <= CONFIG.H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CONFIG.W, y); ctx.stroke(); }

    if (S.shake > 0) { ctx.save(); ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10); }

    if (now < S.bonuses.magnetTill) {
      ctx.strokeStyle = 'rgba(255,215,0,0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.arc(S.player.x + CONFIG.PLAYER_W / 2, CONFIG.PLAYER_Y + 30, CONFIG.MAGNET_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawDrops(now);
    drawPlayer(now);
    drawParticles();
    if (S.shake > 0) ctx.restore();

    const vg = ctx.createRadialGradient(CONFIG.W / 2, CONFIG.H / 2, CONFIG.H * 0.35, CONFIG.W / 2, CONFIG.H / 2, CONFIG.H * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, CONFIG.W, CONFIG.H);
  }

  function drawDrops(now) {
    for (const d of S.drops) {
      ctx.save();
      ctx.translate(d.x, d.y);
      if (d.kind === 'bonus') {
        ctx.fillStyle = 'rgba(30,20,50,0.88)';
        roundRect(ctx, -17, -17, 34, 34, 8);
        ctx.fill();
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        roundRect(ctx, -17, -17, 34, 34, 8);
        ctx.stroke();
        ctx.font = '22px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.emoji, 0, 2);
      } else if (d.kind === 'danger') {
        ctx.rotate(d.rot);
        ctx.fillStyle = '#f2e3c0';
        roundRect(ctx, -14, -6, 26, 12, 3);
        ctx.fill();
        ctx.fillStyle = '#ff9a3c';
        roundRect(ctx, 8, -6, 6, 12, 3);
        ctx.fill();
        ctx.fillStyle = '#d9b98a';
        ctx.fillRect(-14, -6, 26, 3);
        ctx.fillStyle = '#ff4d6d';
        ctx.font = '9px serif';
        ctx.textAlign = 'center';
        ctx.fillText('🚫', 0, 16);
      } else {
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(0, 2, d.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-d.r * 0.55, 0);
        ctx.quadraticCurveTo(0, -d.r * 1.35, d.r * 0.55, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.arc(-d.r * 0.35, -d.r * 0.25, d.r * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = Math.round(d.r * 1.1) + 'px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.emoji, 0, d.r * 0.4);
      }
      ctx.restore();
    }
  }

  function drawPlayer(now) {
    const x = S.player.x, y = CONFIG.PLAYER_Y;
    ctx.fillStyle = '#2a1f4e';
    roundRect(ctx, x + 14, y + 30, 76, 42, 10);
    ctx.fill();
    ctx.fillStyle = '#1a1230';
    ctx.fillRect(x + 14, y + 30, 76, 8);

    ctx.fillStyle = '#ffd9a0';
    ctx.beginPath();
    ctx.arc(x + 52, y + 20, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2b27d';
    ctx.beginPath();
    ctx.arc(x + 58, y + 20, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ededff';
    ctx.beginPath();
    ctx.arc(x + 52, y + 26, 20, 0, Math.PI);
    ctx.fill();

    ctx.fillStyle = '#ff3b5c';
    ctx.beginPath();
    ctx.arc(x + 52, y + 8, 22, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x + 30, y + 8, 44, 7);
    ctx.fillStyle = '#e9e9ff';
    ctx.beginPath();
    ctx.arc(x + 52, y - 6, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1a1230';
    ctx.beginPath();
    ctx.arc(x + 44, y + 16, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 62, y + 16, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffd9a0';
    ctx.beginPath();
    ctx.arc(x + 84, y + 40, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#111';
    roundRect(ctx, x + 80, y + 46, 20, 9, 3);
    ctx.fill();
    ctx.fillStyle = '#ff9a3c';
    ctx.fillRect(x + 98, y + 47, 6, 7);

    ctx.fillStyle = '#7b4dff';
    ctx.globalAlpha = 0.5 + Math.sin(now * 6) * 0.2;
    ctx.beginPath();
    ctx.arc(x + 106, y + 42, 4 + Math.sin(now * 9) * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    for (const pt of S.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
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
      tg.setHeaderColor('#12051f');
      tg.setBackgroundColor('#12051f');
    } catch (e) {}
    const u = tg.initDataUnsafe && tg.initDataUnsafe.user;
    if (u && u.first_name) {
      el.textContent = 'ПРИВЕТ, ' + u.first_name.toUpperCase() + '!';
    }
  }
}