/* =========================================================================
 * opponent.js — 人机对决的 AI 控制器
 * 驱动“自己那个 World”的玩家：前瞻扫描障碍 → 决定 跳 / 二段跳 / 换位 / 用道具。
 * 通过反应距离 + 失误概率做出三档强度，保证“可被战胜”。
 * 由于双方 World 同 seed、地图完全一致，AI 的强弱只体现在操作，不偷地图信息。
 * ====================================================================== */
window.CG = window.CG || {};

CG.AIOpponent = function (world, difficulty) {
  const C = CG.CONFIG, U = CG.util;
  const D = [
    { react: 0.82, err: 0.10, jitter: 0.55, item: 0.4 },   // 轻松（起跳偏早、易失误）
    { react: 0.95, err: 0.035, jitter: 0.30, item: 0.7 },  // 普通
    { react: 1.02, err: 0.006, jitter: 0.12, item: 0.97 }, // 困难（接近最优时机）
  ][U.clamp(difficulty | 0, 0, 2)];

  const rng = U.makeRNG((world.seed ^ 0x9e3779b9) >>> 0);

  let st = {
    doublePending: 0,    // >0 表示还要补第二跳（秒）
    actedFor: -1,        // 已对某 cx 的障碍行动，避免重复
    flipCdv: 0,
    seen: {},            // key → 'act' | 'skip'（每个障碍只判一次失误）
    pruneT: 0,
    itemCd: 0,
  };

  function birdWillFire(o, timeAtPass) {
    const period = 2.3, fire = 0.85;
    const ph = (timeAtPass * (1 / period) + o.phase) % 1;
    return ph < fire / period;
  }

  function neededAction(o, pcx, speed) {
    switch (o.type) {
      case 'spike': return o.h >= 3 ? 'flip' : (o.h === 2 ? 'double' : 'single');
      case 'aerial': return 'ground';
      case 'bird': {
        const tt = Math.max(0, (o.cx - pcx)) / Math.max(2, speed);
        return birdWillFire(o, world.time + tt) ? 'flip' : 'none';
      }
      case 'wall': return (o.state.lowered) ? 'none' : 'flip';
      case 'gate': return world.inventory.indexOf('bomb') >= 0 ? 'bomb' : 'flip';
      default: return 'none';
    }
  }

  // 当前轨迹是否真的会撞上该障碍（避免“明明能过却乱翻面”）
  function willHit(t, p) {
    if (!t) return false;
    if (t.type === 'spike') {
      if (t.h >= 3) return true;                       // 跳不过
      if (p.onGround || p.jumpsUsed < 2) return false; // 还能起跳/二段跳
      return p.dist < (t.h - 0.12);                    // 已无跳：低于刺尖才会撞
    }
    if (t.type === 'aerial') return p.dist > 0.85;     // 跳太高会撞悬刺
    if (t.type === 'bird') return !!(t.state && t.state.firing);
    if (t.type === 'wall') return !(t.state && t.state.lowered);
    if (t.type === 'gate') return world.inventory.indexOf('bomb') < 0;
    return false;
  }

  function otherSideBlocked(pcx, side) {
    const os = side === 'top' ? 'bottom' : 'top';
    for (const o of world.obstacles) {
      if (o.side !== os || o.destroyed) continue;
      if (o.cx > pcx - 0.6 && o.cx < pcx + 2.4 && (o.type === 'spike' || o.type === 'aerial')) return true;
    }
    return false;
  }

  return {
    decide(dt) {
      const p = world.player;
      const intents = { jump: false, flip: false, item: false };
      if (world.status !== 'running' || !p.alive) return intents;

      if (st.flipCdv > 0) st.flipCdv -= dt;
      if (st.itemCd > 0) st.itemCd -= dt;

      const pcx = world.playerCX();
      const speed = world.speed();

      // 补第二跳（二段跳）
      if (st.doublePending > 0) {
        st.doublePending -= dt;
        if (st.doublePending <= 0 && !p.onGround) { intents.jump = true; }
      }

      // 找当前面、前方最近、需要动作的障碍
      let target = null, tdist = Infinity;
      for (const o of world.obstacles) {
        if (o.destroyed) continue;
        if (o.type === 'switch' || o.type === 'drop') continue;
        const sameSide = (o.type === 'gate') || o.side === p.side;
        if (!sameSide) continue;
        const d = o.cx - pcx;
        if (d < -0.4 || d > world.viewWidthCells() * 0.7) continue;
        if (d < tdist) { tdist = d; target = o; }
      }

      if (target) {
        const act = neededAction(target, pcx, speed);
        const key = Math.round(target.cx * 10);
        // 失误判定：每个障碍只掷一次（否则长可见窗内逐帧累积必然漏接）
        if (!(key in st.seen)) st.seen[key] = rng.chance(D.err) ? 'skip' : 'act';
        // 触发距离（按速度与难度缩放）：单跳顶点≈0.23s、二段跳顶点≈0.32s 后到达，
        // 故须在 spike 约 2.1 / 2.9 格外起跳，apex 才落在 spike 上。
        const lead = (speed / 9) / D.react;
        const singleAt = 2.4 * lead, doubleAt = 3.3 * lead, flipAt = 1.15 * lead;

        if (act === 'flip' && st.seen[key] === 'act' && st.actedFor !== key && tdist < flipAt && st.flipCdv <= 0) {
          // 必须翻面（h3/喷火鸟/升墙）：贴近再翻。spike h3 落点由生成器保证干净；
          // 其它类型需确认另一面安全。
          if (target.type === 'spike' || !otherSideBlocked(pcx, p.side)) {
            intents.flip = true; st.flipCdv = C.FLIP_COOLDOWN + 0.02; st.actedFor = key;
          }
        } else if (willHit(target, p) && tdist < 1.3 && st.flipCdv <= 0 && !otherSideBlocked(pcx, p.side)) {
          // 逃生换位：确实会撞且另一面干净（处理空中连刺无法续跳）
          intents.flip = true; st.flipCdv = C.FLIP_COOLDOWN + 0.02; st.actedFor = key;
        } else if (st.seen[key] === 'act' && st.actedFor !== key) {
          if (act === 'single' || act === 'double') {
            // 簇感知：看本侧 [cx, cx+4] 内最高的刺，决定单/双跳，
            // 让一次（地面）起跳飘过整串连刺，避免“空中续跳高度不足”。
            let clusterH = target.h || 1;
            for (const o of world.obstacles) {
              if (o.destroyed || o.type !== 'spike' || o.side !== p.side) continue;
              if (o.cx >= target.cx - 0.1 && o.cx <= target.cx + 4.0 && o.h < 3) clusterH = Math.max(clusterH, o.h);
            }
            const useDouble = clusterH >= 2;
            const at = useDouble ? doubleAt : singleAt;
            if (tdist < at && (p.onGround || p.jumpsUsed < 2)) {
              intents.jump = true; st.actedFor = key;
              if (useDouble && p.onGround) st.doublePending = 0.12 + rng.range(0, D.jitter * 0.04);
            }
          } else if (act === 'bomb' && tdist < 4) {
            intents.item = true; st.actedFor = key;
          }
        }
      }
      // 轻量清理已远离障碍的记忆，防止对象无限增长
      if (++st.pruneT > 240) { st.pruneT = 0; const lim = pcx - 4; for (const k in st.seen) if ((+k) / 10 < lim) delete st.seen[k]; }

      // 道具策略：困难段开护盾，安全时开加速
      if (st.itemCd <= 0 && world.inventory.length && rng.chance(D.item)) {
        const front = world.inventory[0];
        if (front === 'shield' && world.dense) { intents.item = true; st.itemCd = 1.5; }
        else if (front === 'speed' && !target) { intents.item = true; st.itemCd = 1.5; }
        else if (front === 'life') { intents.item = true; st.itemCd = 1.0; }
      }

      return intents;
    },
  };
};
