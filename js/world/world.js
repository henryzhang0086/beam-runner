/* =========================================================================
 * world.js — 单个playfield模拟单元（一个 World = 一名跑者的完整世界）
 * 所有模式复用：无限/闯关跑一个 World；人机对决跑两个同 seed 的 World
 *（保证地图完全一致 = 公平），其中之一由 AI 控制。
 *
 * 物理与碰撞全部在“格空间”完成 → 与渲染分辨率解耦；对决双方用同一套
 * 模拟视口尺寸，确保判定一致。渲染视口可各自不同（主画面 / 小窗）。
 * ====================================================================== */
window.CG = window.CG || {};

CG.World = function (opts) {
  const C = CG.CONFIG, GEO = CG.GEO, U = CG.util, COL = C.COLORS;

  const w = {
    mode: opts.mode,                 // 'endless' | 'campaign' | 'versus'
    variant: opts.variant || 'plain',
    seed: opts.seed >>> 0,
    versus: opts.mode === 'versus',
    isAI: !!opts.isAI,
    level: 0,

    player: CG.Player(),
    source: null,
    background: CG.Background(opts.seed),
    particles: CG.Particles(),
    camera: CG.Camera(),

    obstacles: [], coins: [], items: [],
    floaters: [],                    // 飘字（+8 等）

    scroll: 0,                       // 已前进的格数
    driftAccum: 0,
    time: 0,
    score: 0, coinScore: 0, coinsCollected: 0,
    combo: 0, comboTimer: 0,
    lives: opts.lives || C.LIVES_START,
    deaths: 0,
    inventory: [],
    stepsCrossed: 0,
    denseTimer: 0, speedupTimer: 0,
    dense: false,
    status: 'running',               // running | dead | finished
    finishCX: Infinity,
    tutorials: [],

    aiController: null,
    // 模拟视口（像素，对决双方相同）
    simW: opts.simW || 800, simH: opts.simH || 450,
    _rg: null,
  };

  // ---- 几何 ----
  w.cell = () => w.simH / C.VH_CELLS;
  w.viewWidthCells = () => w.simW / w.cell();
  w.K = () => C.PLAYER_X_FRAC * w.viewWidthCells();
  w.playerCX = () => w.scroll + w.K();
  w.setSim = (pw, ph) => { w.simW = pw; w.simH = ph; };

  // 渲染坐标助手（用上一帧渲染几何，用于粒子等）
  w._sx = (cx) => w._rg ? w._rg.originX + (cx - w._rg.pcx) * w._rg.cell : 0;
  w._surfY = (side) => w._rg ? w._rg.y + (side === 'top' ? GEO.topSurfaceVY : GEO.bottomSurfaceVY) * w._rg.cell : 0;

  // ---- 生成接口 ----
  w.addObstacle = (spec) => { w.obstacles.push(CG.makeObstacle(spec)); };
  w.addCoin = (cx, vy) => { w.coins.push(CG.makeCoin(cx, vy)); };
  w.addItem = (id, cx, vy) => { w.items.push(CG.makeItemPickup(id, cx, vy)); };
  w.queueTutorial = (text, cx) => { w.tutorials.push({ text, cx, shown: false }); };

  // ---- 初始化 ----
  w.init = function () {
    w.source = w.mode === 'campaign'
      ? CG.CampaignSource(opts.level)
      : CG.EndlessSource(w.seed, w.variant);
    w.player.onEvent = (e) => {
      if (e === 'flip') w.camera.shake(C.FLIP_SHAKE);
    };
    w.source.start(w);
    w.source.fill && w.source.fill(w);
  };

  // ---- 速度 ----
  w.speed = function () {
    let s = C.SPEED_BASE + w.level * C.SPEED_PER_LEVEL + w.driftAccum;
    if (w.speedupTimer > 0) s *= C.SPEEDUP_FACTOR;
    if (w.player.speedT > 0) s *= 1.18;
    if (opts.baseSpeed) s = Math.max(s, opts.baseSpeed);
    return Math.min(C.SPEED_MAX, s);
  };

  // ---- 道具 ----
  w.pickItem = function (id) {
    if (id === 'life') {
      if (w.lives < C.LIVES_MAX) { w.lives++; w.addFloater('+1♥', COL.life); }
      else w.addScore(20);
      CG.Audio.play('item');
      return;
    }
    if (w.inventory.length < C.INVENTORY_MAX) w.inventory.push(id);
    else w.addScore(15);
    CG.Audio.play('item');
  };
  w.useItem = function () {
    if (!w.inventory.length) return;
    const id = w.inventory.shift();
    const m = CG.ITEMS[id];
    if (id === 'shield') { w.player.shieldT = C.ITEM_SHIELD_TIME; CG.Audio.play('shield'); w.addFloater('护盾', COL.shield); }
    else if (id === 'speed') { w.player.speedT = C.ITEM_SPEED_TIME; CG.Audio.play('item'); w.addFloater('加速 x2', COL.speed); }
    else if (id === 'bomb') { w.detonate(); }
    if (w.onItemUsed) w.onItemUsed(id);
  };
  w.detonate = function () {
    CG.Audio.play('bomb');
    w.camera.shake(10);
    const x0 = w.playerCX(), x1 = x0 + C.ITEM_BOMB_RANGE;
    let n = 0;
    for (const o of w.obstacles) {
      if (o.destroyed || !o.breakable) continue;
      if (o.cx + o.w >= x0 - 1 && o.cx <= x1) { o.destroy(w); n++; }
    }
    // 爆炸闪光粒子
    const sx = w._sx(x0 + C.ITEM_BOMB_RANGE / 2);
    w.particles.burst(sx, w._surfY(w.player.side), COL.bomb, 24, { speed: 320, life: 0.6 });
    w.addFloater(n ? '炸开 ' + n : '炸弹', COL.bomb);
  };

  // ---- 分数 / 飘字 ----
  w.addScore = function (n) { w.score += n; };
  w.addFloater = function (text, color) {
    w.floaters.push({ text, color, life: 1.1, x: w._sx(w.playerCX()), y: w._surfY(w.player.side) - 30, vy: -40 });
  };

  // ---- 伤害 ----
  w.damage = function (gate) {
    const p = w.player;
    if (p.invincible > 0) return;                 // 受伤无敌帧
    if (p.shieldT > 0) {                           // 护盾抵消一次
      p.shieldT = 0; p.invincible = 0.6;
      CG.Audio.play('shield'); w.camera.shake(6);
      w.particles.burst(w._sx(w.playerCX()), w._surfY(p.side), COL.shield, 16, { speed: 220 });
      w.addFloater('挡下！', COL.shield);
      return;
    }
    CG.Audio.play('hit');
    w.camera.shake(C.HIT_SHAKE);
    w.particles.burst(w._sx(w.playerCX()), w._surfY(p.side), COL.bad, 18, { speed: 260 });
    w.combo = 0;
    if (w.versus) {
      w.deaths++;
      w.score = Math.max(0, w.score - C.VERSUS_DEATH_PENALTY);
      w.addFloater('-' + C.VERSUS_DEATH_PENALTY, COL.bad);
      p.hit();
    } else {
      w.lives--;
      w.deaths++;
      p.hit();
      if (w.lives <= 0) { w.die(); }
    }
  };
  w.die = function () {
    w.status = 'dead';
    w.player.alive = false;
    CG.Audio.play('lose');
    w.particles.burst(w._sx(w.playerCX()), w._surfY(w.player.side), COL.player, 30, { speed: 320, life: 0.8 });
  };

  // ---- 主更新 ----
  w.update = function (dt, intents) {
    if (w.status !== 'running') { w.particles.update(dt); w.camera.update(dt); return; }
    w.time += dt;

    // 输入 → 玩家
    if (intents) {
      if (intents.jump) w.player.requestJump();
      if (intents.flip) w.player.requestFlip();
      if (intents.item) w.useItem();
    }

    // 前进
    w.driftAccum += C.SPEED_DRIFT * dt;
    // 基础难度档随“距离”平滑提升（与生成难度对齐，避免刷币瞬间拉满速度）
    w.level = U.clamp(Math.floor(w.scroll / C.DIST_PER_LEVEL), 0, 3);
    const spd = w.speed();
    w.scroll += spd * dt;
    if (w.speedupTimer > 0) w.speedupTimer -= dt;
    if (w.denseTimer > 0) { w.denseTimer -= dt; w.dense = true; } else w.dense = false;
    if (w.player.speedT > 0) w.player.speedT -= dt;
    if (w.player.shieldT > 0) w.player.shieldT -= dt;

    // 物理
    w.player.update(dt);
    w.background.update(dt);
    w.camera.update(dt);

    // 生成
    w.source.fill && w.source.fill(w);

    // 实体更新
    for (const o of w.obstacles) o.update(dt, w);
    for (const c of w.coins) c.update(dt);
    for (const it of w.items) it.update(dt);
    w.particles.update(dt);

    // 飘字
    for (let i = w.floaters.length - 1; i >= 0; i--) {
      const f = w.floaters[i]; f.life -= dt; f.y += f.vy * dt; f.vy += 30 * dt;
      if (f.life <= 0) w.floaters.splice(i, 1);
    }

    // 连击计时
    if (w.comboTimer > 0) { w.comboTimer -= dt; if (w.comboTimer <= 0) w.combo = 0; }

    // 碰撞
    w.collide();

    // 分数（距离）
    w.score = w.coinScore + Math.floor(w.scroll * C.DIST_SCORE_PER_CELL);

    // 积分里程碑（200/400/600）：触发一次性“密集 + 加速”困难突击（临时，不永久拉满）
    while (w.stepsCrossed < C.HARD_SCORE_STEPS.length && w.score >= C.HARD_SCORE_STEPS[w.stepsCrossed]) {
      w.stepsCrossed++;
      w.denseTimer = C.DENSE_TIME;
      w.speedupTimer = C.SPEEDUP_TIME;
      CG.Audio.play('levelup');
      if (!w.isAI && w.onHardStage) w.onHardStage(w.stepsCrossed);
    }

    // 教程触发（闯关）
    const pcx = w.playerCX();
    for (const t of w.tutorials) {
      if (!t.shown && pcx >= t.cx - w.viewWidthCells() * 0.4) {
        t.shown = true;
        if (!w.isAI && w.onTutorial) w.onTutorial(t.text);
      }
    }

    // 终点（闯关）
    if (w.mode === 'campaign' && w.scroll >= w.finishCX - w.K()) {
      w.status = 'finished';
      if (!w.isAI) CG.Audio.play('win');
    }

    // 清理已离屏实体
    const cullX = w.scroll - 4;
    w.obstacles = w.obstacles.filter((o) => o.cx + o.w > cullX);
    w.coins = w.coins.filter((c) => !c.collected && c.cx > cullX);
    w.items = w.items.filter((it) => !it.collected && it.cx > cullX);
  };

  // ---- 碰撞解析（格空间）----
  w.collide = function () {
    const p = w.player;
    if (!p.alive) return;
    const pcx = w.playerCX();
    const pb = p.aabb(pcx);

    // 触发开关
    for (const o of w.obstacles) {
      if (!o.trigger || o.triggered) continue;
      const tb = o.touchBox();
      if (tb && U.aabb(pb.x0, pb.y0, pb.x1 - pb.x0, pb.y1 - pb.y0, tb.x0, tb.y0, tb.x1 - tb.x0, tb.y1 - tb.y0)) o.onTouch(w);
    }
    // 伤害
    for (const o of w.obstacles) {
      if (o.destroyed) continue;
      const hb = o.hazardBox();
      if (!hb) continue;
      if (U.aabb(pb.x0, pb.y0, pb.x1 - pb.x0, pb.y1 - pb.y0, hb.x0, hb.y0, hb.x1 - hb.x0, hb.y1 - hb.y0)) {
        w.damage(o.type === 'gate');
        if (o.type === 'gate') o.destroy(w);  // 撞门即破，避免卡死
        break;
      }
    }
    // 金币
    for (const c of w.coins) {
      if (c.collected) continue;
      const b = c.box();
      if (U.aabb(pb.x0, pb.y0, pb.x1 - pb.x0, pb.y1 - pb.y0, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0)) {
        c.collected = true;
        w.combo = Math.min(C.COIN_COMBO_MAX, w.combo + 1);
        w.comboTimer = C.COMBO_RESET_GAP;
        const gain = C.COIN_VALUE + (w.combo - 1) * C.COIN_COMBO_BONUS;
        const mult = w.player.speedT > 0 ? 2 : 1;
        w.coinScore += gain * mult;
        w.coinsCollected++;
        CG.Audio.play('coin');
        w.particles.burst(w._sx(c.cx), w._rg ? w._rg.y + c.vy * w._rg.cell : 0, COL.coin, C.COIN_PARTICLES, { speed: 160, life: 0.4, shape: 'circle', size: 3 });
      }
    }
    // 道具
    for (const it of w.items) {
      if (it.collected) continue;
      const b = it.box();
      if (U.aabb(pb.x0, pb.y0, pb.x1 - pb.x0, pb.y1 - pb.y0, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0)) {
        it.collected = true;
        w.pickItem(it.id);
      }
    }
  };

  // ================= 渲染 =================
  w.render = function (ctx, x, y, vw, vh, ropts) {
    ropts = ropts || {};
    const cell = vh / C.VH_CELLS;
    const pcx = w.playerCX();
    const originX = x + vw * C.PLAYER_X_FRAC;
    w._rg = { x, y, w: vw, h: vh, cell, originX, pcx };

    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, vw, vh); ctx.clip();

    // 背景
    w.background.render(ctx, x, y, vw, vh, w.scroll * cell, w.isAI ? COL.aiTint : '#9fb4ff');

    // 震动位移
    ctx.translate(w.camera.offsetX, w.camera.offsetY);

    const topY = y + GEO.topSurfaceVY * cell;
    const botY = y + GEO.bottomSurfaceVY * cell;
    const sX = (cx) => originX + (cx - pcx) * cell;

    // 独木
    drawBeam(ctx, x, vw, topY, botY, cell, w.scroll);

    // 金币 / 道具（先于障碍，处于背面）
    for (const c of w.coins) {
      if (c.collected) continue;
      const sx = sX(c.cx); if (sx < x - 40 || sx > x + vw + 40) continue;
      c.renderAt(ctx, sx, y + c.vy * cell, cell);
    }
    for (const it of w.items) {
      if (it.collected) continue;
      const sx = sX(it.cx); if (sx < x - 40 || sx > x + vw + 40) continue;
      it.renderAt(ctx, sx, y + it.vy * cell, cell);
    }

    // 障碍
    for (const o of w.obstacles) {
      const sx = sX(o.cx); if (sx < x - 80 || sx > x + vw + 80) continue;
      o.render(ctx, sx, cell, topY, botY);
    }

    // 玩家
    if (w.player.alive || w.status === 'finished') w.player.render(ctx, originX, cell, topY, botY);

    // 粒子
    w.particles.render(ctx);

    // 飘字
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.floor(cell * 0.5)}px system-ui, sans-serif`;
    for (const f of w.floaters) {
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    if (ropts.dim) { ctx.fillStyle = 'rgba(8,10,22,0.28)'; ctx.fillRect(x, y, vw, vh); }
    ctx.restore();
  };

  function drawBeam(ctx, x, vw, topY, botY, cell, scroll) {
    const grad = ctx.createLinearGradient(0, topY, 0, botY);
    grad.addColorStop(0, COL.beamEdge);
    grad.addColorStop(0.15, COL.beam);
    grad.addColorStop(0.85, COL.beam);
    grad.addColorStop(1, COL.beamGrain);
    ctx.fillStyle = grad;
    ctx.fillRect(x - 4, topY, vw + 8, botY - topY);
    // 上下高光边
    ctx.fillStyle = U.rgba('#aab8e0', 0.5);
    ctx.fillRect(x - 4, topY, vw + 8, 2);
    ctx.fillStyle = U.rgba('#000', 0.3);
    ctx.fillRect(x - 4, botY - 2, vw + 8, 2);
    // 滚动木纹
    ctx.strokeStyle = U.rgba(COL.beamGrain, 0.6); ctx.lineWidth = 2;
    const period = cell * 1.4;
    const off = -((scroll * cell) % period);
    for (let gx = x + off; gx < x + vw + period; gx += period) {
      ctx.beginPath();
      ctx.moveTo(gx, topY + 3);
      ctx.lineTo(gx - cell * 0.3, botY - 3);
      ctx.stroke();
    }
  }

  return w;
};
