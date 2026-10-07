// semi-6b のフロア操作(仮のボタン。2026-10-07)。js/floor_controls.js(semi-6 のスイッチ操作盤)の代わりに読まれる。
// 実物のスイッチ(押ボタン)の素材・配置は、ユーザーの指示があってから作る(D30)。それまでは、既存の操作盤の下の「機構のボタン」の並びに、
// 押している間だけ動く仮のボタンを足して動かす: 1番の上げ・下げ / 2番の後ろの下げ・上げ / 道板 / 4番へのスロープ。
(function () {
  var fm = window.FLOOR_MECH;
  var statusEl = document.getElementById('floorStatus');
  var lastMsg = null, lastMsgTimer = null;

  window.FLOOR_MECH_NOTIFY = function (msg, kind) {
    lastMsg = msg;
    statusEl.textContent = msg;
    statusEl.style.color = kind === 'warn' ? '#ff8080' : '#9c9';
    clearTimeout(lastMsgTimer);
    lastMsgTimer = setTimeout(function () { lastMsg = null; refreshStatusLine(); }, 1800);
  };
  function refreshStatusLine() {
    var M = fm.MECH, msgs = [];
    msgs.push('1番 ' + (M.f1 < 0.5 ? '走行位置' : '上げ ' + Math.round(M.f1) + 'px'));
    msgs.push('2番 ' + (Math.abs(M.f2) < 0.5 ? '走行位置' : (M.f2 > 0 ? '後ろ下げ ' : '後ろ上げ ') + Math.abs(M.f2).toFixed(1) + '度'));
    if (fm.upperConnected()) msgs.push('道板↔2番つながり(上段へ積める)');
    if (fm.upperConnected() && fm.f1Connected()) msgs.push('2番↔1番つながり');
    if (!M.ramp) msgs.push('道板 格納中(積み込み前に出す)');
    if (M.bridge) msgs.push('4番スロープ 上げ');
    statusEl.textContent = msgs.join(' / ');
    statusEl.style.color = fm.upperConnected() ? '#8f8' : '#9c9';
  }

  // 使わない semi-6 のボタンは隠す
  ['btnStopper', 'btnF2Flap'].forEach(function (id) { var b = document.getElementById(id); if (b) b.style.display = 'none'; });
  var btnRamp = document.getElementById('btnRamp'), btnBridge = document.getElementById('btnBridge');
  btnRamp.addEventListener('click', function () { fm.toggleRamp(); renderMechButtons(); });
  btnBridge.addEventListener('click', function () { fm.toggleBridge(); renderMechButtons(); });
  function renderMechButtons() {
    btnRamp.textContent = fm.MECH.ramp ? '道板をしまう' : '道板を出す';
    btnRamp.classList.toggle('on', fm.MECH.ramp);
    btnBridge.textContent = fm.MECH.bridge ? '4番スロープを下げる' : '4番スロープを上げる';
    btnBridge.classList.toggle('on', fm.MECH.bridge);
  }
  // 押している間だけ動くボタン
  var row = document.querySelector('#floorPanel .mechRow');
  function holdBtn(id, label, end, dir) {
    var b = document.createElement('button');
    b.type = 'button'; b.id = id; b.className = 'hold6b'; b.textContent = label;
    function down(e) { e.preventDefault(); fm.holdStart(end, dir); b.classList.add('on'); }
    function up() { if (!b.classList.contains('on')) return; b.classList.remove('on'); fm.holdStop(); }
    b.addEventListener('mousedown', down); b.addEventListener('touchstart', down, { passive: false });
    ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(function (ev) { b.addEventListener(ev, up); });
    row.appendChild(b);
    return b;
  }
  holdBtn('btnF1Up', '1番 ▲ 上げる', 'F1', -1);
  holdBtn('btnF1Down', '1番 ▼ 下げる', 'F1', 1);
  holdBtn('btnF2Down', '2番 ▼ 後ろを下げる', 'F2', 1);
  holdBtn('btnF2Up', '2番 ▲ 後ろを上げる', 'F2', -1);

  document.getElementById('floorTitle').textContent = 'フロア操作(仮のボタン)';
  var hint = document.getElementById('swHint');
  if (hint) hint.innerHTML = '押している間だけ動きます。上段(1〜3番)を積む時: 道板を出して「2番 後ろを下げる」で後端を尻尾に着ける(約10.5度)。下段(4〜6番)を積む時: 2番を走行位置か上げて、4番はスロープを上げて1番を上げる。';
  var close = document.getElementById('btnSwClose'); if (close) close.style.display = 'none';
  window.SWITCH_UI = { open: function () { }, close: function () { }, get current() { return null; } };

  function tick() {
    renderMechButtons();
    if (!lastMsg) refreshStatusLine();
    requestAnimationFrame(tick);
  }
  renderMechButtons();
  refreshStatusLine();
  requestAnimationFrame(tick);
})();
