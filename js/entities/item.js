/* =========================================================================
 * item.js — 道具掉落物（拾取后进背包，按道具键使用）
 * 拾取与使用的“效果”由 World 处理；此处只负责数据与渲染。
 * ====================================================================== */
window.CG = window.CG || {};

CG.makeItemPickup = function (id, cx, vy) {
  const C = CG.CONFIG, U = CG.util;
  const meta = CG.ITEMS[id];
  return {
    type: 'item', id, cx, vy, r: 0.42, collected: false, t: cx * 0.7,
    box() { return { x0: cx - 0.42, x1: cx + 0.42, y0: vy - 0.42, y1: vy + 0.42 }; },
    update(dt) { this.t += dt; },
    renderAt(ctx, sx, sy, cell) {
      if (this.collected) return;
      const r = this.r * cell;
      const bob = Math.sin(this.t * 3) * cell * 0.12;
      ctx.save();
      ctx.translate(sx, sy + bob);
      // 光环
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(this.t * 6);
      ctx.fillStyle = meta.color;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      // 胶囊底
      ctx.fillStyle = U.rgba(meta.color, 0.9);
      ctx.shadowColor = meta.color; ctx.shadowBlur = 14;
      U.roundRect(ctx, -r, -r, r * 2, r * 2, r * 0.5); ctx.fill();
      ctx.shadowBlur = 0;
      // 图标
      ctx.fillStyle = '#0b0e1a';
      ctx.font = `bold ${Math.floor(r * 1.2)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(meta.icon, 0, r * 0.05);
      ctx.restore();
    },
  };
};
