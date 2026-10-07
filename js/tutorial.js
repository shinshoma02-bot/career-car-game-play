// チュートリアル(index.html#mode=tutorial)。中身は modes.js の sim(難易度なし・時間制限なし・解説あり)で、その上にステップ式のガイドを重ねる。
// ・ステップごとに「やること」を出し、game / floor_mech の状態を 200ms ごとに見て、できたら自動で次へ進む(判定は各ステップの done())
// ・判定が詰まったら(12秒)ヒントを出す。ゲームの注意メッセージ(FLOOR_MECH_NOTIFY)もパネルに写す
// ・「飛ばす(自動でやる)」は、そのステップをガイドが代わりに実行して状態をそろえる(fix)。前のステップを飛ばしても、次のステップが成り立つ
// ・車は7台。最初の荷物は game.js の TUTORIAL_DECK(車種を厳選した固定デッキ。カードに「○番用」と出る)。案内文には、その車の名前・高さ・長さと、その番号に入れる理由を書く(plan() の割り当て=LOADABLE.check の固定割り当て)
// ・実際の通しプレイ(.claude/test_play.js の fullRun7c)と同じ手順: 道板→タイヤ突出(ジャッキ→ロック解除→伸→ロック→ジャッキを戻す)→3番後ろを下げる→1→2→3→棚を上げてピン→5番スロープ→4→平らに→5→宙段→7→6→タイヤ格納→道板をしまう
(function () {
  'use strict';
  var GM = window.GAME_MODE, gs = window.GAME_STATE, fm = window.FLOOR_MECH, cfg = window.TRAILER_CONFIG;
  if (!GM || !GM.tutorial || !gs || !fm) return;
  var $ = function (id) { return document.getElementById(id); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var E = fm.ENDS, P = fm.PINS, MECH = fm.MECH;

  // ---------- 状態の読み取り ----------
  var planCache = null;
  // 7台の割り当て: スロット番号 → デッキの番号
  function plan() {
    var d = gs.deck, r = d && d.loadable;
    if (!d || d.length < 7 || !r || !r.ok || !r.assign || !r.order) return null;
    if (planCache && planCache.deck === d) return planCache;
    planCache = { deck: d, 1: r.order[0], 2: r.order[1], 3: r.order[2], 4: r.order[3], 5: r.assign[0], 6: r.assign[1], 7: r.assign[2], pin: r.bestPin || null, shelf: r.shelf || null, flip5: r.flip5 !== false, chock5: r.chock5 || 0 };
    return planCache;
  }
  var ORDER = ['1', '2', '3', '4', '5', '7', '6'];   // 積む順(7台のサイクルは、宙段の7台目→6番)
  function nonWait() { return gs.deck ? gs.deck.filter(function (d) { return d.status !== 'wait'; }).length : 0; }
  function locked(n) { var o = gs.occupied[n]; return !!(o && o.live && o.live.locked); }
  function called(n) { var c = gs.car; return !!(c && c.deckItem && c.deckItem.status === 'road' && c.phase !== 'exiting' && nonWait() >= ORDER.indexOf(n) + 1); }
  function seatedAt(n) { var c = gs.car; return !!(c && c.seated && String(c.slot) === n); }
  function lidOpen(n) { return !!gs.lidOpen[n]; }
  function chockSet(n) { return !!(gs.chocks[n] && gs.chocks[n].set); }
  function holeNo(k) { return P[k] === null ? null : fm.holeNo(k, P[k]); }
  // 棚を上げてピンで受けた状態(上げた高さ: 走行位置より約30px以上上)
  var RAISE_TH = { F1f: 4, F1r: 10, F2f: 8, MID: 84 };
  function raised(k) { return E[k].off <= RAISE_TH[k]; }
  function raisedRest(k) { return raised(k) && fm.rested(k) && P[k] !== null; }
  function f3rUp() { return fm.rested('F3r') && !fm.upperConnected() && E.F3r.off <= -10 && P.F3r !== null; }
  var FIT = fm.FIT_OFFS;
  // 固定デッキの案内: 番号 → 車(デッキの車カード)。名前・高さ・長さを案内文に出す
  function fixedDeck() { return !!(gs.deck && gs.deck.tutorialFixed); }
  function minHtxt() { return gs.deckMinH ? '約' + gs.deckMinH.toFixed(2) + 'm' : '約4.1m'; }
  function carOf(n) { var p = plan(); return p ? gs.deck[p[n]] : null; }
  function cname(n) { var it = carOf(n); if (!it) return '車'; var e = it.entry; return e.name + '(高さ' + (e.len * e.aspect).toFixed(2) + 'm・長さ' + e.len.toFixed(1) + 'm・幅' + (e.width || 0).toFixed(2) + 'm)'; }
  // タイヤ突出・格納の状態(台車のタイヤ)
  function jackDown() { return MECH.jack <= 0.1; }
  function tireDone() { return MECH.tireOut && MECH.lockR && MECH.lockL && jackDown(); }   // 突出して、ロックして、ジャッキを戻した
  function tireStowed() { return !MECH.tireOut && MECH.lockR && MECH.lockL && jackDown(); }   // 格納して、ロックして、ジャッキを戻した(走行状態)
  // 宙段を使う時の棚(2番前・3番前・3番後ろ)の高さは、判定(LOADABLE.check の shelf)が出した「宙段が当たらない最小の高さ」(ピンの穴)。
  // 2番前の上限は、5番が平らな時は freeTop(-23.5)まで(2026-10-07)。判定が無い時だけ、従来のピンの上限(FIT_OFFS)を使う
  function shelfT() {
    var p = plan();
    if (p && p.shelf) return p.shelf;
    var f2 = E.F2f.freeTop !== undefined ? Math.max(FIT.F2f, E.F2f.freeTop) : FIT.F2f;
    return { F2f: f2, MID: FIT.MID, F3r: FIT.F3r, holes: { F2f: fm.holeNo('F2f', f2), MID: fm.holeNo('MID', FIT.MID), F3r: fm.holeNo('F3r', FIT.F3r) } };
  }
  function f2Ok() { return E.F2f.off <= shelfT().F2f + 3 && fm.rested('F2f'); }
  function midOk() { return E.MID.off <= shelfT().MID + 3 && fm.rested('MID'); }
  function f3rOk() { return E.F3r.off <= shelfT().F3r + 2 && fm.rested('F3r'); }
  function hangPrepOk() { return f2Ok() && midOk() && f3rOk(); }
  function stopPinHole() { var p = plan(); return p && p.pin ? p.pin : (fm.stopPin ? fm.stopPin.hole : 1); }
  function stopPinOk() { return !!fm.stopPin && fm.stopPin.inserted && fm.stopPin.hole === stopPinHole(); }
  function loadU() { return (cfg.hangFloor && cfg.hangFloor.loadU) || 2; }
  function hangUpOk() { return !!gs.occupied['7'] && fm.rested('F7') && MECH.hang > 0.01; }
  function f5Flat() { return fm.atTravel('F5') && MECH.stopper && !MECH.hook && !MECH.bridge && fm.bridgeT() <= 0; }

  // サイクル完了の条件(modes.js の cycleComplete と同じ見方)で、足りないものを日本語で返す
  function unmet() {
    var out = [], n;
    ['1', '2', '3', '4', '5', '6', '7'].forEach(function (k) { if (!gs.occupied[k]) out.push(k + '番の車が未積載'); });
    ['1', '2', '3', '4', '5', '6', '7'].forEach(function (k) { if (gs.occupied[k] && !locked(k)) out.push(k + '番の車をタップで固定'); });
    if (['F1f', 'F1r', 'F2f', 'MID', 'F3r'].some(function (k) { return !fm.rested(k); })) out.push('棚(1・2・3番)がセットピンに載っていない');
    if (!fm.atTravel('F5')) out.push('5番フロアが平らでない');
    if (MECH.hang > 0.01 && !fm.rested('F7')) out.push('宙段が固定ピンに載っていない');
    if (MECH.tireOut || !MECH.lockR || !MECH.lockL) out.push('タイヤ・ロックが走行状態でない');
    if (MECH.bridge || fm.bridgeT() > 0) out.push('扇動板が出たまま');
    if (MECH.ramp || fm.rampT() > 0) out.push('道板が出たまま');
    return out;
  }

  // ---------- 自動実行(「飛ばす」用。通しプレイ検証 .claude/test_play.js と同じ操作を公開APIで行う) ----------
  var Auto = {};
  Auto.unpin = async function (k) { if (P[k] !== null) { fm.togglePin(k); await sleep(50); } };
  // ピンに載っている(ピンより下にいる棚も同じ)と抜けないので、少しずつ上げて抜く(棚を下げる動きの前に必要)
  Auto.unpinHard = async function (k) {
    if (P[k] === null) return;
    fm.togglePin(k); await sleep(50);
    for (var i = 0; i < 12 && P[k] !== null; i++) { fm.holdStart(k, -1); await sleep(250); fm.holdStop(); await sleep(80); fm.togglePin(k); await sleep(50); }
  };
  Auto.move = async function (k, target) {
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
    var car = gs.car, btn = $('btnLeft');
    function ev(t) { btn.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true })); }
    async function press(ms) { ev('mousedown'); await sleep(ms); ev('mouseup'); }
    function tgt() { var st = gs.activeStop(n); return st ? car.arc[n] - st.dx - 8 : null; }
    for (var i = 0; i < 900; i++) {
      if (car.seated || gs.frozen) break;
      var t = tgt(); if (t === null) break;
      var d = t - car.progress;
      if (d > 220) { ev('mousedown'); await sleep(60); }
      else { ev('mouseup'); await sleep(250); if (d > 25) await press(70); else if (d > 4) await press(25); else { await sleep(200); if (!car.seated) await press(20); } }
    }
    ev('mouseup'); await sleep(500);
  };
  Auto.tap = async function () {
    var car = gs.car; if (!car || car.locked) return;
    var x = car.x - car.leftTireX + car.w / 2, y = car.y - car.h / 2, c = window.VIEW.stageToClient(x, y);
    $('stage').dispatchEvent(new MouseEvent('click', { clientX: c.x, clientY: c.y, bubbles: true }));
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
  // 棚 k を、ピンの穴 h の高さに上げ下げして、その穴にピンを刺して載せる(穴を指定)
  Auto.restHole = async function (k, h) {
    var e = E[k], off = fm.offOfHole(k, h);
    await Auto.unpinHard(k);
    for (var i = 0; i < 5; i++) { await Auto.move(k, off - 3); if (e.off <= off + 0.3) break; }   // 穴より上まで動かす(ピンは棚の下にしか刺せない)
    while (fm.pinTarget(k) < h) fm.stepPinTarget(k, 1);
    while (fm.pinTarget(k) > h) fm.stepPinTarget(k, -1);
    fm.togglePin(k); await sleep(60);
    fm.holdStart(k, 1);
    for (var g = 0; g < 400; g++) { await sleep(15); if (fm.rested(k) && Math.abs(e.off - off) < 0.6) break; }
    fm.holdStop(); await sleep(60);
  };
  Auto.hangPrep = async function () {
    var sh = shelfT();
    await Auto.restHole('MID', sh.holes.MID);   // 3番前を先に(3番後ろがシーソーで動くので、3番後ろは最後)
    if (sh.holes.F2f > E.F2f.holeMax) await Auto.restExt('F2f', sh.F2f + 0.6); else await Auto.restHole('F2f', sh.holes.F2f);
    await Auto.restHole('F3r', sh.holes.F3r);
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
  Auto.tireSet = async function (out) { await Auto.tireMove(out); await Auto.lockAll(); await Auto.jackDown(); };
  Auto.stow = async function () { if (MECH.ramp) fm.toggleRamp(); for (var i = 0; i < 80 && (MECH.ramp || fm.rampT() > 0); i++) await sleep(100); };

  // ---------- ステップ ----------
  // c: 章 / t: 見出し / x: 説明 / sub: いまやること(状態で変わる) / hint: 詰まった時 / info: 説明だけ(「次へ」で進む)
  // done: 達成判定 / fix: 飛ばした時にガイドが代わりにやること / enter: 開始時の画面の準備 / hl: 強調する部品 / ring: 強調するスイッチ枠
  var CHAPTERS = ['画面の見方', '道板を出す', 'タイヤを突出する', '上段につなぐ', '上段に積む', '棚を上げて固定', '5番をスロープに', '5番に積む', '宙段(7台目)', '6番に積む', 'サイクル完了'];
  var S = [];
  function add(o) { S.push(o); return o; }
  function swCard(i) { var c = document.querySelectorAll('#swPanel .swCard'); return c[i] ? [c[i]] : []; }
  function openPanel(id) { if (window.SWITCH_UI && window.SWITCH_UI.current !== id) window.SWITCH_UI.open(id); }
  function el(id) { var e = $(id); return e ? [e] : []; }
  function deckHl(n) {
    var p = plan(), drawer = $('deckDrawer');
    if (drawer && !drawer.classList.contains('open')) return el('deckDrawerHandle');
    var box = p && $('deckAll') ? $('deckAll').children[p[n]] : null;
    return box ? [box] : el('deckAll');
  }
  function slotBtn(n) { var b = document.querySelector('#slotSel button[data-slot="' + n + '"]'); return b ? [b] : []; }
  function endCardSub(k) {   // 棚の端1つを「上げる→ピンを差す→下げて載せる」時の、いまやること
    if (raisedRest(k)) return '出来ました。';
    var pinFar = P[k] !== null && P[k] > E[k].off + 14;
    if (P[k] !== null && !raised(k)) return fm.rested(k) && E[k].off >= P[k] - 1 ? '① ▲を一瞬だけ押して、棚をピンから浮かせる → ②「抜く」でピンを抜く(走行位置のピン)' : '②「抜く」ボタンでピンを抜く';
    if (!raised(k)) return '③ ▲を押し続けて、止まるまで(一番上まで)上げる';
    if (P[k] === null) return '④「ピン」ボタンを押す(棚の少し下の穴の番号が自動で入っています)';
    if (pinFar) return 'ピンが下の穴のままです。「抜く」で一度抜いて、上の穴に差し直す';
    return '⑤ ▼を押して、棚をピンに載せる(「載った」とは、棚がピンの高さまで下がって止まること)';
  }
  // 5番の輪止めを前(キャビン側)へ寄せる(宙段が持ち上がる時に、5番の車の鼻が当たらないように。判定が必要と出した時だけ。この荷物では不要)
  function chock5Step() {
    add({ c: 7, t: '5番: 輪止めを前へ寄せる', skip: function () { var p = plan(); return !p || !p.chock5; }, x: function () { var p = plan(); return '5番の輪止めは、前(キャビン側)へ最大44cm(4cm刻み)動かせます。この車は、宙段を持ち上げる時に鼻が当たらないよう、5番の位置を前へ ' + (p ? p.chock5 * 4 : 0) + 'cm(' + (p ? p.chock5 : 0) + '段)寄せます。「輪止めを前へ」を ' + (p ? p.chock5 : 0) + ' 回押してください(4番の車の後ろ端にはぶつかりません)。'; }, sub: function () { var p = plan(), c = gs.chocks['5']; return '輪止めを前へ ' + (p ? p.chock5 : 0) + ' 回(いま ' + (c && c.set ? -c.step : 0) + ' 段)'; }, hint: 'スロット「5」を選んで、「輪止めを前へ」ボタンを押します。', hl: function () { return el('btnChockFront'); }, done: function () { var p = plan(), c = gs.chocks['5']; return !p || !p.chock5 || !!(c && c.set && c.step <= -p.chock5); }, fix: async function () { var p = plan(); for (var i = 0; p && i < p.chock5; i++) { $('btnChockFront').click(); await sleep(60); } } });
  }
  function loadSteps(n, o) {
    var k = ORDER.indexOf(n) + 1, say = n + '番';
    var wantFlip = function () { return typeof o.flip === 'function' ? !!o.flip() : !!o.flip; };   // 5番の向き(判定の結果で変わる。true=後ろ向き(バック))
    if (o.lid) add({ c: o.c, t: say + ': 落し蓋を開ける', x: o.lidText, hint: '下のスロット番号ボタン「' + n + '」を押してから、「落し蓋を開ける」を押します。', hl: function () { return lidOpen(n) ? [] : (gs.targetSlot === n ? el('btnLid') : slotBtn(n)); }, done: function () { return lidOpen(n); }, fix: function () { return Auto.lid(n); } });
    if (o.chock) add({ c: o.c, t: say + ': 輪止めをセット', x: o.chockText, hint: '下のスロット番号ボタン「' + n + '」を押してから、「輪止めをセット」を押します。', hl: function () { return chockSet(n) ? [] : (gs.targetSlot === n ? el('btnChockSet') : slotBtn(n)); }, done: function () { return chockSet(n); }, fix: function () { return Auto.chock(n); } });
    if (n === '5') chock5Step();
    add({ c: o.c, t: say + ': 車を呼ぶ', x: o.callText, sub: function () { var c = gs.car; if (wantFlip() && c && !c.flip && called(n)) return '向きが前向きです。「後ろ向き(バック)」に切り替えてください(車の下のボタン)'; if (!wantFlip() && c && c.flip && called(n)) return '向きが後ろ向きです。「前向き」に戻してください(車の下のボタン)'; return wantFlip() ? '黄色い枠の車の「向き」を「後ろ向き(バック)」にしてから、車をタップ' : '黄色い枠の車をタップ(入場します。向きは前向きのまま)'; },
      hint: '車の一覧が閉じていたら、「車の一覧」を押して開きます。黄色い枠の車をタップすると、道板の手前に入場します。' + (o.flip ? '呼んだ後でも、動かす前なら向きを切り替えられます。' : ''),
      hl: function () { var c = gs.car; if (wantFlip() && called(n) && c && !c.flip) { var b = document.querySelector('#deckAll .deckItem.road button'); return b ? [b] : deckHl(n); } return called(n) ? [] : deckHl(n); },
      past: function () { return seatedAt(n) || locked(n); }, done: function () { return called(n) && (wantFlip() ? gs.car.flip : !gs.car.flip); }, fix: function () { return Auto.callCar(n, wantFlip()); } });
    add({ c: o.c, t: say + ': 進めて止める', x: o.driveText, hint: '右下の ◀(前進)ボタンを押している間、車が進みます。離すと惰性でゆっくり止まります。輪止め(落し蓋の穴)の手前で離し、あとは短くチョンチョン押して寄せます。通り過ぎたら ▶(後退)で戻れます。', hl: function () { return seatedAt(n) ? [] : el('btnLeft'); }, done: function () { return seatedAt(n) || locked(n); }, fix: function () { return Auto.callCar(n, wantFlip()).then(function () { return Auto.drive(n); }); } });
    add({ c: o.c, t: say + ': タップで固定', x: '前輪が止まると「OK」が出ます。そのOKの車を、もう一度タップして固定してください。固定すると次の車を呼べます(固定しないと、他の車は呼べません)。', hint: '画面の車の絵を直接タップします(ボタンではありません)。スマホで小さい時は、ダブルタップで画面を拡大できます。', done: function () { return locked(n); }, fix: function () { return Auto.tap(); } });
  }

  // 1. 画面の見方
  add({ c: 0, info: true, t: 'トレーラーとフロア番号', x: '上の絵が、車を積むトレーラー(キャリアカー)です。車を載せる床を「フロア」と呼び、上の段が1・2・3番、下の段が4・5・6番。下の段の5番と6番の間に浮いている短い棚が「宙段(7番)」で、7台目はここに載せます。', hl: function () { return el('stageWrap'); } });
  add({ c: 0, info: true, t: '操作盤', x: '画面の中ほどが操作盤です。「道板を出す」「扇動板を搬出」などの大きなボタン(道板=車が乗る坂、扇動板=フロア同士をつなぐ板)と、下のスロット番号1〜6(輪止めと落し蓋の操作)があります。棚(フロア)を上げ下げするスイッチは、トレーラー上の光る枠をタップするとここに出ます。', hl: function () { return el('floorPanel').concat(el('chockPanel')); } });
  add({ c: 0, info: true, t: '車カード', x: function () { return '一番下が車の一覧(車カード)です。このチュートリアルは7台。車をタップすると道板の手前に入場し、右下の ◀ ▶ ボタンで前後に動かします。カードの「幅」は6番に載せられるかの目安(6番は1.755m以下)。積む順番は、黄色い枠で教えます。' + (fixedDeck() ? '今回の7台は、高さと長さを考えて選んだ組み合わせです。各カードに「○番用」と出ています。1番はセダン、4番はスポーツタイプ(どちらも高さ約1.4mの背の低い車)、2番はミニバン、3番はSUV(背の高い車)、5番はハッチバック(長さ3.9mと短く、ボンネットが低い車)、宙段(7番)はいちばん背の低いスポーツタイプ(1.24m)、6番は幅1.755m以下のコンパクトカーです。理由は、その番号の車を呼ぶところで説明します。' : ''); }, hl: function () { return el('controls'); }, enter: function () { var h = $('deckDrawerHandle'); var d = $('deckDrawer'); if (h && d && !d.classList.contains('open')) h.click(); } });

  // 2. 道板
  add({ c: 1, t: '道板を出す', x: '車はトレーラーの後ろの「道板」(坂)から乗ります。積み込みの前に、まず道板を出しましょう。「道板を出す」ボタンを押してください。', hint: '操作盤の一番上の「道板を出す」ボタンです。画面の下の方にあるので、スクロールしてください。', hl: function () { return MECH.ramp ? [] : el('btnRamp'); }, done: function () { return fm.rampReady(); }, fix: Auto.ramp });

  // 2.5 タイヤを突出する(台車のタイヤ。6番の横を軽自動車以外が通るために必要。実操作は floor_mech の jackHoldStart/setLock/moveTire)
  function tireSub(what) {
    return function () {
      var lk = '右=' + (MECH.lockR ? 'ロック' : '解除') + ' / 左=' + (MECH.lockL ? 'ロック' : '解除');
      if (what === 'jack') return fm.tireOffGround() ? '出来ました(タイヤが浮いています)。' : 'アウトリガーの ▼ を押し続ける(タイヤが地面から浮くまで)';
      if (what === 'unlock') return '「右引」と「左引」を押す(いま ' + lk + ')';
      if (what === 'out') return '「伸」を押す(いま ' + (MECH.tireOut ? '突出している' : '格納されている') + ')';
      if (what === 'lock') return '「右押」と「左押」を押す(いま ' + lk + ')';
      return 'アウトリガーの ▲ を押し続ける(脚が全部縮むまで)';
    };
  }
  add({ c: 2, info: true, t: 'なぜタイヤを突出させるのか', x: 'トレーラーの台車(後ろの車軸)のタイヤは、突出させていない時、6番の横を通れるのは軽自動車(幅1.48m以下)だけです。それ以外の車は、6番を通り過ぎて5番・4番・宙段(7番)へ行けません(イージーは警告して止まり、ノーマル・ハードは止まらずに重いミスになります)。なお、6番に「積む(止まる)」のは、軽自動車と5ナンバー(幅1.755m以下)なら、突出の有無に関係なくできます。つまり、6番以外(5・4・7番)に積む車は、軽自動車でない限り、先にタイヤを突出させておく必要があります。今回は4番に入るセダンが軽自動車ではないので、積み始める前に突出させます。', hl: function () { return el('stageWrap'); } });
  add({ c: 2, t: 'アウトリガー・タイヤ操作盤を開く', x: 'タイヤの操作盤は、トレーラー後ろ寄りの車軸のあたりの光る枠(アウトリガーとタイヤ操作盤)です。タップして、画面の下に操作盤を出してください。', hint: '絵の右寄り、後ろの車軸(タイヤ)のあたりに光る枠が2つあります。どちらをタップしても同じ操作盤が出ます。', ring: 'tire', past: tireDone, done: function () { return window.SWITCH_UI.current === 'tire'; }, fix: function () { openPanel('tire'); } });
  add({ c: 2, t: 'ジャッキでタイヤを浮かせる', x: 'タイヤが地面に着いたままだと、車軸は動かせません。操作盤の左の「アウトリガー」(トレーラーの後ろを持ち上げる脚=ジャッキ)の ▼ を押し続けて脚を伸ばし、台車のタイヤを地面から浮かせます。', sub: tireSub('jack'), hint: '▼は押している間だけ脚が伸びます。トレーラーの後ろが少し持ち上がって、タイヤが浮いたら離します。', enter: function () { openPanel('tire'); }, hl: function () { return swCard(0); }, past: tireDone, done: function () { return fm.tireOffGround() || MECH.tireOut; }, fix: Auto.jackUp });
  add({ c: 2, t: '車軸のロックを解除する', x: '車軸には、走行中にタイヤが動かないようにするロックが、左右に1つずつ付いています。操作盤の右側のボタン(上から 伸・縮・右押・右引・左押・左引)のうち、「右引」と「左引」を押して、左右のロックを両方解除します。', sub: tireSub('unlock'), hint: '「引」がロック解除、「押」がロックです。右と左、2つとも「引」を押します。タイヤが浮いていないと(前のステップ)、車軸は動かせません。', enter: function () { openPanel('tire'); }, hl: function () { return swCard(1); }, past: tireDone, done: function () { return (!MECH.lockR && !MECH.lockL) || MECH.tireOut; }, fix: Auto.unlock });
  add({ c: 2, t: 'タイヤを突出させる(伸)', x: '一番上の「伸」ボタンを押すと、台車のタイヤが外側へ張り出します(突出)。これで、軽自動車以外の車も、6番の横を通れるようになります。', sub: tireSub('out'), hint: '「伸」は操作盤の右側のボタンの一番上です。ロックが掛かっていると動かないので、前のステップで両方解除します。', enter: function () { openPanel('tire'); }, hl: function () { return swCard(1); }, past: tireDone, done: function () { return MECH.tireOut; }, fix: function () { return Auto.tireMove(true); } });
  add({ c: 2, t: 'ロックを掛ける', x: '突出した位置で固定するため、「右押」と「左押」を押して、左右のロックを両方掛けます。', sub: tireSub('lock'), hint: '「押」がロックです。右と左、2つとも押します。', enter: function () { openPanel('tire'); }, hl: function () { return swCard(1); }, past: tireDone, done: function () { return MECH.tireOut && MECH.lockR && MECH.lockL; }, fix: Auto.lockAll });
  add({ c: 2, t: 'ジャッキを戻す', x: 'アウトリガーの ▲ を押し続けて、脚を縮めます。タイヤが地面に着くと、台車の車高が少し下がります(エアサスの分。絵でトレーラーの後ろが少し下がります)。これでタイヤの突出は完了です。', sub: tireSub('jackup'), hint: '▲は押している間だけ脚が縮みます。脚が全部縮むまで押し続けてください。', enter: function () { openPanel('tire'); }, hl: function () { return swCard(0); }, done: tireDone, fix: Auto.jackDown });

  // 3. 上段につなぐ
  add({ c: 3, t: '後ろ側のスイッチを開く', x: '上の段(1〜3番)に積むには、3番フロアの後ろ端を下げて、道板につなぎます。まず、トレーラーの後ろ寄り(中央の柱の下あたり)の光っているスイッチ枠をタップして、操作盤を出してください。', hint: '絵の中央よりやや右、柱の下にある小さなスイッチが「後ろ側(3番・宙段)」です。タップすると、画面の下に「3番 前・3番 後・宙段」の操作盤が出ます。', ring: 'rear', done: function () { return window.SWITCH_UI.current === 'rear'; }, fix: function () { openPanel('rear'); } });
  add({ c: 3, t: '3番 後: ピンを抜く', x: '棚は、柱の穴に差した「セットピン」(棚を受ける差し込み棒)の上に載って固定されています。載っている間はピンが抜けないので、先に ▲(上)を一瞬押して棚を浮かせ、それから「抜く」を押します。', sub: function () { return fm.rested('F3r') && E.F3r.off >= P.F3r - 1 ? '▲を一瞬だけ押して、棚をピンから浮かせる' : '「抜く」ボタンを押す'; }, hint: '「棚がセットピンに載っているので抜けません」と出たら、▲をもう一瞬押してから「抜く」を押します。', enter: function () { openPanel('rear'); }, hl: function () { return swCard(1); }, past: function () { return !!gs.occupied['1']; }, done: function () { return P.F3r === null; }, fix: async function () { openPanel('rear'); if (P.F3r !== null) { fm.holdStart('F3r', -1); await sleep(300); fm.holdStop(); await sleep(100); await Auto.unpin('F3r'); } } });
  add({ c: 3, t: '3番 後: 道板まで下げる', x: 'ピンを抜けたので、▼(下)を押し続けて3番の後ろ端を下げます。道板の高さまで下がって接地すると、坂がつながります(画面に「3番↔下段(道板)つながり」と出ます)。', hint: '▼は押している間だけ動きます。下がりきるまで押し続けてください。', enter: function () { openPanel('rear'); }, hl: function () { return swCard(1); }, past: function () { return !!gs.occupied['1']; }, done: function () { return fm.upperConnected(); }, fix: Auto.connect });

  // 4. 上段に積む
  loadSteps('1', { c: 4, callText: function () { return 'これで上の段に車が上がれます。上段は奥の1番から順に積みます(車は後ろから前へ進むので、先に奥の1番を埋めます)。「1番用」の黄色い枠の車、' + cname('1') + 'をタップして呼びましょう。' + (fixedDeck() ? '1番に背の低い車を選ぶ理由: 1番は棚の位置が高い場所で、しかも下の4番の車の屋根が高いと、1番の棚がさらに押し上げられるからです(4番の車は後で積みます)。' : ''); }, driveText: '右下の ◀ で前進します。1番は、フロアの先端の輪止め(車止め)に前輪が当たって止まります。勢いが強いと乗り越えてしまうので、近づいたら離して、チョンチョン押して寄せます。止まると「OK」と出ます。' });
  loadSteps('2', { c: 4, lid: true, lidText: '2番・3番には輪止めがなく、床の「落とし穴」にタイヤを落として止めます。その穴にはふた(落し蓋)があって、閉じたままだと車はそこを通過します。2番に積むので、スロット「2」を選んで「落し蓋を開ける」を押してください。', callText: function () { return '2番の蓋を開けました。次は「2番用」の黄色い枠の車、' + cname('2') + 'を呼びます。' + (fixedDeck() ? '2番に背の高い車(ミニバン)を入れる理由: 宙段を使う7台のサイクルでは、宙段とその上の7台目の真上に来る3番 前(継ぎ目)の棚だけを高く上げます。2番 前と3番 後ろは宙段の上を外れるので低いままでよく、棚を傾けて使えます。このデッキの最小の荷姿は' + minHtxt() + 'で、背の高い車を2番・3番に入れても、1番・4番に入れた場合とほとんど変わりません(目安: 2番・3番に入れて約4.07m、1番・4番に入れて約4.04m)。だから背の高い車は2番・3番、背の低い車は1番・4番に回します。' : ''); }, driveText: '◀ で前進。3番の蓋は閉じているので通り過ぎ、2番の穴にタイヤが落ちて止まります。' });
  loadSteps('3', { c: 4, lid: true, lidText: '3番も同じです。スロット「3」を選んで、「落し蓋を開ける」を押してください(2番の蓋は積んだ後なのでそのまま)。', callText: function () { return '3番に積む「3番用」の黄色い枠の車、' + cname('3') + 'を呼びます。' + (fixedDeck() ? '3番にも背の高い車(SUV)を入れます。3番 前(継ぎ目)の棚は宙段のために高く上げますが、3番 後ろは低くできるので、車の背が高くても荷姿はあまり高くなりません。' : ''); }, driveText: '◀ で前進。手前の3番の穴で止まります。' });

  // 5. 棚を上げて固定
  add({ c: 5, t: '前側のスイッチを開く', x: '上段に積み終わったら、棚(フロア)を上げて、セットピンで固定します。下の段に車を入れる時に、上の棚が低いとぶつかるからです。また、積んだ車の重さを、油圧だけでなくピンでも支えます。まず、トレーラー前寄りの光るスイッチ枠(1番・2番)をタップしてください。', hint: '絵の左寄り、運転席の後ろの柱の近くにあるスイッチ枠が「前側(1番・2番)」です。', ring: 'front', done: function () { return window.SWITCH_UI.current === 'front'; }, fix: function () { openPanel('front'); } });
  add({ c: 5, t: '1番 前: 上げてピンで固定', x: 'セットピンは「棚の少し下」の穴に差し、そのピンに棚を載せます。手順: ピンを抜く → ▲で上へ → ピンを差す → ▼で棚をピンに載せる。ピンの穴の番号は、棚の少し下が自動で入ります。下げる時は、いったん上げてからピンを抜きます(載ったままでは抜けません)。', sub: function () { return endCardSub('F1f'); }, hint: '「抜く(13)」のような表示は、いま差しているピンの穴番号です。棚が載っているとピンは抜けないので、▲で少し浮かせてから抜きます。', enter: function () { openPanel('front'); }, hl: function () { return swCard(0); }, done: function () { return raisedRest('F1f'); }, fix: async function () { openPanel('front'); await Auto.rest('F1f', -3); } });
  add({ c: 5, t: '1番 後・2番 前も同じ手順', x: '同じ手順で、1番 後(2枚目)と2番 前(3枚目)も、上まで上げてピンに載せてください。2番 前は、上の方では▲を押し続けると5番フロアの持ち上げにも使うので、ピンに載せたところで止めます。', sub: function () { return raisedRest('F1r') ? '2番 前: ' + endCardSub('F2f') : '1番 後: ' + endCardSub('F1r'); }, hint: '1番 後 → 2番 前 の順にやると分かりやすいです。2番 前は「ピンを抜く」ときに5番フロアが関係するメッセージが出たら、5番が平らか確認します。', enter: function () { openPanel('front'); }, hl: function () { return raisedRest('F1r') ? swCard(2) : swCard(1); }, done: function () { return raisedRest('F1r') && raisedRest('F2f'); }, fix: async function () { openPanel('front'); await Auto.rest('F1r', -3); await Auto.rest('F2f', -3); } });
  add({ c: 5, t: '3番 前(継ぎ目)も上げる', x: '次は後ろ側のスイッチ(3番)です。操作盤を後ろ側に切り替えました。1枚目の「3番 前(継ぎ目)」を、同じ手順で上げてピンに載せます。3番 前を上げると、シーソーのように3番 後が下がりますが、次に直します。', sub: function () { return endCardSub('MID'); }, enter: function () { openPanel('rear'); }, hl: function () { return swCard(0); }, done: function () { return raisedRest('MID'); }, fix: async function () { openPanel('rear'); await Auto.rest('MID', -3); } });
  add({ c: 5, t: '3番 後: 走行位置の高さまで上げる', x: '3番 後は、道板につないだ位置から、元の高さ(走行位置)まで ▲ で上げて、ピンを差して載せます(道板からは離れます)。', sub: function () { if (f3rUp()) return '出来ました。'; if (P.F3r !== null && !f3rUp()) return fm.upperConnected() || E.F3r.off > -10 ? '▲で上へ。一度ピンを抜いてから上げます' : '▼でピンに載せる'; return E.F3r.off > -24 ? '▲で上へ(走行位置の高さまで)' : '「ピン」を差して、▼で載せる'; }, hint: '3番 前を上げた後、3番 後が下がっていることがあります。▲で上げ直してください。', enter: function () { openPanel('rear'); }, hl: function () { return swCard(1); }, done: function () { return f3rUp() && raisedRest('MID'); }, fix: async function () { openPanel('rear'); await Auto.rest('F3r', -24); await Auto.rest('MID', -3); await Auto.rest('F3r', -24); } });

  // 6. 5番フロアをスロープに
  add({ c: 6, info: true, t: '下段へ: 5番をスロープにする', x: '次は下の段の4番です。4番は一番前にあり、5番フロアの上を通って行きます。5番を持ち上げて4番の高さにそろえ、4番との間に「扇動板」(つなぎの橋)を出して、坂を作ります。', hl: function () { return el('floorPanel'); } });
  add({ c: 6, t: '2番 前の ▼ を長押し', x: '5番フロアは、2番 前のシリンダーの余力で持ち上がります。2番 前がピンに載っている状態で ▼ を押し続けると、ワンテンポ(約1秒)待ってから5番が上がり始めます。4番の高さまで上がって、ストッパー(引っかけ金具)が掛かるまで押し続けてください。', sub: function () { return !fm.rested('F2f') ? '2番 前がピンに載っていません。前のステップの手順で載せてください' : (MECH.lift > 0 ? '5番が上がっています。そのまま押し続ける' : '▼を押し続ける(約1秒たつと5番が動き出します)'); }, hint: '押し直さず、長押しのままワンテンポ待ちます。途中で離すと5番が中途半端な高さで止まります。5番は、4番の床と同じ高さまで上げます。', enter: function () { openPanel('front'); }, hl: function () { return swCard(2); }, past: function () { return !!gs.occupied['4']; }, done: function () { return fm.f5Slope(); }, fix: async function () { openPanel('front'); fm.holdStart('F2f', 1); for (var g = 0; g < 500 && MECH.lift < 62; g++) await sleep(30); fm.holdStop(); await sleep(150); } });
  add({ c: 6, t: '2番 前を ▲ で戻す', x: '5番はストッパーに掛かって、4番の高さのまま止まります。2番 前は ▲ を押し続けて、元のピンの位置まで戻します(5番は上がったまま)。', hint: '▲を押し続けると、2番 前がピンの高さまで戻って止まります。', enter: function () { openPanel('front'); }, hl: function () { return swCard(2); }, past: function () { return !!gs.occupied['4']; }, done: function () { return fm.f5Slope() && MECH.lift <= 0; }, fix: async function () { fm.holdStart('F2f', -1); for (var h = 0; h < 500 && MECH.lift > 0; h++) await sleep(30); fm.holdStop(); await sleep(200); } });
  add({ c: 6, t: '扇動板を搬出', x: '4番と5番の間に扇動板を出します。「扇動板を搬出」を押してください。5番がスロープの状態でないと、板が届きません。', hint: '「扇動板を搬出」を押すと、板が伸びて4番と5番がつながります。つながるまで1秒ほどかかります。', hl: function () { return MECH.bridge ? [] : el('btnBridge'); }, past: function () { return !!gs.occupied['4']; }, done: function () { return fm.bridgeReady(); }, fix: Auto.bridgeOut });
  loadSteps('4', { c: 6, callText: function () { return 'これで4番へ行けます。「4番用」の黄色い枠の車、' + cname('4') + 'を呼んでください。道板→5番(スロープ)→扇動板→4番と進みます。' + (fixedDeck() ? '4番に背の低い車(スポーツタイプ 1.44m)を選ぶ理由: 4番の車の屋根が高いと、その上の1番の棚を押し上げてしまうからです。また、この車は軽自動車ではないので、6番の横を通るためにタイヤの突出が必要でした(先に済ませてあります)。' : ''); }, driveText: '◀ で前進します。4番は、前側に元からある輪止めに当たって止まります。扇動板の上は一度止まらずに渡りきると楽です。' });

  // 7. 5番を平らにして5番へ
  add({ c: 7, t: '扇動板を格納', x: '4番に積めました。次は5番に積みます。5番を平らに戻すので、まず扇動板をしまいます。「扇動板を格納」を押してください。', hl: function () { return MECH.bridge ? el('btnBridge') : []; }, past: function () { return !!gs.occupied['4'] && f5Flat(); }, done: function () { return !MECH.bridge && fm.bridgeT() <= 0; }, fix: Auto.bridgeIn });
  add({ c: 7, t: '5番を持ち上げ直す', x: '5番は、ストッパーの引っかけ金具で4番の高さに掛かっています。これを外すために、もう一度2番 前の ▼ を長押しして、5番を一段上へ持ち上げます。', hint: 'ワンテンポ待ってから5番が上がります。「5番を4番の高さより上げてから外してください」と出たら、もう少し上げます。', enter: function () { openPanel('front'); }, hl: function () { return swCard(2); }, past: function () { return !!gs.occupied['4'] && f5Flat(); }, done: function () { return MECH.lift >= -(cfg.floor5.hookOff) - 1 || !MECH.stopper || (fm.atTravel('F5') && !MECH.bridge); }, fix: async function () { fm.holdStart('F2f', 1); for (var a = 0; a < 400 && MECH.lift < 62; a++) await sleep(30); fm.holdStop(); await sleep(150); } });
  add({ c: 7, t: 'ストッパーを外す', x: '5番を一段上げたので、金具が浮きました。操作盤の「5番ストッパーを外す」を押してください。', hl: function () { return MECH.stopper ? el('btnStopper') : []; }, past: function () { return !!gs.occupied['4'] && f5Flat(); }, done: function () { return !MECH.stopper || (fm.atTravel('F5') && !MECH.hook); }, fix: function () { if (MECH.stopper) fm.toggleStopper(); return sleep(150); } });
  add({ c: 7, t: '5番を下げて平らにする', x: 'ストッパーが外れたので、2番 前の ▲ を押し続けて5番を下げます。ストッパーが無いので、地面と同じ高さ(平ら)まで下がります。', hint: '5番が平ら(走行位置)になるまで ▲ を押し続けます。', enter: function () { openPanel('front'); }, hl: function () { return swCard(2); }, past: function () { return !!gs.occupied['4'] && f5Flat(); }, done: function () { return fm.atTravel('F5') && !MECH.hook && !MECH.bridge; }, fix: async function () { fm.holdStart('F2f', -1); for (var b = 0; b < 500 && MECH.lift > 0; b++) await sleep(30); fm.holdStop(); await sleep(200); } });
  add({ c: 7, t: 'ストッパーを掛け直す', x: '5番が平らになりました。もう一度「5番ストッパーを掛ける」を押して、元に戻します(次にスロープにする時や、走行中の保持に使うため)。', hl: function () { return !MECH.stopper ? el('btnStopper') : []; }, past: function () { return !!gs.occupied['4'] && f5Flat(); }, done: function () { return f5Flat(); }, fix: function () { if (!MECH.stopper) fm.toggleStopper(); return sleep(150); } });
  loadSteps('5', { c: 7, chock: true, flip: function () { var p = plan(); return !p || p.flip5; }, chockText: '5番と6番は、床に輪止め(タイヤを止めるくさび)を置いて止めます。輪止めがないと車は止まらずに行き過ぎます。スロット「5」を選んで、「輪止めをセット」を押してください。', callText: function () { var p = plan(), back = !p || p.flip5; return (back ? '5番は、7台のサイクルでは「後ろ向き(バック)」で積みます(鼻先を宙段側へ向けると、宙段が持ち上がる時に、低いボンネットの上を通れるからです)。「5番用」の黄色い枠の車、' + cname('5') + 'の向きを「後ろ向き(バック)」にして呼んでください。' : '5番に、「5番用」の黄色い枠の車、' + cname('5') + 'を、前向きのまま呼んでください(荷台が低い軽トラックは、前向きに積むと荷台が宙段側に来るので、宙段が楽に持ち上がります)。') + (fixedDeck() ? '5番にこの車を選んだ理由: 5番の車は、宙段を持ち上げる時に前端の下に入り込むので、ボンネットが低く、長さが短い車でないと当たります。5番に入れられるのは、背の低い車(クーペ・ハッチバック・セダンなど)か、ヴェゼルクラスまでのSUVです(ミニバン・大きなSUV・ワゴンは当たります)。軽トラックは前向きで積む手もあります。ここでは長さ3.9mのハッチバックを選びました。' : ''); }, driveText: '後ろ向きの車は、◀ で前進するとお尻から進みます。輪止めに後輪が当たって止まるまで進めます。' });

  // 8. 宙段
  add({ c: 8, info: true, t: '宙段(7台目)とは', x: '宙段は、5番と6番の間にある短い棚で、7台目を載せる場所です。普段は下段の床にたたまれていて、前側が持ち上がるとスロープになり、車を載せたら全体を持ち上げて、赤い「固定ピン」で止めます。宙段の真上の棚(3番 前)を高く上げるので荷姿が少し高くなります。高さ制限(約4.1m)にも注意します。', hl: function () { return el('stageWrap'); } });
  function holeTxt(k, key) { var h = shelfT().holes[key]; return key === 'F2f' && h > E.F2f.holeMax ? '一番上まで' : h + '番の穴'; }
  add({ c: 8, t: '2番 前・3番 前・3番 後を、宙段に当たらない高さにする', x: function () { var h = shelfT().holes; return '宙段が持ち上がるための逃げを作ります。宙段(と7台目)の真上に来る3番 前(継ぎ目)だけ高く、2番 前と3番 後ろは、宙段に当たらない最小の高さまででかまいません(棚が傾きます)。この荷物では、2番 前=' + holeTxt('F2f', 'F2f') + '・3番 前=' + holeTxt('MID', 'MID') + '・3番 後=' + holeTxt('F3r', 'F3r') + 'のピンに載せます(高い車を2番・3番に入れたので、棚の高さが荷姿の高さに効きます。必要以上に上げないでください)。穴の番号は、棚の少し下が自動で入るので、−/＋で合わせます。'; }, sub: function () { if (!f2Ok()) return '2番 前: ピンを' + holeTxt('F2f', 'F2f') + 'に合わせて、その高さに載せる(いま ' + (P.F2f === null ? 'ピンなし' : fm.holeNo('F2f', P.F2f) + '番') + ')'; if (!midOk()) return '3番 前(継ぎ目): ピンを' + holeTxt('MID', 'MID') + 'に合わせて載せる(いま ' + (P.MID === null ? 'ピンなし' : fm.holeNo('MID', P.MID) + '番') + ')'; return '3番 後: ピンを' + holeTxt('F3r', 'F3r') + 'に合わせて載せる(いま ' + (P.F3r === null ? 'ピンなし' : fm.holeNo('F3r', P.F3r) + '番') + ')。3番 前を動かすと3番 後が連動して動くので、3番 前の後にやります'; }, hint: '棚は「ピンを抜く(▲で少し浮かせてから)→▲か▼で目標の高さ近くへ→−/＋で穴の番号を合わせてピンを差す→▼でピンに載せる」です。3番 前を動かすと3番 後が連動して動くので、3番 前 → 3番 後 の順がやりやすいです。2番 前が低すぎると5番の車に当たります。', enter: function () { openPanel('front'); }, hl: function () { return hangPrepOk() ? [] : (!f2Ok() ? swCard(2) : (!midOk() ? swCard(0) : swCard(1))); }, done: function () { return hangPrepOk(); }, fix: Auto.hangPrep });
  add({ c: 8, t: '宙段の固定ピンを合わせる', x: '宙段のスイッチ(後ろ側の3枚目)の真ん中のボタンは、フレーム側の赤い「固定ピン」(宙段を持ち上げた時に当たって止める棒)の抜き差しで、−/＋はその位置(前→後ろの5段階)です。ピンの位置で、宙段が止まる高さが決まります。車の組み合わせごとに合う位置があるので、下の「いまやること」の番号に合わせて、差してください。', sub: function () { var h = stopPinHole(); return '固定ピンの位置を「' + h + '」にして、差した状態にする(いま ' + (fm.stopPin.inserted ? '差してある' : '抜いてある') + ' / 位置 ' + fm.stopPin.hole + ')'; }, hint: '−/＋で位置を変えると、ボタンの数字が変わります。「刺す」と表示されていたら押して差します。', enter: function () { openPanel('rear'); }, hl: function () { return swCard(2); }, done: function () { return stopPinOk(); }, fix: Auto.stopPin });
  add({ c: 8, t: '宙段をスロープにする', x: '宙段の ▲ を押して、前側を持ち上げます。後ろ側は接地したままで、車が乗れるスロープになります。スロープの高さ(1段階目)で離すと、ぴたっと止まります。', hint: '宙段の ▲ を押している間、少しずつ上がります。途中で止まる所があれば、そこが「スロープ」の位置です。', enter: function () { openPanel('rear'); }, hl: function () { return swCard(2); }, past: function () { return !!gs.occupied['7']; }, done: function () { return fm.hangSlope(); }, fix: function () { return Auto.hangTo(1); } });
  loadSteps('7', { c: 8, callText: function () { return '7台目、「7番用」の黄色い枠の車、' + cname('7') + 'を呼びます。道板から、下段の床をまっすぐ後ろへ進み、5番(積んだ車)の脇を通って宙段のスロープに乗ります。' + (fixedDeck() ? '宙段に載せた車の屋根は、持ち上げた宙段の上で、2番・3番の棚の下に収まらないといけません。それで、デッキでいちばん背の低いスポーツタイプ(高さ1.24m)にしています。背の高い車だと、2番・3番の棚をもっと高く上げる(荷姿が高くなる)ことになります。' : ''); }, driveText: '◀ で前進。宙段の穴(上げると自動で空いています)にタイヤが落ちて止まります。' });
  add({ c: 8, t: '宙段を上げて固定ピンで止める', x: '7台目を固定したら、宙段の ▲ を押し続けて持ち上げます。赤い固定ピンに床が当たって止まります(それ以上は上がりません)。「ピンに載せる」ことで、車の重さを支えます。', sub: function () { return hangUpOk() ? '出来ました。' : '宙段の ▲ を押し続ける(止まるまで)'; }, hint: '固定ピンが差してあるか確認します(前のステップ)。上がらない時は、2番 前・3番 前・3番 後が一番上まで上がっているか確認してください。', enter: function () { openPanel('rear'); }, hl: function () { return swCard(2); }, done: hangUpOk, fix: Auto.hangUp });

  // 9. 6番
  loadSteps('6', { c: 9, chock: true, chockText: '最後は6番です。6番も輪止めで止めます。スロット「6」を選んで、「輪止めをセット」を押してください。', callText: function () { return '6番には、幅が1.755m以下の車しか載せられません(それより広い車は、タイヤが張り出す位置に当たります)。「6番用」の黄色い枠の車、' + cname('6') + 'を呼んでください。' + (fixedDeck() ? '5ナンバーのコンパクトカーなので、6番に積めます(6番に積む(止まる)だけなら、タイヤの突出の有無は関係ありません)。' : '') + '7台目を積んだあとなので、宙段の下(6番の床)はあいています。'; }, driveText: '◀ で前進。6番の輪止めに前輪が当たって止まります。宙段が上がっている下をくぐるので、車の高さに気をつけます。' });

  // 10. サイクル完了
  function tireInSub() {
    if (tireStowed()) return '出来ました。';
    var off = fm.tireOffGround(), lk = MECH.lockR || MECH.lockL;
    if (!off && !MECH.tireOut && !lk) return 'アウトリガーの ▲ を押し続けて、ジャッキを戻す';
    if (!off && lk) return '① アウトリガーの ▼ を押し続けて、タイヤを浮かせる';
    if (off && lk) return '② 「右引」と「左引」でロックを解除する';
    if (off && MECH.tireOut) return '③ 「縮」を押して、タイヤを格納する';
    if (off && !MECH.lockR && !MECH.lockL) return '④ 「右押」と「左押」でロックを掛ける';
    return '④ 「右押」と「左押」でロックを掛ける → ⑤ アウトリガーの ▲ でジャッキを戻す';
  }
  add({ c: 10, info: true, t: 'サイクル完了の条件', x: 'サイクルが完了する条件は、①7台とも積んで、全部タップで固定 ②上段の棚が全てセットピンに載っている ③5番フロアが平ら ④宙段が固定ピンに載っている ⑤タイヤ・ロックが走行状態(タイヤを格納してロック) ⑥扇動板をしまう ⑦道板をしまう、です。このうち⑤のタイヤの格納が、まだ残っています。', hl: function () { return []; } });
  add({ c: 10, t: 'タイヤを格納する', x: '最初に突出させたタイヤを、格納して元に戻します(走行する時は格納した状態です)。手順は突出の時の逆で、ジャッキで浮かせる → 右引・左引でロック解除 → 「縮」 → 右押・左押でロック → ジャッキを戻す、です。ここは自分の手でやってみてください(「いまやること」に、次の操作が出ます)。', sub: tireInSub, hint: '操作盤は、後ろ寄りの車軸のあたりの光る枠をタップすると出ます。「縮」は右側のボタンの上から2番目です。', ring: 'tire', enter: function () { openPanel('tire'); }, hl: function () { var off = fm.tireOffGround(); return swCard(!off && !MECH.tireOut && !(MECH.lockR || MECH.lockL) ? 0 : (!off ? 0 : 1)); }, past: function () { return !!ctx.cycleDone; }, done: tireStowed, fix: function () { return Auto.tireSet(false); } });
  add({ c: 10, t: '道板をしまう', x: '最後に、「道板をしまう」を押します。足りない条件があるときは、ここに表示します。', sub: function () { var u = unmet().filter(function (s) { return s.indexOf('道板') < 0; }); return u.length ? '残り: ' + u.join(' / ') : 'あと少し。「道板をしまう」を押す'; }, hint: 'まだ足りない条件が上に出ています。1つずつ直してください。', hl: function () { return MECH.ramp ? el('btnRamp') : []; }, done: function () { return !!ctx.cycleDone; }, fix: async function () { await Auto.stow(); } });
  add({ c: 10, info: true, t: 'イージー・ノーマル・ハードの違い', x: '難易度が上がるほど、ガイドが減って、ミスの扱いが厳しくなります。イージー: 通れない・積めない状態のとき、警告を出して車を止めます(進めない・OKにならない)。ノーマル・ハード: 止めずにそのまま進めますが、ミスとして記録して減点します(同じ理由は車1台につき1回)。ハードは、画面のヒントや状態表示も出ません。重いミス(-80点)の例: タイヤ未突出で軽自動車以外が6番の横を通る、脱輪、駐車中の車にぶつかる、フロアが下がっているのに進む。軽いミス(-30点)の例: 道板が出ていない、すでに車があるスロットで止まる、6番に積めない車種で止まる。このチュートリアルは、イージーと同じ「警告して止める」形です。', hl: function () { return []; } });
  add({ c: 10, info: true, last: true, t: '配車への連絡と得点', x: '配車担当への連絡:時々、組み合わせ的にどうやっても積めない荷物が来ます。そのときは画面上の「配車に連絡」で伝えます(早いほどボーナス。積めるのに連絡すると減点)。得点:1台積むごとに加点、ミスで減点、荷姿が高すぎると減点。難易度が上がると倍率が上がります。ここで終わりです。「自由に練習」で、このまま触れます。', hl: function () { return el('btnDispatch'); } });

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
    panel.querySelector('.tutEnd').addEventListener('click', function () { location.href = 'title.html'; });
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
      panel.querySelector('.tutText').textContent = '操作とルールは一通り終わりです。このまま自由に練習するか(次の荷物が出ています)、タイトルに戻って他のモードで遊べます。';
      panel.querySelector('.tutSub').textContent = ''; panel.querySelector('.tutHint').style.display = 'none'; panel.querySelector('.tutWarn').textContent = '';
      panel.querySelector('.tutPrev').style.display = 'none';
      var m = panel.querySelector('.tutMain'); m.textContent = '自由に練習'; m.className = 'tutMain grow'; m.disabled = false;
      panel.querySelector('.tutEnd').textContent = 'タイトルへ';
      return;
    }
    var stepNo = 1; for (var q = 0; q < ctx.i; q++) if (S[q].c === s.c) stepNo++;
    var inChap = S.filter(function (z) { return z.c === s.c; }).length;
    panel.querySelector('.tutChap').textContent = (s.c + 1) + '/' + CHAPTERS.length + ' ' + CHAPTERS[s.c] + (inChap > 1 ? '(' + stepNo + '/' + inChap + ')' : '');
    panel.querySelector('.tutMini').textContent = s.t;
    panel.querySelector('.tutTitle').textContent = s.t;
    panel.querySelector('.tutText').textContent = typeof s.x === 'function' ? s.x() : s.x;
    panel.querySelector('.tutPrev').style.display = ctx.i > 0 && !ctx.busy ? '' : 'none';
    panel.querySelector('.tutPrev').disabled = ctx.busy;
    panel.querySelector('.tutEnd').textContent = '終了(タイトルへ)';
    updateDyn();
  }
  function updateDyn() {
    var s = S[ctx.i]; if (!s || ctx.ended) return;
    var sub = panel.querySelector('.tutSub'), hint = panel.querySelector('.tutHint'), warn = panel.querySelector('.tutWarn'), main = panel.querySelector('.tutMain');
    var txt = '';
    if (ctx.busy) txt = 'ガイドが代わりに実行しています…';
    else if (ctx.done) txt = 'できました。';
    else if (s.sub) { try { txt = s.sub() || ''; } catch (e) { txt = ''; } }
    var subTxt = txt && !ctx.done && !ctx.busy ? 'いまやること: ' + txt : txt;
    if (sub.textContent !== subTxt) sub.textContent = subTxt;
    sub.style.color = ctx.done || ctx.busy ? '' : '#ffe9a8'; sub.style.fontWeight = ctx.done || ctx.busy ? 'bold' : 'normal';
    var stuck = !ctx.done && !ctx.busy && !s.info && Date.now() - ctx.t0 > 12000;
    var h = stuck && s.hint ? 'ヒント: ' + s.hint : '';
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

  // ゲームの注意メッセージ(「棚がセットピンに載っているので抜けません」など)を、パネルにも出す
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
