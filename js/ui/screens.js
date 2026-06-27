/* =========================================================================
 * screens.js — DOM 覆盖层 UI 控制：菜单导航 / 选关 / 暂停 / 结算 /
 *              教程气泡 / 倒计时 / 音效开关。
 * 与 game 通过回调解耦：Screens.init(game)。
 * ====================================================================== */
window.CG = window.CG || {};

CG.Screens = (function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  let game = null;
  let toastTimer = null;

  function nav(name) {
    $$('.screen').forEach((s) => s.classList.add('hidden'));
    if (name && name !== 'none') {
      const el = $('#screen-' + name);
      if (el) el.classList.remove('hidden');
    }
    document.body.classList.toggle('in-menu', !!name && name !== 'none');
    if (name === 'menu') refreshMenu();
    if (name === 'campaign') buildLevels();
  }

  function refreshMenu() {
    $('#menu-best').textContent = CG.util.fmtScore(CG.Storage.get('best'));
    $('#menu-far').textContent = CG.Storage.get('bestFar');
  }

  function buildLevels() {
    const grid = $('#level-grid');
    grid.innerHTML = '';
    CG.CAMPAIGN.forEach((lv) => {
      const unlocked = CG.Storage.levelUnlocked(lv.id);
      const info = CG.Storage.levelInfo(lv.id);
      const b = document.createElement('button');
      b.className = 'level-card btn' + (unlocked ? '' : ' locked');
      b.disabled = !unlocked;
      const stars = '★★★'.slice(0, info.stars) + '☆☆☆'.slice(0, 3 - info.stars);
      b.innerHTML = `<span class="lv-num">${unlocked ? lv.id : '🔒'}</span>
        <span class="lv-name">${lv.name}</span>
        <span class="lv-stars">${unlocked ? stars : ''}</span>
        <span class="lv-tip">${lv.tip}</span>`;
      if (unlocked) b.addEventListener('click', () => { CG.Audio.unlock(); CG.Audio.play('ui'); game.startMode('campaign', { level: lv }); });
      grid.appendChild(b);
    });
  }

  function bind() {
    // 导航
    $$('[data-goto]').forEach((b) => b.addEventListener('click', () => {
      CG.Audio.unlock(); CG.Audio.play('ui'); nav(b.dataset.goto);
    }));
    // 开始模式
    $$('[data-start]').forEach((b) => b.addEventListener('click', () => {
      CG.Audio.unlock(); CG.Audio.play('ui');
      const mode = b.dataset.start;
      const opts = { variant: b.dataset.variant || 'plain' };
      if (mode === 'versus') opts.aiDiff = parseInt($('#ai-diff').value, 10) || 1;
      game.startMode(mode, opts);
    }));
    // 暂停 / 结算动作
    $$('[data-act]').forEach((b) => b.addEventListener('click', () => {
      CG.Audio.play('ui');
      const a = b.dataset.act;
      if (a === 'resume') game.resume();
      else if (a === 'restart') game.restart();
      else if (a === 'quit') game.quitToMenu();
    }));
    // 音效
    $('#btn-sound').addEventListener('click', () => {
      const on = !CG.Audio.isEnabled();
      CG.Audio.setEnabled(on);
      CG.Storage.set('sound', on);
      $('#btn-sound').textContent = on ? '🔊' : '🔇';
      if (on) CG.Audio.play('ui');
    });
  }

  return {
    init(g) {
      game = g;
      bind();
      const on = CG.Storage.get('sound');
      CG.Audio.setEnabled(on);
      $('#btn-sound').textContent = on ? '🔊' : '🔇';
      nav('menu');
    },
    nav,
    showPause() { $('#screen-pause').classList.remove('hidden'); document.body.classList.add('in-menu'); },
    hidePause() { $('#screen-pause').classList.add('hidden'); document.body.classList.remove('in-menu'); },

    showGameOver(title, html) {
      $('#over-title').textContent = title;
      $('#over-result').innerHTML = html;
      $('#screen-over').classList.remove('hidden');
      document.body.classList.add('in-menu');
    },
    hideGameOver() { $('#screen-over').classList.add('hidden'); },

    toast(text) {
      const el = $('#tutorial-toast');
      el.textContent = text;
      el.classList.remove('hidden');
      el.classList.add('show');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.classList.add('hidden'), 300); }, 3200);
    },

    countdown(done) {
      const el = $('#countdown');
      el.classList.remove('hidden');
      const seq = ['3', '2', '1', 'GO!'];
      let i = 0;
      const tick = () => {
        if (i >= seq.length) { el.classList.add('hidden'); el.classList.remove('pulse'); done && done(); return; }
        el.textContent = seq[i];
        el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
        CG.Audio.play(i === seq.length - 1 ? 'double' : 'ui');
        i++;
        setTimeout(tick, 650);
      };
      tick();
    },
  };
})();
