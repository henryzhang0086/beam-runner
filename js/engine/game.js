/* =========================================================================
 * game.js — 顶层状态机与编排
 * 状态：menu → countdown → playing ⇄ paused → over → menu
 * 模式：endless / campaign / versus（versus 跑两个同 seed 的 World）
 * 固定步长物理（FIXED），渲染解耦；HiDPI 自适应由 main 设置 cw/ch。
 * ====================================================================== */
window.CG = window.CG || {};

CG.Game = function (canvas) {
  const C = CG.CONFIG, U = CG.util, COL = C.COLORS;
  const ctx = canvas.getContext('2d');
  const FIXED = 1 / 120;

  const g = {
    canvas, ctx,
    cw: 800, ch: 450, dpr: 1,
    state: 'menu',
    mode: null, level: null, variant: 'plain', aiDiff: 1,
    primary: null, opponent: null,
    timeLeft: 0,
    lastStart: null,
    acc: 0, last: 0, raf: 0,
  };

  // ---- 画布尺寸（由 main 在 resize 时调用）----
  g.resize = function (cssW, cssH, dpr) {
    g.cw = cssW; g.ch = cssH; g.dpr = dpr;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (g.primary) g.primary.setSim(cssW, cssH);
    if (g.opponent) g.opponent.setSim(cssW, cssH);
  };

  // ---- 启动一个模式 ----
  g.startMode = function (mode, opts) {
    opts = opts || {};
    g.lastStart = { mode, opts: Object.assign({}, opts) };
    g.mode = mode;
    g.variant = opts.variant || 'plain';
    g.opponent = null;
    g.level = null;
    CG.Input.clearAll();

    const seed = (Math.floor((performance.now() * 1000)) ^ (Date.now())) >>> 0;

    if (mode === 'endless') {
      g.primary = CG.World({ mode: 'endless', variant: g.variant, seed, simW: g.cw, simH: g.ch });
      wireSingle(g.primary);
      g.primary.init();
    } else if (mode === 'campaign') {
      const lv = opts.level;
      g.level = lv;
      g.primary = CG.World({
        mode: 'campaign', variant: lv.items ? 'items' : 'plain', seed: lv.id,
        level: lv, lives: lv.lives, baseSpeed: lv.baseSpeed, simW: g.cw, simH: g.ch,
      });
      wireSingle(g.primary);
      g.primary.init();
    } else if (mode === 'versus') {
      g.aiDiff = opts.aiDiff != null ? opts.aiDiff : 1;
      g.primary = CG.World({ mode: 'versus', variant: g.variant, seed, simW: g.cw, simH: g.ch });
      g.opponent = CG.World({ mode: 'versus', variant: g.variant, seed, isAI: true, simW: g.cw, simH: g.ch });
      g.primary.init();
      g.opponent.init();
      g.opponent.aiController = CG.AIOpponent(g.opponent, g.aiDiff);
      g.timeLeft = C.VERSUS_TIME;
    }

    CG.Screens.nav('none');
    CG.Audio.unlock();
    g.state = 'countdown';
    CG.Input.setEnabled(false);
    CG.Screens.countdown(() => {
      g.state = 'playing';
      CG.Input.setEnabled(true);
      CG.Audio.startMusic();
      g.last = performance.now();
      g.acc = 0;
    });
  };

  function wireSingle(world) {
    world.onTutorial = (t) => CG.Screens.toast(t);
    world.onHardStage = (lvl) => CG.Screens.toast(['', '困难提升！障碍更密、速度更快', '再次提速！小心', '最终冲刺，全力以赴！'][lvl] || '困难提升！');
    world.onReward = () => CG.Screens.toast('金币奖励段 — 尽情收集！');
    world.onItemUsed = () => {};
  }

  // ---- 暂停 / 继续 / 重开 / 退出 ----
  g.pause = function () {
    if (g.state !== 'playing') return;
    g.state = 'paused';
    CG.Audio.stopMusic();
    CG.Screens.showPause();
  };
  g.resume = function () {
    if (g.state !== 'paused') return;
    CG.Screens.hidePause();
    g.state = 'playing';
    CG.Audio.startMusic();
    g.last = performance.now();
    g.acc = 0;
    CG.Input.clearAll();
  };
  g.restart = function () {
    CG.Screens.hidePause();
    CG.Screens.hideGameOver();
    CG.Audio.stopMusic();
    if (g.lastStart) g.startMode(g.lastStart.mode, g.lastStart.opts);
  };
  g.quitToMenu = function () {
    CG.Screens.hidePause();
    CG.Screens.hideGameOver();
    CG.Audio.stopMusic();
    g.state = 'menu';
    g.mode = null; g.primary = null; g.opponent = null;
    CG.Input.setEnabled(false);
    CG.Screens.nav('menu');
  };

  // ---- 单步推进 ----
  function stepPlaying(dt) {
    // 暂停键
    if (CG.Input.consumePause()) { g.pause(); return; }

    g.acc += dt;
    let steps = 0;
    while (g.acc >= FIXED && steps < 5) {
      const first = steps === 0;
      // 人类意图（每帧消费一次边沿，放在首个子步）
      const hi = first
        ? { jump: CG.Input.consume('jump'), flip: CG.Input.consume('flip'), item: CG.Input.consume('item') }
        : { jump: false, flip: false, item: false };
      g.primary.update(FIXED, hi);

      if (g.opponent) {
        const ai = g.opponent.aiController ? g.opponent.aiController.decide(FIXED) : null;
        g.opponent.update(FIXED, ai);
      }
      g.acc -= FIXED; steps++;
    }
    if (g.acc > FIXED * 6) g.acc = 0; // 防螺旋

    // 计时 / 结束判定
    if (g.mode === 'versus') {
      g.timeLeft -= dt;
      if (g.timeLeft <= 0) { g.timeLeft = 0; endVersus(); }
    } else {
      if (g.primary.status === 'dead') endSingle(false);
      else if (g.primary.status === 'finished') endSingle(true);
    }
  }

  // ---- 结束处理 ----
  function endSingle(success) {
    g.state = 'over';
    CG.Input.setEnabled(false);
    CG.Audio.stopMusic();
    const w = g.primary;
    const far = Math.floor(w.scroll * 0.5);

    if (g.mode === 'endless') {
      const nb = CG.Storage.recordEndless(w.score, far);
      const html = `
        <div class="res-big">${U.fmtScore(w.score)}${nb ? ' <span class="nb">新纪录!</span>' : ''}</div>
        <div class="res-row"><span>金币</span><b>${w.coinsCollected}</b></div>
        <div class="res-row"><span>距离</span><b>${far} m</b></div>
        <div class="res-row"><span>历史最高</span><b>${U.fmtScore(CG.Storage.get('best'))}</b></div>`;
      CG.Screens.showGameOver('游戏结束', html);
    } else { // campaign
      if (success) {
        const stars = w.deaths === 0 ? 3 : (w.deaths === 1 ? 2 : 1);
        CG.Storage.recordLevel(g.level.id, w.score, stars);
        const starStr = '<span class="stars">' + '★'.repeat(stars) + '☆'.repeat(3 - stars) + '</span>';
        const next = CG.CAMPAIGN.find((l) => l.id === g.level.id + 1);
        const html = `
          ${starStr}
          <div class="res-row"><span>分数</span><b>${U.fmtScore(w.score)}</b></div>
          <div class="res-row"><span>金币</span><b>${w.coinsCollected}</b></div>
          <div class="res-row"><span>失误</span><b>${w.deaths}</b></div>
          ${next ? '<div class="hint">已解锁下一关：' + next.name + '</div>' : '<div class="hint">🎉 全部通关！</div>'}`;
        CG.Screens.showGameOver('过关！' + g.level.name, html);
      } else {
        CG.Screens.showGameOver('闯关失败', `<div class="res-row"><span>分数</span><b>${U.fmtScore(w.score)}</b></div>
          <div class="hint">再试一次，注意机关节奏</div>`);
      }
    }
  }

  function endVersus() {
    g.state = 'over';
    CG.Input.setEnabled(false);
    CG.Audio.stopMusic();
    const me = g.primary.score, ai = g.opponent.score;
    let title, cls;
    if (me > ai) { title = '你赢了！'; cls = 'good'; CG.Audio.play('win'); }
    else if (me < ai) { title = '惜败'; cls = 'bad'; CG.Audio.play('lose'); }
    else { title = '平局'; cls = ''; }
    const html = `
      <div class="vs-result">
        <div class="vs-side ${me >= ai ? 'win' : ''}"><span>你</span><b>${U.fmtScore(me)}</b></div>
        <div class="vs-vs">VS</div>
        <div class="vs-side ${ai > me ? 'win' : ''}"><span>AI</span><b>${U.fmtScore(ai)}</b></div>
      </div>
      <div class="res-row"><span>你的失误</span><b>${g.primary.deaths}</b> · <span>AI失误</span><b>${g.opponent.deaths}</b></div>`;
    CG.Screens.showGameOver(title, html);
  }

  // ---- 渲染 ----
  function render() {
    ctx.clearRect(0, 0, g.cw, g.ch);
    if (!g.primary) { // 菜单背景：跑一个装饰世界？简单画渐变
      const grad = ctx.createLinearGradient(0, 0, 0, g.ch);
      grad.addColorStop(0, COL.bgTop); grad.addColorStop(1, COL.bgBot);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, g.cw, g.ch);
      drawVignette();
      return;
    }

    g.primary.render(ctx, 0, 0, g.cw, g.ch);

    // 对决：右上小窗显示对手
    if (g.mode === 'versus' && g.opponent) {
      const mw = Math.min(g.cw * 0.32, 320);
      const mh = mw * (g.ch / g.cw);
      const mx = g.cw - mw - 14, my = 76;
      ctx.save();
      ctx.fillStyle = U.rgba('#000', 0.5);
      U.roundRect(ctx, mx - 3, my - 3, mw + 6, mh + 6, 10); ctx.fill();
      g.opponent.render(ctx, mx, my, mw, mh, { dim: true });
      ctx.strokeStyle = U.rgba(COL.aiTint, 0.8); ctx.lineWidth = 2;
      U.roundRect(ctx, mx, my, mw, mh, 8); ctx.stroke();
      ctx.fillStyle = COL.aiTint; ctx.font = 'bold 12px system-ui';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('对手 AI', mx + 6, my - 5);
      ctx.restore();
    }

    CG.HUD.render(ctx, g.cw, g.ch, g);
    drawVignette();

    if (g.state === 'paused') { ctx.fillStyle = 'rgba(8,10,22,0.55)'; ctx.fillRect(0, 0, g.cw, g.ch); }
  }

  function drawVignette() {
    const grd = ctx.createRadialGradient(g.cw / 2, g.ch / 2, g.ch * 0.3, g.cw / 2, g.ch / 2, g.ch * 0.75);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, g.cw, g.ch);
  }

  // ---- 主循环 ----
  function frame(now) {
    g.raf = requestAnimationFrame(frame);
    let dt = (now - g.last) / 1000;
    g.last = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.1) dt = 0.1;

    if (g.state === 'playing') stepPlaying(dt);
    else if (g.state === 'paused') { if (CG.Input.consumePause()) g.resume(); }
    // countdown：世界静止展示；其它状态仅渲染

    render();
  }

  g.start = function () { g.last = performance.now(); g.raf = requestAnimationFrame(frame); };

  return g;
};
