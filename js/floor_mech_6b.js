// semi-6b(6台積み・宙段なし・台車1軸)のフロア機構。js/floor_mech.js(semi-6 用)の代わりに読まれ、同じ window.FLOOR_MECH という名前で
// game.js・main.js・modes.js が使う最小限の口(onFloor・poseOf・MECH・道板・スロープ・curOffs など)を出す。
// 動くもの: 1番(真上に昇降 0〜60px)・2番(前端のヒンジで傾く -4〜11度)・4番へのスロープ・道板。
// 無いもの(semi-6 にあるもの): 宙段・3番・5番の可動・中央継ぎ目・アウトリガー・タイヤ突出・セットピン → MECH の該当項目は常に「無し」の値で持つ(他のファイルが参照して落ちないように)。
// フロアの姿勢は assets/semi-6b/parts.json の poses(走行時⇔積み込み時)の間を、押している間だけ動く連続値で持つ:
//   1番 MECH.f1 = 上げ量px(0=走行時・18=積み込み時・最大60) / 2番 MECH.f2 = 傾き度(0=走行時・10.5=積み込み時。負=後ろ上げ)
(function () {
  var cfg = window.TRAILER_CONFIG, T = cfg.t6b;
  var RAD = Math.PI / 180;
  var F1 = T.f1, F2 = T.f2;
  var FRAME_GAP_PX = 0.05 * cfg.pxPerMeter;   // 実車は枠の内側に約5cmの隙間があるので、これまでは当たりとみなさない(semi-6 と同じ)

  var MECH = {
    ramp: false, bridge: false,          // 道板・4番へのスロープ(bridge=スロープを上げている)
    f1: 0, f2: 0,                        // 1番の上げ量・2番の傾き
    // 以下は semi-6 にあって semi-6b に無い機構。常に「無し」の値(他のファイルが読んでも落ちない)
    hang: 0, lift: 0, hook: false, stopper: true, f2Flap: false, jack: 0, tireOut: false, lockR: true, lockL: true
  };

  // ---- フロアの形 ----
  function tableAt(tab, s) {
    if (s <= tab[0][0]) return tab[0][1];
    for (var i = 1; i < tab.length; i++) {
      if (s <= tab[i][0]) { var a = tab[i - 1], b = tab[i]; return a[1] + (b[1] - a[1]) * (s - a[0]) / (b[0] - a[0]); }
    }
    return tab[tab.length - 1][1];
  }
  var F1_SLOPE = (F1.rear[1] - F1.front[1]) / (F1.rear[0] - F1.front[0]);
  var FLOORS = {
    F1: { name: '1番フロア', pivot: F1.front, front: { pt: F1.front }, rear: { pt: F1.rear }, x0: F1.front[0], x1: F1.rear[0] + 4, slots: [1],
      surfaceY: function (x) { return F1.front[1] + (x - F1.front[0]) * F1_SLOPE; },
      underY: function (x) { return this.surfaceY(x) + tableAt(F1.under, x - F1.front[0]); } },
    F2: { name: '2番フロア', pivot: F2.hinge, front: { pt: F2.hinge }, rear: { pt: [F2.hinge[0] + F2.len, F2.hinge[1]] }, x0: F2.hinge[0], x1: F2.hinge[0] + F2.len, slots: [2, 3],
      surfaceY: function () { return F2.hinge[1]; },
      underY: function (x) { return F2.hinge[1] + tableAt(F2.under, x - F2.hinge[0]); } }
  };
  var FIDS = ['F1', 'F2'];

  function curOffs() { return { F1: MECH.f1, F2: MECH.f2 }; }
  // フロアの今の姿勢。ang=回転(度。時計回りが正)・dh=縦のずれ(1番は上げ量の分だけ負)。回転の中心は pivot(2番は前端のヒンジ)
  function poseOf(id, offs) {
    var o = offs || curOffs();
    if (id === 'F1') return { ang: 0, dh: -o.F1 };
    if (id === 'F2') return { ang: o.F2, dh: 0 };
    return { ang: 0, dh: 0 };
  }
  function onFloor(id, x, y, offs) {
    var p = poseOf(id, offs);
    if (id === 'F1') return [x, y + p.dh];
    var h = F2.hinge, a = p.ang * RAD, dx = x - h[0], dy = y - h[1];
    return [h[0] + dx * Math.cos(a) - dy * Math.sin(a), h[1] + dx * Math.sin(a) + dy * Math.cos(a)];
  }

  // ---- 下段の車がフロアの下面に当たるか ----
  // o = {x,y(前タイヤの接地点), w,h,leftTireX, prof(横位置ごとの高さの割合), rot(度。時計回りが正)}。戻り値: フロアの下面が車の屋根より下に入り込む量(px)の最大(正=当たっている)。重なる範囲が無ければ -1e9
  function roofFn(o) {
    var x0 = o.x - o.leftTireX, prof = o.prof, rad = (o.rot || 0) * RAD, tn = Math.tan(rad), cs = Math.cos(rad) || 1;
    return function (px) {
      var hh = o.h;
      if (prof) hh = o.h * prof[Math.max(0, Math.min(prof.length - 1, Math.floor((px - x0) / o.w * prof.length)))];
      return o.y + (px - o.x) * tn - hh / cs;
    };
  }
  function overlap(id, o, offs) {
    var f = FLOORS[id], x0 = o.x - o.leftTireX, x1 = x0 + o.w, roof = roofFn(o), worst = -1e9;
    for (var lx = f.x0; lx <= f.x1; lx += 12) {
      var p = onFloor(id, lx, f.underY(lx), offs);
      if (p[0] < x0 || p[0] > x1) continue;
      worst = Math.max(worst, p[1] - roof(p[0]));
    }
    return worst;
  }
  function occBox(occ) { return { x: occ.localX, y: occ.localY, w: occ.w, h: occ.h, leftTireX: occ.leftTireX, prof: occ.prof, rot: occ.rotDeg || 0 }; }
  function lowerList(id) { return id === 'F1' ? T.lower.f1Over : T.lower.f2Over; }
  // 棚を offs の姿勢にした時に、下段に積んだ車(f1Over/f2Over の組み合わせ)に当たる理由。動かす向きが車に近づく(重なりが増える)時だけ止める
  function poseProblem(id, offs) {
    var gs = window.GAME_STATE, now = curOffs(), why = null;
    if (!gs) return null;
    lowerList(id).forEach(function (n) {
      var occ = gs.occupied[n]; if (!occ || why) return;
      var o = occBox(occ), ov = overlap(id, o, offs);
      if (ov > FRAME_GAP_PX && ov > overlap(id, o, now) + 0.01) why = n + '番の車に当たる(' + FLOORS[id].name + 'をこれ以上下げられません)';
    });
    return why;
  }
  // 積める判定(js/loadable_6b.js)用: car={w,h,leftTireX,prof}(向きに合わせたもの)を slotNum に置いた時の重なり量(offs はその時のフロアの姿勢)
  function slotOverlap(slotNum, car, offs) {
    var S = cfg.slots[slotNum], id = slotNum === '4' ? 'F1' : 'F2';
    var o = { x: S.tireX + 8, y: S.deckY, w: car.w, h: car.h, leftTireX: car.leftTireX, prof: car.prof, rot: S.rot || 0 };
    return overlap(id, o, offs);
  }
  // 道の上を走っている車が、下段の道(L・4)でフロアの下に入れるか。入れない時の理由(無ければ null)
  function lowerRoutePathProblem(car) {
    var gs = window.GAME_STATE, id = car.route && car.route.id;
    if (id !== 'L' && id !== '4') return null;
    var rot = 0;
    if (car.pathTool && car.progress > 0) {
      var Lp = car.pathTool.at(car.progress), Rp = car.pathTool.at(car.progress - car.wbPx);
      rot = Math.atan2(Rp.y - Lp.y, Rp.x - Lp.x) / RAD;
    }
    var o = { x: car.x, y: car.y, w: car.w, h: car.h, leftTireX: car.leftTireX, prof: car.prof, rot: rot }, why = null, offs = curOffs();
    ['F2', 'F1'].forEach(function (fid) {
      if (why) return;
      if (fid === 'F1' && id !== '4') return;
      if (overlap(fid, o, offs) > FRAME_GAP_PX) why = FLOORS[fid].name + 'が低くて通れません。' + FLOORS[fid].name + 'を上げてください。';
    });
    return why;
  }

  // ---- 押している間だけ動く操作(1番・2番) ----
  var holding = null, holdRaf = null;
  function holdStart(end, dir) {   // end='F1'|'F2'、dir=-1:上げる(▲)/ +1:下げる(▼)
    if (!FLOORS[end]) return;
    holding = { end: end, dir: dir, last: null, warned: null };
    if (holdRaf === null) holdRaf = requestAnimationFrame(holdStep);
  }
  function holdStop() {
    var h = holding; holding = null;
    if (!h) return;
    // 走行時・積み込み時の姿勢の近くで離したら、ぴたっと合わせる(動かして良い時だけ)
    var cand = curOffs();
    if (h.end === 'F1') {
      [0, F1.loadRaise].forEach(function (v) { if (Math.abs(MECH.f1 - v) < 3 && MECH.f1 !== v) { cand.F1 = v; if (!poseProblem('F1', cand)) MECH.f1 = v; } });
    } else {
      [0, F2.loadDeg].forEach(function (v) { if (Math.abs(MECH.f2 - v) < 0.8 && MECH.f2 !== v) { cand = curOffs(); cand.F2 = v; if (!poseProblem('F2', cand)) MECH.f2 = v; } });
    }
  }
  function holdStep(ts) {
    holdRaf = null;
    var h = holding; if (!h) return;
    if (h.last === null) h.last = ts;
    var dt = Math.min(0.05, (ts - h.last) / 1000); h.last = ts;
    var cand = curOffs(), prob = null, next;
    if (h.end === 'F1') {
      next = Math.round((MECH.f1 - h.dir * F1.rate * dt) * 100) / 100;   // 上げる(dir -1)で増える
      if (next > F1.maxRaise) next = F1.maxRaise; if (next < 0) next = 0;
      if (next === MECH.f1) prob = h.dir < 0 ? '1番は上げきりです' : '1番は下げきりです(走行位置)';
      else { cand.F1 = next; if (h.dir > 0) prob = poseProblem('F1', cand); }
      if (!prob) MECH.f1 = next;
    } else {
      next = Math.round((MECH.f2 + h.dir * F2.rate * dt) * 100) / 100;   // 上げる(dir -1)で傾きが減る
      if (next > F2.maxDeg) next = F2.maxDeg; if (next < F2.minDeg) next = F2.minDeg;
      if (next === MECH.f2) prob = h.dir < 0 ? '2番は上げきりです' : '2番は下げきりです(後ろが尻尾に着きます)';
      else { cand.F2 = next; if (h.dir > 0) prob = poseProblem('F2', cand); }
      if (!prob) MECH.f2 = next;
    }
    if (prob) { if (h.warned !== prob) { onWarn(prob); h.warned = prob; } } else h.warned = null;
    holdRaf = requestAnimationFrame(holdStep);
  }
  function pressInfo() { return { hold: holding ? { end: holding.end, dir: holding.dir } : null, hang: 0, jack: 0 }; }

  // ---- つながり(道) ----
  // 2番の後端が尻尾(道板の根元)まで下りていれば、道板↔2番(上段の道)がつながる
  function upperConnected() { return MECH.f2 >= F2.connectDeg; }
  // 1番の後端と2番のヒンジの高さが近ければ、2番↔1番がつながる(1番を上げ過ぎると段差で通れない)
  function f1Connected() { return Math.abs((F1.rear[1] - MECH.f1) - F2.hinge[1]) <= 14; }
  function atTravel(id) { return id === 'F1' ? MECH.f1 < 0.5 : Math.abs(MECH.f2) < 0.5; }
  function f5Slope() { return MECH.bridge; }
  function slopeReady() { return MECH.bridge && slopeT() >= 1; }

  // ---- 道板・スロープ(時間で進む動き) ----
  var RAMP = { t: 0, last: null };
  var RAMP_SEC = T.ramp.slideSec || 1.15;
  function rampUpdate() {
    var now = performance.now(), dt = RAMP.last === null ? 0 : Math.min(2, (now - RAMP.last) / 1000);
    RAMP.last = now;
    var target = MECH.ramp ? 1 : 0, step = dt / RAMP_SEC;
    RAMP.t = RAMP.t < target ? Math.min(target, RAMP.t + step) : Math.max(target, RAMP.t - step);
  }
  function rampReady() { rampUpdate(); return MECH.ramp && RAMP.t >= 1; }
  function toggleRamp() {
    var car = window.GAME_STATE && window.GAME_STATE.car;
    if (MECH.ramp && car && !car.seated && car.phase !== 'docked') {
      if (car.phase === 'ready' && !(car.progress > 0) && window.GAME_STATE.dismissCar) window.GAME_STATE.dismissCar();
      else { onWarn('車が道板の上・作業中なので、道板をしまえません'); return; }
    }
    rampUpdate();
    MECH.ramp = !MECH.ramp;
    onInfo(MECH.ramp ? '道板を出した' : '道板をしまった');
  }
  var SLOPE = { t: 0, last: null };
  function slopeT() {
    var now = performance.now(), dt = SLOPE.last === null ? 0 : Math.min(2, (now - SLOPE.last) / 1000);
    SLOPE.last = now;
    var target = MECH.bridge ? 1 : 0, step = dt / (T.slope.sec || 0.9);
    SLOPE.t = SLOPE.t < target ? Math.min(target, SLOPE.t + step) : Math.max(target, SLOPE.t - step);
    return SLOPE.t;
  }
  // スロープの上げ下げ(4番へ積む時に上げる)。5番に積んだ車の鼻がスロープに当たるので、5番に車がある間は上げられない
  function toggleBridge() {
    var st = window.GAME_STATE, car = st && st.car;
    if (!MECH.bridge) {
      var o5 = st && st.occupied['5'];
      if (o5) { onWarn('5番に車が積んであるので、スロープを上げられません(4番は5番より先に積みます)'); return; }
    } else if (car && !car.seated && car.phase !== 'docked' && car.route && car.route.id === '4' && car.progress > 0) {
      onWarn('4番へ向かう車がスロープを渡るので下げられません'); return;
    }
    slopeT();
    MECH.bridge = !MECH.bridge;
    onInfo(MECH.bridge ? '4番へのスロープを上げた' : '4番へのスロープを下げた');
  }

  // 走れる道: 道板↔2番がつながっていれば上段(U)、スロープが上がっていれば4番へ(4)、それ以外は下段(L)
  function chooseRoute6b() {
    if (upperConnected()) return 'U';
    if (slopeReady()) return '4';
    return 'L';
  }
  // 道の上の車が通れない理由(game.js の routeProblems が6b の時に呼ぶ)。[{key,msg}]
  function routeProblems6b(car) {
    var out = [], id = car.route.id;
    if (!rampReady()) out.push({ key: 'ramp', msg: '道板が出ていません。「道板を出す」で出してから進めてください。' });
    if (id === 'U') {
      if (car.f2FrontArc !== undefined && car.progress > car.f2FrontArc - 30 && !f1Connected()) {
        out.push({ key: 'f1link', msg: '1番へはまだ2番とつながっていません。1番を下げて(走行位置の近くに)ください。' });
      }
    } else {
      var why = lowerRoutePathProblem(car);
      if (why) out.push({ key: 'lowfloor', msg: why });
      if (id === 'L' && MECH.bridge) out.push({ key: 'slope', msg: 'スロープが上がっています。4番へ積むなら進めて、5番へ積むならスロープを下げてください。' });
    }
    return out;
  }

  // サイクル完了の条件(modes.js): 2番が傾いたまま(尻尾に着いたまま)ではない・スロープを下げた・道板をしまった。1番は4番の車に合わせて上げたままでよい
  function cycleReady() {
    if (MECH.f2 > 0.6) return false;
    if (MECH.bridge || slopeT() > 0) return false;
    if (MECH.ramp || (rampUpdate(), RAMP.t) > 0) return false;
    return true;
  }
  function initPins() { MECH.f1 = 0; MECH.f2 = 0; }   // 次のサイクルへ: 1番・2番を走行位置へ(modes.js が積み終わりのリセットで呼ぶ)
  function resetAll() {
    holdStop();
    MECH.ramp = false; RAMP.t = 0; RAMP.last = null;
    MECH.bridge = false; SLOPE.t = 0; SLOPE.last = null;
    initPins();
  }

  function onWarn(msg) { if (window.FLOOR_MECH_NOTIFY) window.FLOOR_MECH_NOTIFY(msg, 'warn'); }
  function onInfo(msg) { if (window.FLOOR_MECH_NOTIFY) window.FLOOR_MECH_NOTIFY(msg, 'info'); }

  window.FLOOR_MECH = {
    is6b: true, T: T, FLOORS: FLOORS, FIDS: FIDS, MECH: MECH, FRAME_GAP_PX: FRAME_GAP_PX,
    poseOf: poseOf, onFloor: onFloor, curOffs: curOffs, tableAt: tableAt,
    overlap: overlap, slotOverlap: slotOverlap, poseProblem: poseProblem,
    holdStart: holdStart, holdStop: holdStop, pressInfo: pressInfo,
    upperConnected: upperConnected, f1Connected: f1Connected, atTravel: atTravel, f5Slope: f5Slope, slopeReady: slopeReady,
    toggleRamp: toggleRamp, rampUpdate: rampUpdate, rampReady: rampReady, rampT: function () { rampUpdate(); return RAMP.t; },
    toggleBridge: toggleBridge, bridgeT: slopeT, bridgeReady: slopeReady, slopeT: slopeT,
    chooseRoute6b: chooseRoute6b, routeProblems6b: routeProblems6b, cycleReady: cycleReady, initPins: initPins, resetAll: resetAll,
    // semi-6 の機構の口(無い機構は何もしない・常に偽)。他のファイルが参照して落ちないように
    hangReachable: function () { return false; }, tireOffGround: function () { return false; }, jackTiltDeg: function () { return 0; }, jackLift: function () { return 0; },
    jackHoldStart: function () { }, jackHoldStop: function () { }
  };
})();
