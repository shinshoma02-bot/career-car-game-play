// 検証用の入口(開発用・ゲームの遊びには影響しない)。URL に #mode=sim&stage=test を付けて開くと、
// モードを選ばず、画面の真ん中にトレーラーがいて、道板とタイヤを出した状態から始まる。
// 画面の左上に、検証する場面の「準備」ボタンを出す。3番は、入口の時点で道板から離れている(初期状態)。5番のスロープは、今は手で操作する(自動化していない)。ボタンを押すと、その場面の床・板を決まった形にする。
// (物理の動きと判定は、URL の stage=test で最初から入る: game.js の PHYS_ENTRY / PHYS_MOTION)
// 2026-10-24 ユーザー指示: URL を触らずに、すぐ検証できるように。
(function () {
  if (!/[#&]stage=test(?:&|$)/.test(location.hash)) return;
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var fm = null, busy = false, panel = null, stat = null;

  // 床の端(F3r・F5f など)を、目標の高さまで動かす。ピンは外してから動かす(test_play.js の T.move と同じ)
  async function moveEnd(k, target, dir) {
    if (fm.PINS[k] !== null) { fm.togglePin(k); await wait(50); }
    var E = fm.ENDS[k];
    if (Math.abs(E.off - target) < 0.6) return;
    fm.holdStart(k, dir);
    for (var g = 0; g < 500; g++) { await wait(30); if (dir < 0 ? E.off <= target : E.off >= target) break; }
    fm.holdStop(); await wait(80);
  }
  // 道板・タイヤは、ボタンで出す(検証の入口の初期状態と同じ)
  async function ensureRampAndTire() {
    if (!fm.MECH.ramp) document.getElementById('btnRamp').click();
    for (var i = 0; i < 60 && !fm.rampReady(); i++) await wait(100);
    if (!fm.MECH.tireOut) {
      fm.jackHoldStart(1); for (var j = 0; j < 300 && !fm.tireOffGround(); j++) await wait(30); fm.jackHoldStop(); await wait(150);
      fm.setLock('R', false); fm.setLock('L', false); await wait(100);
      fm.moveTire('out'); await wait(700);
      fm.setLock('R', true); fm.setLock('L', true); await wait(100);
      fm.jackHoldStart(-1); for (var k = 0; k < 400 && fm.MECH.jack > 0; k++) await wait(30); fm.jackHoldStop(); await wait(1300);
    }
  }
  var PRESETS = {
    // 1番の入口・2番の隙間: 2番扇動板を開き、スライド板をしまう(穴の幅 = 扇動板 70px + スライド板 50px)
    gap2: { label: '2番の隙間を作る', run: async function () {
      await ensureRampAndTire();
      if (fm.MECH.slide) { fm.toggleSlide(); await wait(1000); }
      if (!fm.MECH.f2Flap) { fm.toggleF2Flap(); await wait(900); }
    } },
    // 4番扇動板を出さない(スロープの先の隙間)
    noBridge: { label: '4番扇動板を出さない', run: async function () {
      await ensureRampAndTire();
      if (fm.MECH.bridge) { fm.toggleBridge(); await wait(1000); }
    } }
  };
  function state() {
    if (!fm) return '';
    var m = fm.MECH;
    return '道板 ' + (m.ramp ? '出' : '格納') + ' / タイヤ ' + (m.tireOut ? '出' : '格納') + ' / 2番扇動板 ' + (m.f2Flap ? '開' : '閉') + ' / スライド板 ' + (m.slide ? '出' : '格納') + ' / 4番扇動板 ' + (m.bridge ? '出' : '格納') + ' / 3番と道板 ' + (fm.upperConnected() ? 'つながる' : '離れている');
  }
  function makePanel() {
    panel = document.createElement('div');
    panel.id = 'testStagePanel';
    panel.style.cssText = 'position:fixed;left:8px;top:8px;z-index:50;background:rgba(10,20,30,.85);color:#fff;font:13px/1.4 sans-serif;padding:8px;border-radius:6px;max-width:260px';
    var title = document.createElement('div'); title.textContent = '検証の準備(stage=test)'; title.style.fontWeight = 'bold'; panel.appendChild(title);
    Object.keys(PRESETS).forEach(function (key) {
      var b = document.createElement('button');
      b.textContent = PRESETS[key].label; b.style.cssText = 'display:block;margin:5px 0;padding:6px 8px;width:100%;font-size:13px';
      b.addEventListener('click', async function () {
        if (busy) return; busy = true; b.disabled = true;
        try { await PRESETS[key].run(); } catch (e) { console.log('[stage] ' + e.message); }
        busy = false; b.disabled = false;
      });
      panel.appendChild(b);
    });
    var r = document.createElement('button');
    r.textContent = 'リセット(開き直す)'; r.style.cssText = 'display:block;margin:5px 0;padding:6px 8px;width:100%;font-size:13px';
    r.addEventListener('click', function () { location.reload(); });
    panel.appendChild(r);
    stat = document.createElement('div'); stat.style.cssText = 'margin-top:6px;font-size:12px;opacity:.85'; panel.appendChild(stat);
    document.body.appendChild(panel);
    setInterval(function () { stat.textContent = state(); }, 300);
  }
  async function setup() {
    var tries = 0;
    while (!(window.FLOOR_MECH && window.GAME_STATE && window.VIEW && document.getElementById('btnRamp'))) {
      await wait(200); if (++tries > 100) return;
    }
    fm = window.FLOOR_MECH;
    makePanel();
    await wait(1200);
    busy = true; await ensureRampAndTire(); busy = false;
    window.VIEW.fitAll();   // トレーラーを画面の真ん中へ
    var st = document.getElementById('gameStatus');
    if (st) st.textContent = '検証用: 道板とタイヤを出した状態です(左上の「検証の準備」で場面を選べます)';
  }
  setup();
})();
