/* =========================================================================
 * storage.js — localStorage 持久化（最高分 / 最远距离 / 关卡进度 / 设置）
 * 全部容错：无 localStorage 时退化为内存存储，不崩。
 * ====================================================================== */
window.CG = window.CG || {};

CG.Storage = (function () {
  const KEY = 'beamrunner.v1';
  let mem = null;

  const DEFAULT = {
    best: 0,            // 无限模式最高分
    bestFar: 0,         // 最远距离（m）
    campaign: {},       // { levelId: {cleared:bool, best:score, stars:0..3} }
    sound: true,
    seenTutorial: {},   // 机关教学是否已看过
  };

  function read() {
    if (mem) return mem;
    try {
      const raw = localStorage.getItem(KEY);
      mem = raw ? Object.assign({}, DEFAULT, JSON.parse(raw)) : Object.assign({}, DEFAULT);
    } catch (e) { mem = Object.assign({}, DEFAULT); }
    if (!mem.campaign) mem.campaign = {};
    if (!mem.seenTutorial) mem.seenTutorial = {};
    return mem;
  }
  function write() {
    try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* 忽略 */ }
  }

  return {
    get: (k) => read()[k],
    set: (k, v) => { read()[k] = v; write(); },
    recordEndless(score, far) {
      const s = read();
      let nb = false;
      if (score > s.best) { s.best = Math.floor(score); nb = true; }
      if (far > s.bestFar) s.bestFar = Math.floor(far);
      write();
      return nb;
    },
    recordLevel(id, score, stars) {
      const s = read();
      const cur = s.campaign[id] || { cleared: false, best: 0, stars: 0 };
      cur.cleared = true;
      cur.best = Math.max(cur.best, Math.floor(score));
      cur.stars = Math.max(cur.stars, stars);
      s.campaign[id] = cur;
      write();
    },
    levelInfo(id) { return read().campaign[id] || { cleared: false, best: 0, stars: 0 }; },
    levelUnlocked(id) {
      if (id <= 1) return true;
      return !!(read().campaign[id - 1] && read().campaign[id - 1].cleared);
    },
    tutorialSeen(key) { return !!read().seenTutorial[key]; },
    markTutorial(key) { read().seenTutorial[key] = true; write(); },
  };
})();
