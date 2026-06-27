/* =========================================================================
 * audio.js — 纯过程化音效（Web Audio API，无音频文件依赖）
 * 受浏览器自动播放策略限制：首个用户手势后 resume()。
 * ====================================================================== */
window.CG = window.CG || {};

CG.Audio = (function () {
  let ctx = null;
  let master = null;
  let enabled = true;
  let musicGain = null;
  let musicTimer = null;

  function ensure() {
    if (ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.0;
      musicGain.connect(master);
    } catch (e) { ctx = null; }
  }
  function now() { return ctx ? ctx.currentTime : 0; }

  // 单个振荡器音
  function tone({ freq = 440, dur = 0.12, type = 'square', vol = 0.2, slideTo = null, attack = 0.005, dest = null }) {
    if (!ctx || !enabled) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, now());
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now() + dur);
    g.gain.setValueAtTime(0.0001, now());
    g.gain.exponentialRampToValueAtTime(vol, now() + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
    o.connect(g); g.connect(dest || master);
    o.start(); o.stop(now() + dur + 0.02);
  }

  // 噪声爆（受击）
  function noise({ dur = 0.18, vol = 0.3, lp = 1200 }) {
    if (!ctx || !enabled) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  const SFX = {
    jump:   () => tone({ freq: 480, slideTo: 760, dur: 0.12, type: 'square', vol: 0.16 }),
    double: () => tone({ freq: 680, slideTo: 1040, dur: 0.13, type: 'square', vol: 0.17 }),
    flip:   () => { tone({ freq: 300, slideTo: 620, dur: 0.14, type: 'sawtooth', vol: 0.14 }); },
    coin:   () => { tone({ freq: 880, dur: 0.07, type: 'triangle', vol: 0.16 });
                    tone({ freq: 1320, dur: 0.1, type: 'triangle', vol: 0.14, attack: 0.04 }); },
    hit:    () => { noise({ dur: 0.22, vol: 0.32, lp: 900 }); tone({ freq: 220, slideTo: 90, dur: 0.25, type: 'sawtooth', vol: 0.22 }); },
    shield: () => { tone({ freq: 520, slideTo: 900, dur: 0.2, type: 'sine', vol: 0.16 }); },
    bomb:   () => { noise({ dur: 0.35, vol: 0.4, lp: 700 }); tone({ freq: 160, slideTo: 60, dur: 0.35, type: 'square', vol: 0.2 }); },
    item:   () => { tone({ freq: 700, dur: 0.08, type: 'square', vol: 0.14 }); tone({ freq: 1050, dur: 0.12, type: 'square', vol: 0.13, attack: 0.05 }); },
    levelup:() => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.16, type: 'triangle', vol: 0.16 }), i * 70)); },
    win:    () => { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.2, type: 'triangle', vol: 0.18 }), i * 90)); },
    lose:   () => { [440, 349, 262, 196].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.22, type: 'sawtooth', vol: 0.18 }), i * 110)); },
    ui:     () => tone({ freq: 600, dur: 0.05, type: 'square', vol: 0.1 }),
  };

  // 极简循环底鼓+琶音背景乐
  const SCALE = [261.63, 311.13, 349.23, 392.0, 466.16];
  let step = 0;
  function musicTick() {
    if (!ctx || !enabled) return;
    const t = step % 8;
    if (t % 2 === 0) tone({ freq: 65, dur: 0.18, type: 'sine', vol: 0.18, dest: musicGain });
    const f = SCALE[(step * 3) % SCALE.length] * (t < 4 ? 1 : 1.5);
    tone({ freq: f, dur: 0.16, type: 'triangle', vol: 0.05, dest: musicGain });
    step++;
  }

  return {
    init() { /* 延迟到首个手势 */ },
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    play(name) { ensure(); if (SFX[name]) SFX[name](); },
    setEnabled(v) { enabled = v; if (!v) this.stopMusic(); },
    isEnabled: () => enabled,
    startMusic() {
      ensure(); if (!ctx || !enabled) return;
      if (musicTimer) return;
      musicGain.gain.cancelScheduledValues(now());
      musicGain.gain.linearRampToValueAtTime(0.7, now() + 1.0);
      step = 0;
      musicTimer = setInterval(musicTick, 220);
    },
    stopMusic() {
      if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
      if (ctx && musicGain) { musicGain.gain.cancelScheduledValues(now()); musicGain.gain.linearRampToValueAtTime(0.0, now() + 0.4); }
    },
  };
})();
