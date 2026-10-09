// モード(タイムアタック / リアル / シミュレーション)とスコアリング(SPEC第3・9章)。
// game.js のミス・積込み完了を GAME_MODE.onMiss / onDock で受け取り、サイクル完了を判定する。
(function () {
  var cfg = window.TRAILER_CONFIG;
  var state = window.GAME_STATE;
  var fm = window.FLOOR_MECH;

  // スコアの調整値(第9.2章: 合算方法は単純な加減算で開始。実際に遊んで調整する)
  var SCORE = {
    perCar: 100,          // 1台の積み込み完了ごとに加点
    perMinor: 30,         // 軽いミス(手順の不備: 道板未展開・棚を動かした・積めない車種等)1回の減点
    perMajor: 80,         // 重いミス(ぶつかる・乗り越える・脱輪・ピン無しで下へ入る等)1回の減点
    minorLimit: 3,        // リアルモード: 重いミスは即終了、軽いミスはこの回数で終了
    heightLimitM: (cfg.score && cfg.score.heightLimitM) || 4.1,    // これを超えた分だけ減点(第9.1章)。トレーラーごとに trailer_config の score.heightLimitM で決める(semi-6b は 4.6)
    minHOffsetM: 0.05,    // この組み合わせをいちばん低く積める高さ(積める判定で計算。実測とほぼ一致、1/3の組み合わせで0.2m高めに出る)+この余裕まで、減点しない(車の組み合わせで決まる高さは、積む人のせいではないので)
    hangExtraM: 0.7,      // 宙段を使う7台のサイクルは、宙段のために2・3番を高く上げるので、高さ制限をこの分だけ緩める(実測: 7台で約0.6m高くなる)
    perMeterOver: 1000,   // 高さ超過1mあたりの減点(=10cmで100点)
    // 配車担当への連絡(積めない荷物。第16章)
    dispatchMaxBonus: 300,   // 積めない荷物に、出題の直後に気づいて連絡した時のボーナス(難易度の倍率を掛ける)
    dispatchMinBonus: 50,    // 制限時間ぎりぎりで連絡した時のボーナス(その間は直線で減る)
    dispatchFalsePenalty: 150,   // 積める荷物なのに「積めない」と連絡した時の減点(難易度の倍率を掛ける)
    dispatchLimitSec: 90     // 積めない荷物に気づいて連絡するまでの制限時間(超えるとそのターンの稼ぎ(積込み点)が0点になる)
  };
  // スコアアタック(旧タイムアタック。2026-10-08 ユーザー提案: 積み終わっても終われない・待つだけになる問題)。
  // 持ち時間は最初 startSec。サイクルを完了するたびに延長ボーナス(base 秒。回を重ねるごとに shrink 秒ずつ減って、min 秒まで)がもらえる。
  // そのサイクルのミス1回につき missCost 秒引く(下限 floor 秒)。持ち時間が0になるか、「荷役を終え出発」を押すと終わり、スコアで競う
  // 難易度ごとに、最初の持ち時間(startSec)と延長の初めの値(base)を変える。2026-10-08 ユーザー指示: 全体に +20秒、イージーはもう少し猶予
  var EXT = { start: { easy: 300, normal: 260, hard: 260 }, base: { easy: 210, normal: 180, hard: 180 }, shrink: 15, min: 90, missCost: 10, floor: 30 };
  var limitSec = EXT.start.normal;
  var MODES = {
    time: { name: 'スコアアタック', desc: '時間延長しながら、どこまでスコアを伸ばせるか(最初4〜5分。サイクル完了で延長)' },
    real: { name: 'リアルモード', desc: 'ミスした時点で終了。何がダメだったかを表示' },
    sim: { name: 'シミュレーション', desc: '自由に操作できる練習用。時間制限・終了なし' }
  };

  var DIFFS = { easy: 'イージー', normal: 'ノーマル', hard: 'ハード' };
  var $ = function (id) { return document.getElementById(id); };
  var diff = 'easy';
  var mode = null, startedAt = 0, timerId = null, ended = false;
  var isTut = false;   // チュートリアル(#mode=tutorial): 中身は sim(難易度なし・時間制限なし)。js/tutorial.js がガイドを重ねる。得点・サイクル完了の表示は出さない
  var stats = { carry: 0, docks: 0, cycles: 0, heightPenalty: 0, penalty: 0, minors: 0, majors: 0, carPoints: 0, bonus: 0, dispatchFound: 0, dispatchFalse: 0, dispatchMissed: 0 };
  var turn = { startedAt: Date.now(), snap: { carPoints: 0, docks: 0 } };   // 今のターン(今の荷物)の開始時刻と、その時の積込み点・台数(連絡・時間切れで巻き戻す)
  // 難易度による加点・減点の倍率(積込み・ミス・高さ超過の全てに掛ける。シミュレーションは1倍)
  var DIFF_MULT = { easy: 1, normal: 1.5, hard: 2 };
  function mult() { return mode === 'sim' ? 1 : (DIFF_MULT[diff] || 1); }
  var lastHeightM = null, cycleStartMisses = 0;

  // 今のサイクルの高さ制限(7台サイクルは宙段の分だけ緩める)
  function limitM() {
    var lim = SCORE.heightLimitM + (state.deckSize >= 7 && !state.deckMinH ? SCORE.hangExtraM : 0);   // 7台も、基準が計算できれば、下の基準を使う
    // 6台は、その組み合わせをいちばん低く積んでも届かない分(車が高い組み合わせ)は減点しない。減点するのは、並べ方や棚の上げ過ぎで、避けられた高さだけ
    if (state.deckMinH && isFinite(state.deckMinH)) lim = Math.max(lim, state.deckMinH + SCORE.minHOffsetM);
    return lim;
  }
  function score() { return Math.round(stats.carPoints + stats.bonus - stats.penalty - stats.heightPenalty + (stats.carry || 0)); }   // carry: 前のゲームの事故(転落・大破)の損害。マイナス点からスタート
  function turnSec() { return (Date.now() - turn.startedAt) / 1000; }
  // このターンの積込み点(と積込み台数)を、ターン開始時に巻き戻す(荷物を替える時。ミスの減点・ボーナスはそのまま)
  function rollbackTurn() { stats.carPoints = turn.snap.carPoints; stats.docks = turn.snap.docks; }

  function elapsed() { return (Date.now() - startedAt) / 1000; }
  function fmtTime(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  function refreshBar() {
    if (!mode) return;
    var t = mode === 'time' ? '残り ' + fmtTime(limitSec - elapsed()) : '経過 ' + fmtTime(elapsed());
    $('modeBarName').textContent = (isTut ? 'チュートリアル' : MODES[mode].name) + (mode === 'sim' ? '' : '・' + DIFFS[diff] + '(×' + mult() + ')') + (window.TRAILER_CONFIG && window.TRAILER_CONFIG.id === 'semi-6b' ? '・6台積み' : '');   // 2台目のトレーラーを選んでいる時は、バーに出して区別する
    $('modeBarTime').textContent = t;
    $('modeBarCycles').textContent = 'サイクル ' + stats.cycles;
    $('modeBarCars').textContent = '積込 ' + stats.docks + '台' + (state.deckSize >= 7 ? '(今回7台・宙段あり)' : '');
    // 積み込んだ状態の、地面から一番高い所の高さ(今のフロアの位置で計算。高さ制限を超えると赤)
    var hm = Object.keys(state.occupied).length ? loadHeightM() : null;
    $('modeBarHeight').textContent = hm === null ? '' : '荷姿の高さ ' + hm.toFixed(2) + 'm';
    $('modeBarHeight').style.color = hm !== null && hm > limitM() ? '#ff8080' : '';
    $('modeBarScore').textContent = 'スコア ' + score();
    $('modeBarScore').style.color = score() < 0 ? '#ff8080' : '#ffe680';
  }

  // 積んだ車のうち一番高い所の地上高(m)。フロア上の車はフロアの現在位置で計算する
  function loadHeightM() {
    var top = Infinity;
    Object.keys(state.occupied).forEach(function (n) {
      var c = state.occupied[n], y = c.localY;
      if (c.floor) y = fm.onFloor(c.floor, c.localX, c.localY)[1];
      top = Math.min(top, y - c.h);
    });
    return top === Infinity ? 0 : (cfg.ramp.groundY - top) / cfg.pxPerMeter;
  }

  function banner(msg) {
    var el = $('cycleBanner');
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(banner.t);
    banner.t = setTimeout(function () { el.style.display = 'none'; }, 4000);
  }

  // ---- サイクル完了: 6台積込み済み + フロアが全て走行位置 + ジャッキ・4番扇動板を格納 ----
  function cycleComplete() {
    if (cfg.id === 'semi-6b') {   // semi-6b: 1〜6番がそろって全部固定・動作中の車がいない・2番が傾いたままでない・スロープを下げた・道板をしまった(fm.cycleReady)
      if (['1', '2', '3', '4', '5', '6'].some(function (n) { return !state.occupied[n]; })) return false;
      if (state.car && !state.car.seated && state.car.phase !== 'docked') return false;
      if (!Object.keys(state.occupied).every(function (n) { var c = state.occupied[n].live; return c && c.locked; })) return false;
      return fm.cycleReady();
    }
    // 1〜6番がそろっている(宙段の7台目は任意。数だけで判定すると、宙段があるのに5番が空でも完了してしまう)
    if (['1', '2', '3', '4', '5', '6'].some(function (n) { return !state.occupied[n]; })) return false;
    if (state.deckSize >= 7 && !state.occupied['7']) return false;   // 7台のサイクルは、宙段の7台目も積む
    if (state.car && !state.car.seated && state.car.phase !== 'docked') return false;   // 動作中の車がいない(全て輪止めに当たって止まっている)
    // 上段の棚は全てセットピンに載って固定(下段に車がいると走行位置までは下げられないので、位置は問わない)。5番フロアは平ら
    if (!Object.keys(state.occupied).every(function (n) { var c = state.occupied[n].live; return c && c.locked; })) return false;   // 全ての車をタップで固定してから完了
    if (!['F1f', 'F1r', 'F2f', 'MID', 'F3r'].every(fm.rested) || !fm.atTravel('F5')) return false;   // 全ての棚がピン(3番前は下端)に載っている
    // 宙段フロアは格納(平ら)に戻す。7台目が載っている間は、上げたまま(最後まで上がった状態)でよい。支柱はセットピンに載せて固定
    // 7台目が載っている間は、セットピンで loadU(hangFloor.loadU)付近に止めた高さでよい(1穴=u0.1、ピンは穴の位置以下にしか載らないので0.15の余裕)
    if (fm.MECH.hang > 0.01 && !(state.occupied['7'] && fm.MECH.hang >= (((window.TRAILER_CONFIG.hangFloor || {}).loadU) || 2) - 0.15)) return false;
    if (!fm.rested('F7')) return false;
    if (fm.MECH.tireOut) return false;
    if (!fm.MECH.lockR || !fm.MECH.lockL) return false;   // 車軸の左右のロックを掛けて、走行できる状態に戻す   // タイヤは必ず格納してから次のサイクルへ(幅の広い車は6番に載せられない)
    if (fm.MECH.jack > 0 || fm.MECH.bridge || fm.bridgeT() > 0) return false;
    if (fm.MECH.ramp || fm.rampT() > 0) return false; // 道板をしまい終えてから完了
    return true;
  }

  function onCycleComplete() {
    var lim = limitM(), h = loadHeightM(), over = Math.max(0, h - lim);
    var pen = Math.round(over * SCORE.perMeterOver * mult());
    lastHeightM = h;
    stats.cycles++;
    stats.heightPenalty += pen;
    var msg = 'サイクル完了! 荷姿の高さ ' + h.toFixed(2) + 'm' + (pen ? '(' + lim.toFixed(1) + 'mを超過 -' + pen + '点)' : '(満点)');
    if (mode === 'real') { finish(true, msg); return; }
    if (mode === 'time') {   // 延長ボーナス: 回を重ねるほど少なく、このサイクルのミスが多いほど少ない
      var missesNow = stats.majors + stats.minors, missesCycle = missesNow - cycleStartMisses;
      var ext = Math.max(EXT.floor, Math.max(EXT.min, (EXT.base[diff] || EXT.base.normal) - EXT.shrink * (stats.cycles - 1)) - EXT.missCost * missesCycle);
      limitSec += ext; cycleStartMisses = missesNow;
      msg += ' / 時間延長 +' + ext + '秒';
    }
    if (isTut) { if (window.TUTORIAL && window.TUTORIAL.onCycleComplete) window.TUTORIAL.onCycleComplete(); }
    else banner(msg);
    fm.initPins && fm.initPins();
    state.resetTrailer();
    refreshBar();
  }

  function tick() {
    if (ended || !mode) return;
    if (mode === 'time' && elapsed() >= limitSec) {
      if (state.deckImpossible && !state.dispatchDone) { stats.dispatchMissed++; rollbackTurn(); }   // 積めない荷物に気づかないまま時間切れ: そのターンの稼ぎは0点
      finish(false, '時間切れ' + (state.deckImpossible && !state.dispatchDone ? '(積めない荷物に気づけませんでした。そのターンの積込み点は0点)' : '')); return;
    }
    // 積めない荷物に気づかず、制限時間を過ぎた(配車担当から連絡が来る。dispatch.js)
    if (state.deckImpossible && !state.dispatchDone && state.deck && state.deck.length && turnSec() >= SCORE.dispatchLimitSec && window.DISPATCH) window.DISPATCH.onTimeout();
    if (cycleComplete()) onCycleComplete();
    refreshBar();
  }

  var CARRY_KEY = 'carCarryPenalty', CARRY_BASE = 200;   // 事故1回の損害(点)。難易度の倍率を掛ける
  // ---- 終了・結果 ----
  function finish(cleared, reason, accident) {
    if (ended) return;
    ended = true;
    clearInterval(timerId);
    state.frozen = true;
    fm.holdStop && fm.holdStop();
    fm.jackHoldStop && fm.jackHoldStop();
    // 出発の仕方: 道板を出したまま・道板の上に車がいる時は、事故になる(ミス1回。トレーラーが走り去る演出は main.js の TRAILER_ANIM)
    var unsafe = null;
    if (!accident && window.TRAILER_ANIM && window.TRAILER_ANIM.unsafeDeparture) unsafe = window.TRAILER_ANIM.unsafeDeparture();
    if (unsafe) { stats.penalty += Math.round(SCORE.perMajor * mult()); stats.majors++; accident = true; reason = unsafe; }   // 重いミス1回として減点
    refreshBar();
    var title = accident ? '事故で作業中止' : (cleared ? 'クリア!' : (mode === 'real' ? 'ミスで終了' : '荷役を終え出発'));
    $('resultTitle').textContent = MODES[mode].name + (mode === 'sim' ? '' : '(' + DIFFS[diff] + ')') + ':' + title;
    var lines = [];
    if (accident) {
      lines.push('事故: ' + reason); lines.push('作業を中止します。一からやり直してください。');
      if (mode !== 'sim' && !isTut) { var loss = Math.round(CARRY_BASE * mult()); try { localStorage.setItem(CARRY_KEY, String(loss)); } catch (e) { } lines.push('損害 ' + loss + '点: 次のゲームは -' + loss + '点からのスタートになります。'); }
    }
    else if (mode === 'real' && !cleared) lines.push('何がダメだったか: ' + reason);
    else lines.push(reason);
    lines.push('積み込み ' + stats.docks + '台 / ミス 重' + stats.majors + '・軽' + stats.minors + ' / 完了サイクル ' + stats.cycles);
    if (stats.dispatchFound || stats.dispatchFalse || stats.dispatchMissed) lines.push('配車連絡: 積めない荷物に気づけた ' + stats.dispatchFound + '回(ボーナス +' + stats.bonus + '点) / 積めるのに連絡 ' + stats.dispatchFalse + '回 / 気づけず ' + stats.dispatchMissed + '回');
    if (lastHeightM !== null) lines.push('荷姿の高さ ' + lastHeightM.toFixed(2) + 'm');
    if (stats.carry) lines.push('前回の事故の損害 ' + stats.carry + '点からのスタート');
    lines.push('所要時間 ' + fmtTime(elapsed()));
    $('resultBody').innerHTML = '';
    lines.forEach(function (l) { var p = document.createElement('p'); p.textContent = l; $('resultBody').appendChild(p); });
    $('resultScore').textContent = 'スコア ' + score();
    // 結果は、トレーラーが走り去ってから出す(演出が無い環境では、すぐ)
    if (window.TRAILER_ANIM && window.TRAILER_ANIM.depart) window.TRAILER_ANIM.depart(!!unsafe, function () { $('resultOverlay').style.display = 'flex'; });
    else $('resultOverlay').style.display = 'flex';
  }

  window.GAME_MODE = {
    cycleComplete: cycleComplete,   // (確認用)
    limitSec: function () { return limitSec; },   // (確認用)持ち時間(秒)
    forceCycle: function () { onCycleComplete(); },   // (確認用)サイクル完了を強制する
    limitM: limitM,   // (確認用)
    onAccident: function (reason) { if (!mode || ended) return; finish(false, reason, true); },
    get mode() { return mode; },
    get tutorial() { return isTut; },
    score: score,
    stats: stats,
    loadHeightM: loadHeightM,
    SCORE: SCORE,
    get ended() { return ended; },
    turnSec: turnSec,
    // 新しい荷物(デッキ)が届いた: ターンの開始時刻と、その時の積込み点を覚える
    onTurnStart: function () { turn.startedAt = Date.now(); turn.snap = { carPoints: stats.carPoints, docks: stats.docks }; },
    // 配車担当への連絡の結果をスコアに反映する。kind: 'found'(積めない荷物に気づいて連絡) / 'false'(積めるのに連絡) / 'timeout'(気づけず制限時間切れ)
    // found: 早いほど高いボーナス(出題直後=dispatchMaxBonus → 制限時間ぎりぎり=dispatchMinBonus。難易度の倍率つき)。積んだ車は降ろすので、そのターンの積込み点は戻す
    // false: 減点のみ(荷物はそのまま)。 timeout: そのターンの積込み点を0点に戻す
    dispatchResult: function (kind) {
      var sec = turnSec(), out = { sec: sec, bonus: 0, penalty: 0 };
      if (kind === 'found') {
        var frac = Math.max(0, Math.min(1, 1 - sec / SCORE.dispatchLimitSec));
        out.bonus = Math.round((SCORE.dispatchMinBonus + (SCORE.dispatchMaxBonus - SCORE.dispatchMinBonus) * frac) * mult());
        out.frac = frac; stats.bonus += out.bonus; stats.dispatchFound++; rollbackTurn();
      } else if (kind === 'false') {
        out.penalty = Math.round(SCORE.dispatchFalsePenalty * mult()); stats.penalty += out.penalty; stats.dispatchFalse++;
      } else if (kind === 'timeout') {
        stats.dispatchMissed++; rollbackTurn();
      }
      refreshBar();
      return out;
    },
    onMiss: function (reason, severity) {
      if (!mode || ended) return;
      var major = severity !== 'minor', pen = Math.round((major ? SCORE.perMajor : SCORE.perMinor) * mult());
      stats.penalty += pen;
      if (major) stats.majors++; else stats.minors++;
      if (mode === 'real') {
        if (major) finish(false, reason + '(重いミス)');
        else if (stats.minors >= SCORE.minorLimit) finish(false, reason + '(軽いミスが' + SCORE.minorLimit + '回)');
        else banner('軽いミス ' + stats.minors + '/' + SCORE.minorLimit + (state.hints ? ': ' + reason : '') + '(-' + pen + '点)');
      } else {
        banner(isTut ? 'うまくいきませんでした: ' + reason : (major ? '重いミス' : '軽いミス') + (state.hints ? ': ' + reason : '') + '(-' + pen + '点)');   // 解説なしの難易度では理由を出さない。チュートリアルは点数を出さない
      }
      refreshBar();
    },
    onUndock: function () {
      if (!mode || ended) return;
      stats.docks = Math.max(0, stats.docks - 1);
      stats.carPoints = Math.max(0, stats.carPoints - Math.round(SCORE.perCar * mult()));
      refreshBar();
    },
    onDock: function () {
      if (!mode || ended) return;
      stats.docks++;
      stats.carPoints += Math.round(SCORE.perCar * mult());
      refreshBar();
    }
  };

  function start(m, d, tut) {
    isTut = !!tut; if (isTut) document.body.classList.add('tutorial');
    state.freeMode = m === 'sim' && !tut;   // シミュレーション(チュートリアルを除く)は、道板・4番扇動板などの状態で動作を制限しない。ぶつかった時にアニメーションを出す
    mode = m; diff = m === 'sim' ? 'easy' : (d || 'easy'); turn.startedAt = Date.now(); turn.snap = { carPoints: stats.carPoints, docks: stats.docks };
    state.setDifficulty && state.setDifficulty(diff); ended = false; startedAt = Date.now();
    limitSec = EXT.start[diff] || EXT.start.normal;
    $('modeOverlay').style.display = 'none';
    $('modeBar').style.display = 'flex';
    var be = $('btnEnd'); if (be) be.style.display = (m === 'time' && !tut) ? '' : 'none';   // 「荷役を終え出発」はスコアアタックだけ
    // 前のゲームで事故(転落・大破)を起こしていたら、その損害分のマイナス点からスタートする(2026-10-09 ユーザー指示)。1回だけ使う
    stats.carry = 0;
    if (m !== 'sim' && !tut) {
      try { var cr = +localStorage.getItem(CARRY_KEY); if (cr > 0) { stats.carry = -cr; localStorage.removeItem(CARRY_KEY); setTimeout(function () { banner('前回の事故の損害で、-' + cr + '点からのスタートです'); }, 2800); } } catch (e) { }
    }
    refreshBar();
    timerId = setInterval(tick, 250);
  }

  // ---- 画面の配線 ----
  function trailerHash() { var t = /trailer=[\w-]+/.exec(location.hash); return t ? '&' + t[0] : ''; }   // 選んだトレーラー(#...&trailer=semi-6b)を、hash を書き換える時も残す
  Object.keys(MODES).forEach(function (k) {
    var b = document.querySelector('[data-mode="' + k + '"]');
    b.querySelector('small').textContent = MODES[k].desc;
    b.addEventListener('click', function () {
      if (k === 'sim') { location.hash = 'mode=sim' + trailerHash(); start('sim'); return; }   // シミュレーションは難易度なし(全部見えて解説あり)
      pickDiff(k);
    });
  });
  // 難易度選択(タイムアタック・リアルのみ)
  var diffMode = null;
  function pickDiff(k) {
    diffMode = k;
    $('diffTitle').textContent = MODES[k].name + ':難易度';
    $('modeOverlay').style.display = 'none';
    $('diffOverlay').style.display = 'flex';
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-diff]'), function (b) {
    b.addEventListener('click', function () {
      var d = b.getAttribute('data-diff');
      location.hash = 'mode=' + diffMode + '&diff=' + d + trailerHash();
      $('diffOverlay').style.display = 'none';
      start(diffMode, d);
    });
  });
  $('btnDiffBack').addEventListener('click', function () {
    $('diffOverlay').style.display = 'none';
    $('modeOverlay').style.display = 'flex';
  });
  // 「荷役を終え出発」: 積み終わって、もう続けない時に、自分で終われる。誤タップ防止に、もう一度押して確定(3秒以内)
  (function () {
    var b = $('btnEnd'), armed = 0, t = 0;
    if (!b) return;
    b.addEventListener('click', function () {
      if (!mode || ended || mode !== 'time') return;
      if (!armed) { armed = 1; b.textContent = '本当に出発?(もう一度)'; clearTimeout(t); t = setTimeout(function () { armed = 0; b.textContent = '荷役を終え出発'; }, 3000); return; }
      armed = 0; clearTimeout(t); b.textContent = '荷役を終え出発';
      finish(false, '荷役を終え出発しました(残り ' + fmtTime(limitSec - elapsed()) + ')');
    });
  })();
  $('btnRetry').addEventListener('click', function () { location.reload(); });
  $('btnModeSelect').addEventListener('click', function () { location.href = 'title.html'; });   // メイン画面(title.html)へ戻る

  var m = /mode=(time|real|sim|tutorial)(?:&diff=(easy|normal|hard))?/.exec(location.hash);
  if (m && m[1] === 'tutorial') start('sim', null, true);   // チュートリアルは内部では sim(難易度なし・全部見えて解説あり)
  else if (m && (m[1] === 'sim' || m[2])) start(m[1], m[2]);
  else if (m) pickDiff(m[1]);
  else location.replace('title.html');   // モードの指定が無い(index.htmlを直接開いた)時は、メイン画面(title.html)へ。モード・難易度の選択はメイン画面で行う
})();
