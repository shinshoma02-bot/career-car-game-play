// UI非表示: 画面のボタン・文字を隠して、トレーラー全体だけを見られるようにする(2026-10-13 ユーザー指示)
// 「UI非表示」を押すと、HUD・操作盤・状態の文字・輪止めや固定などの絵の上の文字を消す。
// 隠した後は、画面のどこをタップしても「UI表示」ボタンが出る。それを押すと元に戻る。
(function () {
  var HIDE_IDS = ['modeBar', 'gameStatus', 'cycleBanner', 'status', 'toolbar', 'opsPanel', 'controls', 'slotPop'];

  var css = document.createElement('style');
  css.textContent =
    'body.ui-hidden #' + HIDE_IDS.join(', body.ui-hidden #') + ' { display: none !important; }' +
    '#btnUiShow { display: none; position: fixed; top: 8px; right: 8px; z-index: 60; padding: 8px 14px; font-size: 14px; font-weight: bold; color: #ffe680; background: rgba(17,20,22,.85); border: 1px solid #ffd34d; border-radius: 8px; }' +
    'body.ui-hidden #btnUiShow.show { display: block; }';
  document.head.appendChild(css);

  function setHidden(hidden) {
    window.UI_HIDDEN = hidden;
    document.body.classList.toggle('ui-hidden', hidden);
    showBtn.classList.remove('show');
    // スマホ横: 操作盤の列がなくなって、ステージが広がる。大きさを測り直して、トレーラー全体が映る見え方にする(戻す時は、車を追う標準の見え方へ。2026-10-29 ユーザー指示)
    function relayout() {
      window.dispatchEvent(new Event('resize'));
      if (window.VIEW && window.VIEW.isCompactLand && window.VIEW.isCompactLand()) { if (hidden) window.VIEW.fitAll(); else window.VIEW.autoView(); }
    }
    relayout(); requestAnimationFrame(relayout);
  }

  // 通常の画面: モードバーの右端に「UI非表示」
  var hideBtn = document.createElement('button');
  hideBtn.id = 'btnUiHide';
  hideBtn.type = 'button';
  hideBtn.textContent = 'UI非表示';
  hideBtn.title = 'ボタンや文字を隠して、トレーラー全体だけを見る';
  hideBtn.addEventListener('click', function (e) { e.stopPropagation(); setHidden(true); });
  document.getElementById('modeBar').appendChild(hideBtn);

  // 隠している時: 「UI表示」ボタン(押すと戻る)
  var showBtn = document.createElement('button');
  showBtn.id = 'btnUiShow';
  showBtn.type = 'button';
  showBtn.textContent = 'UI表示';
  showBtn.addEventListener('click', function (e) { e.stopPropagation(); setHidden(false); });
  document.body.appendChild(showBtn);

  // 隠している時は、画面のどこをタップしても「UI表示」を出す(キャンバスのタップ操作は、そのまま働く)
  document.addEventListener('pointerdown', function (e) {
    if (!window.UI_HIDDEN || e.target === showBtn) return;
    showBtn.classList.add('show');
  }, true);

  // 画面が低い横長(約520px以下)の時は、ページ全体は動かず、右の操作盤(#opsPanel)だけが動く。
  // そのままだと、ステージの上でホイールを回しても何も動かないので、どこでホイールを回しても操作盤へ回す(2026-10-13 ユーザー指示)
  var lowLandscape = window.matchMedia ? window.matchMedia('(orientation: landscape) and (max-height: 520px)') : null;
  document.addEventListener('wheel', function (e) {
    if (!lowLandscape || !lowLandscape.matches || e.ctrlKey || e.metaKey) return;   // Ctrl+ホイールは拡大縮小(main.js)
    var ops = document.getElementById('opsPanel');
    if (!ops || ops.contains(e.target)) return;   // 操作盤の上は、ふつうにスクロールする
    ops.scrollTop += e.deltaY;
    e.preventDefault();
  }, { passive: false });

  window.UI_HIDDEN = false;
})();
