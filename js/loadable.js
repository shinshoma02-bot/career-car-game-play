// 引いた車の組み合わせが、物理的に積めるかの判定(デッキを引く時に使う。積めなければ引き直す)
//  6台: 1〜6番に割り当てる全ての並べ方から、いちばん低くなる並べ方を探す。
//        ・6番は幅1.755m以下の車(必須)
//        ・下段(4・5・6番)の車の屋根が、その上のフロアの下面にぶつからない高さまで、上のフロアを上げる必要がある(車の絵の形で判定)
//        ・上げた分だけ、上段(1・2・3番)の車の屋根も高くなる → 荷姿の高さが、制限(modes.jsのheightLimitM)+余裕を超える並べ方しか無ければ「積めない」
//  7台: 上の条件に加えて、宙段(7番)に載せる車・5番・6番が、宙段の動き(スロープ〜固定ピンの高さ)の間に当たらない組み合わせがあること(fm.hangLowerFit / hangUpperFit)。
//        荷姿の高さは、2番前・3番前・3番後ろを「宙段と7番の車・下段の車に当たらない最も低い穴」まで下げた棚で評価する(check7。2026-10-07。以前は全てピンの上限に決め付けていた)。
//        5番は、バック(鼻を宙段側へ)と前向き(軽トラの荷台を宙段側へ)の両方、5番の輪止めを前へ寄せる段数(0〜11段)も調べる
(function () {
  var cfg = window.TRAILER_CONFIG, fm = window.FLOOR_MECH;
  if (!cfg || !fm) return;
  var PX = cfg.pxPerMeter, GAP = fm.FRAME_GAP_PX;
  var SLACK_M = 0.45;   // 制限をこれだけ超えるまでは「積める」(抽選をほとんど弾かない範囲。実際に超えた分は、これまで通りスコアで減点)
  // 棚を積み込み後に置く標準の高さ(各棚がピンに載った位置。通しプレイで使った値)
  var BASE = { F1f: -2.7, F1r: -3.6, F2f: 6.7, MID: -3.6, F3r: 3.6, F5f: 0, F5r: 0, F7: 0 };

  function dims(it, flip) {
    var e = it.entry, w = e.len * PX, h = w * e.aspect, tl = flip ? 1 - e.tr : e.tl;
    var prof = e.prof ? (flip ? e.prof.slice().reverse() : e.prof) : null;   // 左右反転(バック)は輪郭を逆順にする
    return { img: flip ? it.flipImg : it.img, prof: prof, w: w, h: h, leftTireX: tl * w, e: e };
  }
  // 下段の車(slot=4/5/6)の屋根にぶつからないために、上のフロアを標準の高さからどれだけ上げる必要があるか(px)。
  // 標準の高さのフロアは、下段の床から REF_CLEAR(約1.54m)の高さに下面がある(走行位置・ピンの標準位置)。それより高い車は、超えた分だけ上げる。車の絵の形(屋根の一番高い所)で測る
  var REF_CLEAR = 176 + GAP;   // 標準の高さのフロアの下面は下段の床から 176px。実車は枠の内側に約5cm(GAP)の隙間があるので、車の屋根はその分(5cm)まで下面の中に入れる
  var COVER = { 4: ['F1', 'F2'], 5: ['F2'], 6: ['F3'] };   // その下段スロープの上にあるフロア
  function lowerNeed(d, slotNum) {
    var S = cfg.slots[slotNum], occ = { img: d.img, prof: d.prof, w: d.w, h: d.h, leftTireX: d.leftTireX };
    var tx = S.tireX + 8, pos = [tx, S.deckY], x0 = tx - d.leftTireX, top = fm.carTopY(occ, pos, 0), hmax = 0;   // 高さの計算では、宙段用の許容(tol)は使わない
    for (var x = x0; x <= x0 + d.w; x += 6) hmax = Math.max(hmax, S.deckY - top(x));
    var n = Math.max(0, hmax - REF_CLEAR), need = { F1: 0, F2: 0, F3: 0 };
    COVER[slotNum].forEach(function (id) { need[id] = n; });
    return need;
  }  // 上段の車(slot=1/2/3)の屋根の高さ(y。小さいほど高い)。フロアは標準の位置
  function upperTop(d, slotNum) {
    var S = cfg.slots[slotNum];
    return fm.onFloor(S.floor, S.tireX, S.deckY, BASE)[1] - d.h;
  }
  function permute(arr, k, cb) {   // arr から k 個を並べる全ての並べ方
    var used = [], cur = [];
    (function rec() {
      if (cur.length === k) { cb(cur.slice()); return; }
      for (var i = 0; i < arr.length; i++) { if (used[i]) continue; used[i] = true; cur.push(arr[i]); rec(); cur.pop(); used[i] = false; }
    })();
  }
  function isNarrow(e) { return (e.width || 0) <= (cfg.slots['6'].maxWidthM || Infinity); }


  // ---- 7台(宙段): 2番前・3番前・3番後ろの棚を、宙段が当たらない最小の高さまで下げて評価する(2026-10-07) ----
  // 以前は、宙段を使う時の棚を「ピンで固定できる上限」(FIT_OFFS)に固定して評価していたため、2・3番に背の高い車を入れると荷姿が高く出た。
  // 実際は、宙段(と7番の車)の真上に来る3番前(MID)だけが高く、両端の2番前・3番後ろは、宙段の上を外れるので低くできる(棚は傾けられる)。
  //  ・MID(3番前)の穴ごとに、2番前(F2f)・3番後ろ(F3r)を「宙段・7番の車・下段(4・5・6番)の車・棚の傾き・フレーム」に当たらない最も低い穴まで下げる
  //  ・その中で、上段(1〜3番)の車の屋根が最も低くなる MID を選ぶ。2番前は、5番が平らな時に上がる freeTop まで(以前の -60 は、5番がスロープの時だけ届く高さだった)
  var TILT_MAX_DEG = 5;   // 仮: 2・3番の棚の傾きの上限(度)。実車は写真で5〜15度傾いて積まれているが、傾いた車の高さは計算に入れていないので控えめにする
  var D = { M: [], F2: [], F3: [] };   // 穴の高さの一覧(低い順。off が大きい=低い)
  (function () {
    var E = fm.ENDS, h;
    for (h = 1; h <= E.MID.holeMax; h++) D.M.push(fm.offOfHole('MID', h));
    for (h = 1; h <= E.F2f.holeMax; h++) D.F2.push(fm.offOfHole('F2f', h));
    D.F2.push(E.F2f.freeTop); D.F2.sort(function (a, b) { return b - a; });
  })();
  // 3番後ろの穴の高さは、3番前(MID)の高さで変わる(ピンは柱で固定のため)。MID の高さ m ごとに、届く範囲の穴の高さを低い順に返す
  function f3Dom(m) {
    var E = fm.ENDS, a = [], h, v;
    for (h = 1; h <= E.F3r.holeMax; h++) { v = fm.offOfHole('F3r', h, m); if (v >= E.F3r.r[0] - 0.01 && v <= E.F3r.r[1]) a.push(v); }
    return a.sort(function (x, y) { return y - x; });
  }
  D.F3 = f3Dom;
  // 5番の輪止めは前(キャビン側)へ最大 chockRange.front(cm)まで、step(cm)刻みで動かせる。車をその分前へ寄せると、宙段の前端に車の鼻が当たらなくなる
  var CR5 = cfg.slots['5'].chockRange || {}, STEP5 = (CR5.step || 4) / 100 * PX, MAXSTEP5 = Math.round((CR5.front || 0) / (CR5.step || 4));
  var CAR_GAP_PX = 2;   // 4番の車の後ろ端と5番の車の前端の最小の間隔(重なると「駐車中の車にぶつかる」)
  function minSteps5(d5, ph) {   // 宙段に当たらない最小の寄せ段数(無ければ -1)
    return cached('S' + carKey({ entry: d5.e }, d5.flip) + ph, function () {
      for (var s = 0; s <= MAXSTEP5; s++) if (fm.hangLowerFit(d5, '5', s * STEP5).ok) return s;
      return -1;
    });
  }
  function baseOffs() { return Object.assign(fm.curOffs(), { F2f: BASE.F2f, MID: BASE.MID, F3r: BASE.F3r }); }
  // 下段の車(slot=4/5/6)の屋根が作る「上のフロアの下面は、これより下に来てはいけない」高さの表(枠の内側 GAP は車が入り込める)
  function lowerEnv(d, slotNum, shiftPx) {
    var S = cfg.slots[slotNum], occ = { img: d.img, prof: d.prof, w: d.w, h: d.h, leftTireX: d.leftTireX };
    var pos = [S.tireX + 8 - (shiftPx || 0), S.deckY], top = fm.carTopY(occ, pos, 0), x0 = pos[0] - d.leftTireX, L = new Float32Array(fm.ENV.n);
    for (var i = 0; i < L.length; i++) {
      var x = fm.ENV.x0 + i * fm.ENV.dx;
      L[i] = x >= x0 && x <= x0 + d.w ? top(x) + GAP : 1e9;
    }
    return L;
  }
  // 1つの制約(包絡線 L)について、MID の穴ごとに、その棚(end='F2f' か 'F3r')を下げられる最も低い高さを求める(表。入れられない MID は null)
  //  棚を上げるほど余裕が増える(単調)ので、二分探索。傾き(TILT_MAX_DEG)も条件に入れる
  function frontierOne(L, floorId, end, domIn) {
    var E = fm.ENDS, out = [], base = baseOffs();
    function ok(m, v) {
      var o = Object.assign({}, base); o.MID = m; o[end] = v;
      if (Math.abs(fm.poseOf(floorId, o).ang) > TILT_MAX_DEG) return false;
      return !L || fm.envFits([L], [floorId], o);
    }
    D.M.forEach(function (m) {
      var dom = typeof domIn === 'function' ? domIn(m) : domIn;
      var lo = 0, hi = dom.length - 1;
      if (hi < 0) { out.push(null); return; }
      if (!ok(m, dom[hi])) { out.push(null); return; }
      while (lo < hi) { var mid = (lo + hi) >> 1; if (ok(m, dom[mid])) hi = mid; else lo = mid + 1; }
      out.push(dom[lo]);
    });
    return out;
  }
  function higher(a, b) { return a === null || b === null ? null : Math.min(a, b); }   // 高い方(off が小さい方)。どちらかが null なら null
  var cache = {};
  function cached(key, fn) { return cache[key] || (cache[key] = fn()); }
  function carKey(it, flip) { return it.entry.id + (flip ? 'r' : ''); }
  // 宙段と7番の車(c7)に対する F2f・F3r の下限の表(固定ピンの穴 ph ごと)
  function hangFrontier(it, d7, ph) {
    return cached('H' + carKey(it) + ph, function () {
      var L = fm.hangUpperEnvelope(d7);
      return { f2: frontierOne(L, 'F2', 'F2f', D.F2), f3: frontierOne(L, 'F3', 'F3r', D.F3) };
    });
  }
  function lowerFrontier(it, d, slotNum, flip, steps) {
    return cached('L' + slotNum + carKey(it, flip) + (steps || 0), function () {
      var L = lowerEnv(d, slotNum, (steps || 0) * STEP5);
      return slotNum === '6' ? { f3: frontierOne(L, 'F3', 'F3r', D.F3) } : { f2: frontierOne(L, 'F2', 'F2f', D.F2) };
    });
  }
  function tiltFrontier() {
    return cached('T', function () { return { f2: frontierOne(null, 'F2', 'F2f', D.F2), f3: frontierOne(null, 'F3', 'F3r', D.F3) }; });
  }
  var staticCache = {};
  function staticOk(o) {
    var k = o.F2f.toFixed(1) + '/' + o.MID.toFixed(1) + '/' + o.F3r.toFixed(1);
    if (staticCache[k] === undefined) staticCache[k] = fm.staticPoseProblem(['F2', 'F3'], Object.assign(fm.curOffs(), o)) === null;
    return staticCache[k];
  }
  function holeOf(k, off) { return fm.holeNo(k, off); }

  function check7(items, fx, fw) {
    var idx = items.map(function (_, i) { return i; });
    var EPS = 0.004, bestCost = Infinity, best7 = Infinity, fit = null, fitOrder = null, fitPin = 1, fitFlip5 = true, fitSteps5 = 0, fitShelf = null, pins = [];
    var hole0 = fm.stopPin ? fm.stopPin.hole : 1, nHoles = fm.stopPinHoles || 1, ph, ptilt = tiltFrontier();
    var S1 = cfg.slots['1'], S2 = cfg.slots['2'], S3 = cfg.slots['3'];
    function floorY(S, o) { return fm.onFloor(S.floor, S.tireX, S.deckY, o)[1]; }
    // フレームの固定ピン(1〜nHoles番の位置)のどれか1つで成立すれば積める。成立する位置を pins に集める
    for (ph = 1; ph <= nHoles; ph++) {
      if (fm.stopPin) { fm.stopPin.hole = ph; fm.stopPinResolve(); }
      var okHere = false;
      permute(idx, 3, function (t) {
        var i5 = t[0], i6 = t[1], i7 = t[2];
        if (!isNarrow(items[i6].entry)) return;
        if (fx && fx.assign && (i5 !== fx.assign[0] || i6 !== fx.assign[1] || i7 !== fx.assign[2])) return;
        if (!fm.hangLowerFit(fw[i6], '6').ok) return;
        var hf = hangFrontier(items[i7], fw[i7], ph), l6 = lowerFrontier(items[i6], fw[i6], '6', false);
        var rest = idx.filter(function (i) { return t.indexOf(i) < 0; });   // 1〜4番に載せる4台
        // 5番(宙段側へ車の鼻を向けるバック=反転 か、通常の前向き(軽トラの荷台を宙段側にする裏技))
        [true, false].forEach(function (flip5) {
          if (fx && fx.flip5 !== undefined && !!fx.flip5 !== flip5) return;
          var d5 = flip5 ? dims(items[i5], true) : fw[i5]; d5.flip = flip5;
          var st5 = minSteps5(d5, ph);
          if (st5 < 0) return;
          var l5 = lowerFrontier(items[i5], d5, '5', flip5, st5);
          rest.forEach(function (i4) {   // 4番の車(F2 の下にも入る)
            // 5番の車を前へ寄せても、4番の車(前向き)の後ろ端にぶつからない
            var x1of4 = cfg.slots['4'].tireX + 8 - fw[i4].leftTireX + fw[i4].w, x0of5 = cfg.slots['5'].tireX + 8 - st5 * STEP5 - d5.leftTireX;
            if (x0of5 < x1of4 + CAR_GAP_PX) return;
            var l4 = lowerFrontier(items[i4], fw[i4], '4', false);
            var needF1 = lowerNeed(fw[i4], '4').F1;
            var Y2 = [], Y3 = [], SH = [];
            for (var q = 0; q < D.M.length; q++) {
              var f2 = higher(higher(hf.f2[q], ptilt.f2[q]), higher(l5.f2[q], l4.f2[q])), f3 = higher(higher(hf.f3[q], ptilt.f3[q]), l6.f3[q]);
              var o = f2 === null || f3 === null ? null : { F2f: f2, MID: D.M[q], F3r: f3 };
              if (o && !staticOk(o)) o = null;
              if (!o) { Y2.push(null); Y3.push(null); SH.push(null); continue; }
              var ob = Object.assign(baseOffs(), o);
              Y2.push(floorY(S2, ob)); Y3.push(floorY(S3, ob)); SH.push(o);
            }
            var three = rest.filter(function (i) { return i !== i4; });
            permute(three, 3, function (a3) {   // a3 = 1〜3番の車
              if (fx && fx.order && (a3[0] !== fx.order[0] || a3[1] !== fx.order[1] || a3[2] !== fx.order[2] || i4 !== fx.order[3])) return;
              var bestTop = -Infinity, bq = -1;   // top = 3台の屋根のうち一番高い所(y。小さいほど高い)。MID を選んで、これが一番低い(大きい)ものを探す
              for (var q = 0; q < D.M.length; q++) {
                if (!SH[q]) continue;
                var top = Math.min(floorY(S1, baseOffs()) - fw[a3[0]].h - Math.max(0, needF1), Y2[q] - fw[a3[1]].h, Y3[q] - fw[a3[2]].h);   // 小さいほど高い
                if (top > bestTop) { bestTop = top; bq = q; }
              }
              if (bq < 0) return;
              okHere = true;
              var Hm = (cfg.ramp.groundY - bestTop) / PX;
              var cost = fw[a3[0]].h + fw[i4].h + fw[i5].h + fw[i7].h + 0.5 * (fw[i5].w + fw[i7].w) + 0.5 * st5 + (flip5 ? 0 : 0.01);   // 1番・4番と、5番・宙段に入る車の高さ・長さ(同じ高さなら前向きの5番を好む)
              if (Hm < best7 - EPS || (Hm < best7 + EPS && cost < bestCost)) { best7 = Math.min(best7, Hm); bestCost = cost; fit = t; fitOrder = a3.concat([i4]); fitPin = ph; fitFlip5 = flip5; fitShelf = SH[bq]; fitSteps5 = st5; }
            });
          });
        });
      });
      if (okHere) pins.push(ph);
    }
    if (fm.stopPin) { fm.stopPin.hole = hole0; fm.stopPinResolve(); }
    if (!fit) return { ok: false, why: '宙段に載せて6番・5番も積める組み合わせが無い(車が高い・長い)' };
    var shelf = { F2f: fitShelf.F2f, MID: fitShelf.MID, F3r: fitShelf.F3r };
    shelf.holes = { F2f: holeOf('F2f', shelf.F2f), MID: holeOf('MID', shelf.MID), F3r: fm.holeNo('F3r', shelf.F3r, shelf.MID) };
    return { ok: true, assign: fit, order: fitOrder, H: best7, pins: pins, bestPin: fitPin, flip5: fitFlip5, chock5: fitSteps5, shelf: shelf };   // order = 1〜4番に載せる車(デッキの番号)
  }

  // items: [{entry, img, flipImg}](6台か7台)。戻り値 { ok, H(最小の荷姿の高さm), why }
  //  opts.fixed = { assign: [5番,6番,7番のデッキ番号], order: [1〜4番のデッキ番号] } を渡すと、その割り当てだけを調べる(チュートリアルの固定デッキ用。assign だけ・order だけの指定もできる)
  function check(items, opts) {
    var n = items.length, fx = opts && opts.fixed;
    if (!items.some(function (it) { return isNarrow(it.entry); })) return { ok: false, why: '6番に積める幅の車が無い' };
    var fw = items.map(function (it) { return dims(it, false); });
    var limit = (window.GAME_MODE && window.GAME_MODE.SCORE ? window.GAME_MODE.SCORE.heightLimitM : 4.1) + SLACK_M;
    var idx = items.map(function (_, i) { return i; });

    if (n >= 7) return check7(items, fx, fw);
    // 6台: 下段(4,5,6)の必要な上げ幅と、上段(1,2,3)の屋根の高さを前もって計算して、全ての並べ方を調べる
    var need = {}, tops = {};
    idx.forEach(function (i) {
      need[i] = { 4: lowerNeed(fw[i], '4'), 5: lowerNeed(fw[i], '5'), 6: lowerNeed(fw[i], '6') };
      tops[i] = { 1: upperTop(fw[i], '1'), 2: upperTop(fw[i], '2'), 3: upperTop(fw[i], '3') };
    });
    var best = Infinity, bestAssign = null;
    permute(idx, 6, function (a) {   // a[0..5] = 1..6番に載せる車
      if (!isNarrow(items[a[5]].entry)) return;
      var c4 = a[3], c5 = a[4], c6 = a[5];
      var L1 = Math.max(0, need[c4][4].F1), L2 = Math.max(0, need[c4][4].F2, need[c5][5].F2), L3 = Math.max(0, need[c6][6].F3);
      var top = Math.min(tops[a[0]][1] - L1, tops[a[1]][2] - L2, tops[a[2]][3] - L3);
      if (top < best) { best = top; bestAssign = a; }
    });
    // top が小さいほど高い。荷姿の高さ = 地面から屋根まで
    var H = bestAssign ? (cfg.ramp.groundY - best) / PX : Infinity;
    return H <= limit ? { ok: true, H: H, assign: bestAssign } : { ok: false, H: H, why: '荷姿の高さが制限を超える(最も低く積んでも ' + H.toFixed(2) + 'm)' };
  }
  window.LOADABLE = { check: check, SLACK_M: SLACK_M, setTilt: function (deg) { TILT_MAX_DEG = deg; cache = {}; staticCache = {}; }, tilt: function () { return TILT_MAX_DEG; } };   // setTilt: 検証用(傾きの上限を変えて比べる)
})();
