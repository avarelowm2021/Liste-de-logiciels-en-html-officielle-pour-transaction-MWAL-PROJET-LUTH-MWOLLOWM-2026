/*
 * MWOLLOWM Universe — Prototype Mineur Témoin V1
 * ------------------------------------------------
 * Extension non destructive : elle ajoute un calque Canvas transparent
 * au-dessus du moteur V3.5, sans modifier les mondes, l'API, les clés,
 * les cercles ni la navigation existante.
 *
 * À charger juste avant </body> :
 * <script src="prototype/mineur-temoin-v1.js"></script>
 */
(() => {
  'use strict';

  const GENESIS_UTC = Date.parse('2026-01-06T23:00:00Z'); // 07/01/2026 00:00 Paris
  const MWAL_INTERVAL_MS = 4000;
  const MWAL_PER_OLLO = 144000;
  const TRAIL_COUNT = 18;
  const GOLD = '#ffd35a';
  const GOLD_WHITE = '#fff6c8';

  const overlay = document.createElement('canvas');
  overlay.id = 'mt-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '2'
  });
  document.body.appendChild(overlay);
  const g = overlay.getContext('2d');

  const badge = document.createElement('div');
  badge.id = 'mt-badge';
  badge.innerHTML = '<b>MT</b><span id="mt-live-label">Synchronisation…</span>';
  Object.assign(badge.style, {
    position: 'fixed', left: '50%', top: '104px', transform: 'translateX(-50%)',
    zIndex: '7', display: 'flex', alignItems: 'center', gap: '9px',
    padding: '7px 12px', borderRadius: '999px', pointerEvents: 'none',
    color: '#fff3b0', background: 'rgba(9,8,3,.58)',
    border: '1px solid rgba(255,211,90,.28)', backdropFilter: 'blur(12px)',
    font: '700 10px Inter,Arial,sans-serif', letterSpacing: '.08em',
    boxShadow: '0 0 22px rgba(255,190,35,.10)'
  });
  badge.querySelector('b').style.color = GOLD;
  document.body.appendChild(badge);
  const label = badge.querySelector('#mt-live-label');

  let W = 0, H = 0, DPR = 1;
  let lastMwal = -1;
  let flashStarted = 0;
  let lastFrame = performance.now();
  let smoothedFacing = 1;

  function resize() {
    W = innerWidth; H = innerHeight; DPR = Math.min(devicePixelRatio || 1, 2);
    overlay.width = Math.round(W * DPR);
    overlay.height = Math.round(H * DPR);
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  addEventListener('resize', resize, {passive:true});
  resize();

  function currentMwal(now = Date.now()) {
    return Math.max(0, Math.floor((now - GENESIS_UTC) / MWAL_INTERVAL_MS));
  }

  function safeProject(id) {
    try {
      if (typeof worldPosition !== 'function' || typeof project !== 'function') return null;
      return project(...(() => {
        const w = worldPosition(id);
        return [w.x, w.y, w.z];
      })());
    } catch (_) {
      try {
        const w = worldPosition(id);
        return project(w.x, w.y, w.z);
      } catch (_) { return null; }
    }
  }

  function projectedWorld(id) {
    try {
      if (typeof worldPosition !== 'function' || typeof project !== 'function') return null;
      const w = worldPosition(id);
      const q = project(w.x, w.y, w.z);
      if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.y) || !Number.isFinite(q.s)) return null;
      return q;
    } catch (_) { return null; }
  }

  function glow(x, y, radius, alpha) {
    const grad = g.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, `rgba(255,247,199,${alpha})`);
    grad.addColorStop(.22, `rgba(255,211,90,${alpha * .78})`);
    grad.addColorStop(1, 'rgba(255,170,20,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, radius, 0, Math.PI * 2); g.fill();
  }

  function limb(ax, ay, bx, by, width, alpha = 1) {
    g.strokeStyle = `rgba(255,214,85,${alpha})`;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.strokeStyle = `rgba(255,249,205,${alpha * .72})`;
    g.lineWidth = Math.max(1, width * .18);
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
  }

  function drawEye(x, y, s, alpha = 1) {
    g.save(); g.translate(x, y);
    g.strokeStyle = `rgba(255,250,215,${alpha})`; g.lineWidth = Math.max(1, s * .08);
    g.beginPath(); g.moveTo(-s, 0); g.quadraticCurveTo(0, -s * .62, s, 0);
    g.quadraticCurveTo(0, s * .62, -s, 0); g.stroke();
    g.fillStyle = `rgba(255,218,72,${alpha})`; g.beginPath(); g.arc(0, 0, s * .28, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  function drawMiner(q, time, scaleBoost = 1) {
    const s = Math.max(.42, Math.min(1.65, q.s * 1.32)) * scaleBoost;
    const cycle = time * .0031;
    const stride = Math.sin(cycle);
    const other = Math.sin(cycle + Math.PI);
    const bob = Math.abs(Math.sin(cycle)) * 2.2 * s;
    const x = q.x, ground = q.y + 26 * s;
    const hipY = ground - 62 * s - bob;
    const chestY = hipY - 46 * s;
    const headY = chestY - 30 * s;

    let facing = 1;
    try {
      if (typeof velocity === 'number' && Math.abs(velocity) > .01) facing = velocity >= 0 ? 1 : -1;
      else if (typeof destination === 'number' && typeof camera !== 'undefined') facing = destination >= camera.z ? 1 : -1;
    } catch (_) {}
    smoothedFacing += (facing - smoothedFacing) * .08;
    const f = smoothedFacing >= 0 ? 1 : -1;

    glow(x, chestY, 76 * s, .20);
    glow(x, ground - 2 * s, 48 * s, .10);

    g.save();
    g.shadowBlur = 18 * s; g.shadowColor = GOLD;

    const shoulderL = {x: x - 20*s*f, y: chestY - 3*s};
    const shoulderR = {x: x + 20*s*f, y: chestY - 3*s};
    const hipL = {x: x - 8*s, y: hipY};
    const hipR = {x: x + 8*s, y: hipY};

    const kneeL = {x: x - 11*s + stride*17*s*f, y: hipY + 31*s};
    const kneeR = {x: x + 11*s + other*17*s*f, y: hipY + 31*s};
    const footL = {x: x - 13*s + stride*30*s*f, y: ground};
    const footR = {x: x + 13*s + other*30*s*f, y: ground};

    const elbowL = {x: shoulderL.x - other*12*s*f, y: chestY + 25*s};
    const elbowR = {x: shoulderR.x - stride*12*s*f, y: chestY + 25*s};
    const handL = {x: elbowL.x - other*18*s*f, y: chestY + 49*s};
    const handR = {x: elbowR.x - stride*18*s*f, y: chestY + 49*s};

    // jambes et bras : silhouette athlétique, sans cape
    limb(hipL.x, hipL.y, kneeL.x, kneeL.y, 15*s);
    limb(kneeL.x, kneeL.y, footL.x, footL.y, 11*s);
    limb(hipR.x, hipR.y, kneeR.x, kneeR.y, 15*s);
    limb(kneeR.x, kneeR.y, footR.x, footR.y, 11*s);
    limb(shoulderL.x, shoulderL.y, elbowL.x, elbowL.y, 13*s);
    limb(elbowL.x, elbowL.y, handL.x, handL.y, 9*s);
    limb(shoulderR.x, shoulderR.y, elbowR.x, elbowR.y, 13*s);
    limb(elbowR.x, elbowR.y, handR.x, handR.y, 9*s);

    // torse large et taille resserrée
    const torso = g.createLinearGradient(x - 22*s, chestY, x + 22*s, hipY);
    torso.addColorStop(0, '#8f5a00'); torso.addColorStop(.38, '#fff0a8');
    torso.addColorStop(.62, '#ffc62d'); torso.addColorStop(1, '#6d4100');
    g.fillStyle = torso;
    g.beginPath();
    g.moveTo(x - 24*s, chestY - 8*s); g.quadraticCurveTo(x - 27*s, chestY + 18*s, x - 12*s, hipY);
    g.lineTo(x + 12*s, hipY); g.quadraticCurveTo(x + 27*s, chestY + 18*s, x + 24*s, chestY - 8*s);
    g.quadraticCurveTo(x, chestY - 20*s, x - 24*s, chestY - 8*s); g.fill();

    // tête/visage sans identité
    const head = g.createRadialGradient(x - 5*s, headY - 7*s, 1, x, headY, 17*s);
    head.addColorStop(0, '#fff8cf'); head.addColorStop(.35, '#ffd450'); head.addColorStop(1, '#8b5500');
    g.fillStyle = head; g.beginPath(); g.ellipse(x, headY, 14*s, 18*s, 0, 0, Math.PI*2); g.fill();
    g.fillStyle = 'rgba(15,11,3,.82)';
    g.beginPath(); g.roundRect(x - 10*s, headY - 6*s, 20*s, 10*s, 4*s); g.fill();

    drawEye(x, chestY + 10*s, 8*s, .96);
    g.restore();

    // ombre/empreinte sous le pied d'appui
    const planted = stride > 0 ? footR : footL;
    glow(planted.x, ground + 1*s, 20*s, .20);

    g.save();
    g.textAlign = 'center'; g.font = `800 ${Math.max(9, 10*s)}px Inter,Arial`;
    g.fillStyle = 'rgba(255,239,165,.92)'; g.shadowBlur = 8; g.shadowColor = '#000';
    g.fillText('MT · MINEUR TÉMOIN', x, headY - 31*s);
    g.restore();
  }

  function drawTrail(current, time) {
    for (let n = TRAIL_COUNT; n >= 1; n--) {
      const id = current - n;
      if (id < 0) continue;
      const q = projectedWorld(id);
      if (!q || q.s < .05) continue;
      const fade = (TRAIL_COUNT - n + 1) / TRAIL_COUNT;
      const r = Math.max(1.1, Math.min(5, 3.1 * q.s));
      glow(q.x, q.y, r * 5, .045 * fade);
      g.fillStyle = `rgba(255,214,80,${.18 + fade * .45})`;
      g.beginPath(); g.ellipse(q.x, q.y, r * 1.7, r * .65, -.35, 0, Math.PI*2); g.fill();
    }
  }

  function drawOlloAround(id, time, current) {
    const q = projectedWorld(id);
    if (!q || q.s < .08) return;
    const ageMwal = Math.max(0, current - id);
    const settle = Math.min(1, ageMwal / 12);
    const angularSpeed = .010 * (1 - settle) + .0012 * settle;
    const angle = time * angularSpeed + id * .00017;
    const rx = Math.max(16, 54 * q.s), ry = Math.max(6, 18 * q.s);
    const cx = q.x + Math.cos(angle) * rx;
    const cy = q.y + Math.sin(angle) * ry;

    g.save();
    g.strokeStyle = `rgba(255,201,56,${.16 + settle * .18})`;
    g.lineWidth = Math.max(1, q.s * 1.4);
    g.beginPath(); g.ellipse(q.x, q.y, rx, ry, -.2, 0, Math.PI*2); g.stroke();
    glow(cx, cy, Math.max(13, 28*q.s), .21);
    const coinR = Math.max(4, Math.min(15, 9*q.s));
    const coin = g.createRadialGradient(cx-coinR*.3,cy-coinR*.3,1,cx,cy,coinR);
    coin.addColorStop(0,'#fffbd8'); coin.addColorStop(.3,'#ffd85c'); coin.addColorStop(1,'#875000');
    g.fillStyle = coin; g.beginPath(); g.arc(cx,cy,coinR,0,Math.PI*2); g.fill();
    g.strokeStyle = '#fff0a0'; g.lineWidth = Math.max(1, coinR*.15); g.stroke();
    drawEye(cx,cy,coinR*.56,.86);
    g.restore();
  }

  function render(time) {
    const dt = Math.min(40, time - lastFrame); lastFrame = time;
    g.clearRect(0, 0, W, H);
    const mwal = currentMwal();
    const q = projectedWorld(mwal);

    drawTrail(mwal, time);
    if (q && q.s > .035) drawMiner(q, time);

    // Affiche uniquement les OLLO proches de la zone visible : précédent, actuel et suivant.
    const completed = Math.floor(mwal / MWAL_PER_OLLO);
    for (let k = Math.max(1, completed - 2); k <= completed; k++) {
      drawOlloAround(k * MWAL_PER_OLLO, time, mwal);
    }

    if (mwal !== lastMwal) {
      lastMwal = mwal; flashStarted = time;
    }
    const pulseAge = (time - flashStarted) / 1000;
    if (q && pulseAge < 1) {
      g.strokeStyle = `rgba(255,220,94,${.42 * (1-pulseAge)})`;
      g.lineWidth = 2;
      g.beginPath(); g.arc(q.x,q.y,16+pulseAge*70,0,Math.PI*2); g.stroke();
    }

    const next = MWAL_PER_OLLO - (mwal % MWAL_PER_OLLO);
    label.textContent = `${mwal.toLocaleString('fr-FR')} MWAL · prochain OLLO dans ${next.toLocaleString('fr-FR')}`;
    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
  console.info('[MWOLLOWM] Mineur Témoin V1 chargé — calque non destructif.');
})();
