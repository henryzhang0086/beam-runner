/* =========================================================================
 * particles.js — 轻量粒子系统（每个 World 独立一份）
 * 复用对象池，避免 GC 抖动。
 * ====================================================================== */
window.CG = window.CG || {};

CG.Particles = function () {
  const pool = [];
  const live = [];

  function obtain() {
    return pool.pop() || { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#fff', g: 0, shape: 'rect', spin: 0, rot: 0 };
  }

  function emit(opts) {
    const p = obtain();
    p.x = opts.x; p.y = opts.y;
    p.vx = opts.vx || 0; p.vy = opts.vy || 0;
    p.life = p.max = opts.life || 0.5;
    p.size = opts.size || 3;
    p.color = opts.color || '#fff';
    p.g = opts.g || 0;
    p.shape = opts.shape || 'rect';
    p.spin = opts.spin || 0; p.rot = opts.rot || 0;
    live.push(p);
  }

  // 常用爆发
  function burst(x, y, color, n, opts) {
    opts = opts || {};
    const spd = opts.speed || 180;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = spd * (0.3 + Math.random() * 0.7);
      emit({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (opts.up || 0),
        life: (opts.life || 0.5) * (0.6 + Math.random() * 0.6),
        size: (opts.size || 4) * (0.6 + Math.random() * 0.8),
        color, g: opts.g != null ? opts.g : 600, shape: opts.shape || 'rect',
        spin: (Math.random() - 0.5) * 12,
      });
    }
  }

  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.life -= dt;
      if (p.life <= 0) { pool.push(live[i]); live.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
  }

  function render(ctx) {
    for (let i = 0; i < live.length; i++) {
      const p = live[i];
      const a = Math.max(0, Math.min(1, p.life / p.max));
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      } else if (p.shape === 'spark') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size, -p.size * 0.25, p.size * 2, p.size * 0.5);
        ctx.restore();
      } else {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  function clear() { while (live.length) pool.push(live.pop()); }

  return { emit, burst, update, render, clear, get count() { return live.length; } };
};
