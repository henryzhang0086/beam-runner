/* =========================================================================
 * input.js — 统一输入：键盘 + 触屏，归一成 3 个动作
 *   jump（跳跃） / flip（换位） / item（用道具）
 * 提供“边沿事件队列”（一次按下=一个事件，供 buffer/双击判定）
 * 以及 pause / 确认（UI）。
 * ====================================================================== */
window.CG = window.CG || {};

CG.Input = (function () {
  const actions = { jump: false, flip: false, item: false };
  const pressedQueue = { jump: 0, flip: 0, item: 0 }; // 累计未消费的按下次数
  let pauseRequested = false;
  let enabled = false;

  const KEYMAP = {
    jump: ['Space', 'ArrowUp', 'KeyW'],
    flip: ['ShiftLeft', 'ShiftRight', 'ArrowDown', 'KeyS'],
    item: ['KeyE', 'KeyF', 'Enter'],
    pause: ['KeyP', 'Escape'],
  };
  function actionOf(code) {
    for (const a in KEYMAP) if (KEYMAP[a].includes(code)) return a;
    return null;
  }

  function press(action) {
    if (!enabled) return;
    if (action === 'pause') { pauseRequested = true; return; }
    if (!(action in actions)) return;
    if (!actions[action]) pressedQueue[action]++; // 仅在“从未按→按下”计一次
    actions[action] = true;
  }
  function release(action) {
    if (action in actions) actions[action] = false;
  }

  function onKeyDown(e) {
    const a = actionOf(e.code);
    if (!a) return;
    if (e.repeat) { e.preventDefault(); return; } // 长按不重复计数
    e.preventDefault();
    press(a);
  }
  function onKeyUp(e) {
    const a = actionOf(e.code);
    if (a) { e.preventDefault(); release(a); }
  }

  function bindTouch() {
    const root = document.getElementById('touch-controls');
    if (!root) return;
    root.querySelectorAll('.touch-btn').forEach((btn) => {
      const a = btn.dataset.action;
      const down = (e) => { e.preventDefault(); press(a); btn.classList.add('held'); };
      const up = (e) => { e.preventDefault(); release(a); btn.classList.remove('held'); };
      btn.addEventListener('touchstart', down, { passive: false });
      btn.addEventListener('touchend', up, { passive: false });
      btn.addEventListener('touchcancel', up, { passive: false });
      btn.addEventListener('mousedown', down);
      btn.addEventListener('mouseup', up);
      btn.addEventListener('mouseleave', up);
    });
  }

  return {
    init() {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      bindTouch();
      // 失焦时清状态，避免“卡键”
      window.addEventListener('blur', () => { for (const a in actions) actions[a] = false; });
    },
    setEnabled(v) { enabled = v; if (!v) { for (const a in actions) actions[a] = false; } },
    isDown: (a) => !!actions[a],
    // 消费一次某动作的“按下”边沿；有则返回 true 并 -1
    consume(a) {
      if (pressedQueue[a] > 0) { pressedQueue[a]--; return true; }
      return false;
    },
    peek: (a) => pressedQueue[a] > 0,
    // 取并清空累计的按下次数（用于双击判定的“本帧按了几次”）
    takeCount(a) { const n = pressedQueue[a]; pressedQueue[a] = 0; return n; },
    consumePause() { const p = pauseRequested; pauseRequested = false; return p; },
    clearAll() {
      for (const a in actions) actions[a] = false;
      for (const a in pressedQueue) pressedQueue[a] = 0;
      pauseRequested = false;
    },
  };
})();
