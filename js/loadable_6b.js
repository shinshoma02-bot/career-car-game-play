// semi-6b の「引いた車の組み合わせが積めるか」の判定(簡易版。2026-10-07)。js/loadable.js(semi-6 用)の代わりに読まれる。
// 宙段が無いので hangFit は使わない。6台を1〜6番へ割り当てる全ての並べ方(720通り)のうち、次を全て満たすものがあれば「積める」:
//  ・4番の車: 1番フロアを最大まで上げた時に、1番フロアの下面に当たらない(車の絵の形で判定。fm.slotOverlap)
//  ・5番・6番の車: 2番フロアを最大まで上げた(後ろ上げ)時に、2番フロアの下面に当たらない。6番は全長 slots['6'].maxLenM 以下
//  ・2番・3番の車(2番フロアの1枚に2台): 全長の合計が PAIR_MAX_M 以下
//  ・1番の車: 全長 F1_MAX_M 以下
// 荷姿の高さ(r.H)は計算しない(null)。高さの減点は、制限(trailer_config_semi6b.js の score.heightLimitM)からそのまま。
// 軽四を後ろのフロアに3台積む積み方は未実装(SPEC 第16章 2026-10-07 の「次にやること」)。
(function () {
  var cfg = window.TRAILER_CONFIG, fm = window.FLOOR_MECH;
  if (!cfg || !fm || !fm.is6b) return;
  var PX = cfg.pxPerMeter, T = cfg.t6b;
  var PAIR_MAX_M = 10.2, F1_MAX_M = 5.2;   // 2番フロアの長さ(約9.2m)+前後の張り出し / 1番フロアの長さ(約4.0m)+張り出し
  var MAX_LEN6 = cfg.slots['6'].maxLenM || 99;

  function dims(it) {
    var e = it.entry, w = e.len * PX, h = w * e.aspect;
    return { w: w, h: h, leftTireX: e.tl * w, prof: e.prof || null, lenM: e.len, e: e };
  }
  var cache = {};
  function fits(d, slot) {
    var key = d.e.id + ':' + slot;
    if (cache[key] !== undefined) return cache[key];
    var offs = { F1: slot === '4' ? T.f1.maxRaise : 0, F2: slot === '4' ? 0 : T.f2.minDeg };
    var ov = fm.slotOverlap(slot, d, offs);
    return (cache[key] = ov <= fm.FRAME_GAP_PX);
  }
  function permute(n, cb) {
    var used = [], cur = [];
    (function rec() {
      if (cur.length === n) { cb(cur.slice()); return; }
      for (var i = 0; i < n; i++) { if (used[i]) continue; used[i] = true; cur.push(i); rec(); cur.pop(); used[i] = false; }
    })();
  }
  // items: [{entry, ...}] 6台。戻り値 { ok, why, plan: {slot番号: デッキの番号} }
  function check(items) {
    if (!items || items.length !== 6) return { ok: false, why: '6台ではありません' };
    var D = items.map(dims), found = null;
    permute(6, function (p) {   // p[k] = (k+1)番に載せる車のデッキの番号
      if (found) return;
      var c = function (k) { return D[p[k - 1]]; };
      if (c(1).lenM > F1_MAX_M) return;
      if (c(2).lenM + c(3).lenM > PAIR_MAX_M) return;
      if (c(6).lenM > MAX_LEN6) return;
      if (!fits(c(4), '4') || !fits(c(5), '5') || !fits(c(6), '6')) return;
      found = { 1: p[0], 2: p[1], 3: p[2], 4: p[3], 5: p[4], 6: p[5] };
    });
    return found ? { ok: true, H: null, plan: found } : { ok: false, why: '積める並べ方が無い', H: null };
  }
  window.LOADABLE = { check: check, is6b: true };
})();
