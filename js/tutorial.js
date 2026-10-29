// チュートリアル(index.html#mode=tutorial)。中身は modes.js の sim(難易度なし・時間制限なし・解説あり)で、その上にステップ式のガイドを重ねる。
// ・ステップごとに「やること」を出し、game / floor_mech の状態を 200ms ごとに見て、できたら自動で次へ進む(判定は各ステップの done())
// ・判定が詰まったら(12秒)ヒントを出す。ゲームの注意メッセージ(FLOOR_MECH_NOTIFY)もパネルに写す
// ・「飛ばす(自動でやる)」は、そのステップをガイドが代わりに実行して状態をそろえる(fix)。前のステップを飛ばしても、次のステップが成り立つ
// ・車は7台。最初の荷物は game.js の TUTORIAL_DECK(毎回同じ固定デッキ。カードに「○番用」と出る)。案内文には、その車の名前・高さ・長さと、その番号に入れる理由を書く(plan() の割り当て=LOADABLE.check の固定割り当て。向き=前向き・バックも固定)
// ・1台ずつ「呼ぶ→進めて止める→長押しで固定→荷締め機で緊締」の4工程(2026-10-27 ユーザー指示)
// ・手順(2026-10-27 ユーザー指示で改定): 道板→スライド車軸の伸ばし(ジャッキ→ロック解除→伸→ジャッキを縮めて接地)→3番後ろを下げる→1番→(前側: 1番後を上げる→スライド板・2番扇動板)→2番→3番→(後ろ側: 3番後・3番前を交互に上限まで→ピン)→4番扇動板を出す→(前側: 2番前を上げてピン)→5番スロープ→4番→平らに→5番→宙段フロア→7番→6番→タイヤ格納→道板をしまう
(function () {
  'use strict';
  var GM = window.GAME_MODE, gs = window.GAME_STATE, fm = window.FLOOR_MECH, cfg = window.TRAILER_CONFIG;
  if (!GM || !GM.tutorial || !gs || !fm) return;
  var $ = function (id) { return document.getElementById(id); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var E = fm.ENDS, P = fm.PINS, MECH = fm.MECH;
  var LASH_TURNS = 6;   // game.js の LASH_TURNS(荷締機のハンドルを回す回数)と同じ

  // ---------- 状態の読み取り ----------
  var planCache = null;
  // 7台の割り当て: スロット番号 → デッキの番号
  function plan() {
    var d = gs.deck, r = d && d.loadable;
    if (!d || d.length < 7 || !r || !r.ok || !r.assign || !r.order) return null;
    if (planCache && planCache.deck === d) return planCache;
    planCache = { deck: d, 1: r.order[0], 2: r.order[1], 3: r.order[2], 4: r.order[3], 5: r.assign[0], 6: r.assign[1], 7: r.assign[2], pin: r.bestPin || null, shelf: r.shelf || null, flip5: r.flip5 !== false, flips: r.flips || {}, f1offs: r.F1offs || null, chock5: r.chock5 || 0, chock6: r.chock6 || 0 };
    return planCache;
  }
  var ORDER = ['1', '2', '3', '4', '5', '7', '6'];   // 積む順(7台のサイクルは、宙段フロアの7台目→6番)
  function nonWait() { return gs.deck ? gs.deck.filter(function (d) { return d.status !== 'wait'; }).length : 0; }
  function locked(n) { var o = gs.occupied[n]; return !!(o && o.live && o.live.locked); }
  function called(n) { var c = gs.car; return !!(c && c.deckItem && c.deckItem.status === 'road' && c.phase !== 'exiting' && nonWait() >= ORDER.indexOf(n) + 1); }
  function seatedAt(n) { var c = gs.car; return !!(c && c.seated && String(c.slot) === n); }
  function lidOpen(n) { return !!gs.lidOpen[n]; }
  function lashed(n) { var o = gs.occupied[n]; return !!(o && o.live && o.live.lashTurns >= LASH_TURNS); }
  function lashTurns(n) { var o = gs.occupied[n]; return o && o.live ? (o.live.lashTurns || 0) : 0; }
  function chockSet(n) { return !!(gs.chocks[n] && gs.chocks[n].set); }
  function holeNo(k) { return P[k] === null ? null : fm.holeNo(k, P[k]); }
  // フロアを上げてピンで受けた状態(上げた高さ: 走行位置より約30px以上上)
  var RAISE_TH = { F1f: 4, F1r: 10, F2f: 8, MID: 84 };
  // 1番フロア(前・後)は、4番の車の屋根に当たらない高さ(判定 LOADABLE.check の F1offs)まで上げる必要がある
  function f1need(k) { var p = plan(); return p && p.f1offs && p.f1offs[k] !== undefined ? p.f1offs[k] : RAISE_TH[k]; }
  function raised(k) { return E[k].off <= ((k === 'F1f' || k === 'F1r') ? Math.min(RAISE_TH[k], f1need(k) + 0.6) : RAISE_TH[k]); }
  function raisedRest(k) { return raised(k) && fm.rested(k) && P[k] !== null; }
  // 上限(可動範囲の一番上)まで上げて、ピンに載せた状態(3番前・3番後ろ)
  function topNear(k) { return E[k].off <= E[k].r[0] + 12; }
  function topRest(k) { return P[k] !== null && fm.rested(k) && topNear(k); }
  function f3rUp() { return fm.rested('F3r') && !fm.upperConnected() && E.F3r.off <= -10 && P.F3r !== null; }
  var FIT = fm.FIT_OFFS;
  // 固定デッキの案内: 番号 → 車(デッキの車カード)。名前・高さ・長さを案内文に出す
  function fixedDeck() { return !!(gs.deck && gs.deck.tutorialFixed); }
  // 固定デッキの5番(ハッチバック・バック)の輪止め: 基準から前へ何段(1段4cm)か。2026-10-27 検証: 宙段フロアに当たらない最小は1段(車は後ろすぎて宙段が決まりにくかった)、4番のセダンの後ろ端にぶつからない最大は10段(11段=標準の一番前は重なる)。8段=32cm 前 なら、4番の車との間が約14px(12cm)あいて、宙段フロアの先との余裕も大きい
  var TUT_CHOCK5 = 8;
  // 固定デッキの6番(軽自動車)の輪止め: 基準から後ろへ何段(1段8cm)か。2026-10-28 検証(fm.hangLowerFit。固定ピン穴1番): 宙段フロアの動きに車の鼻が当たらないのは後ろへ4段以上(基準=0段では当たる)。車の後ろ端がトレーラーの端(x=2053)を越えないのは9段以下。6段=48cm なら、当たる位置から2段(16cm)余裕があり、後ろ端はトレーラーの端の手前34pxに収まる
  var TUT_CHOCK6 = 6;
  function minHtxt() { return gs.deckMinH ? '約' + gs.deckMinH.toFixed(2) + 'm' : '約4.1m'; }
  function carOf(n) { var p = plan(); return p ? gs.deck[p[n]] : null; }
  function cname(n) { var it = carOf(n); if (!it) return '車'; var e = it.entry; return e.name + '(高さ' + (e.len * e.aspect).toFixed(2) + 'm・長さ' + e.len.toFixed(1) + 'm・幅' + (e.width || 0).toFixed(2) + 'm)'; }
  // スライド車軸の伸ばし・格納の状態(台車のタイヤ)
  function jackDown() { return MECH.jack <= 0.1; }
  function tireDone() { return MECH.tireOut && !fm.tireOffGround(); }   // 突出して、ジャッキを縮めてタイヤが地面についた(全部縮めなくてよい。伸ばした時は、ロックは掛けなくてよい。2026-10-27 ユーザー指示)
  function tireStowed() { return !MECH.tireOut && MECH.lockR && MECH.lockL && jackDown(); }   // 格納して、ロックして、ジャッキを戻した(走行状態)
  // 宙段フロアを使う時のフロア(2番前・3番前・3番後ろ)の高さは、判定(LOADABLE.check の shelf)が出した「宙段フロアが当たらない最小の高さ」(ピンの穴)。
  // 2番前の上限は、5番が平らな時は freeTop(-23.5)まで(2026-10-07)。判定が無い時だけ、従来のピンの上限(FIT_OFFS)を使う
  function shelfT() {
    var p = plan();
    if (p && p.shelf) return p.shelf;
    var f2 = E.F2f.freeTop !== undefined ? Math.max(FIT.F2f, E.F2f.freeTop) : FIT.F2f;
    return { F2f: f2, MID: FIT.MID, F3r: FIT.F3r, holes: { F2f: fm.holeNo('F2f', f2), MID: fm.holeNo('MID', FIT.MID), F3r: fm.holeNo('F3r', FIT.F3r, FIT.MID) } };
  }
  function stopPinHole() { var p = plan(); return p && p.pin ? p.pin : (fm.stopPin ? fm.stopPin.hole : 1); }
  function stopPinOk() { return !!fm.stopPin && fm.stopPin.inserted && fm.stopPin.hole === stopPinHole(); }
  function loadU() { return (cfg.hangFloor && cfg.hangFloor.loadU) || 2; }
  function hangUpOk() { return !!gs.occupied['7'] && fm.rested('F7') && MECH.hang > 0.01; }
  function f5Flat() { return fm.atTravel('F5') && MECH.stopper && !MECH.hook && !MECH.bridge && fm.bridgeT() <= 0; }

  // サイクル完了の条件(modes.js の cycleComplete と同じ見方)で、足りないものを日本語で返す
  function unmet() {
    var out = [], n;
    ['1', '2', '3', '4', '5', '6', '7'].forEach(function (k) { if (!gs.occupied[k]) out.push(k + '番の車が未積載'); });
    ['1', '2', '3', '4', '5', '6', '7'].forEach(function (k) { if (gs.occupied[k] && !locked(k)) out.push(k + '番の車を長押しで固定'); });
    if (['F1f', 'F1r', 'F2f', 'MID', 'F3r'].some(function (k) { return !fm.rested(k); })) out.push('フロア(1・2・3番)がセットピンに載っていない');
    if (!fm.atTravel('F5')) out.push('5番フロアが平らでない');
    if (MECH.hang > 0.01 && !fm.rested('F7')) out.push('宙段フロアが固定ピンに載っていない');
    if (MECH.tireOut || !MECH.lockR || !MECH.lockL) out.push('タイヤ・ロックが走行状態でない');
    if (MECH.bridge || fm.bridgeT() > 0) out.push('4番扇動板が出たまま');
    if (MECH.ramp || fm.rampT() > 0) out.push('道板が出たまま');
    return out;
  }

  // ---------- 自動実行(「飛ばす」用。通しプレイ検証 .claude/test_play.js と同じ操作を公開APIで行う) ----------
  var Auto = {};
  Auto.unpin = async function (k) { if (P[k] !== null) { fm.togglePin(k); await sleep(50); } };
  // ピンに載っている(ピンより下にいるフロアも同じ)と抜けないので、少しずつ上げて抜く(フロアを下げる動きの前に必要)
  Auto.unpinHard = async function (k) {
    if (P[k] === null) return;
    fm.togglePin(k); await sleep(50);
    for (var i = 0; i < 12 && P[k] !== null; i++) { fm.holdStart(k, -1); await sleep(250); fm.holdStop(); await sleep(80); fm.togglePin(k); await sleep(50); }
  };
  Auto.slideIn = async function () { if (MECH.slide) fm.toggleSlide(); for (var i = 0; i < 30 && fm.slideT() > 0; i++) await sleep(50); };
  Auto.move = async function (k, target) {
    if (MECH.slide && gs.occupied['2']) await Auto.slideIn();   // 2番に車が載っていれば、フロアを動かす前にスライド板をしまう
    await Auto.unpin(k);
    var e = E[k]; if (Math.abs(e.off - target) < 0.6) return;
    var dir = target < e.off ? -1 : 1; fm.holdStart(k, dir);
    for (var g = 0; g < 600; g++) { await sleep(30); if (dir < 0 ? e.off <= target : e.off >= target) break; }
    fm.holdStop(); await sleep(80);
  };
  Auto.rest = async function (k, target) {
    await Auto.move(k, target); await Auto.unpin(k); fm.togglePin(k); await sleep(60);
    fm.holdStart(k, 1);
    for (var g = 0; g < 300; g++) { await sleep(15); if (fm.rested(k)) break; }
    fm.holdStop(); await sleep(60);
  };
  Auto.restExt = async function (k, target) {
    await Auto.move(k, -20); await Auto.unpin(k); fm.togglePin(k); await sleep(60);
    var e = E[k]; fm.holdStart(k, -1);
    for (var g = 0; g < 600 && e.off > target; g++) await sleep(30);
    fm.holdStop(); await sleep(80);
  };
  Auto.ramp = async function () {
    if (!MECH.ramp) fm.toggleRamp();
    for (var i = 0; i < 60 && !fm.rampReady(); i++) await sleep(100);
  };
  Auto.connect = async function () {
    if (fm.upperConnected()) return;
    fm.holdStart('F3r', -1); await sleep(300); fm.holdStop(); await sleep(100); await Auto.unpin('F3r');
    fm.holdStart('F3r', 1); for (var i = 0; i < 800 && !fm.upperConnected(); i++) await sleep(30); fm.holdStop(); await sleep(300);
  };
  Auto.callCar = async function (n, flip) {
    var p = plan(); if (!p) return;
    if (!called(n)) {
      gs.sel = p[n]; gs.pendingEntry = gs.deck[p[n]]; gs.deck[p[n]].flip = !!flip;
      $('carPreview').click();
      for (var i = 0; i < 100; i++) { await sleep(100); if (gs.car && gs.car.phase === 'ready' && gs.car.deckItem === gs.deck[p[n]]) break; }
      await sleep(300);
    }
  };
  Auto.drive = async function (n) {
    // 人が押すのと同じ操作。遠い間は押し続けて、止まるまでの距離(v²/1280。T.drive と同じ)を見て、先に離す。惰性で、落とし・輪止めの本当に手前まで進み、最後の数十pxだけ、短く『ちょん』と押す(2026-10-29 ユーザー指示: 1番のバックで勢いがついて突っ込んだ・ちょんちょんが長すぎた)
    var car = gs.car, btn = $('btnLeft');
    function ev(t) { btn.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true })); }
    async function press(ms) { ev('mousedown'); await sleep(ms); ev('mouseup'); }
    function tgt() { var st = gs.activeStop(n); return st ? car.arc[n] - st.dx - 8 : null; }
    for (var i = 0; i < 900; i++) {
      if (car.seated || gs.frozen) break;
      var t = tgt(); if (t === null) break;
      var d = t - car.progress, v = Math.max(0, car.velocity || 0), coast = v * v / 1280;   // 今離すと、あと coast px 進んで止まる
      if (d > coast + 60 && v < 230) { ev('mousedown'); await sleep(50); continue; }   // まだ遠い: 押し続ける(速すぎる時は離して様子を見る)
      ev('mouseup');
      if (v > 12) { await sleep(90); continue; }   // 惰性で進んでいる間は押さない(押すと速さが乗る)
      if (d > 25) await press(90); else if (d > 4) await press(25); else { await sleep(200); if (!car.seated) await press(20); }
      await sleep(150);
    }
    ev('mouseup'); await sleep(500);
  };
  Auto.tap = async function () {
    var car = gs.car; if (!car || car.locked) return;
    var x = car.x - car.leftTireX + car.w / 2, y = car.y - car.h / 2, c = window.VIEW.stageToClient(x, y);
    gs.tapCar(car);   // 車は長押しで固定(game.js の state.tapCar。長押しと同じ処理)
    await sleep(250);
  };
  Auto.load = async function (n, flip) {
    if (locked(n)) return;
    if (n === '2' || n === '3') await Auto.lid(n);
    if (n === '5' || n === '6') await Auto.chock(n);
    await Auto.callCar(n, flip); if (!(gs.car && gs.car.seated)) await Auto.drive(n); await Auto.tap();
  };
  Auto.lid = async function (n) { gs.selectSlot && gs.targetSlot !== n && gs.selectSlot(n); await sleep(80); if (!gs.lidOpen[n]) $('btnLid').click(); await sleep(700); };
  Auto.chock = async function (n) { if (gs.targetSlot !== n) gs.selectSlot(n); await sleep(80); if (!chockSet(n)) $('btnChockSet').click(); await sleep(80); };
  // 荷締め機のハンドルを LASH_TURNS 回まわす(スロットを選んでボタンを押す)
  Auto.lash = async function (n) {
    if (lashed(n)) return;
    if (gs.targetSlot !== n) gs.selectSlot(n);
    await sleep(80);
    for (var i = 0; i < 12 && !lashed(n); i++) { $('btnLash').click(); await sleep(120); }
  };
  // 3番後ろ → 3番前を交互に上げて、両方を一番上まで(3番前を上げると、シーソーで3番後ろが下がるため)
  Auto.upper3 = async function () {
    for (var rep = 0; rep < 8 && !(E.MID.off <= E.MID.r[0] + 0.6 && E.F3r.off <= E.F3r.r[0] + 0.6); rep++) {
      await Auto.unpin('F3r'); await Auto.unpin('MID');
      fm.holdStart('F3r', -1); await sleep(2000); fm.holdStop(); await sleep(120);
      fm.holdStart('MID', -1); await sleep(2000); fm.holdStop(); await sleep(120);
    }
  };
  // 一番上の位置にピンを刺して、フロアをピンに載せる(3番前を先に。3番後ろは最後: 3番前を動かすと3番後ろが連動するため)
  Auto.topPin = async function (k) {
    await Auto.unpin(k);
    var e = E[k]; if (e.off > e.r[0] + 0.6) { fm.holdStart(k, -1); for (var g = 0; g < 600 && e.off > e.r[0] + 0.6; g++) await sleep(30); fm.holdStop(); await sleep(100); }
    fm.togglePin(k); await sleep(60);
    fm.holdStart(k, 1);
    for (var h = 0; h < 400; h++) { await sleep(15); if (fm.rested(k)) break; }
    fm.holdStop(); await sleep(60);
  };
  Auto.raiseUpper = async function () {
    for (var k of ['F1f', 'F1r', 'F2f', 'MID']) await Auto.rest(k, -3);
    await Auto.rest('F3r', -24); await Auto.rest('MID', -3); await Auto.rest('F3r', -24);
  };
  Auto.slope = async function () {
    fm.holdStart('F2f', 1); for (var g = 0; g < 500 && MECH.lift < 62; g++) await sleep(30); fm.holdStop(); await sleep(150);
    fm.holdStart('F2f', -1); for (var h = 0; h < 500 && MECH.lift > 0; h++) await sleep(30); fm.holdStop(); await sleep(200);
  };
  Auto.bridgeOut = async function () { if (!MECH.bridge) fm.toggleBridge(); for (var i = 0; i < 100 && !fm.bridgeReady(); i++) await sleep(100); };
  Auto.bridgeIn = async function () { if (MECH.bridge) fm.toggleBridge(); for (var i = 0; i < 100 && (MECH.bridge || fm.bridgeT() > 0); i++) await sleep(100); };
  Auto.flat = async function () {
    await Auto.bridgeIn();
    if (!(MECH.lift >= 62)) { fm.holdStart('F2f', 1); for (var a = 0; a < 400 && MECH.lift < 62; a++) await sleep(30); fm.holdStop(); await sleep(150); }
    if (MECH.stopper) { fm.toggleStopper(); await sleep(150); }
    fm.holdStart('F2f', -1); for (var b = 0; b < 500 && MECH.lift > 0; b++) await sleep(30); fm.holdStop(); await sleep(200);
    if (!MECH.stopper) { fm.toggleStopper(); await sleep(150); }
  };
  Auto.hangTo = async function (u) {
    for (var rep = 0; rep < 4; rep++) {
      if (Math.abs(MECH.hang - u) <= 0.03) break;
      var dir = u > MECH.hang ? -1 : 1, prev = MECH.hang, still = 0; fm.holdStart('F7', dir);
      for (var i = 0; i < 400; i++) {
        await sleep(30); if (dir < 0 ? MECH.hang >= u - 0.02 : MECH.hang <= u + 0.02) break;
        if (Math.abs(MECH.hang - prev) < 1e-4) { if (++still > 12) break; } else still = 0;   // 固定ピンに当たって動かなくなったら待たない
        prev = MECH.hang;
      }
      fm.holdStop(); await sleep(200);
      if (still > 12) break;
    }
  };
  // フロア k を、ピンの穴 h の高さに上げ下げして、その穴にピンを刺して載せる(穴を指定)
  Auto.restHole = async function (k, h) {
    var e = E[k], off = fm.offOfHole(k, h);
    await Auto.unpinHard(k);
    // 穴の少し上(0.8〜9px)に止める(ピンはフロアの下にしか刺せない)。上から下げてくる時、勢いで穴を通り過ぎないように、短く押して様子を見る
    for (var i = 0; i < 80; i++) {
      if (e.off <= off - 0.8 && e.off >= off - 9) break;
      fm.holdStart(k, e.off < off - 9 ? 1 : -1); await sleep(e.off < off - 9 && e.off < off - 30 ? 120 : 35); fm.holdStop(); await sleep(70);
    }
    for (var a = 0; a < 80 && fm.pinTarget(k) < h; a++) fm.stepPinTarget(k, 1);   // (ピンが抜けていないと動かないので、回数に上限)
    for (var b = 0; b < 80 && fm.pinTarget(k) > h; b++) fm.stepPinTarget(k, -1);
    fm.togglePin(k); await sleep(60);
    fm.holdStart(k, 1);
    for (var g = 0; g < 400; g++) { await sleep(15); if (fm.rested(k) && Math.abs(e.off - off) < 0.6) break; }
    fm.holdStop(); await sleep(60);
  };
  Auto.stopPin = async function () { if (plan() && plan().pin) fm.setStopPinHole(plan().pin); if (!fm.stopPin.inserted) fm.toggleStopPin(); await sleep(100); };
  Auto.hangUp = async function () {
    await Auto.stopPin();
    var LU = fm.stopPinCfg.us[fm.stopPin.hole - 1];
    await Auto.hangTo(LU + 0.04); await Auto.hangTo(LU);
  };
  // タイヤ: ジャッキで浮かせる → ロック解除 → 伸/縮 → ロック → ジャッキを戻す(どの段階からでも続きをやる)
  Auto.jackUp = async function () { if (fm.tireOffGround()) return; fm.jackHoldStart(1); for (var i = 0; i < 300 && !fm.tireOffGround(); i++) await sleep(30); fm.jackHoldStop(); await sleep(150); };
  Auto.unlock = async function () { await Auto.jackUp(); fm.setLock('R', false); fm.setLock('L', false); await sleep(100); };
  Auto.tireMove = async function (out) { await Auto.unlock(); if (MECH.tireOut !== !!out) { fm.moveTire(out ? 'out' : 'in'); await sleep(700); } };
  Auto.lockAll = async function () { fm.setLock('R', true); fm.setLock('L', true); await sleep(100); };
  Auto.jackDown = async function () { if (jackDown()) return; fm.jackHoldStart(-1); for (var j = 0; j < 400 && MECH.jack > 0; j++) await sleep(30); fm.jackHoldStop(); await sleep(1300); };
  Auto.tireSet = async function (out) { await Auto.tireMove(out); if (!out) await Auto.lockAll(); await Auto.jackDown(); };   // 伸ばした時はロック不要(縮めて走行状態に戻す時だけロック)
  Auto.stow = async function () { if (MECH.ramp) fm.toggleRamp(); for (var i = 0; i < 80 && (MECH.ramp || fm.rampT() > 0); i++) await sleep(100); };

  // ---------- ステップ ----------
  // c: 章 / t: 見出し / x: 説明 / sub: いまやること(状態で変わる) / hint: 詰まった時 / info: 説明だけ(「次へ」で進む)
  // done: 達成判定 / fix: 飛ばした時にガイドが代わりにやること / enter: 開始時の画面の準備 / hl: 強調する部品 / ring: 強調するスイッチ枠
  var CHAPTERS = ['画面の見方', '道板を出す', '台車の車軸を伸ばす', '上段につなぐ', '上段に積む', '上段フロアを上げて固定', '5番をスロープにして4番へ', '5番に積む', '宙段フロア(7台目)', '6番に積む', '荷姿を低くする', 'サイクル完了'];
  var S = [];
  function add(o) { S.push(o); return o; }
  // 操作盤の中の、押すボタンそのものを指す(data-sw は floor_controls.js が付ける: up / down / pin / minus / plus、タイヤ操作盤は nobi・chiji・migi_oshi・migi_hiki・hidari_oshi・hidari_hiki)。無ければカード全体
  function swBtn(i, what) { var c = document.querySelectorAll('#swPanel .swCard')[i], b = c && c.querySelector('[data-sw="' + what + '"]'); return b ? [b] : (c ? [c] : []); }
  // フロアの端1つ「上げる→ピンを差す」の、いま押すボタン(endCardSub と同じ順)
  function endBtn(i, k) {
    if (raisedRest(k)) return [];
    if (P[k] !== null && !raised(k)) return swBtn(i, fm.rested(k) && E[k].off >= P[k] - 1 ? 'up' : 'pin');
    if (!raised(k)) return swBtn(i, 'up');
    return swBtn(i, 'pin');
  }
  function swCard(i) { var c = document.querySelectorAll('#swPanel .swCard'); return c[i] ? [c[i]] : []; }
  function openPanel(id) { if (window.SWITCH_UI && window.SWITCH_UI.current !== id) window.SWITCH_UI.open(id); }
  function el(id) { var e = $(id); return e ? [e] : []; }
  function plateBtn(key) { var e = document.querySelector('#swPanel [data-plate="' + key + '"]'); return e ? [e] : []; }   // 前側の操作盤の『扇動板・スライド板』カードのボタン(slide / flap2 / bridge)
  function deckHl(n) {
    var p = plan(), drawer = $('deckDrawer');
    if (drawer && !drawer.classList.contains('open')) return el('deckDrawerHandle');
    var box = p && $('deckAll') ? $('deckAll').children[p[n]] : null;
    return box ? [box] : el('deckAll');
  }
  function slotBtn(n) { var b = document.querySelector('#slotSel button[data-slot="' + n + '"]'); return b ? [b] : []; }
  function endCardSub(k) {   // フロアの端1つを「上げる→ピンを差す」時の、いまやること(2026-10-27 ユーザー指示: ピンにフロアを下げて載せるところまではやらない)
    if (raisedRest(k)) return '出来ました。';
    var pinFar = P[k] !== null && P[k] > E[k].off + 14;
    if (P[k] !== null && !raised(k)) return fm.rested(k) && E[k].off >= P[k] - 1 ? '① {UP}を一瞬だけ押して、フロアをピンから浮かせる → ②「抜く」でピンを抜く(走行位置のピン)' : '②「抜く」ボタンでピンを抜く';
    if (!raised(k)) return '③ {UP}を押し続けて、止まるまで(一番上まで)上げる';
    if (P[k] === null) return '④「ピン」ボタンを押す(フロアの少し下の穴の番号が自動で入っています)';
    if (pinFar) return 'ピンが下の穴のままです。「抜く」で一度抜いて、上の穴に差し直す';
    return 'ピンがフロアから離れています。「抜く」で一度抜いて、フロアのすぐ下の穴に差し直す';
  }
  // 5番の輪止めを前(キャビン側)へ寄せる(宙段フロアが持ち上がる時に、5番の車の鼻が当たらないように。判定が必要と出した時だけ。この荷物では不要)
  function chock5Step() {
    function tg() { var p = plan(); return fixedDeck() ? -TUT_CHOCK5 : (p ? -(p.chock5 || 0) : 0); }   // 5番の輪止めの目標の段(0=基準、負=前へ)。標準の位置は一番前(2026-10-09)なので、そこから後ろへ戻す
    add({ c: 7, t: '5番: 輪止めの位置を合わせる', skip: function () { var c = gs.chocks['5']; return !plan() || (c && c.set && c.step === tg()); }, x: function () { var p = plan(); if (fixedDeck()) return '5番の輪止めは、標準で一番前(キャビン側)に付きます。でも、一番前だと車が前へ寄りすぎて、4番の車の後ろ端にぶつかります。かといって後ろすぎると、宙段フロアを持ち上げる時の車の鼻の余裕が足りなくなります。そこで、基準から前へ ' + TUT_CHOCK5 * 4 + 'cm(' + TUT_CHOCK5 + '段)の位置にします。「輪止めを後ろへ」で合わせてください。'; return '5番の輪止めは、標準で一番前(キャビン側)に付きます。この車は、宙段フロアを持ち上げる時に鼻が当たらず、4番の車の後ろ端にもぶつからないよう、基準から前へ ' + (p ? (p.chock5 || 0) * 4 : 0) + 'cm(' + (p ? (p.chock5 || 0) : 0) + '段)の位置にします。「輪止めを後ろへ」で合わせてください。'; }, sub: function () { var c = gs.chocks['5']; return '輪止めを基準から前へ ' + (-tg()) + ' 段にする(いま ' + (c && c.set ? -c.step : 0) + ' 段)'; }, hint: 'スロット「5」を選んで、「輪止めを前へ/後ろへ」ボタンで合わせます。', hl: function () { var c = gs.chocks['5']; return gs.targetSlot !== '5' ? slotBtn('5') : el(c && c.set && c.step > tg() ? 'btnChockFront' : 'btnChockRear'); }, done: function () { var c = gs.chocks['5']; return !plan() || !!(c && c.set && c.step === tg()); }, fix: async function () { for (var i = 0; i < 60 && gs.chocks['5'].step !== tg(); i++) { $(gs.chocks['5'].step > tg() ? 'btnChockFront' : 'btnChockRear').click(); await sleep(60); } } });
  }
  // 6番の輪止めを後ろ(道板側)へ寄せる(宙段フロアが持ち上がる時に、6番の車の鼻が当たらないように)
  function chock6Step() {
    function tg() { var p = plan(); return fixedDeck() ? TUT_CHOCK6 : (p ? (p.chock6 || 0) : 0); }   // 6番の輪止めの目標の段(0=基準、正=後ろへ)
    add({ c: 9, t: '6番: 輪止めの位置を合わせる', skip: function () { var c = gs.chocks['6']; return !plan() || (c && c.set && c.step === tg()); }, x: function () { var n = tg(); return '6番の輪止めを基準の位置にすると、6番の車の鼻が、持ち上げた宙段フロア(と、その上の車)に当たります。そこで、基準から後ろへ ' + n * 8 + 'cm(' + n + '段)の位置にします(車がその分、後ろに止まります)。「輪止めを後ろへ」を ' + n + ' 回押して合わせてください。'; }, sub: function () { var c = gs.chocks['6']; return '輪止めを基準から後ろへ ' + tg() + ' 段にする(いま ' + (c && c.set ? c.step : 0) + ' 段)'; }, hint: 'スロット「6」を選んで、「輪止めを前へ/後ろへ」ボタンで合わせます。', hl: function () { var c = gs.chocks['6']; return gs.targetSlot !== '6' ? slotBtn('6') : el(c && c.set && c.step > tg() ? 'btnChockFront' : 'btnChockRear'); }, done: function () { var c = gs.chocks['6']; return !plan() || !!(c && c.set && c.step === tg()); }, fix: async function () { for (var i = 0; i < 60 && gs.chocks['6'].step !== tg(); i++) { $(gs.chocks['6'].step > tg() ? 'btnChockFront' : 'btnChockRear').click(); await sleep(60); } } });
  }
  function loadSteps(n, o) {
    var k = ORDER.indexOf(n) + 1, say = n + '番';
    var wantFlip = function () { return typeof o.flip === 'function' ? !!o.flip() : !!o.flip; };   // 5番の向き(判定の結果で変わる。true=後ろ向き(バック))
    if (o.lid) add({ c: o.c, t: say + ': 落し蓋を開ける', x: o.lidText, hint: '下のスロット番号ボタン「' + n + '」を押してから、「落し蓋を開ける」を押します。', hl: function () { return lidOpen(n) ? [] : (gs.targetSlot === n ? el('btnLid') : slotBtn(n)); }, done: function () { return lidOpen(n); }, fix: function () { return Auto.lid(n); } });
    if (o.chock) add({ c: o.c, t: say + ': 輪止めをセット', x: o.chockText, hint: '下のスロット番号ボタン「' + n + '」を押してから、「輪止めをセット」を押します。', hl: function () { return chockSet(n) ? [] : (gs.targetSlot === n ? el('btnChockSet') : slotBtn(n)); }, done: function () { return chockSet(n); }, fix: function () { return Auto.chock(n); } });
    if (n === '5') chock5Step();
    if (n === '6') chock6Step();
    add({ c: o.c, t: say + ': 車を呼ぶ', x: function () { var b = typeof o.callText === 'function' ? o.callText() : o.callText; return n === '5' ? b : b + (wantFlip() ? ' 向きは「後ろ向き(バック)」で積みます(車の下の「向き」ボタンで切り替えます)。' : ' 向きは「前向き(頭から)」のままです。'); }, sub: function () { var c = gs.car; if (wantFlip() && c && !c.flip && called(n)) return '向きが前向きです。「後ろ向き(バック)」に切り替えてください(車の下のボタン)'; if (!wantFlip() && c && c.flip && called(n)) return '向きが後ろ向きです。「前向き」に戻してください(車の下のボタン)'; return wantFlip() ? '黄色い枠の車の「向き」を「後ろ向き(バック)」にしてから、車をタップ' : '黄色い枠の車をタップ(入場します。向きは前向きのまま)'; },
      hint: '車の一覧が閉じていたら、「車の一覧」を押して開きます。黄色い枠の車をタップすると、道板の手前に入場します。' + (wantFlip() ? '呼んだ後でも、動かす前なら向きを切り替えられます。' : ''),
      hl: function () {   // 向き(前向き/バック)のボタンも指す(2026-10-28 ユーザー指示)。呼ぶ前は、一覧の車の枠と、その車の向きのボタン。呼んだ後に向きが違う時は、待機中の車の向きのボタン
        var c = gs.car, want = wantFlip();
        if (called(n)) { if (c && !!c.flip !== want) { var rb = document.querySelector('#deckAll .deckItem.road button'); return rb ? [rb] : deckHl(n); } return []; }
        var hl = deckHl(n), p = plan(), it = p ? gs.deck[p[n]] : null;
        if (it && hl.length === 1 && hl[0].classList && hl[0].classList.contains('deckItem') && !!it.flip !== want) { var ob = hl[0].querySelector('button'); if (ob) hl.push(ob); }
        return hl;
      },
      past: function () { return seatedAt(n) || locked(n); }, done: function () { return called(n) && (wantFlip() ? gs.car.flip : !gs.car.flip); }, fix: function () { return Auto.callCar(n, wantFlip()); } });
    add({ c: o.c, t: say + ': 進めて止める', x: o.driveText, hint: '右下の {FWD}ボタンを押している間、車が進みます。離すと惰性でゆっくり止まります。輪止め(落し蓋の穴)の手前で離し、あとは短くチョンチョン押して寄せます。通り過ぎたら {BACK}で戻れます。', hl: function () { if (seatedAt(n) || locked(n)) return []; var c = gs.car, st = c && gs.activeStop ? gs.activeStop(n) : null; return c && st && c.arc && c.arc[n] !== undefined && c.progress > c.arc[n] - st.dx - 8 + 45 ? el('btnRight') : el('btnLeft'); }, done: function () { return seatedAt(n) || locked(n); }, fix: function () { return Auto.callCar(n, wantFlip()).then(function () { return Auto.drive(n); }); } });
    add({ c: o.c, t: say + ': 長押しで固定', x: '各フロアに止まると「OK」が出ます。OKの出た車を指で長押し(約0.5秒)して固定してください。ちょっと触れただけでは固定されません(スイッチを押そうとして車を間違えて触れても、固定されないようにするためです)。固定すると次の車を呼べます(固定しないと、他の車は呼べません)。', hint: '画面の車の絵を、指で押さえたまま約0.5秒待ちます(ボタンではありません)。途中で指を動かすと取り消されます。スマホで小さい時は、ダブルタップで画面を拡大できます。', done: function () { return locked(n); }, fix: function () { return Auto.tap(); } });
    add({ c: o.c, t: say + ': 荷締機で緊締', x: (n === '1' ? '車を固定したら、荷締機(ワイヤーを張る道具)のハンドルを回して、タイヤの前後にかけたワイヤーを張ります。これを「緊締」と言って、走行中やフロアを動かす時に、車が動かないようにします。' : '1台ごとに、固定したら荷締機でも緊締します。') + 'スロット「' + n + '」を選んで、「荷締機を回す」を ' + LASH_TURNS + ' 回押してください。', sub: function () { return lashed(n) ? '出来ました(緊締済み)。' : (gs.targetSlot !== n ? '下のスロット「' + n + '」を押す' : '「荷締機を回す」を押す(いま ' + lashTurns(n) + '/' + LASH_TURNS + ')'); }, hint: '下のスロット番号ボタン「' + n + '」を押してから、「荷締機を回す」を ' + LASH_TURNS + ' 回押します。車を長押しで固定していないと回せません。', hl: function () { return lashed(n) ? [] : (gs.targetSlot === n ? el('btnLash') : slotBtn(n)); }, done: function () { return lashed(n); }, fix: function () { return Auto.lash(n); } });
  }

  // 1. 画面の見方
  add({ c: 0, info: true, t: 'トレーラーとフロア番号', x: '上の絵が車を積むトレーラー(キャリアカー)です。車を載せる床を「フロア」と呼び、上の段が1・2・3番、下の段が4・5・6番。下の段の5番と6番の間に「宙段フロア(7番)」が存在します。7台積む際に使用します。', hl: function () { return el('stageWrap'); } });
  add({ c: 0, info: true, t: '操作盤', x: '画面の真ん中あたりが操作盤です。「道板を出す」などの大きなボタン(道板=車が乗る坂)と、車を載せる各フロアと紐づいてるスロット番号1〜6(輪止めと落し蓋の操作)があります。フロアを上げ下げするスイッチは、トレーラー上の光る枠をタップするとここに出ます。扇動板・スライド板のボタンは前側のスイッチ(1番・2番)を開くと、その操作盤の中に出ます。', hl: function () { return el('floorPanel').concat(el('chockPanel')); } });
  add({ c: 0, info: true, t: '車カード', x: function () { return '一番下が車の一覧(車カード)です。このチュートリアルは7台。車をタップすると道板の手前に入場し、右下の {LEFT} {RIGHT} ボタンで前後に動かします。カードの「幅」は6番に載せられるかの目安(6番は1.755m以下)。積む順番は、黄色い枠で教えます。' + (fixedDeck() ? '今回の7台は、毎回同じ組み合わせです。各カードに「○番用」と出ています。1番はスポーツタイプ(背が低い)、2番はミニバン(背が高い)、3番は軽自動車、4番はセダン(背が低い)、5番はハッチバック(長さ3.9mと短く、ボンネットが低い)、宙段フロア(7番)はセダン(背が低い)、6番はスポーツタイプ(幅1.755m以下)です。向き(前向き・バック)も決まっていて、呼ぶところで案内します。理由は、その番号の車を呼ぶところで説明します。' : ''); }, hl: function () { return el('controls'); }, enter: function () { var h = $('deckDrawerHandle'); var d = $('deckDrawer'); if (h && d && !d.classList.contains('open')) h.click(); } });

  // 2. 道板
  add({ c: 1, t: '道板を出す', x: '車はトレーラー後ろの「道板」(坂)から乗ります。まず「道板を出す」を押してください。', hint: '操作盤の一番上の「道板を出す」です。画面の下の方にあります。', hl: function () { return MECH.ramp ? [] : el('btnRamp'); }, done: function () { return fm.rampReady(); }, fix: Auto.ramp });

  // 2.5 スライド車軸を伸ばす(台車のタイヤ。6番の横を軽自動車以外が通るために必要。実操作は floor_mech の jackHoldStart/setLock/moveTire)
  function tireSub(what) {
    return function () {
      var lk = '右=' + (MECH.lockR ? 'ロック' : '解除') + ' / 左=' + (MECH.lockL ? 'ロック' : '解除');
      if (what === 'jack') return fm.tireOffGround() ? '出来ました(タイヤが浮いています)。' : 'ジャッキの {UP} を押し続ける(タイヤが地面から浮くまで)';
      if (what === 'unlock') return '「右引」と「左引」を押す(いま ' + lk + ')';
      if (what === 'out') return '「伸」を押す(いま ' + (MECH.tireOut ? '伸びている' : '縮んでいる') + ')';
      if (what === 'lock') return '「右押」と「左押」を押す(いま ' + lk + ')';
      return fm.tireOffGround() ? 'ジャッキの {DOWN} を押し続ける(タイヤが地面につくまで。全部縮めなくてかまいません)' : '出来ました(タイヤが地面についています)。';
    };
  }
  add({ c: 2, info: true, t: 'なぜ台車の車軸を伸ばすのか', x: '軽四は、台車のタイヤを外へ出さなくても通れます。', hl: function () { return el('stageWrap'); } });
  add({ c: 2, t: 'ジャッキ・タイヤ操作盤を開く', x: '後ろの車軸辺りの光る枠をタップして、タイヤの操作盤を出してください。', hint: '光る枠は2つあり、どちらをタップしても同じ操作盤が出ます。', ring: 'tire', past: tireDone, done: function () { return window.SWITCH_UI.current === 'tire'; }, fix: function () { openPanel('tire'); } });
  add({ c: 2, t: 'ジャッキでタイヤを浮かせる', x: 'タイヤが地面に付いたままだと車軸は動きません。「ジャッキ」の {UP} を押し続けて、タイヤを地面から浮かせてください。', sub: tireSub('jack'), hint: '{UP}は押している間だけ動きます。タイヤが浮いたら離してください。', enter: function () { openPanel('tire'); }, hl: function () { return fm.tireOffGround() || MECH.tireOut ? [] : swBtn(0, 'up'); }, past: tireDone, done: function () { return fm.tireOffGround() || MECH.tireOut; }, fix: Auto.jackUp });
  add({ c: 2, t: '車軸のロックを解除する', x: '車軸のロックを外します。「右引」と「左引」を押して、両方のロックを解除してください。', sub: tireSub('unlock'), hint: '「引」がロック解除、「押」がロックです。タイヤが浮いていないと動きません。', enter: function () { openPanel('tire'); }, hl: function () { var r = []; if (MECH.lockR) r = r.concat(swBtn(1, 'migi_hiki')); if (MECH.lockL) r = r.concat(swBtn(1, 'hidari_hiki')); return r; }, past: tireDone, done: function () { return (!MECH.lockR && !MECH.lockL) || MECH.tireOut; }, fix: Auto.unlock });
  add({ c: 2, t: 'スライド車軸を伸ばす(伸)', x: '「伸」を押すと、タイヤが外へ張り出します。軽自動車以外の車も、6番の横を通れるようになります。', sub: tireSub('out'), hint: '「伸」は右側の一番上のボタンです。ロックが掛かっていると動きません。', enter: function () { openPanel('tire'); }, hl: function () { return MECH.tireOut ? [] : swBtn(1, 'nobi'); }, past: tireDone, done: function () { return MECH.tireOut; }, fix: function () { return Auto.tireMove(true); } });
  add({ c: 2, t: 'ジャッキを縮めてタイヤを地面につける', x: 'ジャッキの {DOWN} を押し続けて、タイヤを地面につけます。これで伸ばす作業は完了です。ロックは掛け直さなくてOKです。', sub: tireSub('jackup'), hint: '{DOWN}は押している間だけ動きます。', enter: function () { openPanel('tire'); }, hl: function () { return swBtn(0, 'down'); }, done: tireDone, fix: Auto.jackDown });

  // 3. 上段につなぐ
  add({ c: 3, t: '後ろ側のスイッチを開く', x: '上の段(1〜3番)に積むため、後ろのスイッチ枠をタップして操作盤を出してください。', hint: '柱の下の小さなスイッチです。「後ろ側」の操作盤が出ます。', ring: 'rear', done: function () { return window.SWITCH_UI.current === 'rear'; }, fix: function () { openPanel('rear'); } });
  add({ c: 3, t: '3番 後: ピンを抜く', x: 'セットピンに載っている間は抜けません。{UP}を一瞬押してフロアを浮かせてから、「抜く」を押してください。', sub: function () { return fm.rested('F3r') && E.F3r.off >= P.F3r - 1 ? '{UP}を一瞬だけ押して、フロアをピンから浮かせる' : '「抜く」ボタンを押す'; }, hint: '「載っているので抜けません」と出たら、{UP}をもう一瞬押してから「抜く」です。', enter: function () { openPanel('rear'); }, hl: function () { return swBtn(1, fm.rested('F3r') && E.F3r.off >= P.F3r - 1 ? 'up' : 'pin'); }, past: function () { return !!gs.occupied['1']; }, done: function () { return P.F3r === null; }, fix: async function () { openPanel('rear'); if (P.F3r !== null) { fm.holdStart('F3r', -1); await sleep(300); fm.holdStop(); await sleep(100); await Auto.unpin('F3r'); } } });
  add({ c: 3, t: '3番 後: 一番下まで下げる', x: '{DOWN}を押し続けて、3番の後ろ端を道板の高さまで下げます。接地すると坂がつながります。', hint: '{DOWN}は押している間だけ動きます。下がりきるまで押し続けてください。', enter: function () { openPanel('rear'); }, hl: function () { return swBtn(1, 'down'); }, past: function () { return !!gs.occupied['1']; }, done: function () { return fm.upperConnected(); }, fix: Auto.connect });

  // 4. 上段に積む
  loadSteps('1', { c: 4, flip: function () { var p = plan(); return !!(p && p.flips && p.flips[1]); }, callText: function () { return 'これで上の段に車が上がれます。上段は奥の1番から順に積みます(車は後ろから前へ進むので、先に奥の1番を埋めます)。「1番用」の黄色い枠の車、' + cname('1') + 'をタップして呼びましょう。' + (fixedDeck() ? '1番に背の低い車を選ぶ理由: 1番はフロアの位置が高い場所で、しかも下の4番の車の屋根が高いと、1番のフロアがさらに押し上げられるからです(4番の車は後で積みます)。' : ''); }, driveText: '右下の ◀ で前進します。1番は、フロアの先端の輪止めに前輪が当たって止まります。勢いが強いと乗り越えてしまうので、近づいたら離して、チョンチョン押して寄せます。止まると「OK」と出ます。後ろ向きの車は、◀ で前進するとお尻から進みます。' });
  add({ c: 4, t: '前側のスイッチを開く', x: '1番の車は積めました。次は前側のスイッチ(1番・2番)をタップして、操作盤を出してください。', hint: '絵の左寄り、運転席の後ろの柱の近くです。', ring: 'front', past: function () { return raisedRest('F1r'); }, done: function () { return window.SWITCH_UI.current === 'front'; }, fix: function () { openPanel('front'); } });
  add({ c: 4, t: '1番 後: 上げてピンで固定', x: '「抜く」でピンを抜き、{UP}で上へ上げて、「ピン」で差します。穴の番号は自動で入ります。操作盤の2枚目「1番 後」です。', sub: function () { return endCardSub('F1r'); }, hint: '「抜く(13)」の13は、いま差しているピンの穴番号です。載っていて抜けない時は、{UP}で少し浮かせてから抜きます。', enter: function () { openPanel('front'); }, hl: function () { return endBtn(1, 'F1r'); }, past: function () { return !!gs.occupied['2'] && raisedRest('F1r'); }, done: function () { return raisedRest('F1r'); }, fix: async function () { openPanel('front'); await Auto.rest('F1r', f1need('F1r') - 8); } });
  add({ c: 4, t: 'スライド板を格納', x: '1番と2番の間の「スライド板」をしまいます。「扇動板・スライド板」のカードで「スライド板を格納」を押してください。', hint: '「スライド板を格納」を押すと、板が1番フロアの下へ入ります。', enter: function () { openPanel('front'); }, hl: function () { return MECH.slide ? plateBtn('slide') : []; }, past: function () { return !MECH.slide && !!gs.occupied['2']; }, done: function () { return !MECH.slide && fm.slideT() <= 0; }, fix: Auto.slideIn });
  add({ c: 4, t: '2番扇動板を開く', skip: function () { return !!MECH.f2Flap; }, x: '2番に積むミニバンは長いので、あとで4番にセダンを入れる時、2番フロアの前を下げると、ミニバンの下面が4番の車の屋根に当たって下げにくくなります。「2番扇動板」を開けておくと、その部分は屋根に当たらなくなります(1番には積み終えているので、道が切れても大丈夫です)。「扇動板・スライド板」のカードで「2番扇動板を開く」を押してください。', hint: '同じカードの「2番扇動板を開く」を押します。', enter: function () { openPanel('front'); }, hl: function () { return MECH.f2Flap ? [] : plateBtn('flap2'); }, past: function () { return !!gs.occupied['2'] && !!MECH.f2Flap; }, done: function () { return !!MECH.f2Flap; }, fix: async function () { if (!MECH.f2Flap) fm.toggleF2Flap(); for (var i = 0; i < 40 && fm.flapT() < 1; i++) await sleep(50); } });
  loadSteps('2', { c: 4, lid: true, flip: function () { var p = plan(); return !!(p && p.flips && p.flips[2]); }, lidText: '2番・3番には輪止めがなく、床の「落とし穴」にタイヤを落として止めます。その穴にはふた(落し蓋)があって、閉じたままだと車はそこを通過します。2番に積むので、スロット「2」を選んで「落し蓋を開ける」を押してください。', callText: function () { return '2番の蓋を開けました。次は「2番用」の黄色い枠の車、' + cname('2') + 'を呼びます。' + (fixedDeck() ? '2番に背の高い車(ミニバン)を入れる理由: 荷姿の高さは、背の低い車を1番・4番、背の高い車を2番・3番に回すと低く収まります(1番・4番の車の屋根は、上下のフロアを押し上げやすいため)。' : ''); }, driveText: '◀ で前進。3番の蓋は閉じているので通り過ぎ、2番の穴にタイヤが落ちて止まります。後ろ向きの車は、お尻から進みます。' });
  loadSteps('3', { c: 4, lid: true, flip: function () { var p = plan(); return !!(p && p.flips && p.flips[3]); }, lidText: '3番も同じです。スロット「3」を選んで、「落し蓋を開ける」を押してください(2番の蓋は積んだ後なのでそのまま)。', callText: function () { return '3番に積む「3番用」の黄色い枠の車、' + cname('3') + 'を呼びます。' + (fixedDeck() ? '3番にはセダンを入れます(1番・4番ほど背が低くなくてかまいません。ただし、3番の車の屋根が高いと、3番のフロアを上げた時に荷姿が高くなります)。' : ''); }, driveText: '◀ で前進。手前の3番の穴で止まります。' });

  // 5. 上段フロアを上げて固定
  function topSub(k, lab) {
    if (topRest(k)) return lab + ': 出来ました。';
    if (P[k] === null) return topNear(k) ? lab + ': 「ピン」ボタンを押す(フロアの少し下の穴の番号が自動で入っています)' : lab + ': {UP}を押して、一番上まで上げ直す';
    if (!topNear(k) || P[k] > E[k].off + 14) return lab + ': ピンが下の穴のままです。{UP}で一番上まで上げてから「抜く」で抜き、上の穴に差し直す';
    return lab + ': ピンがフロアから離れています。「抜く」で一度抜いて、フロアのすぐ下の穴に差し直す';
  }
  add({ c: 5, t: '後ろ側のスイッチを開く', x: '上段のフロアを上げて、ピンでも支えます。後ろのスイッチ枠をタップして、後ろ側の操作盤を出してください。', hint: '絵の中央よりやや右、柱の下にある小さなスイッチです。', ring: 'rear', past: function () { return topRest('MID') && topRest('F3r'); }, done: function () { return window.SWITCH_UI.current === 'rear'; }, fix: function () { openPanel('rear'); } });
  add({ c: 5, t: '3番 後と3番 前を交互に上げる', x: '3番 前を上げると3番 後が下がるので、3番 後と3番 前の {UP} を交互に押して、2つとも一番上まで上げます。', sub: function () { var a = E.F3r.off <= E.F3r.r[0] + 3, b = E.MID.off <= E.MID.r[0] + 3; return a && b ? '出来ました。' : (a ? '3番 後: 上限' : '3番 後: {UP}') + ' → ' + (b ? '3番 前: 上限' : '3番 前: {UP}') + '(交互に繰り返す)'; }, hint: '{UP}は押している間だけ動きます。最後は3番 後で上限まで。', enter: function () { openPanel('rear'); }, hl: function () {   // 3番 後 → 3番 前 の順に、交互に光らせる(片方が上限に着いたら、もう一方だけ)
      var a = E.F3r.off <= E.F3r.r[0] + 3, b = E.MID.off <= E.MID.r[0] + 3;
      if (a && b) return [];
      if (a) return swBtn(0, 'up');
      if (b) return swBtn(1, 'up');
      return Math.floor(Date.now() / 1500) % 2 === 0 ? swBtn(1, 'up') : swBtn(0, 'up');
    }, past: function () { return topRest('MID') && topRest('F3r'); }, done: function () { return E.F3r.off <= E.F3r.r[0] + 3 && E.MID.off <= E.MID.r[0] + 3; }, fix: async function () { openPanel('rear'); await Auto.upper3(); } });
  add({ c: 5, t: '3番 前・3番 後: 上限にピンを刺す', x: '一番上まで上げたまま、「ピン」で差します。3番 前 → 3番 後 の順です。', sub: function () { return !topRest('MID') ? topSub('MID', '3番 前') : topSub('F3r', '3番 後'); }, hint: '「ピン」を押すと、フロアの少し下の穴に入ります。', enter: function () { openPanel('rear'); }, hl: function () { var m = !topRest('MID'), i = m ? 0 : 1, k = m ? 'MID' : 'F3r'; return P[k] === null ? swBtn(i, topNear(k) ? 'pin' : 'up') : (P[k] > E[k].off + 14 ? swBtn(i, 'pin') : []); }, past: function () { return topRest('MID') && topRest('F3r') && fm.bridgeReady(); }, done: function () { return topRest('MID') && topRest('F3r'); }, fix: async function () { openPanel('rear'); await Auto.topPin('MID'); await Auto.topPin('F3r'); } });
  add({ c: 5, t: '前側のスイッチを開く', x: '前のスイッチ枠(1番・2番)をタップして、前側の操作盤を出してください。', hint: '絵の左寄り、運転席の後ろの柱の近くです。', ring: 'front', past: function () { return raisedRest('F2f'); }, done: function () { return window.SWITCH_UI.current === 'front'; }, fix: function () { openPanel('front'); } });
  add({ c: 5, t: '4番扇動板を搬出', x: '下の段の4番に積みます。「扇動板・スライド板」のカードで「4番扇動板を搬出」を押して、5番と4番の間に橋を出してください。', hint: '5番が4番の高さまで上がると、板の先がつながります。', enter: function () { openPanel('front'); }, hl: function () { return MECH.bridge ? [] : plateBtn('bridge'); }, past: function () { return !!gs.occupied['4']; }, done: function () { return fm.bridgeReady(); }, fix: Auto.bridgeOut });
  add({ c: 5, t: '1番 前: 上げてピンで固定', x: '4番の車の屋根が当たらないよう、1番 前(操作盤の1枚目)を一番上まで上げて、ピンで固定してください。手順は1番 後と同じです。', sub: function () { return endCardSub('F1f'); }, hint: '載っていて抜けない時は、{UP}で少し浮かせてから「抜く」です。', enter: function () { openPanel('front'); }, hl: function () { return endBtn(0, 'F1f'); }, past: function () { return fm.f5Slope() || !!gs.occupied['4']; }, done: function () { return raisedRest('F1f'); }, fix: async function () { openPanel('front'); await Auto.rest('F1f', f1need('F1f') - 8); } });
  // 2番前を限界(ピン無しで上がる一番上 = freeTop)まで上げて、ピンを刺す。フロアはピンの上に浮いたまま(油圧で保持)。このあと5番を持ち上げる時に、▼でピンに載る
  function f2Lim() { return (E.F2f.freeTop !== undefined ? E.F2f.freeTop : -23.5) + 2; }
  function f2Top() { return E.F2f.r[0] + 3; }   // 5番がスロープの間、ピンを一番上の穴に差していると、ピンより上(可動範囲の上限)まで上げられる
  function f2Armed() { return P.F2f !== null && P.F2f <= 10 && E.F2f.off <= f2Lim(); }
  add({ c: 5, t: '2番 前を限界まで上げて、ピンを刺す', x: '2番 前を {UP} で限界まで上げて、ピンを差します。このフロアが、5番を持ち上げる時の土台になります。', sub: function () { if (f2Armed()) return '出来ました。'; if (P.F2f !== null && P.F2f > 10) return fm.rested('F2f') && E.F2f.off >= P.F2f - 1 ? '① {UP}を一瞬だけ押して、フロアをピンから浮かせる → ②「抜く」でピンを抜く(走行位置のピン)' : '②「抜く」ボタンでピンを抜く'; if (E.F2f.off > f2Lim()) return '③ {UP}を押し続けて、止まるまで(限界まで)上げる'; return '④「ピン」ボタンを押す(フロアの少し下の穴の番号が自動で入っています)'; }, hint: '載っていて抜けない時は、{UP}で少し浮かせてから「抜く」です。', enter: function () { openPanel('front'); }, hl: function () { if (f2Armed()) return []; if (P.F2f !== null && P.F2f > 10) return swBtn(2, fm.rested('F2f') && E.F2f.off >= P.F2f - 1 ? 'up' : 'pin'); return swBtn(2, E.F2f.off > f2Lim() ? 'up' : 'pin'); }, past: function () { return fm.f5Slope(); }, done: f2Armed, fix: async function () { openPanel('front'); await Auto.unpinHard('F2f'); fm.holdStart('F2f', -1); for (var g = 0; g < 600 && E.F2f.off > f2Lim(); g++) await sleep(30); fm.holdStop(); await sleep(150); if (P.F2f === null) fm.togglePin('F2f'); await sleep(100); } });

  // 5. フロアを上げて固定

  // 6. 5番フロアをスロープに
  add({ c: 6, t: '2番 前の {DOWN} を長押し', x: '2番 前の {DOWN} を押し続けてください。約1秒待ってから5番が上がり始めます。4番の高さまで上がり、ストッパーが掛かるまで押し続けます。', sub: function () { return P.F2f === null ? '2番 前のピンが差さっていません。前のステップで差してください' : (MECH.lift > 0 ? '5番が上がっています。そのまま押し続ける' : (fm.rested('F2f') ? '{DOWN}を押し続ける(約1秒たつと5番が動き出します)' : '{DOWN}を押し続ける(2番 前がピンに載ってから、約1秒たつと5番が動き出します)')); }, hint: '押し直さず、そのまま待ちます。途中で離すと5番が中途半端な高さで止まります。', enter: function () { openPanel('front'); }, hl: function () { return swBtn(2, 'down'); }, past: function () { return !!gs.occupied['4']; }, done: function () { return fm.f5Slope(); }, fix: async function () { openPanel('front'); fm.holdStart('F2f', 1); for (var g = 0; g < 500 && MECH.lift < 62; g++) await sleep(30); fm.holdStop(); for (var w = 0; w < 40 && !fm.f5Slope(); w++) await sleep(50); await sleep(100); } });
  add({ c: 6, t: '2番 前を {UP} で戻す', x: '5番はスロープのピンに掛かって止まります。2番 前は {UP} を押し続けて、元のピンの位置まで戻してください。', hint: '{UP}を押し続けると、2番 前がピンの高さまで戻って止まります。', enter: function () { openPanel('front'); }, hl: function () { return swBtn(2, 'up'); }, past: function () { return !!gs.occupied['4']; }, done: function () { return fm.f5Slope() && MECH.lift <= 0; }, fix: async function () { fm.holdStart('F2f', -1); for (var h = 0; h < 500 && MECH.lift > 0; h++) await sleep(30); fm.holdStop(); await sleep(200); } });
  add({ c: 6, t: '2番 前を限界まで上げる', x: '4番の車が通れるよう、2番 前をもう一度 {UP} で限界まで上げます。一度離して、押し直してください。', sub: function () { return E.F2f.off <= f2Top() ? '出来ました。' : '{UP}を押し続ける(止まるまで)'; }, hint: 'リミットスイッチが働いて止まったら、そこが限界です。', enter: function () { openPanel('front'); }, hl: function () { return swBtn(2, 'up'); }, past: function () { return !!gs.occupied['4']; }, done: function () { return fm.f5Slope() && MECH.lift <= 0 && E.F2f.off <= f2Top(); }, fix: async function () { fm.holdStart('F2f', -1); for (var a = 0; a < 500 && MECH.lift > 0; a++) await sleep(30); fm.holdStop(); await sleep(250); fm.holdStart('F2f', -1); for (var b = 0; b < 900 && E.F2f.off > f2Top(); b++) await sleep(30); fm.holdStop(); await sleep(150); } });
  loadSteps('4', { c: 6, flip: function () { var p = plan(); return !!(p && p.flips && p.flips[4]); }, callText: function () { return 'これで4番へ行けます。「4番用」の黄色い枠の車、' + cname('4') + 'を呼んでください。道板→5番(スロープ)→4番扇動板→4番と進みます。' + (fixedDeck() ? '4番に背の低い車(セダン)を選ぶ理由: 4番の車の屋根が高いと、その上の1番のフロアを押し上げてしまうからです。また、この車は軽自動車ではないので、6番の横を通るためにスライド車軸の伸ばしが必要でした(先に済ませてあります)。' : ''); }, driveText: '◀ で前進します。4番は、前側に元からある輪止めに当たって止まります。4番扇動板の上は一度止まらずに渡りきると楽です。' });

  // 7. 5番を平らにして5番へ
  add({ c: 7, t: '4番扇動板を格納', x: '4番に積めました。次の5番のために、「扇動板・スライド板」のカードで「4番扇動板を格納」を押してください。', enter: function () { openPanel('front'); }, hl: function () { return MECH.bridge ? plateBtn('bridge') : []; }, past: function () { return !!gs.occupied['4'] && f5Flat(); }, done: function () { return !MECH.bridge && fm.bridgeT() <= 0; }, fix: Auto.bridgeIn });
  add({ c: 7, t: '5番を持ち上げ直す', x: '5番は、引っかけ金具がスロープのピンに掛かっています。外すため、2番 前の {DOWN} をもう一度長押しして、5番を一段上へ持ち上げてください。', hint: '「5番を4番の高さより上げてから」と出たら、もう少し上げます。', enter: function () { openPanel('front'); }, hl: function () { return swBtn(2, 'down'); }, past: function () { return !!gs.occupied['4'] && f5Flat(); }, done: function () { return MECH.lift >= -(cfg.floor5.hookOff) - 1 || !MECH.stopper || (fm.atTravel('F5') && !MECH.bridge); }, fix: async function () { fm.holdStart('F2f', 1); for (var a = 0; a < 400 && MECH.lift < 62; a++) await sleep(30); fm.holdStop(); await sleep(150); } });
  add({ c: 7, t: '赤いレバーを上げる', x: '金具が浮いたら、柱の後ろの赤いレバーをタップして、ピンを外してください。', hint: '「5番を4番の高さより上げてから」と出たら、もう少し5番を上げます。', hl: function () { return []; }, past: function () { return !!gs.occupied['4'] && f5Flat(); }, done: function () { return !MECH.stopper || (fm.atTravel('F5') && !MECH.hook); }, fix: function () { if (MECH.stopper) fm.toggleStopper(); return sleep(150); } });
  add({ c: 7, t: '5番を下げて平らにする', x: '2番 前の {UP} を押し続けて、5番を平らになるまで下げてください。', hint: '平らになったら離します。', enter: function () { openPanel('front'); }, hl: function () { return swBtn(2, 'up'); }, past: function () { return !!gs.occupied['4'] && f5Flat(); }, done: function () { return fm.atTravel('F5') && !MECH.hook && !MECH.bridge; }, fix: async function () { fm.holdStart('F2f', -1); for (var b = 0; b < 500 && MECH.lift > 0; b++) await sleep(30); fm.holdStop(); await sleep(200); } });
  add({ c: 7, t: 'ピンが元に戻る', x: 'レバーは自動で戻ります。ピンが出たら、次へ進んでください。', hl: function () { return []; }, past: function () { return !!gs.occupied['4'] && f5Flat(); }, done: function () { return f5Flat(); }, fix: function () { if (!MECH.stopper) fm.toggleStopper(); return sleep(150); } });
  loadSteps('5', { c: 7, chock: true, flip: function () { var p = plan(); return !p || p.flip5; }, chockText: '5番と6番は、床に輪止め(タイヤを止めるくさび)を置いて止めます。輪止めがないと車は止まらずに行き過ぎます。スロット「5」を選んで、「輪止めをセット」を押してください。', callText: function () { var p = plan(), back = !p || p.flip5; return (back ? '5番は、7台のサイクルでは「後ろ向き(バック)」で積みます(鼻先を宙段フロア側へ向けると、宙段フロアが持ち上がる時に、低いボンネットの上を通れるからです)。「5番用」の黄色い枠の車、' + cname('5') + 'の向きを「後ろ向き(バック)」にして呼んでください。' : '5番に、「5番用」の黄色い枠の車、' + cname('5') + 'を、前向きのまま呼んでください(荷台が低い軽トラックは、前向きに積むと荷台が宙段フロア側に来るので、宙段フロアが楽に持ち上がります)。') + (fixedDeck() ? '5番にこの車を選んだ理由: 5番の車は、宙段フロアを持ち上げる時に前端の下に入り込むので、ボンネットが低く、長さが短い車でないと当たります。5番に入れられるのは、背の低い車(クーペ・ハッチバック・セダンなど)か、ヴェゼルクラスまでのSUVです(ミニバン・大きなSUV・ワゴンは当たります)。ここでは長さ3.9mのハッチバックを選びました。' : ''); }, driveText: '後ろ向きの車は、◀ で前進するとお尻から進みます。輪止めに後輪が当たって止まるまで進めます。' });

  // 8. 宙段フロア
  add({ c: 8, info: true, t: '宙段フロア(7台目)とは', x: '宙段フロアは、5番と6番の間にある短いフロアで、7台目を載せる場所です。普段は下段の床にたたまれていて、前側が持ち上がるとスロープになり、車を載せたら全体を持ち上げて、赤い「固定ピン」で止めます。宙段フロアの真上のフロア(3番 前)を高く上げるので荷姿が少し高くなります。高さ制限(約4.1m)にも注意します。', hl: function () { return el('stageWrap'); } });
  add({ c: 8, t: '宙段フロアの固定ピンを合わせる', x: '宙段フロアの「固定ピン」の位置を、−/＋で合わせて差してください。ピンの位置で、宙段フロアの止まる高さが決まります。「いまやること」に出る位置に合わせます。', sub: function () { var h = stopPinHole(); return '固定ピンの位置を「' + h + '」にして、差した状態にする(いま ' + (fm.stopPin.inserted ? '差してある' : '抜いてある') + ' / 位置 ' + fm.stopPin.hole + ')'; }, hint: '「刺す」と出ていたら押して差します。', enter: function () { openPanel('rear'); }, hl: function () { var h = stopPinHole(); return fm.stopPin.hole !== h ? swBtn(2, fm.stopPin.hole < h ? 'plus' : 'minus') : (fm.stopPin.inserted ? [] : swBtn(2, 'pin')); }, done: function () { return stopPinOk(); }, fix: Auto.stopPin });
  add({ c: 8, t: '宙段フロアをスロープにする', x: '宙段フロアの {UP} を押して前側を持ち上げ、スロープにします。1段目で離してください。', hint: '途中で止まる所が、スロープの位置です。', enter: function () { openPanel('rear'); }, hl: function () { return swBtn(2, 'up'); }, past: function () { return !!gs.occupied['7']; }, done: function () { return fm.hangSlope(); }, fix: function () { return Auto.hangTo(1); } });
  loadSteps('7', { c: 8, flip: function () { var p = plan(); return !!(p && p.flips && p.flips[7]); }, callText: function () { return '7台目、「7番用」の黄色い枠の車、' + cname('7') + 'を呼びます。道板から、下段の床をまっすぐ後ろへ進み、5番(積んだ車)の脇を通って宙段フロアのスロープに乗ります。' + (fixedDeck() ? '宙段フロアに載せた車の屋根は、持ち上げた宙段フロアの上で、2番・3番のフロアの下に収まらないといけません。それで、背の低い車(スポーツタイプ)にしています。背の高い車だと、荷姿が高くなりすぎます。' : ''); }, driveText: '◀ で前進。宙段フロアの穴(上げると自動で空いています)にタイヤが落ちて止まります。' });
  add({ c: 8, t: '宙段フロアを上げて固定ピンで止める', x: '7台目を固定したら、宙段フロアの {UP} を押し続けます。赤い固定ピンに当たって止まれば完了です。', sub: function () { return hangUpOk() ? '出来ました。' : '宙段フロアの {UP} を押し続ける(止まるまで)'; }, hint: '上がらない時は、2番 前・3番 前・3番 後が一番上まで上がっているか確認します。', enter: function () { openPanel('rear'); }, hl: function () { return swBtn(2, 'up'); }, done: hangUpOk, fix: Auto.hangUp });

  // 9. 6番
  loadSteps('6', { c: 9, chock: true, flip: function () { var p = plan(); return !!(p && p.flips && p.flips[6]); }, chockText: '最後は6番です。6番も輪止めで止めます。スロット「6」を選んで、「輪止めをセット」を押してください。', callText: function () { return '6番には、幅が1.755m以下の車しか載せられません(それより広い車は、タイヤが張り出す位置に当たります)。「6番用」の黄色い枠の車、' + cname('6') + 'を呼んでください。' + (fixedDeck() ? '6番には軽自動車を入れます。幅は1.48mなので、6番に積めます(6番に積む(止まる)だけなら、スライド車軸の伸ばしの有無は関係ありません)。6番は宙段フロアの下に入るので、車が高いと宙段フロアが当たりますが、前の手順で輪止めを後ろへ寄せたので、車の鼻は宙段フロアの動きに当たりません。' : '') + '7台目を積んだあとなので、宙段フロアの下(6番の床)はあいています。'; }, driveText: '◀ で前進。6番の輪止めに前輪が当たって止まります。宙段フロアが上がっている下をくぐるので、車の高さに気をつけます。' });

  // 10. 荷姿を低くする(2026-10-28 ユーザー指示: 6番に積んだ後、上のフロアを適切な位置に下げて固定する)
  //  3番 前(MID)・3番 後(F3r)は、7台を積むために一番上まで上げてある。積み終えたら、判定 LOADABLE.check の棚(shelf.holes)の穴まで下げてピンで固定する(宙段フロアと7台目の車に当たらない一番低い高さ)。荷姿が上限を超えると減点
  function shelfHole(k) { var p = plan(); return p && p.shelf && p.shelf.holes ? p.shelf.holes[k] : null; }
  function shelfOk(k) { var h = shelfHole(k); return h === null || (P[k] !== null && fm.holeNo(k, P[k]) === h && fm.rested(k)); }
  // フロア k を棚の穴 h まで下げる時の、いま押すボタン(下げる→穴の番号を合わせる→ピン→▼で載せる)
  function shelfBtn(i, k) {
    var h = shelfHole(k); if (h === null || shelfOk(k)) return [];
    var off = fm.offOfHole(k, h);
    if (P[k] !== null) {
      if (fm.holeNo(k, P[k]) !== h) return swBtn(i, fm.rested(k) && E[k].off >= P[k] - 1 ? 'up' : 'pin');   // 違う穴に差してある: 一瞬上げて抜く
      return swBtn(i, 'down');   // 目標の穴に差してある: ▼でピンに載せる
    }
    if (E[k].off < off - 25) return swBtn(i, 'down');   // まだ高い: ▼で目標の穴の近くまで下げる(穴の番号は、フロアの少し下に自動で入る)
    if (E[k].off > off + 0.5) return swBtn(i, 'up');   // 下げ過ぎ(ピンは穴より上のフロアにしか差せない)
    return swBtn(i, fm.pinTarget(k) > h ? 'minus' : (fm.pinTarget(k) < h ? 'plus' : 'pin'));
  }
  function shelfSub(k, lab) {
    var h = shelfHole(k); if (h === null || shelfOk(k)) return lab + ': 出来ました。';
    var off = fm.offOfHole(k, h);
    if (P[k] !== null) return fm.holeNo(k, P[k]) !== h ? lab + ': 違う穴(' + fm.holeNo(k, P[k]) + '番)に差してあります。{UP}を一瞬押してフロアを浮かせ、「抜く」で抜く' : lab + ': {DOWN}を押して、フロアをピン(' + h + '番)に載せる';
    if (E[k].off < off - 25) return lab + ': {DOWN}を押して、' + h + '番の穴の少し上まで下げる(ピンの穴の番号を見ながら)';
    if (E[k].off > off + 0.5) return lab + ': 下げ過ぎです。{UP}で少し上げる(ピンは穴より上のフロアにしか差せません)';
    return fm.pinTarget(k) === h ? lab + ': 「ピン」を押す(穴 ' + h + '番)' : lab + ': ピンの穴を ' + h + ' 番に合わせる(−/＋。いま ' + fm.pinTarget(k) + ' 番)';
  }
  add({ c: 10, info: true, t: '荷姿の高さを低くする', x: function () { var p = plan(); return '7台とも積めました。いま、3番 前・3番 後は、車を積むために一番上まで上げたままです。積み込みが終わったら、上のフロアは、下の車や宙段フロアに当たらない範囲で、できるだけ低く下げて、セットピンで固定します(2番 前 → 3番 前 → 3番 後の順)。画面上の「荷姿の高さ」(積んだ状態の一番高い所)が、高さ制限(' + (GAME_MODE.limitM ? GAME_MODE.limitM().toFixed(2) + 'm' : '約4.3m') + ')を超えると減点されるからです。この荷物では、3番 前を ' + (shelfHole('MID') || '-') + ' 番、3番 後を ' + (shelfHole('F3r') || '-') + ' 番の穴の高さにします(計算で出した、当たらない一番低い高さです)。'; }, skip: function () { return !plan() || shelfHole('MID') === null; }, hl: function () { return el('modeBarHeight'); } });
  add({ c: 10, t: '前側のスイッチを開く', skip: function () { return !plan() || shelfHole('MID') === null || (window.SWITCH_UI && window.SWITCH_UI.current === 'front'); }, x: '前側の2番 前を、先に限界まで上げ直します。前のスイッチ枠(1番・2番)をタップしてください。', hint: '絵の左寄り、運転席の後ろの柱の近くです。', ring: 'front', done: function () { return window.SWITCH_UI.current === 'front'; }, fix: function () { openPanel('front'); } });
  add({ c: 10, t: '2番 前を限界まで上げ直す', skip: function () { return !plan() || shelfHole('MID') === null; }, x: '2番 前の {UP} を、止まるまで押し続けます。ピンは差したままでOKです。', sub: function () { return E.F2f.off <= f2Lim() ? '出来ました。' : '{UP}を押し続ける(止まるまで)'; }, hint: '2番 前は、{UP}でリミットスイッチが働くところまで上がります。', enter: function () { openPanel('front'); }, hl: function () { return E.F2f.off <= f2Lim() ? [] : swBtn(2, 'up'); }, done: function () { return E.F2f.off <= f2Lim(); }, fix: async function () { openPanel('front'); fm.holdStart('F2f', -1); for (var g = 0; g < 900 && E.F2f.off > f2Lim(); g++) await sleep(30); fm.holdStop(); await sleep(150); } });
  add({ c: 10, t: '後ろ側のスイッチを開く', skip: function () { return !plan() || shelfHole('MID') === null || (window.SWITCH_UI && window.SWITCH_UI.current === 'rear'); }, x: '後ろのスイッチ枠をタップして、後ろ側の操作盤を出してください。', hint: '絵の中央よりやや右、柱の下にある小さなスイッチです。', ring: 'rear', done: function () { return window.SWITCH_UI.current === 'rear'; }, fix: function () { openPanel('rear'); } });
  function f3rLow() { return P.F3r === null && E.F3r.off >= -30; }
  add({ c: 10, t: '3番 後を先に下げる', skip: function () { return !plan() || shelfHole('MID') === null; }, x: '3番 前を下げると3番 後が上がるため、先に3番 後を下げて余裕を作ります。ピンを抜いて({UP}を一瞬押してから「抜く」)、{DOWN}で約-24(走行位置の近く)まで下げてください。', sub: function () { if (f3rLow()) return '出来ました。'; if (P.F3r !== null) return fm.rested('F3r') && E.F3r.off >= P.F3r - 1 ? '① {UP}を一瞬だけ押して、フロアをピンから浮かせる → ②「抜く」でピンを抜く' : '②「抜く」ボタンでピンを抜く'; return '{DOWN}を押し続けて、約-24まで下げる(いま ' + Math.round(E.F3r.off) + ')'; }, hint: 'ピンが差さったままだと下がりません。', enter: function () { openPanel('rear'); }, hl: function () { return f3rLow() ? [] : (P.F3r !== null ? swBtn(1, fm.rested('F3r') && E.F3r.off >= P.F3r - 1 ? 'up' : 'pin') : swBtn(1, 'down')); }, done: f3rLow, fix: async function () { openPanel('rear'); await Auto.unpinHard('F3r'); await Auto.move('F3r', -20); } });
  add({ c: 10, t: '3番 前を下げてピンで固定', skip: function () { return !plan() || shelfHole('MID') === null; }, x: function () { var h = shelfHole('MID'); return '3番 前を、' + h + ' 番の穴の高さまで下げます。手順: ピンを抜く({UP}を一瞬押してフロアを浮かせてから「抜く」)→ {DOWN}で、ピンの穴の番号(フロアの少し下の穴)が ' + h + ' になる高さまで下げる → 「ピン」で差す → {DOWN}でフロアをピンに載せる。3番 前を動かすと3番 後が連動して動くので、3番 後は次の手順で合わせます。'; }, sub: function () { return shelfSub('MID', '3番 前'); }, hint: '「ピン」ボタンの横の −/＋ で、ピンの穴の番号を変えられます(ピンを抜いている間だけ)。穴の番号は大きいほど高い位置です。', enter: function () { openPanel('rear'); }, hl: function () { return shelfBtn(0, 'MID'); }, done: function () { return shelfOk('MID'); }, fix: async function () { openPanel('rear'); await Auto.restHole('MID', shelfHole('MID')); } });
  add({ c: 10, t: '3番 後を下げてピンで固定', skip: function () { return !plan() || shelfHole('F3r') === null; }, x: function () { var h = shelfHole('F3r'); return '次に、3番 後を、' + h + ' 番の穴の高さまで下げます。手順は3番 前と同じです(ピンを抜く → {DOWN}で下げる → 穴の番号を ' + h + ' に合わせて「ピン」→ {DOWN}でピンに載せる)。3番 後の穴の間隔は広く、3番 前の高さで番号が変わります。3番 前を先に決めたので、もう動きません。'; }, sub: function () { return shelfSub('F3r', '3番 後'); }, hint: '3番 後の穴の番号は、3番 前の高さで決まります。−/＋で ' + '合わせてください。', enter: function () { openPanel('rear'); }, hl: function () { return shelfBtn(1, 'F3r'); }, done: function () { return shelfOk('F3r'); }, fix: async function () { openPanel('rear'); await Auto.restHole('F3r', shelfHole('F3r')); } });

  // 11. サイクル完了
  function tireInHl() {   // スライド車軸を縮める手順(tireInSub と同じ順)の、いま押すボタン
    if (tireStowed()) return [];
    var off = fm.tireOffGround(), lk = MECH.lockR || MECH.lockL, r = [];
    if (!off && !MECH.tireOut && !lk) return swBtn(0, 'down');
    if (!off && lk) return swBtn(0, 'up');
    if (off && lk) { if (MECH.lockR) r = r.concat(swBtn(1, 'migi_hiki')); if (MECH.lockL) r = r.concat(swBtn(1, 'hidari_hiki')); return r; }
    if (off && MECH.tireOut) return swBtn(1, 'chiji');
    if (off && !MECH.lockR) r = r.concat(swBtn(1, 'migi_oshi')); if (off && !MECH.lockL) r = r.concat(swBtn(1, 'hidari_oshi'));
    return r.length ? r : swBtn(0, 'down');
  }
  function tireInSub() {
    if (tireStowed()) return '出来ました。';
    var off = fm.tireOffGround(), lk = MECH.lockR || MECH.lockL;
    if (!off && !MECH.tireOut && !lk) return 'ジャッキの {DOWN} を押し続けて、ジャッキを戻す';
    if (!off && lk) return '① ジャッキの {UP} を押し続けて、タイヤを浮かせる';
    if (off && lk) return '② 「右引」と「左引」でロックを解除する';
    if (off && MECH.tireOut) return '③ 「縮」を押して、スライド車軸を縮める';
    if (off && !MECH.lockR && !MECH.lockL) return '④ 「右押」と「左押」でロックを掛ける';
    return '④ 「右押」と「左押」でロックを掛ける → ⑤ ジャッキの {DOWN} でジャッキを戻す';
  }
  add({ c: 11, info: true, t: 'サイクル完了の条件', x: 'サイクルが完了する条件は、①7台とも積んで、全部長押しで固定して緊締 ②上段のフロアが全てセットピンに載っている ③5番フロアが平ら ④宙段フロアが固定ピンに載っている ⑤タイヤ・ロックが走行状態(タイヤを格納してロック) ⑥4番扇動板をしまう ⑦道板をしまう、です。このうち⑤のタイヤの格納が、まだ残っています。', hl: function () { return []; } });
  add({ c: 11, t: 'スライド車軸を縮める', x: '伸ばした車軸を縮めて、走行の状態に戻します。伸ばした時の逆の手順です。「いまやること」に出る操作を、順番にやってください。', sub: tireInSub, hint: '「縮」は、右側のボタンの上から2番目です。', ring: 'tire', enter: function () { openPanel('tire'); }, hl: tireInHl, past: function () { return !!ctx.cycleDone; }, done: tireStowed, fix: function () { return Auto.tireSet(false); } });
  add({ c: 11, t: '道板をしまう', x: '最後に「道板をしまう」を押してください。足りない条件は、ここに出ます。', sub: function () { var u = unmet().filter(function (s) { return s.indexOf('道板') < 0; }); return u.length ? '残り: ' + u.join(' / ') : 'あと少し。「道板をしまう」を押す'; }, hint: 'まだ足りない条件が上に出ています。1つずつ直してください。', hl: function () { return MECH.ramp ? el('btnRamp') : []; }, done: function () { return !!ctx.cycleDone; }, fix: async function () { await Auto.stow(); } });
  add({ c: 11, info: true, t: 'イージー・ノーマル・ハードの違い', x: '難易度が上がるほど、ガイドが減って、ミスの扱いが厳しくなります。イージー: 通れない・積めない状態のとき、警告を出して車を止めます(進めない・OKにならない)。ノーマル・ハード: 止めずにそのまま進めますが、ミスとして記録して減点します(同じ理由は車1台につき1回)。ハードは、画面のヒントや状態表示も出ません。重いミス(-80点)の例: スライド車軸を伸ばさずに軽自動車以外が6番の横を通る、脱輪、駐車中の車にぶつかる、フロアが下がっているのに進む。軽いミス(-30点)の例: 道板が出ていない、すでに車があるスロットで止まる、6番に積めない車種で止まる。このチュートリアルは、イージーと同じ「警告して止める」形です。', hl: function () { return []; } });
  add({ c: 11, info: true, last: true, t: '配車への連絡と得点', x: '配車担当への連絡:時々、組み合わせ的にどうやっても積めない荷物が来ます。そのときは画面上の「配車に連絡」で伝えます(早いほどボーナス。積めるのに連絡すると減点)。得点:1台積むごとに加点、ミスで減点、荷姿が高すぎると減点。難易度が上がると倍率が上がります。ここで終わりです。「自由に練習」で、このまま触れます。', hl: function () { return el('btnDispatch'); } });

  // ---------- 進行 ----------
  var ctx = { i: 0, t0: 0, done: false, doneAt: 0, busy: false, review: false, cycleDone: false, min: false, warn: '', warnAt: 0, hlKey: '', ended: false };
  var panel, ring;

  function build() {
    panel = document.createElement('div'); panel.id = 'tutPanel';
    panel.innerHTML = '<div class="tutHead"><span class="tutChap"></span><span class="tutDots"></span><button type="button" class="tutFold" aria-label="パネルを折りたたむ">折りたたむ</button></div>' +
      '<div class="tutMini"></div><div class="tutBody"><div class="tutScroll"><div class="tutTitle"></div><div class="tutText"></div><div class="tutSub tutDone"></div><div class="tutHint" style="display:none"></div><div class="tutWarn"></div></div>' +
      '<div class="tutBtns"><button type="button" class="tutPrev">前へ</button><button type="button" class="tutMain grow">次へ</button><button type="button" class="tutEnd">終了(タイトルへ)</button></div></div>';
    var top = $('stickyTop'); top.appendChild(panel);
    ring = document.createElement('div'); ring.id = 'tutRing'; document.body.appendChild(ring);
    panel.querySelector('.tutPrev').addEventListener('click', function () { if (!ctx.busy && ctx.i > 0) go(ctx.i - 1, true); });
    panel.querySelector('.tutMain').addEventListener('click', onMain);
    panel.querySelector('.tutEnd').addEventListener('click', function () { location.href = window.TITLE_URL || 'title.html'; });
    panel.querySelector('.tutFold').addEventListener('click', function () { ctx.min = !ctx.min; render(); });
  }

  function stepAt(i) { return S[i]; }
  function go(i, review) {
    i = Math.max(0, Math.min(S.length, i));
    ctx.i = i; ctx.t0 = Date.now(); ctx.done = false; ctx.doneAt = 0; ctx.review = !!review; ctx.hlKey = '';
    if (i >= S.length) { finishTutorial(); return; }
    var s = S[i];
    if (!review && s.skip && safe(s.skip)) { go(i + 1, false); return; }   // この荷物では要らないステップ(例: 5番の輪止めを前へ寄せる)は飛ばす
    try { s.enter && s.enter(); } catch (e) { console.warn('tutorial enter', e); }
    render();
    setTimeout(function () { if (ctx.i === i) reveal(true); }, 350);
  }
  function finishTutorial() {
    ctx.ended = true; render();
  }
  async function onMain() {
    if (ctx.busy || ctx.ended) { if (ctx.ended) { ctx.ended = false; panel.style.display = 'none'; clearHl(); } return; }
    var s = S[ctx.i];
    if (s.info || ctx.done || (s.done && safe(s.done))) { go(ctx.i + 1, false); return; }
    if (!s.fix) { go(ctx.i + 1, false); return; }
    ctx.busy = true; render();
    try { await s.fix(); } catch (e) { console.warn('tutorial fix', e); }
    ctx.busy = false;
    go(ctx.i + 1, false);
  }
  function safe(f) { try { return !!f(); } catch (e) { return false; } }

  // ---------- 表示 ----------
  function render() {
    if (!panel) return;
    var s = S[ctx.i], total = S.length;
    if (window.VOICE_GUIDE && !ctx.ended) window.VOICE_GUIDE.step(s.t);   // ステップが変わった時、解説の声を鳴らす(voice_guide.js。声のファイルが無ければ鳴らない)
    var body = panel.querySelector('.tutBody');
    panel.classList.toggle('min', ctx.min);
    panel.querySelector('.tutFold').textContent = ctx.min ? '開く' : '折りたたむ';
    var dots = panel.querySelector('.tutDots');
    if (!dots.firstChild) { CHAPTERS.forEach(function () { dots.appendChild(document.createElement('i')); }); }
    var cur = ctx.ended ? CHAPTERS.length : s.c;
    Array.prototype.forEach.call(dots.children, function (d, k) { d.className = k < cur ? 'on' : (k === cur ? 'cur' : ''); });
    if (ctx.ended) {
      panel.querySelector('.tutChap').textContent = 'チュートリアル完了';
      panel.querySelector('.tutMini').textContent = 'おつかれさまでした。';
      panel.querySelector('.tutTitle').textContent = 'おつかれさまでした';
      panel.querySelector('.tutText').textContent = '操作とルールは一通り終わりです。車の積み方は人それぞれ。高さを抑えて、車が干渉しないならよいのです。今回のチュートリアルの7台も、実は色んな積み方があります。今後は自分で積み方を考えて、色々と試してみてください！このまま自由に練習するか(次の荷物が出ています)、タイトルに戻って他のモードで遊べます。';
      panel.querySelector('.tutSub').textContent = ''; panel.querySelector('.tutHint').style.display = 'none'; panel.querySelector('.tutWarn').textContent = '';
      panel.querySelector('.tutPrev').style.display = 'none';
      var m = panel.querySelector('.tutMain'); m.textContent = '自由に練習'; m.className = 'tutMain grow'; m.disabled = false;
      panel.querySelector('.tutEnd').textContent = 'タイトルへ';
      return;
    }
    var stepNo = 1; for (var q = 0; q < ctx.i; q++) if (S[q].c === s.c) stepNo++;
    var inChap = S.filter(function (z) { return z.c === s.c; }).length;
    panel.querySelector('.tutChap').textContent = (s.c + 1) + '/' + CHAPTERS.length + ' ' + CHAPTERS[s.c] + (inChap > 1 ? '(' + stepNo + '/' + inChap + ')' : '');
    panel.querySelector('.tutMini').textContent = SYMBOLS.fill(s.t, 'screen');
    panel.querySelector('.tutTitle').textContent = SYMBOLS.fill(s.t, 'screen');
    panel.querySelector('.tutText').textContent = SYMBOLS.fill(typeof s.x === 'function' ? s.x() : s.x, 'screen');
    panel.querySelector('.tutPrev').style.display = ctx.i > 0 && !ctx.busy ? '' : 'none';
    panel.querySelector('.tutPrev').disabled = ctx.busy;
    panel.querySelector('.tutEnd').textContent = '終了(タイトルへ)';
    updateDyn();
  }
  function updateDyn() {
    var s = S[ctx.i]; if (!s || ctx.ended) return;
    var sub = panel.querySelector('.tutSub'), hint = panel.querySelector('.tutHint'), warn = panel.querySelector('.tutWarn'), main = panel.querySelector('.tutMain');
    var txt = '';
    if (ctx.busy) txt = '先輩が代わりに実行しています…';
    else if (ctx.done) txt = 'できました。';
    else if (s.sub) { try { txt = s.sub() || ''; } catch (e) { txt = ''; } }
    txt = SYMBOLS.fill(txt, 'screen');
    var subTxt = txt && !ctx.done && !ctx.busy ? 'いまやること: ' + txt : txt;
    if (sub.textContent !== subTxt) sub.textContent = subTxt;
    sub.style.color = ctx.done || ctx.busy ? '' : '#ffe9a8'; sub.style.fontWeight = ctx.done || ctx.busy ? 'bold' : 'normal';
    var stuck = !ctx.done && !ctx.busy && !s.info && Date.now() - ctx.t0 > 12000;
    var h = stuck && s.hint ? 'ヒント: ' + SYMBOLS.fill(s.hint, 'screen') : '';
    if (hint.textContent !== h) hint.textContent = h;
    hint.style.display = h ? '' : 'none';
    var w = ctx.warn && Date.now() - ctx.warnAt < 5000 ? ctx.warn : '';
    if (warn.textContent !== w) warn.textContent = w;
    var label = s.info ? '次へ' : (ctx.done ? '次へ' : (s.fix ? '飛ばす(自動でやる)' : '次へ'));
    if (main.textContent !== label) main.textContent = label;
    main.className = 'tutMain grow' + (s.info || ctx.done ? '' : ' wait');
    main.disabled = !!ctx.busy;
    if (ctx.i === S.length - 1 && s.last) { if (main.textContent !== 'おわる') main.textContent = 'おわる'; }
  }

  // 強調: 部品に枠(.tutHi)、スイッチ枠は画面に重ねた枠(#tutRing)
  var hlEls = [];
  function clearHl() { hlEls.forEach(function (e) { e.classList.remove('tutHi'); }); hlEls = []; ring.style.display = 'none'; }
  function applyHl() {
    var s = S[ctx.i];
    if (!s || ctx.ended || ctx.done || ctx.busy) { clearHl(); return; }
    var els = [];
    try { els = s.hl ? s.hl() : []; } catch (e) { els = []; }
    var same = els.length === hlEls.length && els.every(function (e, k) { return e === hlEls[k]; });
    if (!same) { hlEls.forEach(function (e) { e.classList.remove('tutHi'); }); els.forEach(function (e) { e.classList.add('tutHi'); }); hlEls = els; if (els.length) reveal(false); }
    // スイッチ枠
    if (s.ring && !(window.SWITCH_UI && window.SWITCH_UI.current === s.ring)) {
      var groups = (cfg.newArt && cfg.newArt.switchGroups) || [], g = groups.filter(function (z) { return z.id === s.ring; })[0];
      if (g && window.VIEW) {
        var a = window.VIEW.stageToClient(g.rect[0], g.rect[1]), b = window.VIEW.stageToClient(g.rect[0] + g.rect[2], g.rect[1] + g.rect[3]);
        var pad = 8, x = Math.min(a.x, b.x) - pad, y = Math.min(a.y, b.y) - pad, w = Math.abs(b.x - a.x) + pad * 2, hh = Math.abs(b.y - a.y) + pad * 2;
        var cr = $('stage').getBoundingClientRect();
        var vis = w > 0 && x + w > cr.left && x < cr.right && y + hh > cr.top && y < cr.bottom;
        ring.style.cssText = 'display:' + (vis ? 'block' : 'none') + ';left:' + x + 'px;top:' + y + 'px;width:' + Math.max(w, 34) + 'px;height:' + Math.max(hh, 34) + 'px;';
      }
    } else ring.style.display = 'none';
  }
  // 強調した部品が、固定部分(ステージとパネル)に隠れている・画面の外なら、見える所までスクロールする
  function reveal(force) {
    var t = hlEls[0]; if (!t || !t.getBoundingClientRect) return;
    var top = $('stickyTop').getBoundingClientRect().bottom, r = t.getBoundingClientRect(), vh = window.innerHeight;
    if (r.height === 0) return;
    if (window.VIEW && VIEW.isCompactLand && VIEW.isCompactLand()) {   // スマホ横: 操作盤は右の列の中でスクロールするので、その中で見える所へ
      if (r.top < 4 || r.bottom > vh - 84) t.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    if (r.top < top + 4 || r.bottom > vh - 84) {
      var want = r.top - (top + Math.max(8, (vh - top - r.height) / 3));
      window.scrollBy({ top: want, behavior: 'smooth' });
    }
  }

  // 200msごとの判定
  function tick() {
    if (ctx.ended || !panel) return;
    var s = S[ctx.i]; if (!s) return;
    applyHl();
    if (!ctx.busy && !s.info && s.done) {
      var ok = safe(s.done), pastOk = !ok && s.past && safe(s.past);   // past: 後のステップまで進んでいて、このステップの状態はもう消えている(操作が速い人・飛ばした人)
      ok = ok || pastOk;
      if (ok && !ctx.done) { ctx.done = true; ctx.doneAt = Date.now(); ctx.fast = pastOk || Date.now() - ctx.t0 < 500; render(); }
      else if (!ok && ctx.done && !ctx.review) { ctx.done = false; ctx.doneAt = 0; }
      if (ctx.done && !ctx.review && Date.now() - ctx.doneAt > (ctx.fast ? 150 : 900)) { go(ctx.i + 1, false); return; }
    }
    updateDyn();
  }

  // ゲームの注意メッセージ(「フロアがセットピンに載っているので抜けません」など)を、パネルにも出す
  var oldNotify = window.FLOOR_MECH_NOTIFY;
  window.FLOOR_MECH_NOTIFY = function (msg, kind) { if (kind === 'warn') { ctx.warn = msg; ctx.warnAt = Date.now(); } return oldNotify && oldNotify.apply(this, arguments); };

  // ---------- 開始 ----------
  function start() {
    document.body.classList.add('tutorial');
    build();
    window.dispatchEvent(new Event('resize'));   // 横並び(PC)にした分、ステージの大きさを測り直す
    // 7台の積める組み合わせが引けるまで待ってから始める(最初のデッキは game.js が7台で引く)
    var tries = 0;
    (function wait() {
      if (plan() || tries++ > 150) { go(0, false); setInterval(tick, 200); return; }
      setTimeout(wait, 200);
    })();
  }
  window.TUTORIAL = {
    get active() { return !ctx.ended; },
    get step() { return ctx.i; },
    steps: S, chapters: CHAPTERS, ctx: ctx, plan: plan, unmet: unmet,
    go: function (i) { go(i, false); },
    onCycleComplete: function () { ctx.cycleDone = true; }
  };
  start();
})();
