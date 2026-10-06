// 引いた車の組み合わせが、物理的に積めるかの判定(デッキを引く時に使う。積めなければ引き直す)
//  6台: 1〜6番に割り当てる全ての並べ方から、いちばん低くなる並べ方を探す。
//        ・6番は幅1.755m以下の車(必須)
//        ・下段(4・5・6番)の車の屋根が、その上のフロアの下面にぶつからない高さまで、上のフロアを上げる必要がある(車の絵の形で判定)
//        ・上げた分だけ、上段(1・2・3番)の車の屋根も高くなる → 荷姿の高さが、制限(modes.jsのheightLimitM)+余裕を超える並べ方しか無ければ「積めない」
//  7台: 上の条件に加えて、宙段(7番)に載せる車・5番(バック)・6番が、宙段の動き(スロープ〜全上げ)の間に当たらない組み合わせがあること(fm.hangFit)
(function () {
  var cfg = window.TRAILER_CONFIG, fm = window.FLOOR_MECH;
  if (!cfg || !fm) return;
  var PX = cfg.pxPerMeter, GAP = fm.FRAME_GAP_PX;
  var SLACK_M = 0.45;   // 制限をこれだけ超えるまでは「積める」(抽選をほとんど弾かない範囲。実際に超えた分は、これまで通りスコアで減点)
  // 棚を積み込み後に置く標準の高さ(各棚がピンに載った位置。通しプレイで使った値)
  var BASE = { F1f: -2.4, F1r: -3.6, F2f: 6.7, MID: -3.6, F3r: 3.6, F5f: 0, F5r: 0, F7: 0 };

  function dims(it, flip) {
    var e = it.entry, w = e.len * PX, h = w * e.aspect, tl = flip ? 1 - e.tr : e.tl;
    var prof = e.prof ? (flip ? e.prof.slice().reverse() : e.prof) : null;   // 左右反転(バック)は輪郭を逆順にする
    return { img: flip ? it.flipImg : it.img, prof: prof, w: w, h: h, leftTireX: tl * w, e: e };
  }
  // 下段の車(slot=4/5/6)の屋根にぶつからないために、上のフロアを標準の高さからどれだけ上げる必要があるか(px)。
  // 標準の高さのフロアは、下段の床から REF_CLEAR(約1.54m)の高さに下面がある(走行位置・ピンの標準位置)。それより高い車は、超えた分だけ上げる。車の絵の形(屋根の一番高い所)で測る
  var REF_CLEAR = 176;
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

  // items: [{entry, img, flipImg}](6台か7台)。戻り値 { ok, H(最小の荷姿の高さm), why }
  function check(items) {
    var n = items.length;
    if (!items.some(function (it) { return isNarrow(it.entry); })) return { ok: false, why: '6番に積める幅の車が無い' };
    var fw = items.map(function (it) { return dims(it, false); });
    var limit = (window.GAME_MODE && window.GAME_MODE.SCORE ? window.GAME_MODE.SCORE.heightLimitM : 4.1) + SLACK_M;
    var idx = items.map(function (_, i) { return i; });

    if (n >= 7) {
      // 宙段: 5番(バック)・6番・7番の車の組み合わせが成立するもの。成立する組み合わせのうち、荷姿の高さがいちばん低くなるものを選ぶ
      //  荷姿の高さ: 宙段を使う時の棚の高さ(2番前・3番前・3番後ろ=ピンの上限)で、残りの4台(1〜4番)を最も低く並べた時の、上段(1〜3番)の車の屋根
      var offs7 = Object.assign({}, BASE, { F2f: fm.FIT_OFFS.F2f, MID: fm.FIT_OFFS.MID, F3r: fm.FIT_OFFS.F3r });
      var best7 = Infinity, fit = null, fitOrder = null, fitPin = 1, pins = [], hole0 = fm.stopPin ? fm.stopPin.hole : 1, nHoles = fm.stopPinHoles || 1, ph;
      // フレームの固定ピン(1〜nHoles番の位置)のどれか1つで成立すれば積める。成立する位置を pins に集める
      for (ph = 1; ph <= nHoles; ph++) {
      if (fm.stopPin) { fm.stopPin.hole = ph; fm.stopPinResolve(); }
      var okHere = false;
      permute(idx, 3, function (t) {
        var i5 = t[0], i6 = t[1], i7 = t[2];
        if (!isNarrow(items[i6].entry)) return;
        if (!fm.hangFit(dims(items[i5], true), fw[i6], fw[i7]).ok) return;
        var rest = idx.filter(function (i) { return t.indexOf(i) < 0; });   // 1〜4番に載せる4台
        var needF1 = {}, topAt = {};
        rest.forEach(function (i) {
          needF1[i] = lowerNeed(fw[i], '4').F1;   // 4番の車の上の1番フロアを、上げる量
          topAt[i] = [1, 2, 3].map(function (u) { var S = cfg.slots[u]; return fm.onFloor(S.floor, S.tireX, S.deckY, offs7)[1] - fw[i].h; });
        });
        permute(rest, 4, function (a) {   // a[0..2] = 1〜3番、a[3] = 4番
          var top = Math.min(topAt[a[0]][0] - Math.max(0, needF1[a[3]]), topAt[a[1]][1], topAt[a[2]][2]);
          var Hm = (cfg.ramp.groundY - top) / PX;
          okHere = true;
          if (Hm < best7) { best7 = Hm; fit = t; fitOrder = a; fitPin = ph; }
        });
      });
      if (okHere) pins.push(ph);
      }
      if (fm.stopPin) { fm.stopPin.hole = hole0; fm.stopPinResolve(); }
      if (!fit) return { ok: false, why: '宙段に載せて6番・5番も積める組み合わせが無い(車が高い・長い)' };
      return { ok: true, assign: fit, order: fitOrder, H: best7, pins: pins, bestPin: fitPin };   // order = 1〜4番に載せる車(デッキの番号)
    }
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
  window.LOADABLE = { check: check, SLACK_M: SLACK_M };
})();
