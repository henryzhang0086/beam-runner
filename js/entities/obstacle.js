/* =========================================================================
 * obstacle.js — 障碍与机关（全部以“格”定义碰撞，世界坐标 cx）
 * 类型：
 *   spike      地刺 1~3 格（3 格为橙色提示“须换位”）
 *   aerial     空中悬刺：贴面跑可过，跳起会撞
 *   bird       吐火鸟：周期喷火，火灭时通过
 *   wall       升降墙：被开关控制，落下才可过
 *   switch     开关踏板：碰到触发联动（无伤害）
 *   drop       坠物：下方开关触发后从上方落下
 *   gate       道具门：占满全高，须用炸弹清除（硬撞扣命并击碎）
 *
 * 统一接口：
 *   update(dt, world)
 *   hazardBox()   -> {x0,x1,y0,y1} | null  当前是否有伤害判定
 *   trigger?      -> 触发型（开关）
 *   onTouch(world)
 *   render(ctx, sx, cell, topY, botY)
 *   destroyed, breakable
 * ====================================================================== */
window.CG = window.CG || {};

CG.makeObstacle = function (spec) {
  const C = CG.CONFIG, COL = C.COLORS, GEO = CG.GEO, U = CG.util;
  const o = {
    type: spec.type,
    cx: spec.cx,
    side: spec.side || 'top',
    h: spec.h || 1,
    w: spec.w || (spec.type === 'spike' ? C.SPIKE_W : C.OBSTACLE_W),
    destroyed: false,
    breakable: spec.type !== 'switch' && spec.type !== 'drop',  // 炸弹是否可清除
    trigger: spec.type === 'switch' || spec.type === 'drop',
    link: null,        // switch -> wall/drop
    phase: ((spec.cx * 0.618) % 1 + 1) % 1,
    t: 0,
    state: {},
    triggered: false,
    spec,
  };

  // 各类型初始化
  if (spec.type === 'wall') { o.state.lowered = spec.lowered || false; o.h = 3.0; }
  if (spec.type === 'drop') { o.state.falling = false; o.state.fall = 0; o.h = 1.2; }
  if (spec.type === 'gate') { o.breakable = true; }

  const surfaceVY = () => (o.side === 'top' ? GEO.topSurfaceVY : GEO.bottomSurfaceVY);
  const dirAway = () => (o.side === 'top' ? -1 : 1); // 远离独木方向（格→更小/更大 vy）

  // 顶/底面延伸 d 格的盒子（hazard 朝远离独木方向）
  function laneBox(d0, d1) {
    const s = surfaceVY();
    let y0, y1;
    if (o.side === 'top') { y1 = s - d0; y0 = s - d1; }
    else { y0 = s + d0; y1 = s + d1; }
    return { x0: o.cx, x1: o.cx + o.w, y0: Math.min(y0, y1), y1: Math.max(y0, y1) };
  }

  o.update = function (dt, world) {
    o.t = (world ? world.time : o.t + dt);
    if (o.type === 'bird') {
      // 喷火周期：phase 错开
      const period = 2.3, fire = 0.85;
      const ph = (o.t * (1 / period) + o.phase) % 1;
      o.state.firing = ph < fire / period;
      o.state.fireGrow = o.state.firing ? Math.min(1, (ph * period) / 0.15) : 0;
    } else if (o.type === 'wall') {
      o.state.anim = U.approach(o.state.anim || (o.state.lowered ? 0 : 1), o.state.lowered ? 0 : 1, dt * 5);
    } else if (o.type === 'drop') {
      if (o.state.falling) o.state.fall = Math.min(1, o.state.fall + dt * 2.6);
    }
  };

  o.hazardBox = function () {
    if (o.destroyed) return null;
    switch (o.type) {
      case 'spike': {
        // 三角刺：碰撞盒比视觉略收（顶端尖角与两侧留容错）。
        // 高度内缩 0.12 → h3 判定高 2.88 > 跳跃硬上限 2.82，3 格刺仍绝对跳不过。
        const b = laneBox(0, Math.max(0.2, o.h - 0.12));
        return { x0: o.cx + 0.12, x1: o.cx + o.w - 0.12, y0: b.y0, y1: b.y1 };
      }
      case 'aerial': return laneBox(1.45, 1.45 + (o.h || 1.05));
      case 'bird': {
        if (!o.state.firing) return null;
        const g = o.state.fireGrow || 1;
        return laneBox(0, 3.4 * g);   // 火柱直达独木面
      }
      case 'wall': {
        const a = o.state.anim != null ? o.state.anim : (o.state.lowered ? 0 : 1);
        if (a < 0.06) return null;
        return laneBox(0, o.h * a);
      }
      case 'drop': {
        if (!o.state.falling || o.state.fall < 0.55) return null;
        // 落入对面（spec.side 是开关侧；坠物在对面）
        const dropSide = o.side === 'top' ? 'bottom' : 'top';
        const s = dropSide === 'top' ? GEO.topSurfaceVY : GEO.bottomSurfaceVY;
        const reach = o.state.fall; // 0..1
        let y0, y1;
        if (dropSide === 'top') { y1 = s; y0 = s - 2.2 * reach; }
        else { y0 = s; y1 = s + 2.2 * reach; }
        return { x0: o.cx, x1: o.cx + o.w, y0: Math.min(y0, y1), y1: Math.max(y0, y1) };
      }
      case 'gate': // 占满全高
        return { x0: o.cx, x1: o.cx + o.w, y0: GEO.topSurfaceVY - 3.2, y1: GEO.bottomSurfaceVY + 3.2 };
      default: return null;
    }
  };

  // 触发型（开关 / 坠物开关）的接触判定盒：贴在 o.side 面上的踏板
  o.touchBox = function () {
    if (!o.trigger || o.triggered) return null;
    const s = surfaceVY();
    if (o.side === 'top') return { x0: o.cx, x1: o.cx + o.w, y0: s - 0.4, y1: s + 0.05 };
    return { x0: o.cx, x1: o.cx + o.w, y0: s - 0.05, y1: s + 0.4 };
  };

  o.onTouch = function (world) {
    if (o.triggered) return;
    o.triggered = true;
    CG.Audio.play('ui');
    if (o.type === 'switch' && o.link) {
      if (o.link.type === 'wall') o.link.state.lowered = true;
    } else if (o.type === 'drop') {
      o.state.falling = true;
    }
    world.particles.burst(world._sx(o.cx + o.w / 2), world._surfY(o.side), COL.switchOn, 8, { speed: 120, up: 60 });
  };

  o.destroy = function (world) {
    if (o.destroyed) return;
    o.destroyed = true;
    if (world) world.particles.burst(world._sx(o.cx + o.w / 2), world._surfY(o.side), o.type === 'gate' ? COL.bomb : COL.spike, 16, { speed: 240 });
  };

  // -------------------------------- 渲染 --------------------------------
  o.render = function (ctx, sx, cell, topY, botY) {
    if (o.destroyed) return;
    const surfY = o.side === 'top' ? topY : botY;
    const away = dirAway(); // -1 上 / +1 下
    const w = o.w * cell;

    switch (o.type) {
      case 'spike': drawSpike(ctx, sx, surfY, w, o.h * cell, away, o.h >= 3); break;
      case 'aerial': drawAerial(ctx, sx, surfY, w, cell, away); break;
      case 'bird': drawBird(ctx, sx, surfY, w, cell, away); break;
      case 'wall': drawWall(ctx, sx, surfY, w, cell, away); break;
      case 'switch': drawSwitch(ctx, sx, surfY, w, cell, away); break;
      case 'drop': drawDrop(ctx, sx, topY, botY, w, cell); break;
      case 'gate': drawGate(ctx, sx, topY, botY, w, cell); break;
    }
  };

  function drawSpike(ctx, sx, surfY, w, hpx, away, tall) {
    const col = tall ? COL.spike3 : COL.spike;
    const dark = tall ? COL.spike3Dark : COL.spikeDark;
    const tipY = surfY + away * hpx;
    const grad = ctx.createLinearGradient(sx, surfY, sx, tipY);
    grad.addColorStop(0, dark); grad.addColorStop(1, col);
    ctx.fillStyle = grad;
    ctx.shadowColor = U.rgba(col, 0.5); ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(sx, surfY);
    ctx.lineTo(sx + w, surfY);
    ctx.lineTo(sx + w / 2, tipY);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    if (tall) { // 3 格刺顶部加一个“禁跳”闪光点
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(o.t * 8);
      ctx.beginPath(); ctx.arc(sx + w / 2, tipY, w * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawAerial(ctx, sx, surfY, w, cell, away) {
    const y0 = surfY + away * 1.45 * cell;
    const y1 = surfY + away * (1.45 + (o.h || 1.05)) * cell;
    const top = Math.min(y0, y1), hh = Math.abs(y1 - y0);
    const grad = ctx.createLinearGradient(sx, top, sx, top + hh);
    grad.addColorStop(0, COL.aerialDark); grad.addColorStop(1, COL.aerial);
    ctx.fillStyle = grad;
    ctx.shadowColor = U.rgba(COL.aerial, 0.5); ctx.shadowBlur = 10;
    U.roundRect(ctx, sx, top, w, hh, 4); ctx.fill();
    ctx.shadowBlur = 0;
    // 朝向独木的小刺
    ctx.fillStyle = COL.aerial;
    const baseY = away < 0 ? top + hh : top;
    for (let i = 0; i < 3; i++) {
      const px = sx + w * (0.2 + i * 0.3);
      ctx.beginPath(); ctx.moveTo(px - w * 0.08, baseY); ctx.lineTo(px + w * 0.08, baseY);
      ctx.lineTo(px, baseY - away * 6); ctx.closePath(); ctx.fill();
    }
  }

  function drawBird(ctx, sx, surfY, w, cell, away) {
    const bodyY = surfY + away * 3.6 * cell;
    // 火柱
    if (o.state.firing) {
      const g = o.state.fireGrow || 1;
      const fy0 = bodyY, fy1 = surfY;
      const grad = ctx.createLinearGradient(sx, fy0, sx, fy1);
      grad.addColorStop(0, COL.fire); grad.addColorStop(1, U.rgba(COL.bird, 0.2));
      ctx.fillStyle = grad; ctx.globalAlpha = 0.85;
      ctx.shadowColor = COL.fire; ctx.shadowBlur = 16;
      const fw = w * (0.5 + 0.4 * g);
      ctx.beginPath();
      ctx.moveTo(sx + w / 2 - fw / 2 * 0.4, fy0);
      ctx.lineTo(sx + w / 2 + fw / 2 * 0.4, fy0);
      ctx.lineTo(sx + w / 2 + fw / 2, fy1);
      ctx.lineTo(sx + w / 2 - fw / 2, fy1);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
    // 鸟身（扑翼）
    const flap = Math.sin(o.t * 10) * 0.4;
    ctx.save();
    ctx.translate(sx + w / 2, bodyY);
    ctx.scale(1, away < 0 ? 1 : -1);
    ctx.fillStyle = COL.bird;
    U.roundRect(ctx, -w * 0.4, -w * 0.3, w * 0.8, w * 0.6, w * 0.25); ctx.fill();
    ctx.fillStyle = COL.birdDark;
    ctx.beginPath(); ctx.moveTo(-w * 0.3, 0); ctx.lineTo(-w * 0.75, -flap * w); ctx.lineTo(-w * 0.3, w * 0.15); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(w * 0.3, 0); ctx.lineTo(w * 0.75, flap * w); ctx.lineTo(w * 0.3, w * 0.15); ctx.closePath(); ctx.fill();
    // 眼+喙
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(w * 0.12, -w * 0.05, w * 0.08, 0, 6.3); ctx.fill();
    ctx.fillStyle = COL.fire; ctx.beginPath();
    ctx.moveTo(w * 0.3, w * 0.05); ctx.lineTo(w * 0.5, w * 0.18); ctx.lineTo(w * 0.3, w * 0.22); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawWall(ctx, sx, surfY, w, cell, away) {
    const a = o.state.anim != null ? o.state.anim : (o.state.lowered ? 0 : 1);
    const hpx = o.h * cell * a;
    if (hpx < 2) return;
    const top = away < 0 ? surfY - hpx : surfY;
    const grad = ctx.createLinearGradient(sx, top, sx, top + hpx);
    grad.addColorStop(0, COL.wallDark); grad.addColorStop(1, COL.wall);
    ctx.fillStyle = grad;
    U.roundRect(ctx, sx, top, w, hpx, 3); ctx.fill();
    // 砖纹
    ctx.strokeStyle = U.rgba('#000', 0.18); ctx.lineWidth = 1;
    for (let yy = top + cell * 0.5; yy < top + hpx; yy += cell * 0.5) {
      ctx.beginPath(); ctx.moveTo(sx, yy); ctx.lineTo(sx + w, yy); ctx.stroke();
    }
  }

  function drawSwitch(ctx, sx, surfY, w, cell, away) {
    const on = o.triggered;
    const hpx = cell * 0.28;
    const top = away < 0 ? surfY - hpx : surfY;
    ctx.fillStyle = on ? COL.switchOn : COL.switchOff;
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = on ? 14 : 6;
    U.roundRect(ctx, sx, top, w, hpx, hpx * 0.5); ctx.fill();
    ctx.shadowBlur = 0;
    // 箭头提示
    ctx.fillStyle = U.rgba('#000', 0.35);
    ctx.font = `${Math.floor(cell * 0.3)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('◉', sx + w / 2, top + hpx / 2);
  }

  function drawDrop(ctx, sx, topY, botY, w, cell) {
    // 开关侧
    const surfY = o.side === 'top' ? topY : botY;
    drawSwitch(ctx, sx, surfY, w, cell, o.side === 'top' ? -1 : 1);
    // 对面坠物
    const dropSide = o.side === 'top' ? 'bottom' : 'top';
    const baseY = dropSide === 'top' ? topY : botY;
    const away = dropSide === 'top' ? -1 : 1;
    const hang = 3.0; // 悬挂高度
    const reach = o.state.falling ? o.state.fall : 0;
    const y = baseY + away * (hang - (hang) * reach) * cell;
    const size = w * 0.9;
    ctx.save();
    ctx.translate(sx + w / 2, y);
    ctx.fillStyle = COL.wall;
    ctx.shadowColor = U.rgba(COL.bad, 0.5); ctx.shadowBlur = o.state.falling ? 10 : 0;
    U.roundRect(ctx, -size / 2, -size / 2, size, size, 4); ctx.fill();
    // 尖刺面朝独木
    ctx.fillStyle = COL.spikeDark;
    for (let i = 0; i < 3; i++) {
      const px = -size / 2 + size * (0.25 + i * 0.25);
      ctx.beginPath(); ctx.moveTo(px - 4, away * size / 2); ctx.lineTo(px + 4, away * size / 2);
      ctx.lineTo(px, away * size / 2 + away * 8); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // 悬挂链
    if (!o.state.falling || reach < 0.3) {
      ctx.strokeStyle = COL.wallDark; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx + w / 2, baseY + away * 3.2 * cell); ctx.lineTo(sx + w / 2, y - away * size / 2); ctx.stroke();
    }
  }

  function drawGate(ctx, sx, topY, botY, w, cell) {
    const grad = ctx.createLinearGradient(sx, topY - 3 * cell, sx, botY + 3 * cell);
    grad.addColorStop(0, COL.wallDark); grad.addColorStop(0.5, COL.wall); grad.addColorStop(1, COL.wallDark);
    ctx.fillStyle = grad;
    // 上段
    U.roundRect(ctx, sx, topY - 3.2 * cell, w, 3.2 * cell, 4); ctx.fill();
    // 下段
    U.roundRect(ctx, sx, botY, w, 3.2 * cell, 4); ctx.fill();
    // 炸弹标识
    ctx.fillStyle = COL.bomb;
    ctx.font = `${Math.floor(cell * 0.7)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✸', sx + w / 2, (topY + botY) / 2);
  }

  return o;
};
