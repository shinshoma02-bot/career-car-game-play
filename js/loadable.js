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
  var SLACK_M = 0.45;   // (旧)制限をこれだけ超えるまでは「積める」。2026-10-09 から、下の CAP_M(荷姿の高さの上限)で判定する
  // 荷姿の高さの上限(m)。これを超える並べ方しか無ければ「積めない」(2026-10-09 ユーザー指示: 高さは気にしないとはいえ、4.5mを超えるのはまずい)。
  // 1・4番に箱バン・ミニバン・SUVのような背の高い車を積むと、上のフロアが高くなって、この上限を超える(=背の高い車が3台以上あると、ほぼ積めない)
  var CAP_M = (cfg.score && cfg.score.heightCapM) || 4.5;
  // 1番・4番(前の列)に積める車: 背の低い車(高さ LOW_MAX_PX 以下)か、軽トラ(荷台が低い)だけ(2026-10-09 ユーザー指示: 箱バン・ミニバンのような背の高い車は積めない)
  var LOW_MAX_PX = 192;
  function lowCar(d) { return d.h <= LOW_MAX_PX || /^truck/.test(d.e.id); }
  // 棚を積み込み後に置く標準の高さ(各棚がピンに載った位置。通しプレイで使った値)
  var BASE = { F1f: -2.7, F1r: -3.6, F2f: 6.7, MID: -3.6, F3r: 3.6, F5f: 0, F5r: 0, F7: 0 };

  function dims(it, flip) {
    var e = it.entry, w = e.len * PX, h = w * e.aspect, tl = flip ? 1 - e.tr : e.tl;
    var prof = e.prof ? (flip ? e.prof.slice().reverse() : e.prof) : null;   // 左右反転(バック)は輪郭を逆順にする
    return { img: flip ? it.flipImg : it.img, prof: prof, w: w, h: h, leftTireX: tl * w, e: e, flip: !!flip };
  }
  // 下段の車(slot=4/5/6)の屋根にぶつからないために、上のフロアを標準の高さからどれだけ上げる必要があるか(px)。
  // 標準の高さのフロアは、下段の床から REF_CLEAR(約1.54m)の高さに下面がある(走行位置・ピンの標準位置)。それより高い車は、超えた分だけ上げる。車の絵の形(屋根の一番高い所)で測る
  var REF_CLEAR = 176 + GAP;   // 標準の高さのフロアの下面は下段の床から 176px。実車は枠の内側に約5cm(GAP)の隙間があるので、車の屋根はその分(5cm)まで下面の中に入れる
  var F1_DOWN = 30;   // 1番フロアを標準の高さから下げられる最大(px。走行位置までは約35〜75px下がるが、控えめに)
  // 1番フロアを標準の高さ(BASE)から上げる量(px。負=下げられる量)。下の4番の車の屋根(lowerEnv)に、1番フロアの下面が当たらない最小の量を、実際の形で調べる(二分探索)
  var f1Cache = {};
  // 1番フロアは、前(F1f)は最高の穴までしか上がらない(=ほとんど上がらない)、後ろ(F1r)は大きく上がる(ケツ上がり)。上げる量 s(px。上げる=正)の時の棚の高さ
  function f1Offs(s) {
    var E = fm.ENDS, hiF = fm.offOfHole('F1f', E.F1f.holeMax), hiR = fm.offOfHole('F1r', E.F1r.holeMax), o = baseOffs();
    o.F1f = Math.max(hiF, BASE.F1f - s); o.F1r = Math.max(hiR, BASE.F1r - s);
    return o;
  }
  // 4番の車(向き d.flip)の屋根に、1番フロアの下面が当たらないために、1番フロアを標準の高さから上げる量(px。下げられる時は負)。
  // 2026-10-09: 1番フロアが実際に上がれる限界(最高の穴)までしか調べない。届かない(背の高い車を4番に積む)時は Infinity=積めない。
  // 以前は、従来の式(車の最大の高さ−標準)をそのまま使い、上げられる限界を見ていなかったので、背の高い車が4番に入った(1番フロアを貫通した)
  function f1Need(d) {
    var key = carKey({ entry: d.e }, d.flip);
    if (f1Cache[key] !== undefined) return f1Cache[key];
    var E = fm.ENDS, L = lowerEnv(d, '4', 0);
    for (var sh = 15; sh <= 60; sh += 15) { var L2 = lowerEnv(d, '4', -sh); for (var q = 0; q < L.length; q++) if (L2[q] < L[q]) L[q] = L2[q]; }   // 4番に着く前の60px手前(ゲームの屋根の判定の範囲)から、そこまでの各位置で当たらない高さ
    function ok(s) { return fm.envFits([L], ['F1'], f1Offs(s)); }
    var lo = -F1_DOWN, hi = Math.max(BASE.F1f - fm.offOfHole('F1f', E.F1f.holeMax), BASE.F1r - fm.offOfHole('F1r', E.F1r.holeMax)), r;
    if (ok(lo)) r = lo;
    else if (!ok(hi)) r = Infinity;
    else { while (hi - lo > 0.5) { var m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; } r = hi + 3; if (!ok(r)) r = Infinity; }   // +3px: ピンの穴の間隔(約6px)の半分。穴に載せるので、ぴったりの高さには止められない
    return (f1Cache[key] = r);
  }
  var COVER = { 4: ['F1', 'F2'], 5: ['F2'], 6: ['F3'] };   // その下段スロープの上にあるフロア
  function lowerNeed(d, slotNum) {
    var S = cfg.slots[slotNum], occ = { img: d.img, prof: d.prof, w: d.w, h: d.h, leftTireX: d.leftTireX };
    var tx = S.tireX + 8, pos = [tx, S.deckY], x0 = tx - d.leftTireX, top = fm.carTopY(occ, pos, 0), hmax = 0;   // 高さの計算では、宙段用の許容(tol)は使わない
    for (var x = x0; x <= x0 + d.w; x += 6) hmax = Math.max(hmax, S.deckY - top(x));
    // n=標準の高さから上げる量(px。下げられる時は負)。1番フロアは、下の4番の車が低ければ標準より下げられる(F1_DOWN まで)。2・3番は呼び出し側で 0 以上に丸める
    var n = Math.max(-F1_DOWN, hmax - REF_CLEAR), need = { F1: 0, F2: 0, F3: 0 };
    COVER[slotNum].forEach(function (id) { need[id] = n; });
    // 2・3番フロアの上げる量は、車の絵の輪郭と棚の実際の形で求め直す(高さだけの近似だと、屋根がフロアに入り込んだ。2026-10-09)。着く前の60pxからの各位置で当たらないこと
    var Lenv = lowerEnv(d, slotNum, 0);
    for (var sh = 15; sh <= 60; sh += 15) { var L2 = lowerEnv(d, slotNum, -sh); for (var q = 0; q < Lenv.length; q++) if (L2[q] < Lenv[q]) Lenv[q] = L2[q]; }
    function envNeed(id, mk, rmax) {
      function ok(r) { return fm.envFits([Lenv], [id], mk(r)); }
      if (ok(0)) return 0;
      if (!ok(rmax)) return Infinity;
      var lo = 0, hi = rmax; while (hi - lo > 0.5) { var m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; }
      return hi + 1;
    }
    var rMid = Math.max(0, BASE.MID - fm.offOfHole('MID', fm.ENDS.MID.holeMax));
    if (COVER[slotNum].indexOf('F2') >= 0) need.F2 = Math.max(0, envNeed('F2', function (r) { var o = Object.assign({}, BASE); o.F2f = BASE.F2f - r; o.MID = BASE.MID - Math.min(r, rMid); return o; }, Math.max(0, BASE.F2f - fm.offOfHole('F2f', fm.ENDS.F2f.holeMax))));
    if (COVER[slotNum].indexOf('F3') >= 0) need.F3 = Math.max(0, envNeed('F3', function (r) { var o = Object.assign({}, BASE); o.MID = BASE.MID - Math.min(r, rMid); o.F3r = BASE.F3r - r; return o; }, Math.max(0, BASE.F3r - fm.offOfHole('F3r', fm.ENDS.F3r.holeMax, fm.offOfHole('MID', fm.ENDS.MID.holeMax)))));
    return need;
  }  // 上段の車(slot=1/2/3)の屋根の高さ(y。小さいほど高い)。フロアは標準の位置
  function upperTop(d, slotNum) {
    return roofY(d, slotNum, BASE);
  }
  // 上段(1・2・3番)の車の屋根の一番高い所(y。小さいほど高い)。車の絵の輪郭(profile)と、フロアの傾き(ケツ上がり等)で測る。
  // 前向きとバック(輪郭を逆順・タイヤ位置を反転)で違う: フロアがケツ上がりなら、屋根の高い所が後ろに来ない向き(バック)のほうが低くなる
  function roofY(d, slotNum, offs) {
    var S = cfg.slots[slotNum], a = fm.poseOf(S.floor, offs).ang * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), p = fm.onFloor(S.floor, S.tireX, S.deckY, offs), prof = d.prof, best = Infinity;
    if (!prof || !prof.length) return p[1] - d.h;
    for (var c = 0; c < prof.length; c++) {
      var lx = (c + 0.5) / prof.length * d.w - d.leftTireX, ly = -d.h * prof[c];
      best = Math.min(best, p[1] + lx * sa + ly * ca);
    }
    return best;
  }
  // 1番の車の後ろ端と、2番の車の鼻は、横から見て重ならない(2番の落とし穴が2番扇動板の後ろへ移って、2番の車が前に寄ったため。2026-10-08)。
  // 1番は上のフロア(F1)で2番より約0.2m高いだけなので、車の高さ(1.4〜1.8m)では重なると当たる。余裕 12px(約0.1m)
  function pair12Ok(d1, d2) {
    var S1 = cfg.slots['1'], S2 = cfg.slots['2'];
    return S2.tireX + 8 - d2.leftTireX >= S1.tireX + 8 - d1.leftTireX + d1.w + 12;
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
    var idx = items.map(function (_, i) { return i; }), fr = items.map(function (it) { return dims(it, true); }), D2 = [fw, fr], roofCache = {};
    function roofOf(i, f, slot, offs) {   // 上段の車の屋根の高さ(y)。向き f(0=前向き・1=バック)・スロット・棚の高さごとに1回だけ計算する
      var k = items[i].entry.id + '|' + f + '|' + slot + '|' + (slot === '1' ? offs.F1f.toFixed(1) + '/' + offs.F1r.toFixed(1) : offs.F2f.toFixed(1) + '/' + offs.MID.toFixed(1) + '/' + offs.F3r.toFixed(1));
      return roofCache[k] !== undefined ? roofCache[k] : (roofCache[k] = roofY(D2[f][i], slot, offs));
    }
    var EPS = 0.004, bestCost = Infinity, best7 = Infinity, fit = null, fitOrder = null, fitPin = 1, fitFlip5 = true, fitSteps5 = 0, fitShelf = null, fitNeedF1 = 0, fitFlips = null, pins = [];
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
          rest.forEach(function (i4) { [0, 1].forEach(function (f4) {   // 4番の車(F2 の下にも入る)・向き(前向き0・バック1)
            var d4 = D2[f4][i4];
            if (!lowCar(d4)) return;   // 4番は背の低い車だけ
            // 5番の車を前へ寄せても、4番の車の後ろ端にぶつからない
            var x1of4 = cfg.slots['4'].tireX + 8 - d4.leftTireX + d4.w, x0of5 = cfg.slots['5'].tireX + 8 - st5 * STEP5 - d5.leftTireX;
            if (x0of5 < x1of4 + CAR_GAP_PX) return;
            var needF1 = f1Need(d4);
            if (!isFinite(needF1)) return;   // 1番フロアを上げても、4番の車の屋根に届かない(背の高い車は4番に積めない)
            var l4 = lowerFrontier(items[i4], d4, '4', f4 === 1);
            var OB = [], SH = [];
            for (var q = 0; q < D.M.length; q++) {
              var f2 = higher(higher(hf.f2[q], ptilt.f2[q]), higher(l5.f2[q], l4.f2[q])), f3 = higher(higher(hf.f3[q], ptilt.f3[q]), l6.f3[q]);
              var o = f2 === null || f3 === null ? null : { F2f: f2, MID: D.M[q], F3r: f3 };
              if (o && !staticOk(o)) o = null;
              if (!o) { OB.push(null); SH.push(null); continue; }
              OB.push(Object.assign(baseOffs(), o)); SH.push(o);
            }
            var three = rest.filter(function (i) { return i !== i4; });
            permute(three, 3, function (a3) {   // a3 = 1〜3番の車
              if (!lowCar(fw[a3[0]])) return;   // 1番は背の低い車だけ
              if (fx && fx.order && (a3[0] !== fx.order[0] || a3[1] !== fx.order[1] || a3[2] !== fx.order[2] || i4 !== fx.order[3])) return;
              var bestTop = -Infinity, bq = -1, bflips = null, f1o = f1Offs(needF1);   // top = 3台の屋根のうち一番高い所(y。小さいほど高い)。MID と、1〜3番の向き(前向き・バック)を選んで、これが一番低い(大きい)ものを探す
              for (var q = 0; q < D.M.length; q++) {
                if (!SH[q]) continue;
                var t3 = roofOf(a3[2], 0, '3', OB[q]) >= roofOf(a3[2], 1, '3', OB[q]) ? 0 : 1, y3 = roofOf(a3[2], t3, '3', OB[q]);
                for (var f1 = 0; f1 < 2; f1++) for (var f2 = 0; f2 < 2; f2++) {
                  if (!pair12Ok(D2[f1][a3[0]], D2[f2][a3[1]])) continue;
                  var top = Math.min(roofOf(a3[0], f1, '1', f1o), roofOf(a3[1], f2, '2', OB[q]), y3);   // 小さいほど高い
                  if (top > bestTop + 1e-9) { bestTop = top; bq = q; bflips = { 1: !!f1, 2: !!f2, 3: !!t3 }; }
                }
              }
              if (bq < 0) return;
              okHere = true;
              var Hm = (cfg.ramp.groundY - bestTop) / PX;
              var cost = fw[a3[0]].h + fw[i4].h + fw[i5].h + fw[i7].h + 0.5 * (fw[i5].w + fw[i7].w) + 0.5 * st5 + (flip5 ? 0 : 0.01);   // 1番・4番と、5番・宙段に入る車の高さ・長さ(同じ高さなら前向きの5番を好む)
              if (Hm < best7 - EPS || (Hm < best7 + EPS && cost < bestCost)) { best7 = Math.min(best7, Hm); bestCost = cost; fit = t; fitOrder = a3.concat([i4]); fitPin = ph; fitFlip5 = flip5; fitShelf = SH[bq]; fitNeedF1 = needF1; fitSteps5 = st5; fitFlips = Object.assign({ 4: f4 === 1 }, bflips); }
            });
          }); });
        });
      });
      if (okHere) pins.push(ph);
    }
    if (fm.stopPin) { fm.stopPin.hole = hole0; fm.stopPinResolve(); }
    if (!fit) return { ok: false, why: '宙段に載せて6番・5番も積める組み合わせが無い(車が高い・長い)' };
    if (best7 > CAP_M) return { ok: false, H: best7, why: '荷姿の高さが上限(' + CAP_M + 'm)を超える(最も低く積んでも ' + best7.toFixed(2) + 'm)' };   // 2026-10-09 ユーザー指示
    var shelf = { F2f: fitShelf.F2f, MID: fitShelf.MID, F3r: fitShelf.F3r };
    shelf.holes = { F2f: holeOf('F2f', shelf.F2f), MID: holeOf('MID', shelf.MID), F3r: fm.holeNo('F3r', shelf.F3r, shelf.MID) };
    return { ok: true, assign: fit, order: fitOrder, H: best7, pins: pins, bestPin: fitPin, flip5: fitFlip5, flips: fitFlips, chock5: fitSteps5, shelf: shelf, F1need: fitNeedF1, F1offs: (function (o) { return { F1f: o.F1f, F1r: o.F1r }; })(f1Offs(fitNeedF1)) };   // order = 1〜4番に載せる車(デッキの番号)
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
    var need = {}, tops = {}, fr = items.map(function (it) { return dims(it, true); }), D2 = [fw, fr];
    idx.forEach(function (i) {
      need[i] = { 4: lowerNeed(fw[i], '4'), 5: lowerNeed(fw[i], '5'), 6: lowerNeed(fw[i], '6') };
      // 上段の屋根の高さ(y): 前向き[0]・バック[1] の2通り(フロアがケツ上がりなら、バックのほうが低い車がある)
      tops[i] = { 1: [upperTop(fw[i], '1'), upperTop(fr[i], '1')], 2: [upperTop(fw[i], '2'), upperTop(fr[i], '2')], 3: [upperTop(fw[i], '3'), upperTop(fr[i], '3')] };
    });
    // 荷姿のいちばん低い並べ方を探す(top = 屋根のいちばん高い所のy。大きいほど低い。以前は不等号が逆で、いちばん高い並べ方を選んでいた=1・4番に背の高い車が来ていた)
    var best = -Infinity, bestAssign = null, bestFlips = null, bestL2 = 0, bestL3 = 0, roof1c = {};
    function roof1(i, f, sNeed) { var k = items[i].entry.id + '|' + f + '|' + sNeed.toFixed(1); return roof1c[k] !== undefined ? roof1c[k] : (roof1c[k] = roofY(D2[f][i], '1', f1Offs(sNeed))); }
    permute(idx, 6, function (a) {   // a[0..5] = 1..6番に載せる車
      if (!isNarrow(items[a[5]].entry)) return;
      var c4 = a[3], c5 = a[4], c6 = a[5];
      if (!lowCar(fw[a[0]]) || !lowCar(fw[c4])) return;   // 1・4番は背の低い車だけ
      var L2 = Math.max(0, need[c4][4].F2, need[c5][5].F2), L3 = Math.max(0, need[c6][6].F3);
      var t3 = tops[a[2]][3][0] >= tops[a[2]][3][1] ? 0 : 1, y3 = tops[a[2]][3][t3] - L3;
      for (var f4 = 0; f4 < 2; f4++) {   // 4番の車の向き(1番フロアの下に入る屋根の形が変わる)
        var L1 = f1Need(D2[f4][c4]);
        if (!isFinite(L1)) continue;   // 1番フロアを上げても、4番の車の屋根に届かない
        for (var f1 = 0; f1 < 2; f1++) for (var f2 = 0; f2 < 2; f2++) {
          if (!pair12Ok(D2[f1][a[0]], D2[f2][a[1]])) continue;
          var top = Math.min(roof1(a[0], f1, L1), tops[a[1]][2][f2] - L2, y3);
          if (top > best + 1e-9) { best = top; bestAssign = a; bestL2 = L2; bestL3 = L3; bestFlips = { 1: !!f1, 2: !!f2, 3: !!t3, 4: !!f4 }; }
        }
      }
    });
    var H = bestAssign ? (cfg.ramp.groundY - best) / PX : Infinity;
    // 荷姿の高さが上限(CAP_M)を超える並べ方しか無ければ「積めない」(2026-10-09 ユーザー指示)
    return bestAssign && isFinite(H) && H <= CAP_M ? { ok: true, H: H, assign: bestAssign, flips: bestFlips, L2: bestL2, L3: bestL3, rMid: Math.max(0, BASE.MID - fm.offOfHole('MID', fm.ENDS.MID.holeMax)), F1need: f1Need(D2[bestFlips[4] ? 1 : 0][bestAssign[3]]), F1offs: (function (o) { return { F1f: o.F1f, F1r: o.F1r }; })(f1Offs(f1Need(D2[bestFlips[4] ? 1 : 0][bestAssign[3]]))) } : { ok: false, H: H, why: '荷姿の高さが上限(' + CAP_M + 'm)を超える・または積める並べ方が無い(最も低く積んでも ' + (isFinite(H) ? H.toFixed(2) + 'm' : '-') + ')' };
  }
  window.LOADABLE = { check: check, BASE: BASE, SLACK_M: SLACK_M, setTilt: function (deg) { TILT_MAX_DEG = deg; cache = {}; staticCache = {}; }, tilt: function () { return TILT_MAX_DEG; } };   // setTilt: 検証用(傾きの上限を変えて比べる)
})();
