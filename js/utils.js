/* =========================================================================
 * utils.js — 数学 / 随机数 / 碰撞 / 缓动 等纯函数工具
 * ====================================================================== */
window.CG = window.CG || {};

CG.util = (function () {
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
  const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const approach = (cur, target, delta) =>
    cur < target ? Math.min(cur + delta, target) : Math.max(cur - delta, target);

  // 确定性随机：mulberry32（同一 seed 必产生同一序列 —— 对决公平所需）
  function makeRNG(seed) {
    let a = (seed >>> 0) || 1;
    const rng = function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.range = (lo, hi) => lo + rng() * (hi - lo);
    rng.int = (lo, hi) => Math.floor(rng.range(lo, hi + 1));
    rng.pick = (arr) => arr[rng.int(0, arr.length - 1)];
    rng.chance = (p) => rng() < p;
    // 加权选择：weights = {key:w,...} → key
    rng.weighted = (weights) => {
      let total = 0;
      for (const k in weights) total += weights[k];
      let r = rng() * total;
      for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
      return Object.keys(weights)[0];
    };
    return rng;
  }

  // 轴对齐包围盒重叠检测
  function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // 缓动
  const ease = {
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outElastic: (t) => {
      const c4 = (2 * Math.PI) / 3;
      return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
  };

  // 颜色辅助：#rrggbb → rgba(...)
  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  // 两个 hex 颜色线性混合
  function mix(hexA, hexB, t) {
    const a = parseInt(hexA.slice(1), 16), b = parseInt(hexB.slice(1), 16);
    const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
    const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
    const bl = Math.round(lerp(a & 255, b & 255, t));
    return `rgb(${r},${g},${bl})`;
  }

  function fmtScore(n) { return Math.floor(n).toLocaleString('en-US'); }

  // 圆角矩形路径
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return { clamp, lerp, invLerp, sign, approach, makeRNG, aabb, ease, rgba, mix, fmtScore, roundRect, TAU: Math.PI * 2 };
})();
