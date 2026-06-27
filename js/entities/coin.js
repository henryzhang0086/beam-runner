/* =========================================================================
 * coin.js — 金币（计分）。位置用格坐标 (cx, vy)。
 * ====================================================================== */
window.CG = window.CG || {};

CG.makeCoin = function (cx, vy) {
  const C = CG.CONFIG, COL = C.COLORS, U = CG.util;
  return {
    type: 'coin', cx, vy, r: 0.32, collected: false, t: cx * 0.5,
    box() { return { x0: cx - 0.32, x1: cx + 0.32, y0: vy - 0.32, y1: vy + 0.32 }; },
    update(dt) { this.t += dt; },
    // world 传入屏幕坐标渲染
    renderAt(ctx, sx, sy, cell) {
      if (this.collected) return;
      const spin = Math.abs(Math.cos(this.t * 4));
      const r = this.r * cell;
      ctx.save();
      ctx.translate(sx, sy + Math.sin(this.t * 3) * cell * 0.08);
      ctx.shadowColor = U.rgba(COL.coin, 0.6); ctx.shadowBlur = 10;
      const grad = ctx.createLinearGradient(0, -r, 0, r);
      grad.addColorStop(0, '#fff3b0'); grad.addColorStop(0.5, COL.coin); grad.addColorStop(1, COL.coinEdge);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.ellipse(0, 0, Math.max(2, r * spin), r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      if (spin > 0.35) {
        ctx.fillStyle = U.rgba('#fff', 0.7);
        ctx.font = `bold ${Math.floor(r * 1.1)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('¥', 0, 0);
      }
      ctx.restore();
    },
  };
};
