/* =========================================================================
 * camera.js — 屏幕震动（受击 / 翻面手感）。位移叠加到渲染变换。
 * ====================================================================== */
window.CG = window.CG || {};

CG.Camera = function () {
  let trauma = 0;       // 0..1
  let t = 0;

  return {
    shake(amount) { trauma = Math.min(1, trauma + amount / 20); },
    update(dt) { t += dt; trauma = Math.max(0, trauma - dt * 1.6); },
    get offsetX() { const s = trauma * trauma; return (Math.sin(t * 57) + Math.sin(t * 31)) * 0.5 * s * 16; },
    get offsetY() { const s = trauma * trauma; return (Math.sin(t * 43) + Math.sin(t * 67)) * 0.5 * s * 16; },
    reset() { trauma = 0; },
  };
};
