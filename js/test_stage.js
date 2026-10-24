// 検証用の入口(開発用・ゲームの遊びには影響しない)。URL に #mode=sim&stage=test を付けて開くと、
// モードを選ばず、画面の真ん中にトレーラーがいて、道板とタイヤを出した状態から始まる。
// 2026-10-24 ユーザー指示: 毎回「モードを選ぶ→道板を出す→タイヤを出す」をしなくて済むように。
(function () {
  if (!/[#&]stage=test(?:&|$)/.test(location.hash)) return;
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function setup() {
    var tries = 0;
    while (!(window.FLOOR_MECH && window.GAME_STATE && window.VIEW && document.getElementById('btnRamp'))) {
      await wait(200); if (++tries > 100) return;
    }
    var fm = window.FLOOR_MECH;
    await wait(1200);
    if (!fm.MECH.ramp) document.getElementById('btnRamp').click();   // 道板を出す
    for (var i = 0; i < 60 && !fm.rampReady(); i++) await wait(100);
    if (!fm.MECH.tireOut) {   // タイヤを出す: ジャッキで浮かせる → ロック解除 → 出す → ロック → ジャッキを戻す(test_play.js の T.tireSet と同じ順)
      fm.jackHoldStart(1); for (var j = 0; j < 300 && !fm.tireOffGround(); j++) await wait(30); fm.jackHoldStop(); await wait(150);
      fm.setLock('R', false); fm.setLock('L', false); await wait(100);
      fm.moveTire('out'); await wait(700);
      fm.setLock('R', true); fm.setLock('L', true); await wait(100);
      fm.jackHoldStart(-1); for (var k = 0; k < 400 && fm.MECH.jack > 0; k++) await wait(30); fm.jackHoldStop(); await wait(1300);
    }
    window.VIEW.fitAll();   // トレーラーを画面の真ん中へ
    var st = document.getElementById('gameStatus');
    if (st) st.textContent = '検証用: 道板とタイヤを出した状態です';
  }
  setup();
})();
