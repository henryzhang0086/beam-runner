/* =========================================================================
 * levelgen.js — 无限模式程序化生成器
 *
 * 可解性保证（核心算法）：
 *   维护一条“路径侧 pathSide”。规范解法 = 始终待在 pathSide：
 *     · pathSide 上只放可跳障碍 (h1/h2) 或空档；
 *     · 需要换面时，在 pathSide 放 3 格刺（跳不过），并保证“另一面”在该
 *       窗口内干净 → 玩家被迫且能安全翻面，随后 pathSide 切换。
 *   另一面（非路径侧）则故意撒障碍 —— 乱翻面会撞，杜绝“翻到空侧躺赢”。
 *   由此：沿 pathSide 跳 h1/h2、遇 h3 翻面，必可通关；且偷懒翻面有惩罚。
 *
 * 节奏：每 30 障碍 → 金币奖励段；积分 200/400/600 → 困难（由 world 调速度，
 *       这里收紧间距）。
 * ====================================================================== */
window.CG = window.CG || {};

CG.EndlessSource = function (seed, variant) {
  const C = CG.CONFIG, GEO = CG.GEO, U = CG.util;
  const rng = U.makeRNG(seed);
  const withItems = variant === 'items';

  const S = {
    cursor: 0,
    pathSide: 'top',
    obstacleCount: 0,
    sinceReward: 0,
    flipCounter: 0,
    clearOtherUntil: 0,
    rewardActive: false,
    rewardEnd: 0,
    warmup: 6,          // 开局先放几个空档热身
    lastGap: 99,        // 上一段间距（用于判断 2 格刺前是否有落地空间）
  };
  const H2_ROOM = 6.0;  // 2 格刺需要前后都有足够间距（落地后再起跳做干净二段跳）

  const other = (s) => (s === 'top' ? 'bottom' : 'top');

  // 难度只由“已生成距离”决定 → 与 world 的分数无关，
  // 保证对决双方（同 seed）生成完全一致的地图（公平）。
  function genLevel() { return U.clamp(Math.floor(S.cursor / 230), 0, 3); }
  // 困难密集段：按 cursor 周期性出现（确定性）
  function isDense() {
    if (genLevel() < 1) return false;
    const p = ((S.cursor % 200) + 200) % 200;
    return p < 28; // 每 200 格内前 28 格密集
  }

  function gapFor() {
    const t = U.clamp(genLevel() / 3, 0, 1);
    let g = U.lerp(C.GAP_EASY, C.GAP_HARD, t);
    if (isDense()) g = C.DENSE_GAP;
    g += rng.range(-C.GAP_JITTER, C.GAP_JITTER);
    return Math.max(2.0, g);
  }

  // ---- 金币图案（贴 pathSide）----
  function coinArc(world, cx, side, span) {
    const surf = side === 'top' ? GEO.topSurfaceVY : GEO.bottomSurfaceVY;
    const dir = side === 'top' ? -1 : 1;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const tt = i / (n - 1);
      const x = cx - span / 2 + span * tt;
      const peak = 1.9;
      const hh = 0.6 + Math.sin(tt * Math.PI) * peak;
      world.addCoin(x, surf + dir * hh);
    }
  }
  function coinLine(world, cx, side, span) {
    const surf = side === 'top' ? GEO.topSurfaceVY : GEO.bottomSurfaceVY;
    const dir = side === 'top' ? -1 : 1;
    const n = Math.max(3, Math.round(span));
    for (let i = 0; i < n; i++) world.addCoin(cx - span / 2 + span * (i / (n - 1)), surf + dir * 1.0);
  }
  function coinWave(world, cx, side, span) {
    const surf = side === 'top' ? GEO.topSurfaceVY : GEO.bottomSurfaceVY;
    const dir = side === 'top' ? -1 : 1;
    const n = 8;
    for (let i = 0; i < n; i++) {
      const tt = i / (n - 1);
      world.addCoin(cx - span / 2 + span * tt, surf + dir * (0.8 + 1.3 * (0.5 + 0.5 * Math.sin(tt * Math.PI * 2))));
    }
  }

  function startReward(world) {
    S.rewardActive = true;
    S.rewardEnd = S.cursor + C.REWARD_LEN_CELLS;
    S.sinceReward = 0;
    world.onReward && world.onReward();
  }

  function placePathObstacle(world, cx, dense, roomy) {
    const lvl = genLevel();
    const t = U.clamp(lvl / 3, 0, 1);
    // 密集段：全部低刺（1 格），一次起跳可飘过一串，公平且爽快
    if (dense) { world.addObstacle({ type: 'spike', cx, side: S.pathSide, h: 1 }); return true; }
    const pEmpty = U.lerp(0.18, 0.06, t);
    if (rng.chance(pEmpty)) return false;
    // 偶尔放空中障碍/鸟增加花样（中高难度）
    if (lvl >= 1 && rng.chance(0.12)) {
      const kind = rng.chance(0.6) ? 'aerial' : 'bird';
      world.addObstacle({ type: kind, cx, side: S.pathSide });
      return true;
    }
    // 2 格刺只在前后都有落地空间时出现，确保玩家能做干净二段跳；否则降为 1 格
    const wantH2 = !rng.chance(U.lerp(0.65, 0.4, t));
    const h = (wantH2 && roomy) ? 2 : 1;
    world.addObstacle({ type: 'spike', cx, side: S.pathSide, h });
    return true;
  }

  function placeOtherHazard(world, cx) {
    if (cx < S.clearOtherUntil) return;
    const prob = U.lerp(0.22, 0.5, U.clamp(genLevel() / 3, 0, 1));
    if (!rng.chance(prob)) return;
    const r = rng();
    const os = other(S.pathSide);
    if (r < 0.6) world.addObstacle({ type: 'spike', cx, side: os, h: rng.int(1, 2) });
    else if (r < 0.8) world.addObstacle({ type: 'spike', cx, side: os, h: 3 });
    else world.addObstacle({ type: 'aerial', cx, side: os });
  }

  function maybeItem(world, cx) {
    if (!withItems) return;
    if (!rng.chance(C.ITEM_DROP_CHANCE * 0.25)) return;
    const surf = S.pathSide === 'top' ? GEO.topSurfaceVY : GEO.bottomSurfaceVY;
    const dir = S.pathSide === 'top' ? -1 : 1;
    const id = rng.weighted({ shield: 3, speed: 3, bomb: 2, life: 1 });
    world.addItem(id, cx, surf + dir * 1.2);
  }

  function unit(world) {
    const cx = S.cursor;
    const gap = gapFor();

    if (S.rewardActive) {
      // 奖励段：无障碍，铺金币 + 可能道具
      const pat = rng.pick(['arc', 'line', 'wave']);
      if (pat === 'arc') coinArc(world, cx, S.pathSide, 4);
      else if (pat === 'wave') coinWave(world, cx, S.pathSide, 5);
      else coinLine(world, cx, S.pathSide, 4);
      if (withItems && rng.chance(C.ITEM_DROP_CHANCE)) maybeItem(world, cx);
      S.cursor += 4.2;
      if (S.cursor >= S.rewardEnd) { S.rewardActive = false; }
      return;
    }

    if (S.warmup > 0) {
      S.warmup--;
      coinLine(world, cx, S.pathSide, 3);
      S.cursor += 4.5;
      return;
    }

    const dense = isDense();
    S.flipCounter++;
    const forcedEvery = C.FORCED_FLIP_EVERY[genLevel()];
    // 密集段内不强制换位（避免在连刺中被迫翻面），延后到密集段结束
    const forced = !dense && S.flipCounter >= forcedEvery;

    if (forced) {
      S.flipCounter = 0;
      const dest = other(S.pathSide);
      // 关键：清理“落点一侧”在翻面点前后窗口内的所有障碍（含先前撒下的诱饵），
      // 保证无论玩家提前还是贴近翻面，落点都干净 —— 早翻/晚翻都安全。
      const lo = cx - 3.6, hi = cx + gap * 1.8;
      world.obstacles = world.obstacles.filter((o) =>
        !(o.side === dest && o.cx > lo && o.cx < hi &&
          (o.type === 'spike' || o.type === 'aerial' || o.type === 'bird')));
      world.addObstacle({ type: 'spike', cx, side: S.pathSide, h: 3 });
      coinArc(world, cx + gap, dest, 3.5);  // 金币提示“翻到另一面”
      S.clearOtherUntil = hi;
      S.pathSide = dest;
      S.obstacleCount++; S.sinceReward++;
    } else {
      const roomy = gap >= H2_ROOM && S.lastGap >= H2_ROOM;
      const placed = placePathObstacle(world, cx, dense, roomy);
      if (!dense) placeOtherHazard(world, cx + gap * 0.5);  // 密集段不撒对面障碍，给喘息
      // 金币：障碍上方画弧（鼓励跳），空档铺线
      if (placed && !dense) coinArc(world, cx, S.pathSide, 3.2);
      else if (!dense) coinLine(world, cx, S.pathSide, 3);
      if (!dense) maybeItem(world, cx + gap * 0.5);
      if (placed) { S.obstacleCount++; S.sinceReward++; }
    }

    S.lastGap = dense ? 0 : gap;
    S.cursor += gap + C.SPIKE_W;
    if (S.sinceReward >= C.REWARD_EVERY_OBSTACLES) startReward(world);
  }

  return {
    isFinite: false,
    start(world) { S.cursor = world.playerCX(world) + 8; },
    fill(world) {
      const front = world.playerCX(world) + world.viewWidthCells() + 8;
      let guard = 0;
      while (S.cursor < front && guard++ < 200) unit(world);
    },
    obstaclesPlaced() { return S.obstacleCount; },
  };
};


/* =========================================================================
 * CampaignSource — 闯关模式（有限关卡，开局一次性编译整张地图）
 * ====================================================================== */
CG.CampaignSource = function (level) {
  const C = CG.CONFIG, GEO = CG.GEO, U = CG.util;

  function surf(side) { return side === 'top' ? GEO.topSurfaceVY : GEO.bottomSurfaceVY; }
  function dir(side) { return side === 'top' ? -1 : 1; }

  function compile(world) {
    let cx = 6;
    const startX = cx;
    for (const cmd of level.script) {
      const op = cmd[0];
      switch (op) {
        case 'gap': cx += cmd[1]; break;
        case 'tutorial': world.queueTutorial(cmd[1], cx); break;
        case 'spike': {
          const h = cmd[1], side = cmd[2] || 'top';
          world.addObstacle({ type: 'spike', cx, side, h });
          cx += 2.6;
          break;
        }
        case 'aerial': {
          const side = cmd[1] || 'top';
          world.addObstacle({ type: 'aerial', cx, side });
          cx += 3.0;
          break;
        }
        case 'bird': {
          const side = cmd[1] || 'top';
          world.addObstacle({ type: 'bird', cx, side });
          cx += 3.4;
          break;
        }
        case 'switchWall': {
          const side = cmd[1] || 'top';
          const wall = CG.makeObstacle({ type: 'wall', cx: cx + 5, side, lowered: false });
          const sw = CG.makeObstacle({ type: 'switch', cx, side });
          sw.link = wall;
          world.obstacles.push(sw, wall);
          cx += 8;
          break;
        }
        case 'dropTrap': {
          const side = cmd[1] || 'bottom';
          world.obstacles.push(CG.makeObstacle({ type: 'drop', cx, side }));
          cx += 5;
          break;
        }
        case 'gate': {
          world.addObstacle({ type: 'gate', cx, side: 'top', w: 1.1 });
          cx += 4;
          break;
        }
        case 'coins': {
          const pat = cmd[1], side = cmd[2] || 'top';
          const s = surf(side), d = dir(side);
          if (pat === 'arc') { for (let i = 0; i < 5; i++) { const tt = i / 4; world.addCoin(cx + tt * 4, s + d * (0.6 + Math.sin(tt * Math.PI) * 1.9)); } cx += 4; }
          else if (pat === 'wave') { for (let i = 0; i < 8; i++) { const tt = i / 7; world.addCoin(cx + tt * 6, s + d * (0.8 + 1.3 * (0.5 + 0.5 * Math.sin(tt * Math.PI * 2)))); } cx += 6; }
          else { for (let i = 0; i < 5; i++) world.addCoin(cx + i, s + d * 1.0); cx += 5; }
          break;
        }
        case 'item': {
          const id = cmd[1], side = cmd[2] || 'top';
          world.addItem(id, cx, surf(side) + dir(side) * 1.2);
          cx += 3;
          break;
        }
      }
    }
    // 终点线
    world.finishCX = Math.max(cx + 6, level.lengthCells);
    return startX;
  }

  return {
    isFinite: true,
    start(world) { compile(world); },
    fill() { /* 有限关卡已全量编译 */ },
    obstaclesPlaced() { return 0; },
  };
};
