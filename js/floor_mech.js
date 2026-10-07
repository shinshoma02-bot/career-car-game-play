// 上段フロア(1・2・3番)の可動機構: シリンダー・セットピン・5番リフト・扇動板。
// old/tsumikomi-simulator-beta.html の機構ロジックを、現行アーキテクチャ(canvas描画・window.GAME_STATE)向けに移植したもの。
(function () {
  var cfg = window.TRAILER_CONFIG;
  var floorsCfg = cfg.floors;
  var M = floorsCfg.mid;

  function resolvePt(pt) { return pt === 'mid' ? M : pt; }

  // ---- 端点(棚の上下量)----
  var ENDS = {};
  Object.keys(floorsCfg.ends).forEach(function (k) {
    var e = floorsCfg.ends[k];
    ENDS[k] = { off: 0, r: e.range.slice(), hole: e.hole, holeMax: e.holeMax, travel: e.travel || 0, label: e.label, noTravelPin: !!e.noTravelPin, freeTop: e.freeTop, pitchUpPx: e.pitchUp, pitchDownPx: e.pitchDown };
    if (e.limit !== undefined) ENDS[k].limit = e.limit;
  });
  // 5番フロアはセットピン対象外・機構側(2番前シリンダーの余力)で直接動かす
  ENDS.F5f = { off: 0, travel: 0, r: [-999, 999], label: '5番フロア 前' };
  ENDS.F5r = { off: 0, travel: 0, r: [-999, 999], label: '5番フロア 後ろ' };

  // ---- フロア形状(前端・後端の2点で決まる)----
  var FLOORS = {};
  Object.keys(floorsCfg.defs).forEach(function (id) {
    var d = floorsCfg.defs[id];
    FLOORS[id] = {
      name: d.name,
      front: { pt: resolvePt(d.frontPt), end: d.frontEnd },
      rear: { pt: resolvePt(d.rearPt), end: d.rearEnd },
      slots: d.slots, x0: d.x0, x1: d.x1,
      bottom: (d.bottomFlat !== undefined)
        ? (function (v) { return function () { return v; }; })(d.bottomFlat)
        : (function (base, slope) { return function (x) { return base + slope * (x - 380); }; })(d.bottomAt380, d.bottomSlope)
    };
  });
  FLOORS.F1.pivot = FLOORS.F1.front.pt;
  FLOORS.F2.pivot = FLOORS.F2.front.pt;
  FLOORS.F3.pivot = FLOORS.F3.front.pt;
  FLOORS.F5.pivot = FLOORS.F5.front.pt;
  var FIDS = Object.keys(FLOORS);

  function angOf(dx, dy) { return Math.atan2(dy, dx); }
  function curOffs() { var o = {}; for (var k in ENDS) o[k] = ENDS[k].off; return o; }
  // 前端・後端の上下量から、回転角(度)と前端の上下量を求める
  function poseOf(id, offs) {
    if (id === 'F7') return { ang: hangPose().ang, dh: 0 };   // 宙段フロア(前端・後端の2点で決まらない別の動き)
    var f = FLOORS[id], o = offs || curOffs(), pf = f.front.pt, pr = f.rear.pt;
    var of = o[f.front.end], orr = o[f.rear.end];
    var a = angOf(pr[0] - pf[0], (pr[1] + orr) - (pf[1] + of)) - angOf(pr[0] - pf[0], pr[1] - pf[1]);
    return { ang: a * 180 / Math.PI, dh: of };
  }
  function tf(pose, pivot, x, y) {
    var a = pose.ang * Math.PI / 180, dx = x - pivot[0], dy = y - pivot[1];
    return [pivot[0] + dx * Math.cos(a) - dy * Math.sin(a), pivot[1] + pose.dh + dx * Math.sin(a) + dy * Math.cos(a)];
  }
  function onFloor(id, x, y, offs) {
    if (id === 'F7') {   // 宙段: ローカル座標(格納時に平らな姿勢の絵)を、今の前端Fの位置・角度に移す
      var hp = hangPose(), a = hp.ang * Math.PI / 180, dx = x - HANG.localX0, dy = y - HANG.localY;
      return [hp.F[0] + dx * Math.cos(a) - dy * Math.sin(a), hp.F[1] + dx * Math.sin(a) + dy * Math.cos(a)];
    }
    return tf(poseOf(id, offs), FLOORS[id].pivot, x, y);
  }

  // ---- セットピン ----
  var PIN_PITCH = floorsCfg.pinPitch;
  // 下段の車とフロアの当たり判定は、フロアの枠(横に見えるフレーム)の内側5cm程度は隙間があって当たらない(5cm=5.7px)
  var FRAME_GAP_PX = 0.05 * cfg.pxPerMeter;
  var PINS = {}; Object.keys(floorsCfg.ends).forEach(function (k) { PINS[k] = null; });
  var PIN_TARGET = {};
  // 柱の穴番号(実車の番号): 最下段=0番(ピンなし)、走行位置=hole番、ピンを差せる最大=holeMax番(棚の上限の1穴下)。
  // 棚の絵(off=0)は変えずに番号を当てはめるので、走行位置より上と下で1穴の間隔が違う(上は細かい)。
  function pitchUp(k) { var e = ENDS[k]; return e.pitchUpPx || (e.travel - e.r[0]) / (e.holeMax - e.hole + 1); }   // pitchUp(設定): 穴の間隔を実車に合わせて決めている棚(2番前)
  function pitchDown(k) { var e = ENDS[k]; return e.pitchDownPx || (e.hole > 0 ? (e.r[1] - e.travel) / e.hole : 0); }   // pitchDown(設定): 走行位置より下の穴の間隔を決めている棚(3番後ろ。設定が無ければ、下の可動域を穴の数で割る)
  function holeNo(k, off) {
    var e = ENDS[k];
    if (off > e.travel) return pitchDown(k) > 0 ? Math.max(0, e.hole - Math.round((off - e.travel) / pitchDown(k))) : e.hole;
    return e.hole + Math.round((e.travel - off) / pitchUp(k));
  }
  function offOfHole(k, h) {
    var e = ENDS[k];
    return h >= e.hole ? e.travel - (h - e.hole) * pitchUp(k) : e.travel + (e.hole - h) * pitchDown(k);
  }
  function pinLimitOff(k) { return offOfHole(k, ENDS[k].holeMax); }
  // ピンを差せる穴番号の範囲(0番はピンなしの最下段なので1番から)
  function holeRange(k) { return { top: ENDS[k].holeMax, bottom: 1 }; }
  function snapToHole(k, off) { return offOfHole(k, Math.max(1, Math.min(ENDS[k].holeMax, holeNo(k, off)))); }
  function lowOf(k) { return PINS[k] !== null ? PINS[k] : ENDS[k].r[1]; }
  function f2Low() { return lowOf('F2f'); }
  function pinTarget(k) {
    if (PIN_TARGET[k] === undefined) PIN_TARGET[k] = holeNo(k, snapToHole(k, ENDS[k].off));
    var r = holeRange(k);
    return Math.max(r.bottom, Math.min(r.top, PIN_TARGET[k]));
  }
  // 棚を動かしている間、その棚の近くの『フロアより下の差し込み口』を自動でピンの番号にする(あとから−/＋で変えられる)。
  // フロアがちょうど10番の真上にいる時は9番、10番を超えて上がったら10番(ピンは棚の下に差して棚を受ける)
  function autoPinTarget(k) {
    if (PINS[k] !== null || !ENDS[k] || ENDS[k].holeMax === undefined) return;
    var e = ENDS[k], best = 1;
    for (var h = e.holeMax; h >= 1; h--) { if (offOfHole(k, h) > e.off + 0.5) { best = h; break; } }
    PIN_TARGET[k] = best;
  }
  function stepPinTarget(k, d) {
    if (PINS[k] !== null) { onWarn(ENDS[k].label + ': ピンを抜いてから穴を選び直してください'); return; }
    PIN_TARGET[k] = pinTarget(k) + d;
  }
  function togglePin(k) {
    if (PINS[k] === null) {
      var h = pinTarget(k), off = offOfHole(k, h);
      if (off < ENDS[k].off - 0.5) { onWarn(ENDS[k].label + 'の棚を' + h + '番より上に上げてからピンを差してください'); return; }
      PINS[k] = off; PIN_TARGET[k] = h;
      onInfo(ENDS[k].label + ' ' + h + '番の穴にセットピンを差した');
    } else {
      if (k === 'F2f' && MECH.lift > 0) { onWarn('5番フロアの前を下げきってからセットピンを抜いてください'); return; }
      // フロアがセットピンに載って固定されている間は抜けない(少し上げて、ピンが空いてから抜く)
      if (ENDS[k].off >= PINS[k] - 1) { onWarn(ENDS[k].label + 'のフロアがセットピンに載っているので抜けません。少し上げてから抜いてください'); return; }
      PINS[k] = null;
      autoPinTarget(k);   // ピンを刺したままフロアを上げてから抜いた時は、その位置の『フロアより下の差し込み口』を自動で入力する
      onInfo(ENDS[k].label + 'のセットピンを抜いた');
    }
  }

  // 初期状態(走行位置): 全ての棚を走行位置に置き、セットピンを差して固定した状態。3番の前だけはピンを差さない
  // フレーム側の固定ピン(赤い板。2枚目の写真): 宙段を上げて車を載せた時に、フロアの下面がこのピンに当たって止まる。前後に5段階の位置(SP_CFG.xs)。ピン穴の位置で止まる高さ(loadU)が決まる
  var SP_CFG = (cfg.hangFloor && cfg.hangFloor.stopPin) || null;
  var SP = { hole: SP_CFG ? SP_CFG.hole : 1, inserted: true };   // pts=[x,y]の5つ(前→後ろ。斜めの柱に沿って並ぶ)
  function initPins() {
    SP.inserted = true;   // 固定ピンは赤い板に最初から差してある(フロアの位置に関係なく抜き差しできる)
    Object.keys(floorsCfg.ends).forEach(function (k) {
      ENDS[k].off = ENDS[k].travel;
      if (k === 'F7' && typeof MECH !== 'undefined' && MECH) { MECH.hang = 0; MECH.lockR = MECH.lockL = true; }   // サイクルのリセットで宙段も格納に戻し、車軸のロックも掛かった状態にする
      if (ENDS[k].noTravelPin) { PINS[k] = null; delete PIN_TARGET[k]; }
      else { PINS[k] = ENDS[k].travel; PIN_TARGET[k] = ENDS[k].hole; }
    });
  }
  // 棚がセットピンに載って固定されているか(ピンを差さない端は常にtrue)。
  // ピン穴は棚の今の位置以下にしか差せないので、1穴分の隙間までは「載っている」とみなす
  // 棚がセットピン(3番前は下端)にしっかり載って固定されているか(ピンを刺しただけでなく、フロアがピンに載っている)
  function rested(k) {
    var e = ENDS[k];
    if (k === 'F7') return MECH.hang <= 0.01 || (SP.inserted && Math.abs(MECH.hang - HANG.loadU) < 0.03);   // 宙段: 格納か、固定ピン(赤い板)に載って止まっている
    if (e.noTravelPin) return e.off >= e.travel - 1.5 || (PINS[k] !== null && e.off >= PINS[k] - 2 * pitchUp(k) - 0.5);   // 3番前も、棚の少し下にピンがあれば固定扱い(棚をそのピンまで下げ切っていなくてよい)
    // 支柱の短い棚(2番前): ピンを一番上の穴に差して昇降させた(伸ばした)状態は、ピンより上でも固定されている
    if (e.freeTop !== undefined && PINS[k] !== null && PINS[k] <= pinLimitOff(k) + 0.5) return true;
    // 棚が走行位置まで下がっていなくても、棚の少し下(最大2穴分)にピンが差してあれば固定されているとみなす(下段の車を積む間は棚を上げたままにするので、ピンは棚の位置付近に差せばよい。棚をそのピンまで下げ切っている必要はない。2026-10-06 ユーザー指示)
    return PINS[k] !== null && e.off >= PINS[k] - 2 * pitchUp(k) - 0.5;
  }
  function floorPinsOk(id) { var f = FLOORS[id]; return rested(f.front.end) && rested(f.rear.end); }
  function pinned(k) {
    if (k === 'F7') return rested('F7');
    if (ENDS[k].noTravelPin) return true;
    if (ENDS[k].freeTop !== undefined && PINS[k] !== null && PINS[k] <= pinLimitOff(k) + 0.5) return true;
    return PINS[k] !== null && ENDS[k].off >= PINS[k] - 2 * pitchUp(k) - 0.5;
  }
  initPins();

  // ---- 宙段フロア(5番と6番の間の、持ち上がる短い棚=7台目)----
  // u=0 格納(下段の床に平ら)→ u=1 前(5番側)が先に上がり、後ろは接地のまま前へ滑る(車が乗れるスロープ)→ u=2 後ろも上がる。
  // 前端F・後端Rの位置は段階ごとに設定(trailer_config.hangFloor)で、その間を直線で補間する(長さはほぼ一定)。
  // 他の棚と同じく、柱の中の支柱にセットピンを当てて固定する(ピンは仮想の上下量 ENDS.F7.off = -u×60、1穴=u0.1=6px。番号札 hole_scale_f7 の1穴6pxと同じ)。
  var HANG = cfg.hangFloor;
  // 姿勢は実車と同じ四節リンクの計算(trailer_config.hangFloor.linkage)。リンク=車体(pivotF〜pivotR)・前の柱(長さ固定)・フロア(取付点の間)・後ろの柱(伸縮)。
  //  段階1(u 0→lockU): 前の柱が θ 0→theta1 まで持ち上がり、後ろの取付点は地面(groundY)を前へ滑る → 後ろの柱が縮む。
  //  段階2(u lockU→2): 後ろの柱の可動部が固定され(rearMin)、固定長の柱として前の柱に連動してフロア後ろ側も浮く(円と円の交点)。θ が rearGrowTheta を超えたら rearMax まで再び伸びる。
  var LK = HANG.linkage, CH = cfg.newArt.chuudan;   // 付け根(pivotF/pivotR)は描画と同じ newArt.chuudan の値
  // 後ろの柱のセットピン: 内側の角パイプの穴(RP_CFG.holes個、pitch px間隔)に差す。1番穴=一番縮む(rearMin)、番号が増えるほど縮み幅が小さい(長さ rearMin+(n-1)×pitch)。
  var RP_CFG = HANG.rearPin || { holes: 1, pitch: 0, hole: 1 };
  var RP = { hole: RP_CFG.hole || 1, len: LK.rearMin, theta1: LK.theta1 };
  function hangSolve(u) {
    u = Math.max(0, Math.min(2, u));
    // theta0=格納時(u=0)の前の柱の角度(水平=0。前の取付点が付け根より低い時は負。無ければ0)
    var th0 = LK.theta0 || 0, th1 = RP.theta1;   // th1=後ろの柱がセットピンの長さまで縮んで止まる角度(ピン穴で変わる)
    var th = u <= LK.lockU ? th0 + (th1 - th0) * u / LK.lockU : th1 + (LK.theta2 - th1) * (u - LK.lockU) / (2 - LK.lockU), r = th * Math.PI / 180;
    // 前の取付点のずれ oF・後ろの取付点のずれ oR(どちらも、フロア上面の前端Fから、フロアに沿った向き(x)・フロアの下向き(y)へのずれ)。
    // 前と後ろで高さが違ってよい(D18: 前の柱はフロアの上に付く oF=[16,-23]、後ろは上面の18px下 oR=[309,18])。無ければ従来の pinOffset・pinSpan
    var oF = LK.pinOffsetF || LK.pinOffset, oR = LK.pinOffsetR || [oF[0] + LK.pinSpan, oF[1]];
    var pF = CH.pivotF, pR = CH.pivotR, S = Math.hypot(oR[0] - oF[0], oR[1] - oF[1]), dlt = Math.atan2(oR[1] - oF[1], oR[0] - oF[0]);   // S=前後の取付点の間の距離、dlt=取付点を結ぶ線とフロアの傾きの差
    var aF = [pF[0] + LK.frontLen * Math.cos(r), pF[1] - LK.frontLen * Math.sin(r)], aR;
    if (u <= LK.lockU) {
      var dy = LK.groundY - aF[1];
      aR = [aF[0] + Math.sqrt(Math.max(0, S * S - dy * dy)), LK.groundY];
    } else {
      var Lr = RP.len;   // 後ろの柱の可動部はセットピンで固定された長さのまま
      var vx = pR[0] - aF[0], vy = pR[1] - aF[1], d = Math.hypot(vx, vy), a = (S * S - Lr * Lr + d * d) / (2 * d), h = Math.sqrt(Math.max(0, S * S - a * a));
      var ex = vx / d, ey = vy / d, mx = aF[0] + ex * a, my = aF[1] + ey * a, p1 = [mx - ey * h, my + ex * h], p2 = [mx + ey * h, my - ex * h];
      aR = p1[0] >= p2[0] ? p1 : p2;
    }
    var ang = Math.atan2(aR[1] - aF[1], aR[0] - aF[0]) - dlt, c = Math.cos(ang), s = Math.sin(ang);   // フロアの傾き = 取付点を結ぶ線の傾き − dlt
    var F = [aF[0] - (oF[0] * c - oF[1] * s), aF[1] - (oF[0] * s + oF[1] * c)];
    return { F: F, R: [F[0] + HANG.len * c, F[1] + HANG.len * s], aF: aF, aR: aR, theta: th, rear: Math.hypot(aR[0] - pR[0], aR[1] - pR[1]) };
  }
  // 毎フレーム・判定で何度も呼ばれるので、u を細かく刻んだ表を起動時に作って補間する
  var HANG_N = Math.round(2 / LK.tableStep), HANG_TAB = [];
  // ピン穴から固定長を決め、その長さまで縮む角度 theta1 を求める(段階1は後ろの取付点が地面を滑るので、角度に対し柱の長さは単調に縮む)
  function rearPinSolve() {
    RP.len = LK.rearMin + (RP.hole - 1) * (RP_CFG.pitch || 0);
    var th0 = LK.theta0 || 0, lo = th0, hi = LK.theta1 + 40, i;
    RP.theta1 = hi;
    function len(th) { var s = RP.theta1; RP.theta1 = th; var p = hangSolve(LK.lockU); RP.theta1 = s; return p.rear; }
    if (len(lo) <= RP.len) { RP.theta1 = lo; return; }   // 格納時から既にピンの長さ以下 → 縮まない
    for (i = 0; i < 50; i++) { var m = (lo + hi) / 2; if (len(m) > RP.len) lo = m; else hi = m; }
    RP.theta1 = hi;
  }
  function hangRebuild() { rearPinSolve(); HANG_TAB.length = 0; for (var hi = 0; hi <= HANG_N; hi++) HANG_TAB.push(hangSolve(hi * 2 / HANG_N)); stopPinSolve(); }   // 設定値を実行中に変えて比べる時(検証用)にも使う
  // ピンの位置(穴 n)から、宙段を上から下げた時にフロア下面がピンに当たる u を求める(0.01 刻み)。HANG.loadU に入れる
  function stopPinSolve() {
    if (!SP_CFG) return;
    if (SP_CFG.us) { HANG.loadU = SP_CFG.us[SP.hole - 1]; return; }   // 穴ごとの止まる高さを設定で直接決める(D25のピンの穴は6px間隔で、フロア先端が通る道の上に並んでいないため、位置の計算では使えない)
    var pt = SP_CFG.pts[SP.hole - 1], x = pt[0], yTop = pt[1], thick = SP_CFG.thick || 16, u, found = 1.2;
    for (u = 2; u >= 1.2 - 1e-9; u -= 0.005) { if (x >= hangEnds(u).F[0] - 1 && hangTop(u, x) + thick >= yTop) { found = u; break; } }   // フロアの前端より後ろ(フロアの下)にあるピンにだけ当たる
    HANG.loadU = Math.max(1.2, Math.min(2, Math.round(found * 100) / 100));
  }
  hangRebuild();
  function hangEnds(u) {
    u = Math.max(0, Math.min(2, u));
    var s = u / 2 * HANG_N, i = Math.min(HANG_N - 1, Math.floor(s)), t = s - i, A = HANG_TAB[i], B = HANG_TAB[i + 1];
    return { F: [A.F[0] + (B.F[0] - A.F[0]) * t, A.F[1] + (B.F[1] - A.F[1]) * t], R: [A.R[0] + (B.R[0] - A.R[0]) * t, A.R[1] + (B.R[1] - A.R[1]) * t] };
  }
  function hangPose(u) {
    var e = hangEnds(u === undefined ? MECH.hang : u);
    return { F: e.F, R: e.R, ang: Math.atan2(e.R[1] - e.F[1], e.R[0] - e.F[0]) * 180 / Math.PI };
  }
  function hangTop(u, x) { var e = hangEnds(u); return e.F[1] + (e.R[1] - e.F[1]) * (x - e.F[0]) / (e.R[0] - e.F[0]); }
  var HANG_PIN_PX = 60;   // 宙段のピンの仮想の上下量: u=1あたり60px(0〜19番の20穴で120px、1穴6px)
  function syncHangEnd() { if (ENDS.F7) ENDS.F7.off = -MECH.hang * HANG_PIN_PX; }
  // 床の下面(上面+10px)がy(x)・x範囲[x0,x1]・屋根の高さtopYの車とぶつかるか(枠の内側5cmは隙間)
  // topY は車の屋根の高さ(数値)か、x→屋根の高さを返す関数(ボンネットは低く屋根は高い、実際の車の形で判定する)
  function hangHits(x0, x1, topY, u) {
    if (u <= 0.05) return false;   // 格納中は下段の床と同じ高さで、車が上を通る
    var e = hangEnds(u), dx = e.R[0] - e.F[0], dy = e.R[1] - e.F[1];
    for (var x = Math.max(x0, e.F[0]); x <= Math.min(x1, e.R[0]); x += 10) {
      var y = e.F[1] + dy * (x - e.F[0]) / dx + 10;
      if (y > (typeof topY === 'function' ? topY(x) : topY) + FRAME_GAP_PX) return true;
    }
    return false;
  }
  // 車の絵(左右反転済み)から、横位置ごとの一番上の高さ(接地面からの割合)を読み取る。ボンネット・トランクは屋根より低い
  var profCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function carProfile(img) {
    if (profCache && profCache.has(img)) return profCache.get(img);
    var N = 48, prof = null;
    try {
      var w = img.width, h = img.height, cv = document.createElement('canvas');
      cv.width = N; cv.height = Math.max(8, Math.round(N * h / w));
      var g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, cv.width, cv.height);
      var d = g.getImageData(0, 0, cv.width, cv.height).data;
      prof = [];
      for (var c = 0; c < N; c++) {
        var top = cv.height;
        for (var r = 0; r < cv.height; r++) { if (d[(r * cv.width + c) * 4 + 3] > 40) { top = r; break; } }
        prof.push(1 - top / cv.height);   // この列の高さ(車の全高に対する割合)
      }
    } catch (e) { prof = null; }
    if (profCache && prof) profCache.set(img, prof);
    return prof;
  }
  // 積んだ車occ(床の位置pos)の、画面x での屋根の高さ(y)。絵が読めない時は全体を屋根の高さとする
  // 宙段まわりは実車でもすき間がほぼ無い(車の屋根・ボンネットと棚が触れる寸前で積んでいる)ので、車を HANG.tol px 低く見て判定する(実車の許容)
  function carTopY(occ, pos, tolOverride) {
    var x0 = pos[0] - occ.leftTireX, prof = occ.prof || (occ.img ? carProfile(occ.img) : null), tol = tolOverride !== undefined ? tolOverride : ((HANG && (HANG.tolLower !== undefined ? HANG.tolLower : HANG.tol)) || 0);   // 下段(5・6番)の車と宙段の判定は tolLower(従来の40)。宙段に載せた車と2・3番の床の判定は tol(hangCarBoxOf)
    return function (x) {
      if (!prof) return pos[1] - occ.h + tol;
      var c = Math.max(0, Math.min(prof.length - 1, Math.floor((x - x0) / occ.w * prof.length)));
      return pos[1] - occ.h * prof[c] + tol;
    };
  }
  // 宙段に載っている7台目(あれば): 姿勢uでの、車の前後の端のxと屋根の高さ
  function hangCarBox(u) {
    var gs = window.GAME_STATE;
    return hangCarBoxOf(gs && gs.occupied['7'], u);
  }
  function hangCarBoxOf(occ, u) {
    if (!occ) return null;
    var a = Math.max(0, Math.min(2, u)), hp = hangPose(a), rad = hp.ang * Math.PI / 180;
    var dx = occ.localX - HANG.localX0, dy = occ.localY - HANG.localY;
    var px = hp.F[0] + dx * Math.cos(rad) - dy * Math.sin(rad);
    var prof = occ.prof || (occ.img ? carProfile(occ.img) : null), x0 = px - occ.leftTireX;
    return {
      x0: x0, x1: x0 + occ.w, h: occ.h,
      // 画面xでの車の高さ(ボンネット・トランクは屋根より低い)。絵が読めない時は全長を屋根の高さとする
      hAt: function (x) { var tol = (HANG && HANG.tol) || 0; if (!prof) return occ.h - tol; var c = Math.max(0, Math.min(prof.length - 1, Math.floor((x - x0) / occ.w * prof.length))); return occ.h * prof[c] - tol; }
    };
  }
  // 宙段の支柱は、3番前(継ぎ目)の棚の柱の一番下に埋まっている。3番前の棚が下がりきって(ピン無しで支柱が一番下に)いる間は、宙段の支柱が動かない
  function hangStuck() {
    var m = ENDS.MID;
    if (m.off >= m.travel - 1.5) return '3番前の棚が一番下にあるので、宙段の支柱が動きません(3番前の柱の一番下に埋まっています)。3番前を少し上げてください';
    return null;
  }
  // 宙段を上げる時に、他のものにぶつからないか。ぶつかるなら理由
  //  - 下段(5・6番)に積んだ車の屋根  - 上のフロア(2・3番。車が載っていれば車の屋根まで)に床の下面がぶつからない高さ
  function hangProblem(nu) {
    var gs = window.GAME_STATE, why = null;
    if (nu <= 0.05) return null;
    ['5', '6'].forEach(function (n) {
      var occ = gs && gs.occupied[n];
      if (!occ || why) return;
      var pos = occ.floor ? onFloor(occ.floor, occ.localX, occ.localY) : [occ.localX, occ.localY];
      var x0 = pos[0] - occ.leftTireX;
      if (hangHits(x0, x0 + occ.w, carTopY(occ, pos), nu)) why = n + '番の車に当たる(宙段を上げられません)';
    });
    if (why) return why;
    return hangVsUpper(nu, null);
  }
  // 宙段(姿勢nu)と上のフロア(2・3番)の干渉。offs指定時はその棚の姿勢で判定
  // 戻り値 { why: 理由 or null, car: 当たったのが宙段に載せた車(true)か、フロア同士(false)か }
  function hangVsUpperX(nu, offs, onlyIds, carOcc) {
    var e = hangEnds(nu), car = carOcc ? hangCarBoxOf(carOcc, nu) : hangCarBox(nu), res = { why: null, car: false };
    ['F2', 'F3'].forEach(function (id) {
      if (res.why || (onlyIds && onlyIds.indexOf(id) < 0)) return;
      var f = FLOORS[id];
      for (var x = f.x0; x <= f.x1; x += 15) {
        var p = onFloor(id, x, f.bottom(x), offs);
        if (p[0] < e.F[0] || p[0] > e.R[0]) continue;
        var base = hangTop(nu, p[0]), top = base, inCar = !!(car && p[0] >= car.x0 && p[0] <= car.x1);
        if (inCar) top -= car.hAt(p[0]);
        if (p[1] > top - 4) { res = { why: f.name + 'が低くて宙段' + (inCar ? '(と載せた車)' : '') + 'に当たる(' + f.name + 'を上げてください)', car: inCar && !(p[1] > base - 4) }; return; }
      }
    });
    return res;
  }
  function hangVsUpper(nu, offs, onlyIds) { return hangVsUpperX(nu, offs, onlyIds).why; }
  // 宙段を姿勢nuにした時に、車にぶつかるもの(減点と演出の対象): 下段(5・6番)の車の屋根・ボンネット、宙段に載せた車と上のフロア
  function hangContacts(nu) {
    var gs = window.GAME_STATE, out = [];
    if (nu <= 0.05 || !gs) return out;
    ['5', '6'].forEach(function (n) {
      var occ = gs.occupied[n];
      if (!occ) return;
      var pos = occ.floor ? onFloor(occ.floor, occ.localX, occ.localY) : [occ.localX, occ.localY];
      var x0 = pos[0] - occ.leftTireX;
      if (hangHits(x0, x0 + occ.w, carTopY(occ, pos), nu)) out.push({ key: 'hang-' + n, slot: n, msg: n + '番の車に宙段がぶつかった' });
    });
    var vu = hangVsUpperX(nu, null);
    if (vu.why && vu.car) out.push({ key: 'hang-7', slot: '7', msg: '宙段に載せた車が上のフロアにぶつかった' });
    return out;
  }
  // ---- 宙段を使う7台の組み合わせが、物理的に積めるかの判定(デッキを引く時に使う)----
  // c5=5番(バックで積む)・c6=6番・c7=宙段に載せる車。それぞれ {img, w, h, leftTireX}(画像は車の向きに合わせたもの)。
  // 2・3番フロアは、宙段を使う時に、セットピンで固定できる上限の高さ(下の FIT_OFFS。2番前 -60・3番前=ピン最大28番・3番後ろ=ピン最大33番)まで上げた状態とする。
  // (2026-10-03: ユーザーが案2を選んだ。写真の測定で、ゲームの2番の床は実車より約26〜48px低いため。前の値は 2番前 -46・3番前 -72・3番後ろ -24)
  // 前半(u=0.5〜1.5。スロープで7番を積む間)は5番と7番だけ、全上げ(u=1.9〜2)の時は6番も居る
  // 実際に棚をピンで固定できる、一番高い位置(ピン最大の穴の高さ)。【2026-10-07〜: LOADABLE.check は棚を最小の高さまで下げて評価する(loadable.js の check7)。FIT_OFFS は hangFit の shelf を省略した時の既定(最も余裕のある高さ)】判定(LOADABLE・hangFit)は、実際に届かない高さを前提にすると、
  // 判定は通るのに本物では2・3番の棚に当たって宙段が上がり切らない組み合わせが出るので、この値で行う(2026-10-06。3番後ろは -60 でなく -58.5、3番前は -72 でなく -71.7)。
  // 2番前は、ピンを刺さずに(freeTop)可動域の上限まで上げて、5番フロアを持ち上げる時の固定位置にできるので、上限の -60
  var FIT_OFFS = { F2f: -60, MID: offOfHole('MID', ENDS.MID.holeMax), F3r: offOfHole('F3r', ENDS.F3r.holeMax) };
  // 宙段の動き(格納に近い所から固定ピンの高さ loadU まで)を調べる u の一覧。0.04 刻み(0.1 刻みでは、間で当たる組み合わせを見逃した 2026-10-06)
  //  7台目を載せた宙段は、一番上(u=2)まで上げず、固定ピンで loadU(HANG.loadU)に止めて6番を積む。ピンは最初から刺さっていて loadU より上へは動かない(hangStep の onPin)ので、
  //  loadU までの動きだけを調べる(2026-10-07: 以前は loadU より上〜u=2 も調べていた。ピンを抜かない限り行かない範囲なので、判定が実車より厳しかった)
  function hangUsList() {
    var us = [0.05, 0.1, 0.15, 0.2], loadU = (HANG && HANG.loadU) || 2;
    for (var ui = 0.24; ui <= 2 + 1e-9; ui += 0.04) us.push(Math.round(ui * 100) / 100);
    us = us.filter(function (x) { return x < loadU - 1e-9; }); us.push(loadU);
    return us;
  }
  function hangO(c, slotNum, isHang) {
    var S = cfg.slots[slotNum];
    return { img: c.img, prof: c.prof, w: c.w, h: c.h, leftTireX: c.leftTireX, localX: isHang ? S.tireX : S.tireX + 8, localY: S.deckY };
  }
  function hangLowerHits(o, u) { var x0 = o.localX - o.leftTireX; return hangHits(x0, x0 + o.w, carTopY(o, [o.localX, o.localY]), u); }
  // 5番(slotNum='5')・6番('6')の車と宙段の動きが当たらないか。棚の高さに関係しない
  //  shiftPx: 輪止めを前(キャビン側)へ動かして、車をその分(px)前へ寄せた位置(5番は輪止めを前へ最大44cm動かせる)
  function hangLowerFit(c, slotNum, shiftPx) {
    var o = hangO(c, slotNum, false); o.localX -= (shiftPx || 0);
    var us = hangUsList(), loadU = (HANG && HANG.loadU) || 2;
    for (var i = 0; i < us.length; i++) {
      if (slotNum === '6' && us[i] < loadU - 0.1 - 1e-9) continue;   // 6番の車は、宙段を上げ切って(ピンの高さ)から積む
      if (hangLowerHits(o, us[i])) return { ok: false, why: slotNum === '5' ? '5番の車(ボンネットの高さ)に宙段が当たる' : '6番の車に宙段が当たる' };
    }
    return { ok: true };
  }
  // 宙段に載せた7台目と宙段が、上のフロア(2・3番)に当たらないか(棚の高さ offs で)。構造(フロアと宙段)・車どちらの干渉も不合格
  function hangUpperFit(c7, offs) {
    var o7 = hangO(c7, '7', true), us = hangUsList();
    for (var i = 0; i < us.length; i++) {
      var vu = hangVsUpperX(us[i], offs, null, o7);
      if (vu.why) return { ok: false, why: vu.car ? '宙段の車が2・3番フロアに当たる' : '宙段が2・3番フロアに当たる' };
    }
    return { ok: true };
  }
  // 7台目の車と宙段の動きから、上のフロアの下面(画面のx)ごとの「これより下に来てはいけない高さ y」の表(包絡線)を作る。
  // 棚の高さの組み合わせを何千通りも調べるための高速版(hangVsUpperX と同じ式: 床の下面 y ≤ 宙段の上面 − 載せた車の高さ − 4)。x は2px刻み、隣の格子の小さい方(安全側)を使う
  var ENV_X0 = 400, ENV_DX = 2, ENV_N = 1000;   // x=400〜2400(下段の車・宙段まで含む)
  function hangUpperEnvelope(c7) {
    var o7 = hangO(c7, '7', true), us = hangUsList(), L = new Float32Array(ENV_N);
    for (var i = 0; i < ENV_N; i++) L[i] = 1e9;
    us.forEach(function (u) {
      var e = hangEnds(u), car = hangCarBoxOf(o7, u);
      var i0 = Math.max(0, Math.floor((e.F[0] - ENV_X0) / ENV_DX)), i1 = Math.min(ENV_N - 1, Math.ceil((e.R[0] - ENV_X0) / ENV_DX));
      for (var i = i0; i <= i1; i++) {
        var x = ENV_X0 + i * ENV_DX;
        if (x < e.F[0] || x > e.R[0]) continue;
        var lim = hangTop(u, x) - (car && x >= car.x0 && x <= car.x1 ? car.hAt(x) : 0) - 4;
        if (lim < L[i]) L[i] = lim;
      }
    });
    return L;
  }
  function envAt(L, x) {
    var f = (x - ENV_X0) / ENV_DX, i = Math.floor(f);
    if (i < 0 || i >= ENV_N - 1) return 1e9;
    return Math.min(L[i], L[i + 1]);
  }
  // 包絡線 L(と、下段の車などの追加の上限)に対して、上のフロア ids の下面が収まるか(offs で)。ids の下面の各点 y ≤ L(x)
  function envFits(Ls, ids, offs) {
    for (var q = 0; q < ids.length; q++) {
      var f = FLOORS[ids[q]];
      for (var x = f.x0; x <= f.x1; x += 15) {
        var p = onFloor(ids[q], x, f.bottom(x), offs);
        for (var j = 0; j < Ls.length; j++) if (p[1] > envAt(Ls[j], p[0])) return false;
      }
    }
    return true;
  }
  // c5=5番・c6=6番・c7=宙段に載せる車。{img, prof, w, h, leftTireX}(向きに合わせたもの)。offs = 2・3番の棚の高さ { F2f, MID, F3r }(無ければ FIT_OFFS=ピンで届く上限)
  function hangFit(c5, c6, c7, shelf) {
    var offs = curOffs(); var sh = shelf || FIT_OFFS; offs.F2f = sh.F2f; offs.MID = sh.MID; offs.F3r = sh.F3r;
    var r = hangLowerFit(c5, '5'); if (!r.ok) return r;
    r = hangLowerFit(c6, '6'); if (!r.ok) return r;
    return hangUpperFit(c7, offs);
  }
  var hangHold = null, hangRaf = null, hangHitKeys = {};   // hangHitKeys: ぶつかり中のもの(離れるまで減点は1回)
  function hangStart(dir) {
    hangHold = { dir: dir, last: null, warned: false };
    if (hangRaf === null) hangRaf = requestAnimationFrame(hangStep);
  }
  function hangLow() { return PINS.F7 !== null ? Math.max(0, -PINS.F7 / HANG_PIN_PX) : 0; }   // セットピンに支柱が当たって、これ以上下がらない位置
  function hangStep(ts) {
    hangRaf = null;
    if (!hangHold) return;
    var h = hangHold;
    if (h.last === null) h.last = ts;
    var dt = Math.min(0.05, (ts - h.last) / 1000); h.last = ts;
    if (dt <= 0) { hangRaf = requestAnimationFrame(hangStep); return; }   // 最初のフレームは時間が進んでいない
    var stuck = hangStuck();
    var nu = Math.max(hangLow(), Math.min(2, MECH.hang + h.dir * HANG.speed * dt));
    var onPin = SP_CFG && SP.inserted && h.dir > 0 && MECH.hang <= HANG.loadU + 1e-6;   // 固定ピンが刺さっていて、フロアがピンの高さより下にある → 上げるとピンに当たって、それより奥(上)へは動かない(下げる=来た道を戻る方向は止めない)
    if (onPin) nu = Math.min(nu, HANG.loadU);
    var gs = window.GAME_STATE;
    var p = stuck || (nu === MECH.hang ? (h.dir < 0 && hangLow() > 0 && MECH.hang <= hangLow() + 1e-6 ? 'セットピンでこれ以上下がらない' : (onPin && MECH.hang >= HANG.loadU - 1e-6 ? 'フロアが固定ピンに当たって止まりました(ピンを抜くと奥へ動きます。戻る方向は動きます)' : '宙段は可動範囲いっぱい')) : null);
    var hits = [];
    if (!p && nu !== MECH.hang) {
      // 載せた車が当たらない、フロア同士の干渉は構造上の制限(上げる時だけ。動かせない)
      if (h.dir > 0) { var vu = hangVsUpperX(nu, null); if (vu.why && !vu.car) p = vu.why; }
      // 宙段の位置に関係なく、車がいる状態でも動かせる。車にぶつかったら減点・演出(イージーは手前で止まって注意だけ)
      // 他の箇所(車同士・輪止め)と同じ扱い: イージーはぶつかる手前で止まって注意だけ、ノーマル・ハードは減点してそのまま動く
      if (!p) { hits = hangContacts(nu); if (hits.length && gs && gs.hints) p = hits[0].msg + '(宙段はそれ以上動きません)'; }
      // イージー: 車が宙段に乗りかけている間は動かせない
      if (!p && gs && gs.hints && gs.hangStraddle && gs.hangStraddle()) p = '車が宙段に乗りかけています。乗り終わるか、戻ってから動かしてください。';
    }
    if (hits.length) {
      hits.forEach(function (c) { if (!hangHitKeys[c.key]) { hangHitKeys[c.key] = true; if (window.FLOOR_MECH_HIT) window.FLOOR_MECH_HIT(c); } });
    } else if (!p) hangHitKeys = {};
    if (p) { if (h.warned !== p) { onWarn(p); h.warned = p; } }
    else { MECH.hang = nu; syncHangEnd(); autoPinTarget('F7'); h.warned = false; }
    hangRaf = requestAnimationFrame(hangStep);
  }
  // 宙段のスロープ状態(前が上がり、後ろは接地のまま): 車が下段の床から乗り込める
  function hangSlope() { return MECH.hang >= 0.55 && MECH.hang <= 1.1; }
  // 上げた宙段の後端が、下段の床の高さ(y510)から約40px以内なら、車が後端から乗り上がれる(宙段の道)。格納中は対象外
  function hangReachable() { return MECH.hang > 0.05 && 510 - hangPose().R[1] <= 40; }
  // ---- 5番フロア(2番前シリンダーの余力で二段階に持ち上がる)----
  var LIFT_MAX = cfg.floor5.liftMax, HOOK_OFF = cfg.floor5.hookOff;
  var MECH = { lockR: true, lockL: true, hang: 0, lift: 0, hook: false, stopper: true, bridge: false, f2Flap: false, ramp: false };
  function applyF5() {
    if (MECH.stopper && -MECH.lift < HOOK_OFF - 3) MECH.hook = true;
    ENDS.F5r.off = 0;
    ENDS.F5f.off = MECH.hook ? Math.min(-MECH.lift, HOOK_OFF) : -MECH.lift;
  }
  function f5Slope() { return MECH.hook && ENDS.F5f.off === HOOK_OFF; }
  function toggleStopper() {
    if (MECH.stopper) {
      if (MECH.hook && MECH.lift < -HOOK_OFF) { onWarn('5番フロアを4番の高さより上げてから外してください'); return; }
      MECH.stopper = false; MECH.hook = false; onInfo('ストッパーを外した');
    } else { MECH.stopper = true; onInfo('ストッパーを掛けた'); }
    applyF5();
  }

  // ---- 道板(後部の床下に格納。横にスライドして引き出し、最後に地面へ傾ける)----
  // RAMP.t: 0=格納、1=展開完了。約1.15秒で移行(出す時はスライド→傾き、しまう時は逆)。積み込みは展開完了(t=1)が必要
  var RAMP = { t: 0, last: null };
  var RAMP_SEC = 1.15;
  function rampUpdate() {
    var now = performance.now(), dt = RAMP.last === null ? 0 : Math.min(2, (now - RAMP.last) / 1000); // 描画が止まっていた間の経過も反映する
    RAMP.last = now;
    var target = MECH.ramp ? 1 : 0, step = dt / RAMP_SEC;
    RAMP.t = RAMP.t < target ? Math.min(target, RAMP.t + step) : Math.max(target, RAMP.t - step);
  }
  function rampReady() { rampUpdate(); return MECH.ramp && RAMP.t >= 1; } // 描画が止まっていても時間経過で進める
  function toggleRamp() {
    var car = window.GAME_STATE && window.GAME_STATE.car;
    if (MECH.ramp && car && !car.seated && car.phase !== 'docked') {
      // 道板の手前で待っているだけの車(まだ動いていない)は、退場させてからしまう
      if (car.phase === 'ready' && !(car.progress > 0) && window.GAME_STATE.dismissCar) window.GAME_STATE.dismissCar();
      else { onWarn('車が道板の上・作業中なので、道板をしまえません'); return; }
    }
    rampUpdate(); // 切り替え前の位置まで進めてから、新しい向きで動かし始める
    MECH.ramp = !MECH.ramp;
    onInfo(MECH.ramp ? '道板を出した' : '道板をしまった');
  }

  // ---- 扇動板(4-5番間の格納式プレート)----
  var BR_ANCHOR = cfg.bridgePlate.anchor, BRIDGE_STOWED_X = cfg.bridgePlate.stowedX;
  // 開閉の進行度(0=閉/格納、1=開/搬出)。道板と同じく時間経過で進み、描画が止まっていても進む
  function makeAnim(key, sec) {
    var a = { t: 0, last: null };
    function update() {
      var now = performance.now(), dt = a.last === null ? 0 : Math.min(2, (now - a.last) / 1000);
      a.last = now;
      var target = MECH[key] ? 1 : 0, step = dt / sec;
      a.t = a.t < target ? Math.min(target, a.t + step) : Math.max(target, a.t - step);
      return a.t;
    }
    return update;
  }
  var bridgeT = makeAnim('bridge', 0.9), flapT = makeAnim('f2Flap', 0.7);
  // 搬出時の扇動板の先端: 5番フロアの今の位置ではなく、5番をスロープにセットした時の前端の高さ(固定)
  function bridgeTip() {
    var offs = curOffs(); offs.F5f = HOOK_OFF; offs.F5r = 0;
    return onFloor('F5', cfg.bridgePlate.tipX, FLOORS.F5.front.pt[1], offs);
  }
  function bridgeReady() { return MECH.bridge && bridgeT() >= 1; }
  function toggleBridge() {
    var st = window.GAME_STATE, car = st && st.car;
    if (MECH.bridge && car && !car.seated && car.phase !== 'docked' && car.route && car.route.id === '4' && car.progress > 0) {
      onWarn('4番へ向かう車が扇動板を渡るので格納できません'); return;
    }
    bridgeT(); // 切り替え前の位置まで進めてから、新しい向きで動かし始める
    MECH.bridge = !MECH.bridge;
    onInfo(MECH.bridge ? '扇動板を搬出した' : '扇動板を格納した');
  }

  // ---- 2番扇動板(2番フロア前端の、外側に開くメッシュ床)----
  // 開くと、その範囲(F2のx0〜x0+len)で4番の車の屋根と当たらなくなる。長い車を4番に積む時に使う。
  // 開いている間は1番↔2番の道が切れる(1番へは走れない)。
  var F2_FLAP_LEN = (cfg.f2Flap && cfg.f2Flap.len) || 110;
  function inF2Flap(id, x) { return id === 'F2' && x <= FLOORS.F2.x0 + F2_FLAP_LEN; }
  function lowerCarOverFlap() {
    var sp = lowerCarSpan('4');
    return sp && sp[1] > FLOORS.F2.x0 && sp[0] < FLOORS.F2.x0 + F2_FLAP_LEN;
  }
  // 2番に車が積んである時、その車の先端が2番扇動板の範囲にかかっていると、扇動板を動かすと車にぶつかる。
  // イージーは動かせない / ノーマル・ハードは動かせるがぶつかってミス
  function flapHitsCar2() {
    var gs = window.GAME_STATE, occ = gs && gs.occupied['2'];
    if (!occ) return false;
    var x0 = occ.localX - occ.leftTireX;
    if (x0 >= FLOORS.F2.x0 + F2_FLAP_LEN + 5) return false;
    if (gs.hints) { onWarn('2番に車が積んであるので、2番扇動板は動かせません(車にぶつかります)'); return true; }
    if (gs.flapHit) gs.flapHit();
    return false;
  }
  function toggleF2Flap() {
    if (MECH.f2Flap) {
      // 閉じる: 扇動板の真下に4番の車の屋根が入り込んでいる間は閉じられない
      if (flapHitsCar2()) return;
      if (lowerCarOverFlap()) { onWarn('4番の車の屋根に当たるので2番扇動板を閉じられません'); return; }
      flapT(); MECH.f2Flap = false; onInfo('2番扇動板を閉じた');
    } else {
      if (flapHitsCar2()) return;
      var car = window.GAME_STATE && window.GAME_STATE.car;
      if (car && !car.seated && car.dynamicPath && (car.phase === 'ready' || car.phase === 'moving') && car.route && car.route.id === 'U' && car.progress > 0) {
        onWarn('1番へ向かう車が2番扇動板の上を通るので開けられません'); return;
      }
      flapT(); MECH.f2Flap = true; onInfo('2番扇動板を開いた');
    }
  }

  // ---- シリンダー(見た目の伸縮)----
  var CYLS = cfg.cylinders.map(function (c) {
    return { id: c.id, floor: c.floor, pin: c.pin, anchor: c.anchor, barrel: c.barrel, thick: c.thick };
  });
  function cylPin(c, offs) {
    if (c.floor) return onFloor(c.floor, c.pin[0], c.pin[1], offs);
    return [c.pin[0], c.pin[1] + (offs || curOffs()).MID];
  }
  function cylLen(c, offs) {
    var j = cylPin(c, offs), dx = j[0] - c.anchor[0], dy = j[1] - c.anchor[1];
    return { L: Math.sqrt(dx * dx + dy * dy), deg: Math.atan2(dy, dx) * 180 / Math.PI };
  }

  // ---- 1番の昇降リグ(シリンダー→ワイヤー→滑車)----
  var F1_CYL = [cfg.f1Rig.cylX0, cfg.f1Rig.cylX1, cfg.f1Rig.cylY];
  var SHEAVE = cfg.f1Rig.sheave, WIRE_TOP = cfg.f1Rig.wireTop;
  // ワイヤーの長さは一定: 後ろが上がる(off<0)と柱への縦の区間が短くなる分、シリンダーが縮んで巻き取る
  function f1CylLen() { return (F1_CYL[1] - F1_CYL[0]) + ENDS.F1r.off * cfg.f1Rig.cylStrokePerOff; }

  // ---- 動かして良いかの判定(可動範囲・フレーム・道板・シリンダー下限・下段の車)----
  var RAMP_TOP = cfg.ramp.top;
  function lowerCarSpan(n) {
    var occ = window.GAME_STATE && window.GAME_STATE.occupied[n];
    if (!occ) return null;
    var x0 = occ.localX - occ.leftTireX; // 下段(4〜6番)はfloor=nullなのでlocalXがそのまま画面座標
    return [x0, x0 + occ.w];
  }
  function poseProblem(ids, offs) {
    var sp = staticPoseProblem(ids, offs);
    if (sp) return sp;
    return dynamicPoseProblem(ids, offs);
  }
  // 棚の位置だけで決まる制限(可動範囲・フレーム・道板・シリンダー下限)。車や宙段の状態に関係しない(積める判定が使う)
  function staticPoseProblem(ids, offs) {
    for (var k in ENDS) { if (offs[k] < ENDS[k].r[0] || offs[k] > ENDS[k].r[1]) return '可動範囲いっぱい'; }
    if (onFloor('F3', FLOORS.F3.x1, 312, offs)[1] > RAMP_TOP[1] + 2) return '下段に当たる';   // 3番の後端(延長板の先)が道板の高さより下がらない
    var fr = onFloor('F2', 885, 314, offs);
    if (fr[1] < 215) return 'フレームに当たる';
    if (fr[1] > 440) return '下段に当たる';
    for (var i = 0; i < CYLS.length; i++) {
      var c = CYLS[i];
      if (c.floor && ids.indexOf(c.floor) < 0) continue;
      if (!c.floor && ids.indexOf('F2') < 0) continue;
      if (cylLen(c, offs).L < c.barrel + 6) return 'シリンダーが縮みきってる';
    }
    return null;
  }
  function dynamicPoseProblem(ids, offs) {
    if (MECH.hang > 0.05) {   // 上げてある宙段(と載せた車)に、2・3番のフロアが下がってぶつからない
      var hv = hangVsUpper(MECH.hang, offs, ids);
      if (hv) return hv;
    }
    // 下段(4〜6番)の車の屋根に、上のフロアの下面が当たらないか。車の屋根の実際の形(ボンネット・トランクは低い)で判定する。
    // 実車は、フロアの枠の内側に約5cmの隙間があるので、屋根が描画の床の下面より FRAME_GAP_PX(5cm)上に入り込むまでは当たらない
    // (横から見るとフロアと屋根が重なって見えるが、実際は当たっていない。2026-10-06 ユーザー指示)。
    // 下げる動きだけを止める: すでに重なっている状態(昔の判定で入った状態)からでも、上げる動きは必ずできる(重なりが増える動きだけ止める)
    var gsn = window.GAME_STATE, cars = [];
    [4, 5, 6].forEach(function (n) {
      var o = gsn && gsn.occupied[n]; if (!o) return;
      var pos = o.floor ? onFloor(o.floor, o.localX, o.localY) : [o.localX, o.localY], x0 = pos[0] - o.leftTireX;
      cars.push({ n: n, x0: x0, x1: x0 + o.w, top: carTopY(o, pos, 0) });
    });
    function worstOverlap(of) {   // 床の下面が、車の屋根より下に入り込む量(px)の最大。正=入り込んでいる。戻り値 { v, n }
      var worst = { v: -1e9, n: 0 };
      ids.forEach(function (id) {
        var f = FLOORS[id];
        for (var x = f.x0; x <= f.x1; x += 15) {
          if (MECH.f2Flap && flapT() >= 1 && inF2Flap(id, x)) continue;   // 開いた2番扇動板の範囲は車に当たらない
          var p = onFloor(id, x, f.bottom(x), of);
          cars.forEach(function (c) {
            if (p[0] < c.x0 || p[0] > c.x1) return;
            // 5番の車が載っていても、2番前の棚を「ピン位置(赤ラインの1穴下)」まで下げるのは許可する。5番フロアを持ち上げる時の定位置で、これを許さないと5番の車が載った状態で5番フロアを上げられない
            if (c.n === 5 && id === 'F2' && of.F2f <= 8 && of.MID <= 8) return;
            var ov = p[1] - c.top(p[0]);
            if (ov > worst.v) worst = { v: ov, n: c.n };
          });
        }
      });
      return worst;
    }
    if (cars.length) {
      var wc = worstOverlap(offs);
      if (wc.v > FRAME_GAP_PX && wc.v > worstOverlap(curOffs()).v + 0.01) return wc.n + '番の車に当たる';
    }
    return null;
  }
  // 2番前のシリンダーが5番フロアを持ち上げられる量は、2番前(ピン)の位置で変わる。走行位置(ピン9番)の低い位置では、シリンダーの長さが足りず
  // 4番の高さ(スロープ)まで届かない(4番と5番がつながらない)。ピンを上の穴に差すほど持ち上がる量が増える(ピン18番で上限 LIFT_MAX)
  var LIFT_PER_PX = 1.98;
  function liftMaxAt(f2off) { return Math.max(0, Math.min(LIFT_MAX, LIFT_MAX - LIFT_PER_PX * (f2off - offOfHole('F2f', ENDS.F2f.holeMax)))); }
  function liftProblem(nl) {
    if (nl < 0) return MECH.lift > 0 ? null : '5番フロアは下がりきってる';
    if (nl > LIFT_MAX) return '可動範囲いっぱい';
    if (nl > liftMaxAt(ENDS.F2f.off) && nl > MECH.lift) return 'シリンダーが伸びきりました。2番前のセットピンを上の穴に差し直すと、もっと持ち上がります';
    if (nl > MECH.lift) {
      var f2b = onFloor('F2', 980, 347)[1], top5 = 510 - nl - 22;
      if (top5 < f2b + 2) return '2番フロアに当たる(2番を上げた位置でセットピンを入れて)';
    }
    return null;
  }
  function floorsOfEnd(k) { return FIDS.filter(function (id) { return FLOORS[id].front.end === k || FLOORS[id].rear.end === k; }); }
  function unlockedOn(ids) {
    // 現行アーキテクチャでは積込み完了=確定固定のため、緊締チェックは常に通過
    return [];
  }

  // ---- 押している間だけ動く操作 ----
  var RATE = 70; // px/秒
  var LIFT_DELAY_SEC = 0.8;   // 下ボタン長押しで、シリンダーが5番を押し上げ始めるまでの待ち(秒)
  var holding = null;
  var jackHoldUnused = null;
  function holdStart(endKey, dir) {
    if (endKey === 'F7') { hangStart(-dir); return; }   // ▲(-1)=上げる
    var ids = floorsOfEnd(endKey), un = unlockedOn(ids);
    if (un.length) { onWarn(un.join('・') + '番を緊締してからフロアを動かしてください'); return; }
    holding = { end: endKey, ids: ids, dir: dir, last: null, warned: false };
    ensureHoldLoop();
  }
  function holdStop() {
    if (hangHold) {   // 宙段は離した時、各段階(格納・スロープ・全上げ)の近くならぴたっとその位置に合わせる(格納位置(0番)より上にセットピンが入っている間は合わせない: ピンに載った位置から、段階の位置へ引き戻されてしまうため)
      var onStopPin = SP_CFG && SP.inserted && MECH.hang >= HANG.loadU - 0.001;   // ピンに当たって止まっている間は、ピンより奥(上)の段階の位置(2)へは吸い付かせない
      [0, 1, 2].forEach(function (s) { if (!(onStopPin && s > HANG.loadU + 1e-6) && Math.abs(MECH.hang - s) < 0.08 && s >= hangLow() && !hangStuck() && !(s > MECH.hang && hangProblem(s))) MECH.hang = s; });
      syncHangEnd(); autoPinTarget('F7');
    }
    hangHold = null;
    if (!holding) return;
    var e = ENDS[holding.end];
    holding = null;
    // 2番前を下げ続けて5番フロアがほんの少し(3px未満)浮いただけなら、離した時に平らへ戻す(押し過ぎで「5番が平らでない」にならないように)
    if (MECH.lift > 0 && MECH.lift < 3 && !MECH.hook) { MECH.lift = 0; applyF5(); }
    var movedKey = Object.keys(ENDS).filter(function (n) { return ENDS[n] === e; })[0];
    if (movedKey) autoPinTarget(movedKey);
    // 走行位置の近くで離したらピタッと合わせる(動かして良い位置の時だけ)
    if (Math.abs(e.off - e.travel) < 3 && e.off !== e.travel) {
      var k = Object.keys(ENDS).filter(function (n) { return ENDS[n] === e; })[0];
      var cand = curOffs(); cand[k] = e.travel;
      if (!poseProblem(floorsOfEnd(k), cand)) e.off = e.travel;
    }
  }
  var holdRafId = null;
  function ensureHoldLoop() {
    if (holdRafId === null) { holdRafId = requestAnimationFrame(holdStep); }
  }
  function holdStep(ts) {
    holdRafId = null;
    if (!holding) return;
    var h = holding;
    if (h.last === null) h.last = ts;
    var dt = Math.min(0.05, (ts - h.last) / 1000); h.last = ts;

    // ピンに載った判定(rested)と同じ1.5pxの余裕を見る。下の車の屋根すれすれでピンの数値までわずかに届かない時も、5番を持ち上げられるように
    // 5番フロアを下げ切ったら、同じ押し続けでは2番前を上げない(離して押し直すまで止まる)。押し続けの勢いで2番前がピンから浮いて、
    // 「ピンに載っていない」ままフロアの下へ車が入ってしまうのを防ぐ
    if (h.end === 'F2f' && h.dir < 0 && h.liftUsed && MECH.lift <= 0) { holdRafId = requestAnimationFrame(holdStep); return; }
    if (h.end === 'F2f' && ((h.dir > 0 && ENDS.F2f.off >= f2Low() - 1.5) || (h.dir < 0 && MECH.lift > 0))) {
      if (h.dir < 0) h.liftUsed = true;
      // 床がピンに載ったところで下ボタンを押し続けても、すぐには5番を持ち上げ始めない(ワンテンポ待つ)。走行位置で下を押した瞬間に5番が浮いて、平らを保つのが大変だったため。
      // 押し直す必要はなく、長押しのまま待てば動き出す
      if (h.dir > 0) { h.liftWait = (h.liftWait || 0) + dt; if (h.liftWait < LIFT_DELAY_SEC) { holdRafId = requestAnimationFrame(holdStep); return; } }
      // 2番前シリンダーの余力で5番フロアを昇降
      var nl = Math.min(LIFT_MAX, Math.round((MECH.lift + h.dir * RATE * dt) * 10) / 10);
      var p5 = nl === MECH.lift ? '可動範囲いっぱい' : liftProblem(nl);
      if (p5) { if (h.warned !== p5) { onWarn(p5); h.warned = p5; } }
      else { MECH.lift = Math.max(0, nl); applyF5(); h.warned = false; }
      holdRafId = requestAnimationFrame(holdStep);
      return;
    }
    var onStopper = MECH.hook && MECH.lift <= 0;
    var cand = curOffs(), er = ENDS[h.end].r, lo = lowOf(h.end);
    var midPrev = cand.MID;
    // 2番前は可動域の上限(柱の赤テープ付近)までそのまま上げられる(以前の「赤ラインより上は5番をストッパーに掛けてから」は廃止)
    var hi = er[0];
    // 3番前のシーソー連動で、ピンより下まで引き下げられている棚(3番後ろ)も、押した瞬間にピンの高さへ飛ばず、上げる向きに普通の速さで動かす
    // 棚がセットピンより下にいる間(3番前を上げた時のシーソー連動で、ピンより下へ引き下げられた3番後ろなど)は、ピンは下げる動きの邪魔をしない。
    // ピンは「その上に載った棚」を受けるだけ。ピンより下の棚は、可動範囲の下限(接地)まで下げられる
    if (PINS[h.end] !== null && ENDS[h.end].off > PINS[h.end] + 0.5) lo = ENDS[h.end].r[1];
    lo = Math.max(lo, ENDS[h.end].off);
    // 支柱の短い棚(2番前)は、ピン無しで上がるのは freeTop まで。ピンを一番上の穴に差し、かつ5番フロアがスロープ(ストッパーに乗った状態)の時だけ、赤テープ付近(range の上限)まで上がる。
    // 5番フロアを平らに戻したら、ピンが上限の穴のままでも freeTop まで(2026-10-07 ユーザー指示)。
    // ピンを抜いた時にすでに freeTop より上なら、そこより上へは上げられないだけで、下げるまでは位置はそのまま(押した瞬間に飛ばない)
    var topOff = er[0];
    if (ENDS[h.end].freeTop !== undefined && !(PINS[h.end] !== null && PINS[h.end] <= pinLimitOff(h.end) + 0.5 && (h.end !== 'F2f' || f5Slope()))) topOff = Math.max(er[0], Math.min(ENDS[h.end].freeTop, ENDS[h.end].off));
    cand[h.end] = Math.min(lo, Math.max(topOff, Math.round((cand[h.end] + h.dir * RATE * dt) * 10) / 10));
    if (h.end === 'MID') {
      // 中央継ぎ目を動かすと、3番後ろの斜めシリンダーはシーソーのように連動する
      var d = cand.MID - midPrev;
      var lever = (2055 - 1762) / (1762 - 1520);
      cand.F3r = Math.min(ENDS.F3r.r[1], Math.max(ENDS.F3r.r[0], ENDS.F3r.off - lever * d));
    }
    var prob = cand[h.end] === ENDS[h.end].off
      ? (PINS[h.end] !== null && h.dir > 0 && ENDS[h.end].off <= PINS[h.end] + 0.5 ? 'セットピンでこれ以上下がらない'
        : '可動範囲いっぱい')
      : poseProblem(h.ids, cand);
    if (prob) { if (h.warned !== prob) { onWarn(prob); h.warned = prob; } }
    else { ENDS[h.end].off = cand[h.end]; if (h.end === 'MID') ENDS.F3r.off = cand.F3r; h.warned = false; autoPinTarget(h.end); if (h.end === 'MID') autoPinTarget('F3r'); }
    holdRafId = requestAnimationFrame(holdStep);
  }

  function endAtTravel(k) { return Math.abs(ENDS[k].off - ENDS[k].travel) < 0.5; }
  function atTravel(id) { return endAtTravel(FLOORS[id].front.end) && endAtTravel(FLOORS[id].rear.end); }
  // 3番後ろのフロアが道板の高さまで下がって接地していれば、上段へ積む状態(それより上に浮いていれば下段へ積む状態)
  function upperConnected() { var r = onFloor('F3', FLOORS.F3.x1, 312); return r[1] >= RAMP_TOP[1] - 24; }   // 3番の後端(延長板の先 x=2010)が道板の高さ付近まで下がって接地
  function f1Connected() {
    var f1DeckY = function (x) { return floorsCfg.f1DeckYAt625 + floorsCfg.f1DeckYSlope * (x - 625); };
    var a = onFloor('F1', 850, f1DeckY(850)), b = onFloor('F2', 885, 314);
    return !MECH.f2Flap && flapT() <= 0 && Math.abs(a[1] - b[1]) <= 14; // 2番扇動板を開いている間は1番への道が切れる
  }

  // ---- アウトリガー(6番のタイヤ張り出しを解除するためのジャッキ)----
  var OUT = cfg.outrigger;
  var JACK_MAX = OUT.jackMax, JACK_CONTACT = OUT.jackContact;
  var KINGPIN = OUT.kingpin;
  MECH.jack = 0;      // ジャッキの伸び量(0=格納)
  MECH.tireOut = false;
  function jackLift() { return Math.max(0, MECH.jack - JACK_CONTACT); }
  function tireOffGround() { return jackLift() > 1; }
  // ジャッキで持ち上がった分、車体(トレーラー側)が傾く角度(度)。連結部(キングピン)が支点。
  function jackTiltDeg() {
    var lift = jackLift(); if (!lift) return 0;
    var arm = OUT.jackX - KINGPIN[0];
    return Math.asin(Math.min(1, lift / arm)) * 180 / Math.PI;
  }
  var jackHolding = null;
  function jackHoldStart(dir) {
    jackHolding = { dir: dir, last: null };
    ensureJackLoop();
  }
  function jackHoldStop() { jackHolding = null; }
  var jackRafId = null;
  function ensureJackLoop() { if (jackRafId === null) jackRafId = requestAnimationFrame(jackStep); }
  function jackStep(ts) {
    jackRafId = null;
    if (!jackHolding) return;
    var h = jackHolding;
    if (h.last === null) h.last = ts;
    var dt = Math.min(0.05, (ts - h.last) / 1000); h.last = ts;
    var v = MECH.jack + h.dir * 22 * dt;
    MECH.jack = Math.max(0, Math.min(JACK_MAX, Math.round(v * 10) / 10));
    if (jackHolding) jackRafId = requestAnimationFrame(jackStep);
  }
  // タイヤ(車軸)の突出・格納。実車は、左右のロックを解除していないと動かない(走行中に勝手に出ないためのロック)。
  // 手順: ジャッキを伸ばしてタイヤを浮かせる → 右引・左引でロック解除 → 伸/縮 → 右押・左押でロック → ジャッキを縮める
  function setLock(side, locked) {
    if (side === 'R') MECH.lockR = !!locked; else MECH.lockL = !!locked;
    onInfo((side === 'R' ? '車軸の右' : '車軸の左') + (locked ? 'をロックした' : 'のロックを解除した'));
  }
  // 作業ランプ: 左右のロックを解除して、タイヤを浮かせている(伸/縮ができる状態)
  function workReady() { return !MECH.lockR && !MECH.lockL && tireOffGround(); }
  // dir: 'out'=伸(突出) / 'in'=縮(格納)
  function moveTire(dir) {
    if (MECH.lockR || MECH.lockL) { onWarn('車軸のロックが掛かっています。右引・左引でロックを解除してください'); return; }
    if (!tireOffGround()) { onWarn('ジャッキでタイヤを浮かせてから動かしてください'); return; }
    if (dir === 'out' && MECH.tireOut) { onWarn('タイヤはすでに突出しています'); return; }
    if (dir === 'in' && !MECH.tireOut) { onWarn('タイヤはすでに格納されています'); return; }
    MECH.tireOut = dir === 'out';
    onInfo(MECH.tireOut ? 'タイヤを突出させた' : 'タイヤを格納した');
  }
  function toggleTireOut() { moveTire(MECH.tireOut ? 'in' : 'out'); }
  // いま押されているスイッチ(トレーラー上のスイッチの押した絵・操作盤用): {end,dir}・宙段・ジャッキ
  function pressInfo() {
    return { hold: holding ? { end: holding.end, dir: holding.dir } : null, hang: hangHold ? hangHold.dir : 0, jack: jackHolding ? jackHolding.dir : 0 };
  }

  // ---- 通知(status行への橋渡し。main側から差し替え可能)----
  function onWarn(msg) { if (window.FLOOR_MECH_NOTIFY) window.FLOOR_MECH_NOTIFY(msg, 'warn'); }
  function onInfo(msg) { if (window.FLOOR_MECH_NOTIFY) window.FLOOR_MECH_NOTIFY(msg, 'info'); }

  // 後ろの柱のセットピン穴の変更(宙段が格納位置にある時だけ。上がっている間は柱に荷重が掛かっていて抜けない)
  // フレームの固定ピン: 位置(穴)の変更・抜き差し。宙段がスロープ(u≦1.05)以下の時だけ位置を変えられる。差せるのはフロアがピンの穴の高さ以上にある時だけ(棚のセットピンと同じ)
  function setStopPinHole(n) {
    if (!SP_CFG) return false;
    n = Math.max(1, Math.min(SP_CFG.pts.length, Math.round(n)));
    if (n === SP.hole) return true;
    if (MECH.hang > 1.05 && SP.inserted) { onWarn('固定ピンを抜いてから、位置を変えてください(ピンが刺さったままでは変えられません)'); return false; }
    SP.hole = n; stopPinSolve(); onInfo('固定ピンの位置: ' + n + '番(止まる高さ u=' + HANG.loadU.toFixed(1) + ')'); return true;
  }
  function toggleStopPin() {
    if (!SP_CFG) return;
    if (SP.inserted) { SP.inserted = false; onInfo('固定ピンを抜いた'); return; }
    SP.inserted = true;   // フロアの位置に関係なく刺せる。ピンは赤い板に差しておく止め具で、上がってきたフロアがピンに当たると、それより奥(上)へは動かなくなる(戻る方向は止めない)
    onInfo('固定ピンを刺した(宙段を上げるとピンに当たって止まります)');
  }
  function setRearPinHole(n) {
    n = Math.max(1, Math.min(RP_CFG.holes || 1, Math.round(n)));
    if (n === RP.hole) return true;
    if (MECH.hang > 0.05) { onWarn('宙段を格納位置に戻してから、後ろの柱のピンを差し替えてください'); return false; }
    RP.hole = n; hangRebuild(); syncHangEnd();
    onInfo('後ろの柱のピン: ' + n + '番穴(柱の縮み幅 ' + Math.round(hangSolve(0).rear - RP.len) + 'px)');
    return true;
  }
  // 荷物の変更(配車担当への連絡・時間切れ)で、トレーラーを積み始めの状態に戻す: 道板・扇動板・ジャッキ・タイヤ・ロック・5番フロア・宙段・セットピンを初期位置へ
  function resetAll() {
    holdStop(); if (typeof jackHoldStop === 'function') jackHoldStop();
    MECH.ramp = false; RAMP.t = 0; RAMP.last = null;
    MECH.bridge = false; MECH.f2Flap = false;
    MECH.lift = 0; MECH.hook = false; MECH.stopper = true;
    MECH.jack = 0; MECH.tireOut = false; MECH.lockR = MECH.lockL = true;
    applyF5();
    initPins();   // 棚を走行位置・ピンを初期状態へ。宙段も格納(hang=0)に戻る
    syncHangEnd();
  }
  window.FLOOR_MECH = {
    resetAll: resetAll,
    stopPinResolve: stopPinSolve, stopPin: SP, stopPinHoles: SP_CFG ? SP_CFG.pts.length : 0, stopPinCfg: SP_CFG, setStopPinHole: setStopPinHole, toggleStopPin: toggleStopPin,
    rearPin: RP, rearPinHoles: RP_CFG.holes || 1, rearPinPitch: RP_CFG.pitch || 0, setRearPinHole: setRearPinHole, rearPinLen: function () { return RP.len; },
    FLOORS: FLOORS, FIDS: FIDS, ENDS: ENDS, PINS: PINS, MECH: MECH, CYLS: CYLS, initPins: initPins, FRAME_GAP_PX: FRAME_GAP_PX, hangPose: hangPose, hangSlope: hangSlope, hangReachable: hangReachable, hangHits: hangHits, carTopY: carTopY, hangFit: hangFit, hangLowerFit: hangLowerFit, hangUpperFit: hangUpperFit, hangUpperEnvelope: hangUpperEnvelope, envFits: envFits, envAt: envAt, ENV: { x0: ENV_X0, dx: ENV_DX, n: ENV_N }, hangVsUpperX: hangVsUpperX, FIT_OFFS: FIT_OFFS, hangProblem: hangProblem, hangStuck: hangStuck, hangEnds: hangEnds, hangSolve: hangSolve, hangRebuild: hangRebuild, pinned: pinned, rested: rested, floorPinsOk: floorPinsOk, offOfHole: offOfHole, poseProblem: poseProblem, staticPoseProblem: staticPoseProblem,
    BR_ANCHOR: BR_ANCHOR, BRIDGE_STOWED_X: BRIDGE_STOWED_X,
    F1_CYL: F1_CYL, SHEAVE: SHEAVE, WIRE_TOP: WIRE_TOP, f1CylLen: f1CylLen,
    poseOf: poseOf, tf: tf, onFloor: onFloor, curOffs: curOffs,
    holeNo: holeNo, holeRange: holeRange, pinTarget: pinTarget, snapToHole: snapToHole,
    stepPinTarget: stepPinTarget, togglePin: togglePin,
    toggleStopper: toggleStopper, toggleBridge: toggleBridge, f5Slope: f5Slope,
    toggleRamp: toggleRamp, rampUpdate: rampUpdate, rampReady: rampReady, rampT: function () { rampUpdate(); return RAMP.t; },
    toggleF2Flap: toggleF2Flap, F2_FLAP_LEN: F2_FLAP_LEN, flapT: flapT, bridgeT: bridgeT, bridgeReady: bridgeReady, bridgeTip: bridgeTip,
    holdStart: holdStart, holdStop: holdStop,
    atTravel: atTravel, upperConnected: upperConnected, f1Connected: f1Connected,
    cylPin: cylPin, cylLen: cylLen,
    outrigger: OUT, jackLift: jackLift, tireOffGround: tireOffGround, jackTiltDeg: jackTiltDeg,
    jackHoldStart: jackHoldStart, jackHoldStop: jackHoldStop, toggleTireOut: toggleTireOut, moveTire: moveTire, setLock: setLock, workReady: workReady, pressInfo: pressInfo
  };
})();
