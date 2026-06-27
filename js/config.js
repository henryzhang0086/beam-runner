/* =========================================================================
 * config.js — 全局配置与内容数据（所有可调参数集中于此）
 * 命名空间：window.CG
 * 单位约定：除像素相关外，竖直空间一律用“格 (cell)”为单位；
 *           1 格 = 画面高度 / VH_CELLS，保证不同分辨率手感一致。
 * ====================================================================== */
window.CG = window.CG || {};

CG.CONFIG = {
  // ---- 虚拟世界尺度 ----
  VH_CELLS: 13,            // 画面纵向被切成多少“格”
  BEAM_THICK: 1.4,        // 独木厚度（格）
  PLAYER_W: 0.82,         // 玩家宽（格）
  PLAYER_H: 1.12,         // 玩家高（格）
  PLAYER_X_FRAC: 1 / 3,   // 玩家固定在画面左侧 1/3 处

  // ---- 跳跃物理（格 / 秒）----
  GRAVITY: 64,            // 重力加速度
  JUMP_V: 14.8,           // 单跳初速度 → 顶点≈1.71 格（过 1 格刺，过不了 2 格）
  DOUBLE_JUMP_V: 15.2,    // 二段跳再次给的上冲速度
  MAX_JUMP_CELLS: 2.82,   // 跳跃高度硬上限 → 3 格刺“跳不过去”由此保证
  FLIP_TIME: 0.14,        // 换位翻转动画时长（秒）
  FLIP_COOLDOWN: 0.16,    // 换位冷却，防连点穿帮
  COYOTE: 0.08,           // 土狼时间：离开地面后仍可起跳的宽限
  JUMP_BUFFER: 0.12,      // 跳跃输入缓冲

  // ---- 滚动速度（格 / 秒）----
  // 跳跃滞空≈0.46s，故“起跳水平覆盖≈0.46×速度”。把速度与间距配好，
  // 使常规段能“落地再跳”，避免一直在空中续跳导致高度不足。
  SPEED_BASE: 8.2,        // 起始速度
  SPEED_PER_LEVEL: 1.2,   // 每个困难档 +速度
  SPEED_DRIFT: 0.014,     // 随距离缓慢加速（格/秒 每秒）
  SPEED_MAX: 14,          // 速度上限
  SPEEDUP_FACTOR: 1.28,   // “加速困难段”倍率
  SPEEDUP_TIME: 6,        // 加速段持续秒数

  // ---- 障碍尺寸 ----
  SPIKE_W: 0.7,           // 地刺宽（格）
  OBSTACLE_W: 0.9,        // 通用障碍宽

  // ---- 生成节奏（格，按困难档插值）----
  GAP_EASY: 6.6,
  GAP_HARD: 5.2,
  GAP_JITTER: 0.6,
  FORCED_FLIP_EVERY: [9, 8, 7, 6],  // 各困难档每隔多少障碍强制一次换位
  DENSE_GAP: 2.5,                   // 密集困难段间距（全低刺，可一跳飘过一串）
  DENSE_TIME: 5,                    // 密集段持续秒数

  // ---- 奖励 / 困难触发 ----
  REWARD_EVERY_OBSTACLES: 30,       // 每 30 障碍触发金币奖励段
  REWARD_LEN_CELLS: 26,             // 奖励段长度（格）
  HARD_SCORE_STEPS: [200, 400, 600],// 积分阶段触发困难

  // ---- 分数 ----
  COIN_VALUE: 5,
  COIN_COMBO_BONUS: 1,    // 连续吃币的额外加成（每连击 +n，封顶）
  COIN_COMBO_MAX: 8,
  DIST_SCORE_PER_CELL: 0.18,
  DIST_PER_LEVEL: 260,    // 距离每 N 格提升一档基础难度（平滑递增）
  COMBO_RESET_GAP: 1.1,   // 超过该秒数没吃币则连击清零

  // ---- 生命 ----
  LIVES_START: 3,
  LIVES_MAX: 5,
  INVINCIBLE_TIME: 1.3,   // 受伤后无敌秒数

  // ---- 道具 ----
  ITEM_SHIELD_TIME: 6,
  ITEM_SPEED_TIME: 5,
  ITEM_SPEED_MULT: 1.0,   // 加速道具：占位（实际加速以视觉+得分体现），见 world
  ITEM_BOMB_RANGE: 9,     // 炸弹清除前方多少格内障碍
  INVENTORY_MAX: 3,       // 背包格数
  ITEM_DROP_CHANCE: 0.5,  // 道具赛里奖励段/普通段掉落概率

  // ---- 联机/对决 ----
  VERSUS_TIME: 75,        // 对决时长（秒）
  VERSUS_DEATH_PENALTY: 40, // 死亡一次扣分

  // ---- 手感杂项 ----
  HIT_SHAKE: 14,
  FLIP_SHAKE: 4,
  COIN_PARTICLES: 7,

  // ---- 调色板 ----
  COLORS: {
    bgTop: '#0b0e1a', bgBot: '#1a2342',
    beam: '#3a4668', beamEdge: '#5a6da0', beamGrain: '#2b3450',
    player: '#7cf2d1', playerDark: '#1d8f73', playerEye: '#0b0e1a',
    spike: '#ff5d73', spikeDark: '#c0314a',
    spike3: '#ff9f43', spike3Dark: '#c46a12',
    aerial: '#b06bff', aerialDark: '#6a31c0',
    bird: '#ff7b54', birdDark: '#b53d1f', fire: '#ffd23f',
    wall: '#8a93b5', wallDark: '#545d80', switchOn: '#7cf2d1', switchOff: '#ff5d73',
    coin: '#ffd23f', coinEdge: '#b8860b',
    shield: '#56c2ff', speed: '#ffe14d', life: '#ff6b9d', bomb: '#ff7043',
    text: '#e8edff', textDim: '#8d97c4', good: '#7cf2d1', bad: '#ff5d73',
    aiTint: '#ff9f43',
  },
};

/* -------------------------------------------------------------------------
 * 由配置推导的纯几何常量（格空间，分辨率无关）
 * ---------------------------------------------------------------------- */
CG.GEO = (function () {
  const C = CG.CONFIG;
  const mid = C.VH_CELLS / 2;
  return {
    midVY: mid,
    topSurfaceVY: mid - C.BEAM_THICK / 2,    // 独木上表面（玩家站这之上）
    bottomSurfaceVY: mid + C.BEAM_THICK / 2, // 独木下表面（翻面后站这之下）
    beamTopVY: mid - C.BEAM_THICK / 2,
    beamBotVY: mid + C.BEAM_THICK / 2,
  };
})();

/* -------------------------------------------------------------------------
 * 道具定义（id → 元数据）
 * ---------------------------------------------------------------------- */
CG.ITEMS = {
  shield: { id: 'shield', name: '护盾', icon: '🛡', color: CG.CONFIG.COLORS.shield,
            desc: '一段时间内免疫一次碰撞' },
  speed:  { id: 'speed',  name: '加速', icon: '»',  color: CG.CONFIG.COLORS.speed,
            desc: '短暂冲刺，得分翻倍' },
  life:   { id: 'life',   name: '加命', icon: '♥',  color: CG.CONFIG.COLORS.life,
            desc: '立即 +1 生命（不超上限）' },
  bomb:   { id: 'bomb',   name: '炸弹', icon: '✸',  color: CG.CONFIG.COLORS.bomb,
            desc: '炸掉前方一段障碍' },
};
CG.ITEM_LIST = ['shield', 'speed', 'life', 'bomb'];

/* -------------------------------------------------------------------------
 * 闯关模式关卡数据（data-driven）
 * 每关由一串“指令”组成，levelgen / campaign 解析为实体。
 * 指令类型：
 *   gap(n)                 —— 空走 n 格
 *   spike(h[,side])        —— 地刺，高度 h(1..3)，side 'top'|'bottom'
 *   aerial(side,gapCells)  —— 空中障碍（悬空刺），需在另一面或贴面通过
 *   bird(side)             —— 吐火鸟，周期喷火
 *   switchWall(trigger)    —— 开关+墙：踩到开关墙升/降；trigger 'top'|'bottom'
 *   dropTrap(side)         —— 下方开关触发上方坠物
 *   coins(pattern,side)    —— 金币：'line' | 'arc' | 'wave'
 *   item(id,side)          —— 道具掉落
 *   gate(itemId)           —— 道具门：须用指定道具（如炸弹）清除的硬墙
 *   tutorial(text)         —— 弹出教学气泡
 * 注：每关结尾自动补一段终点。
 * ---------------------------------------------------------------------- */
CG.CAMPAIGN = [
  {
    id: 1, name: '初见独木', tip: '点跳跃过低刺，连点两下过双格刺',
    lengthCells: 150, baseSpeed: 8.0, lives: 4, items: false,
    script: [
      ['tutorial', '点一下【跳跃】越过 1 格地刺'],
      ['gap', 6], ['spike', 1], ['coins', 'arc', 'top'], ['gap', 5], ['spike', 1],
      ['gap', 6], ['coins', 'line', 'top'],
      ['tutorial', '连点两下【跳跃】做二段跳，越过 2 格刺'],
      ['gap', 5], ['spike', 2], ['gap', 6], ['spike', 2], ['coins', 'arc', 'top'],
      ['gap', 5], ['spike', 1], ['spike', 2],
      ['gap', 8], ['coins', 'wave', 'top'], ['gap', 6],
    ],
  },
  {
    id: 2, name: '翻面而行', tip: '遇到 3 格刺，按【换位】翻到独木另一面',
    lengthCells: 175, baseSpeed: 8.4, lives: 4, items: false,
    script: [
      ['tutorial', '3 格刺跳不过，按【换位】翻到另一面躲开'],
      ['gap', 6], ['spike', 3], ['gap', 6], ['coins', 'line', 'bottom'],
      ['gap', 4], ['spike', 1, 'bottom'], ['gap', 5], ['spike', 3],
      ['gap', 6], ['spike', 2, 'bottom'], ['coins', 'arc', 'bottom'],
      ['gap', 5], ['spike', 3], ['gap', 5], ['spike', 3],
      ['gap', 7], ['coins', 'wave', 'top'], ['gap', 6],
    ],
  },
  {
    id: 3, name: '空中走廊', tip: '空中障碍与吐火鸟，挑准时机',
    lengthCells: 200, baseSpeed: 9.0, lives: 3, items: true,
    script: [
      ['tutorial', '空中悬刺：贴着独木跑（别跳）即可钻过'],
      ['gap', 6], ['aerial', 'top', 0], ['gap', 5], ['aerial', 'top', 0],
      ['gap', 5], ['spike', 1], ['aerial', 'top', 0],
      ['tutorial', '吐火鸟会周期喷火，火熄时通过'],
      ['gap', 6], ['bird', 'top'], ['gap', 6], ['item', 'shield', 'top'],
      ['gap', 5], ['bird', 'top'], ['coins', 'line', 'top'],
      ['gap', 5], ['spike', 3], ['gap', 5], ['bird', 'bottom'],
      ['gap', 8], ['coins', 'wave', 'bottom'], ['gap', 6],
    ],
  },
  {
    id: 4, name: '机关重重', tip: '开关控制墙体升降，看准节奏',
    lengthCells: 210, baseSpeed: 9.2, lives: 3, items: true,
    script: [
      ['tutorial', '踩下开关会抬起 / 落下前方的墙'],
      ['gap', 6], ['switchWall', 'top'], ['gap', 8], ['coins', 'arc', 'top'],
      ['gap', 5], ['dropTrap', 'bottom'],
      ['tutorial', '下方开关会让上方坠物落下，及时换位'],
      ['gap', 6], ['dropTrap', 'bottom'], ['gap', 6], ['item', 'speed', 'top'],
      ['gap', 5], ['switchWall', 'bottom'], ['gap', 6], ['spike', 3],
      ['gap', 6], ['bird', 'top'], ['coins', 'wave', 'top'], ['gap', 6],
    ],
  },
  {
    id: 5, name: '炸出生路', tip: '捡炸弹，炸掉无法跳过的路障',
    lengthCells: 220, baseSpeed: 9.4, lives: 3, items: true,
    script: [
      ['tutorial', '前方有道具门：先捡【炸弹】，按道具键炸开'],
      ['gap', 6], ['item', 'bomb', 'top'], ['gap', 6], ['gate', 'bomb'],
      ['gap', 6], ['coins', 'line', 'top'], ['gap', 5], ['spike', 3],
      ['gap', 5], ['item', 'bomb', 'bottom'], ['gap', 5], ['gate', 'bomb'],
      ['gap', 6], ['bird', 'top'], ['dropTrap', 'bottom'],
      ['gap', 6], ['item', 'life', 'top'], ['gap', 6], ['spike', 2], ['spike', 3],
      ['gap', 8], ['coins', 'wave', 'top'], ['gap', 6],
    ],
  },
];
