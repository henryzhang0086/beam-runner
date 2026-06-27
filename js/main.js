/* =========================================================================
 * main.js — 引导启动：初始化子系统、自适应画布、绑定生命周期。
 * ====================================================================== */
(function () {
  const canvas = document.getElementById('game');
  const game = CG.Game(canvas);

  // 自适应（HiDPI）
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = window.innerWidth;
    const h = window.innerHeight;
    game.resize(w, h, dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  // 子系统
  CG.Input.init();
  CG.Audio.init();
  CG.Screens.init(game);

  // 触屏设备显示虚拟按键
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (isTouch) document.getElementById('touch-controls').classList.remove('hidden');

  // 首个手势解锁音频
  const unlock = () => { CG.Audio.unlock(); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  // 防止移动端双击缩放/滚动
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => { if (e.target.closest('#touch-controls') || e.target.id === 'game') e.preventDefault(); }, { passive: false });

  game.start();

  // 暴露用于调试
  window.__GAME = game;
})();
