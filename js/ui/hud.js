/* =========================================================================
 * hud.js — 画布内 HUD：分数 / 生命 / 距离 / 连击 / 道具栏 / 困难提示 /
 *          闯关进度 / 对决比分与计时。
 * ====================================================================== */
window.CG = window.CG || {};

CG.HUD = (function () {
  const C = CG.CONFIG, COL = C.COLORS, U = CG.util;

  function panel(ctx, x, y, w, h, alpha) {
    ctx.fillStyle = U.rgba('#0b0e1a', alpha != null ? alpha : 0.42);
    U.roundRect(ctx, x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = U.rgba('#5a6da0', 0.35); ctx.lineWidth = 1;
    U.roundRect(ctx, x, y, w, h, 10); ctx.stroke();
  }

  function hearts(ctx, x, y, lives, size) {
    for (let i = 0; i < Math.max(lives, 0); i++) {
      ctx.fillStyle = COL.life;
      ctx.font = `${size}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('♥', x + i * (size * 0.85), y);
    }
  }

  function inventory(ctx, x, y, inv, scale) {
    const s = 34 * scale;
    for (let i = 0; i < C.INVENTORY_MAX; i++) {
      const ix = x + i * (s + 6);
      ctx.fillStyle = U.rgba('#0b0e1a', 0.5);
      U.roundRect(ctx, ix, y, s, s, 7); ctx.fill();
      ctx.strokeStyle = U.rgba('#5a6da0', 0.4); ctx.lineWidth = 1;
      U.roundRect(ctx, ix, y, s, s, 7); ctx.stroke();
      const id = inv[i];
      if (id) {
        const m = CG.ITEMS[id];
        ctx.fillStyle = m.color;
        ctx.font = `bold ${Math.floor(s * 0.5)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(m.icon, ix + s / 2, y + s / 2);
        if (i === 0) { // 首个=下次使用
          ctx.strokeStyle = m.color; ctx.lineWidth = 2;
          U.roundRect(ctx, ix, y, s, s, 7); ctx.stroke();
        }
      }
    }
    // 提示
    ctx.fillStyle = COL.textDim; ctx.font = `${Math.floor(12 * scale)}px system-ui`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('道具键使用 →', x, y + s + 4);
  }

  function comboBadge(ctx, cx, cy, combo, scale) {
    if (combo < 2) return;
    ctx.save();
    ctx.translate(cx, cy);
    const pop = 1 + 0.1 * Math.sin(Date.now() / 80);
    ctx.scale(pop, pop);
    ctx.fillStyle = COL.coin;
    ctx.font = `bold ${Math.floor(22 * scale)}px system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('连击 x' + combo, 0, 0);
    ctx.restore();
  }

  function drawScorePanel(ctx, x, y, w, world, scale, label) {
    panel(ctx, x, y, w, 56 * scale);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = COL.textDim; ctx.font = `${Math.floor(12 * scale)}px system-ui`;
    ctx.fillText(label || '分数', x + 12, y + 8 * scale);
    ctx.fillStyle = COL.text; ctx.font = `bold ${Math.floor(26 * scale)}px system-ui`;
    ctx.fillText(U.fmtScore(world.score), x + 12, y + 22 * scale);
  }

  return {
    render(ctx, cw, ch, game) {
      const scale = U.clamp(ch / 480, 0.7, 1.4);

      if (game.mode === 'versus') return this.renderVersus(ctx, cw, ch, game, scale);

      const w = game.primary;
      // 分数面板
      drawScorePanel(ctx, 14, 14, 150 * scale, w, scale);

      // 困难/加速提示
      let by = 14;
      if (w.speedupTimer > 0 || w.dense) {
        const tx = 14 + 150 * scale + 12;
        panel(ctx, tx, by, 92 * scale, 30 * scale, 0.5);
        ctx.fillStyle = w.speedupTimer > 0 ? COL.speed : COL.bad;
        ctx.font = `bold ${Math.floor(15 * scale)}px system-ui`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(w.speedupTimer > 0 ? '⚡加速!' : '密集!', tx + 46 * scale, by + 15 * scale);
      }

      // 生命（右上）
      const hx = cw - 14 - (w.lives) * (24 * scale * 0.85) - 4;
      hearts(ctx, Math.max(cw * 0.5, hx), 16, w.lives, Math.floor(24 * scale));

      // 距离（右上，生命下方）
      ctx.fillStyle = COL.textDim; ctx.font = `${Math.floor(14 * scale)}px system-ui`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(Math.floor(w.scroll * 0.5) + ' m', cw - 14, 16 + 26 * scale);
      ctx.fillText('最高 ' + U.fmtScore(CG.Storage.get('best')), cw - 14, 16 + 44 * scale);

      // 闯关进度条
      if (game.mode === 'campaign') {
        const prog = U.clamp(w.scroll / Math.max(1, w.finishCX - w.K()), 0, 1);
        const bx = cw / 2 - 110 * scale, bw = 220 * scale, byy = 16, bh = 10 * scale;
        panel(ctx, bx - 4, byy - 4, bw + 8, bh + 8, 0.4);
        ctx.fillStyle = U.rgba('#5a6da0', 0.4); U.roundRect(ctx, bx, byy, bw, bh, bh / 2); ctx.fill();
        ctx.fillStyle = COL.good; U.roundRect(ctx, bx, byy, bw * prog, bh, bh / 2); ctx.fill();
        ctx.fillStyle = COL.text; ctx.font = `${Math.floor(12 * scale)}px system-ui`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText((game.level ? game.level.name : '') + '  ' + Math.floor(prog * 100) + '%', cw / 2, byy + bh + 4);
      }

      // 道具栏（左下）
      if (w.variant === 'items' || (game.level && game.level.items)) {
        inventory(ctx, 14, ch - 14 - 34 * scale - 18, w.inventory, scale);
      }

      // 连击
      comboBadge(ctx, cw / 2, ch * 0.18, w.combo, scale);
    },

    renderVersus(ctx, cw, ch, game, scale) {
      const me = game.primary, ai = game.opponent;
      // 中上比分条
      const pw = 140 * scale;
      drawScorePanel(ctx, cw / 2 - pw - 50 * scale, 12, pw, me, scale, '你');
      drawScorePanel(ctx, cw / 2 + 50 * scale, 12, pw, ai, scale, '对手 AI');
      // 计时
      panel(ctx, cw / 2 - 46 * scale, 12, 92 * scale, 56 * scale);
      ctx.fillStyle = game.timeLeft < 10 ? COL.bad : COL.text;
      ctx.font = `bold ${Math.floor(30 * scale)}px system-ui`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(Math.ceil(game.timeLeft).toString(), cw / 2, 12 + 30 * scale);
      ctx.fillStyle = COL.textDim; ctx.font = `${Math.floor(11 * scale)}px system-ui`;
      ctx.fillText('秒', cw / 2, 12 + 48 * scale);

      // 领先标记
      const lead = me.score >= ai.score ? '领先' : '落后';
      ctx.fillStyle = me.score >= ai.score ? COL.good : COL.bad;
      ctx.font = `bold ${Math.floor(13 * scale)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(lead, cw / 2 - pw / 2 - 50 * scale, 12 + 56 * scale + 10);

      // 道具栏
      if (me.variant === 'items') inventory(ctx, 14, ch - 14 - 34 * scale - 18, me.inventory, scale);
      comboBadge(ctx, cw * 0.28, ch * 0.2, me.combo, scale * 0.8);
    },
  };
})();
