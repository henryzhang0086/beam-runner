/* =========================================================================
 * background.js — 视差背景（远景星点 + 多层山脊 + 渐变天空 + 流光地平线）
 * 与世界滚动量挂钩，按层产生不同视差速度。
 * ====================================================================== */
window.CG = window.CG || {};

CG.Background = function (seed) {
  const rng = CG.util.makeRNG((seed || 1) * 2654435761 >>> 0);

  // 星点
  const stars = [];
  for (let i = 0; i < 70; i++) {
    stars.push({ x: rng(), y: rng() * 0.55, r: rng.range(0.6, 1.8), tw: rng.range(0, Math.PI * 2), s: rng.range(0.18, 0.5) });
  }

  // 山脊层：每层一串高度采样点
  function makeRidge(points, baseH, amp) {
    const arr = [];
    for (let i = 0; i <= points; i++) arr.push(rng.range(baseH - amp, baseH + amp));
    return arr;
  }
  const ridges = [
    { pts: makeRidge(8, 0.72, 0.10), color: '#1b2547', par: 0.06, span: 1.6 },
    { pts: makeRidge(10, 0.80, 0.10), color: '#222e57', par: 0.12, span: 1.3 },
    { pts: makeRidge(14, 0.88, 0.08), color: '#2a3868', par: 0.22, span: 1.0 },
  ];

  let hueT = 0;

  return {
    update(dt) { hueT += dt; },
    render(ctx, x, y, w, h, scrollPx, tint) {
      const C = CG.CONFIG.COLORS;
      // 天空渐变
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, C.bgTop);
      g.addColorStop(1, C.bgBot);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);

      // 星点（缓慢视差 + 闪烁）
      ctx.save();
      for (const st of stars) {
        const sx = x + ((st.x * w - scrollPx * 0.02) % w + w) % w;
        const sy = y + st.y * h;
        const a = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(hueT * st.s * 6 + st.tw));
        ctx.globalAlpha = a;
        ctx.fillStyle = '#cdd8ff';
        ctx.beginPath(); ctx.arc(sx, sy, st.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // 远景光晕（伪太阳/月亮）
      const moonX = x + w * 0.78, moonY = y + h * 0.24;
      const rg = ctx.createRadialGradient(moonX, moonY, 4, moonX, moonY, h * 0.5);
      rg.addColorStop(0, CG.util.rgba(tint || '#9fb4ff', 0.25));
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(x, y, w, h);

      // 山脊层
      for (const r of ridges) {
        const span = w * r.span;
        const seg = span / (r.pts.length - 1);
        const off = -((scrollPx * r.par) % seg);
        ctx.fillStyle = r.color;
        ctx.beginPath();
        ctx.moveTo(x - seg, y + h);
        let px = x + off - seg;
        // 多绘制一段以铺满
        for (let rep = 0; rep < 2; rep++) {
          for (let i = 0; i < r.pts.length; i++) {
            ctx.lineTo(px, y + r.pts[i] * h);
            px += seg;
          }
        }
        ctx.lineTo(px, y + h);
        ctx.closePath();
        ctx.fill();
      }
    },
  };
};
