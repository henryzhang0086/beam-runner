/* =========================================================================
 * player.js — 玩家：跑酷者
 * 物理全部以“格”为单位，与分辨率无关。
 *   side  : 'top' | 'bottom'  当前贴在独木哪一面
 *   dist  : 离开当前面的距离（格，>=0；0 = 站在面上）
 *   vel   : d(dist)/dt（格/秒，正=远离独木）
 * 关键设计：dist 上限 = MAX_JUMP_CELLS < 3，因此 3 格刺“跳不过去”，
 *          只能靠换位 —— 与策划一致，且由物理保证、不靠运气。
 * 跳跃：地面点一下=单跳；空中再点一下=二段跳（更高）。对应“点两下”。
 * ====================================================================== */
window.CG = window.CG || {};

CG.Player = function () {
  const C = CG.CONFIG;
  const GEO = CG.GEO;

  const p = {
    side: 'top',
    dist: 0,
    vel: 0,
    onGround: true,
    jumpsUsed: 0,
    coyote: 0,
    jumpBuffer: 0,
    flipCooldown: 0,
    flipAnim: 0,        // 1→0 翻转动画进度
    flipDir: 1,
    invincible: 0,
    alive: true,
    // 表现
    bob: 0,
    runT: 0,
    squash: 0,          // 落地/起跳挤压
    shieldT: 0,         // 护盾剩余（由 world 写入用于渲染）
    speedT: 0,
    trail: [],
  };

  // ---- 控制意图 ----
  function requestJump() {
    p.jumpBuffer = C.JUMP_BUFFER;
  }
  function tryConsumeJump() {
    if (p.jumpBuffer <= 0) return;
    if (p.onGround || p.coyote > 0) {
      p.vel = C.JUMP_V; p.onGround = false; p.coyote = 0; p.jumpsUsed = 1;
      p.jumpBuffer = 0; p.squash = -0.5;
      CG.Audio.play('jump');
      if (p.onEvent) p.onEvent('jump');
    } else if (p.jumpsUsed < 2) {
      p.vel = C.DOUBLE_JUMP_V; p.jumpsUsed = 2; p.jumpBuffer = 0; p.squash = -0.6;
      CG.Audio.play('double');
      if (p.onEvent) p.onEvent('double');
    }
  }

  function requestFlip() {
    if (p.flipCooldown > 0) return false;
    p.side = p.side === 'top' ? 'bottom' : 'top';
    p.dist = 0; p.vel = 0; p.onGround = true; p.jumpsUsed = 0;
    p.flipCooldown = C.FLIP_COOLDOWN;
    p.flipAnim = 1; p.flipDir = -p.flipDir;
    CG.Audio.play('flip');
    if (p.onEvent) p.onEvent('flip');
    return true;
  }

  function update(dt) {
    if (!p.alive) return;
    p.runT += dt;
    p.bob = Math.sin(p.runT * 16) * 0.04;

    // 计时器
    if (p.flipCooldown > 0) p.flipCooldown -= dt;
    if (p.flipAnim > 0) p.flipAnim = Math.max(0, p.flipAnim - dt / C.FLIP_TIME);
    if (p.invincible > 0) p.invincible -= dt;
    if (p.coyote > 0) p.coyote -= dt;
    if (p.jumpBuffer > 0) p.jumpBuffer -= dt;
    p.squash = CG.util.approach(p.squash, 0, dt * 4);

    // 起跳缓冲消费
    tryConsumeJump();

    // 重力积分
    const wasGround = p.onGround;
    p.vel -= C.GRAVITY * dt;
    p.dist += p.vel * dt;

    // 高度硬上限（保证 3 格刺不可跳）
    if (p.dist > C.MAX_JUMP_CELLS) { p.dist = C.MAX_JUMP_CELLS; if (p.vel > 0) p.vel = 0; }

    // 落地
    if (p.dist <= 0) {
      p.dist = 0;
      if (!wasGround) { p.squash = 0.5; }
      if (p.vel < 0) p.vel = 0;
      if (!p.onGround) p.onGround = true;
      p.jumpsUsed = 0;
    } else {
      if (p.onGround) p.coyote = C.COYOTE; // 刚离地
      p.onGround = false;
    }

    // 拖尾采样
    p.trail.unshift({ dist: p.dist, side: p.side });
    if (p.trail.length > 6) p.trail.pop();
  }

  // 碰撞盒（格空间，绝对世界 X 由 world 传入 cx）
  function aabb(cx) {
    const half = C.PLAYER_W / 2;
    let y0, y1;
    if (p.side === 'top') {
      const feet = GEO.topSurfaceVY - p.dist;
      y1 = feet; y0 = feet - C.PLAYER_H;
    } else {
      const feet = GEO.bottomSurfaceVY + p.dist;
      y0 = feet; y1 = feet + C.PLAYER_H;
    }
    return { x0: cx - half, x1: cx + half, y0, y1 };
  }

  function hit() {
    p.invincible = C.INVINCIBLE_TIME;
    p.squash = 0.6;
  }
  function isInvincible() { return p.invincible > 0 || p.shieldT > 0; }

  // ---- 渲染：传入像素坐标 ----
  function render(ctx, sx, cell, topY, botY) {
    const C2 = CG.CONFIG.COLORS;
    const w = C.PLAYER_W * cell;
    const h = C.PLAYER_H * cell;

    // 计算脚部像素 Y
    let feetY, dir;
    if (p.side === 'top') { feetY = topY - p.dist * cell; dir = -1; }
    else { feetY = botY + p.dist * cell; dir = 1; }

    // 挤压形变
    const sq = p.squash;
    const sw = w * (1 - sq * 0.35);
    const sh = h * (1 + sq * 0.4);

    // 拖尾（速度感）
    for (let i = p.trail.length - 1; i >= 1; i--) {
      const t = p.trail[i];
      let fy = t.side === 'top' ? topY - t.dist * cell : botY + t.dist * cell;
      const cy = fy + (t.side === 'top' ? -h / 2 : h / 2);
      ctx.globalAlpha = 0.08 * (1 - i / p.trail.length);
      ctx.fillStyle = C2.player;
      CG.util.roundRect(ctx, sx - sw / 2 - i * 2, cy - sh / 2, sw, sh, sw * 0.3);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 受伤闪烁
    if (p.invincible > 0 && p.shieldT <= 0) {
      if (Math.floor(p.invincible * 18) % 2 === 0) { /* 跳过一帧绘制实现闪烁 */ }
    }
    const blink = p.invincible > 0 && p.shieldT <= 0 && Math.floor(p.invincible * 18) % 2 === 0;

    ctx.save();
    const cy = feetY + dir * sh / 2; // 身体中心
    ctx.translate(sx, cy);
    // 翻面动画：绕中心做 Y 轴翻转（用 scaleY 模拟）
    const flip = p.flipAnim > 0 ? CG.util.ease.inOutQuad(1 - p.flipAnim) : 1;
    ctx.scale(1, dir * (p.flipAnim > 0 ? (flip * 2 - 1) : 1));
    // 奔跑轻微前倾
    ctx.rotate((p.onGround ? Math.sin(p.runT * 16) * 0.04 : p.vel * 0.012) * 0.6);

    if (!blink) {
      // 身体
      const grad = ctx.createLinearGradient(0, -sh / 2, 0, sh / 2);
      grad.addColorStop(0, C2.player);
      grad.addColorStop(1, C2.playerDark);
      ctx.fillStyle = grad;
      ctx.shadowColor = CG.util.rgba(C2.player, 0.6);
      ctx.shadowBlur = p.speedT > 0 ? 22 : 12;
      CG.util.roundRect(ctx, -sw / 2, -sh / 2, sw, sh, sw * 0.32);
      ctx.fill();
      ctx.shadowBlur = 0;

      // 眼睛（朝前）
      ctx.fillStyle = C2.playerEye;
      const ex = sw * 0.16, ey = -sh * 0.12, er = sw * 0.13;
      ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex + er * 0.3, ey - er * 0.3, er * 0.4, 0, Math.PI * 2); ctx.fill();

      // 跑动小腿
      ctx.strokeStyle = C2.playerDark; ctx.lineWidth = Math.max(2, sw * 0.12); ctx.lineCap = 'round';
      const legPhase = p.onGround ? Math.sin(p.runT * 16) : 0.5;
      ctx.beginPath();
      ctx.moveTo(-sw * 0.18, sh * 0.45); ctx.lineTo(-sw * 0.18 + legPhase * sw * 0.2, sh * 0.62);
      ctx.moveTo(sw * 0.18, sh * 0.45); ctx.lineTo(sw * 0.18 - legPhase * sw * 0.2, sh * 0.62);
      ctx.stroke();
    }
    ctx.restore();

    // 护盾光环
    if (p.shieldT > 0) {
      ctx.save();
      const a = 0.35 + 0.25 * Math.sin(p.runT * 10);
      ctx.globalAlpha = p.shieldT < 1.2 ? a * (0.4 + 0.6 * Math.abs(Math.sin(p.shieldT * 12))) : a;
      ctx.strokeStyle = C2.shield; ctx.lineWidth = 3;
      ctx.shadowColor = C2.shield; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(sx, cy, Math.max(sw, sh) * 0.85, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  return Object.assign(p, { requestJump, requestFlip, update, aabb, hit, isInvincible, render });
};
