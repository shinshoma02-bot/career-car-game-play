(function () {
  var cfg = window.TRAILER_CONFIG;
  var lib = window.CAR_LIBRARY;
  // 車の寸法・画像は、実車の参考車種の諸元に合わせた値(js/car_dims.js。200px/mの画像)で上書きする。画像は使う車だけを必要な時に読み込む
  if (window.CAR_DIMS) lib.forEach(function (e) {
    var d = window.CAR_DIMS[e.id];
    if (!d) return;
    ['len', 'width', 'aspect', 'wb', 'tl', 'tr', 'rw', 'rh'].forEach(function (k) { e[k] = d[k]; });
    e.imgSrc = d.img + '?v=' + (window.CAR_DIMS_V || 1);
    e.prof = d.prof;   // 車の輪郭(画像を読まずに、積める組み合わせを判定するため)
  });

  var canvas = document.getElementById('stage');
  var gameStatusEl = document.getElementById('gameStatus');
  var previewCanvas = document.getElementById('carPreview');
  var previewCtx = previewCanvas.getContext('2d');
  var btnLeft = document.getElementById('btnLeft');
  var btnRight = document.getElementById('btnRight');

  var ENTRY_STOP = { x: cfg.ramp.bottom[0] + 70, y: cfg.ramp.bottom[1] };
  var OFFSCREEN_X = cfg.stage.w + 220;
  var CREEP_SPEED_PX_S = 0.45 * cfg.pxPerMeter; // 押した瞬間に達する最低速度(クリープ相当)
  var MAX_SPEED_PX_S = 3.3 * cfg.pxPerMeter;    // 長押しで到達する最高速度
  var ACCEL_PX_S2 = 100;  // 押している間、クリープ→最高速度へ滑らかに加速する割合
  var DECEL_PX_S2 = 640;  // 離した時、惰性で滑らかに減速して止まる割合(急停止させない)
  var ENTRY_EXIT_SPEED_PX_S = CREEP_SPEED_PX_S * 2;
  var SPIN_SIGN = -1; // 前進(進行量+)方向のホイール回転符号
  var CHOCK_OVERRIDE_SPEED_PX_S = 3.05 * cfg.pxPerMeter; // これ以上の勢いで当たると輪止めを乗り越える(高い輪止め=乗り越えにくい)
  var OVERRIDE_SPEED_KEEP = 0.55; // 乗り越えた瞬間、衝撃で失われず残る速度の割合
  var OVERSHOOT_CAP_PX = 130; // 乗り越えて進める限界(その先は壁扱いでこれ以上進めない)

  var missCountEl = document.getElementById('missCount');

  var state = {
    targetSlot: null,
    occupied: {},     // slotNum -> { img, w, h, leftTireX, floor, localX, localY, rotDeg }
    car: null,        // 現在ステージ上で操作可能な車
    pendingEntry: null,
    misses: 0
  };
  window.GAME_STATE = state;
  // 衝撃の演出: 勢いよくぶつかるとトレーラーが揺れ(shake)、ぶつかった車がグシャッと縮む(squash)。描画はmain.js
  state.fx = { shake: null };
  function triggerShake(amp, dur) { state.fx.shake = { t0: performance.now(), dur: dur || 500, amp: amp }; }
  function triggerSquash(car, a, dur) { car.squash = { t0: performance.now(), dur: dur || 480, a: a }; }
  // 2番に積んだ車に2番扇動板がぶつかった(ノーマル・ハード)
  state.flapHit = function () {
    var occ = state.occupied['2'];
    triggerShake(7, 600);
    if (occ && occ.live) triggerSquash(occ.live, 0.14, 520);
    recordMiss('2番の車に2番扇動板がぶつかった', 'major');
  };
  // 事故(車の落下など): 衝撃の演出のあと作業を止めて、一からやり直し(modes.jsが結果画面を出す)
  function accident(car, reason) {
    if (state.accident) return;
    state.accident = { reason: reason };
    car.accident = { t0: performance.now(), landed: false };
    car.velocity = 0;
    state.frozen = true;
    triggerShake(12, 1400);
    setStatus('事故!' + reason);
    setTimeout(function () { if (window.GAME_MODE && window.GAME_MODE.onAccident) window.GAME_MODE.onAccident(reason); }, 1900);
  }

  // ---- 輪止め・タイヤ止め・タイヤ落とし(第5章)----
  // 車は「タイヤが最初に当たる障害物」の位置で止まる。障害物は次のいずれか(cfg.slots[n].stopKind):
  //   stopper(1・4番): フロア端に元からあるタイヤ止め。手前(後方)に輪止めを追加でセットできる
  //   hole(2・3番)   : タイヤ落とし。落し蓋を開けるとタイヤが落ち込んで止まる。蓋を閉じたまま上に輪止めもセットできる
  //   none(5・6番)   : 床の穴に輪止めをはめ込む(必須)。輪止めが無いと止まれない
  // chocks[slot] = { set:bool, step:int }: 輪止めの有無と、基準位置(tireX)からの段数(+は後方=道板側=画面右、-は前方)。
  // lidOpen[slot]: 落し蓋を開けているか(2・3番)。可動範囲・1段の距離はchockRange(cm)。
  // 車が輪止め(タイヤ止め・落とし)の位置より約8px手前(後方)で止まる。輪止めの絵はタイヤ接地点の前に置くので、タイヤが輪止めに届く手前で当たるように
  var STOP_OFFSET_PX = 8;
  var chocks = {}, lidOpen = {};
  state.chocks = chocks; state.lidOpen = lidOpen;
  // 1番は元のタイヤ止めを廃止し、輪止めを基準位置(可動範囲の一番手前側)にセットした状態から始める(そこから奥へ動かせる)
  function setDefaultChocks() {
    Object.keys(cfg.slots).forEach(function (n) { if (cfg.slots[n].defaultChock) chocks[n] = { set: true, step: 0 }; });
  }
  setDefaultChocks();
  function chockLimits(num) {
    var r = cfg.slots[num].chockRange || {};
    var step = r.step || 1, front = Math.round((r.front || 0) / step);
    // 前方にも動かせないスロット(1〜4番)は、元のタイヤ止め/穴に重ならない後方1段目から
    return { min: front ? -front : 1, max: Math.round((r.rear || 0) / step), stepCm: step };
  }
  function stepsToPx(num, steps) { return steps * chockLimits(num).stepCm / 100 * cfg.pxPerMeter; }
  // 現在有効な障害物: { kind:'chock'|'stopper'|'hole', dx }(dxは基準位置から後方へのpx)。無ければnull
  function activeStop(num) {
    var slot = cfg.slots[num], c = chocks[num];
    if (slot.noChock) syncHangHole();
    if (c && c.set) return { kind: 'chock', dx: stepsToPx(num, c.step) };
    if (slot.stopKind === 'stopper') return { kind: 'stopper', dx: 0 };
    if (slot.stopKind === 'hole' && lidOpen[num]) return { kind: 'hole', dx: 0 };
    return null;
  }
  // 宙段(7番)の落とし穴: 落し蓋の操作は無い。格納中は下段の窪みにはまっていて関係なく、上げた時には最初から穴が空いている(載せた車がいる間は空いたまま)
  function syncHangHole() {
    var fm = window.FLOOR_MECH;
    if (fm && cfg.slots['7']) lidOpen['7'] = fm.MECH.hang > 0.05 || !!state.occupied['7'];
  }
  // 車のタイヤの停止点(フロア上ならフロアのローカル座標)。障害物が無ければ基準位置
  function slotTarget(num) {
    var slot = cfg.slots[num], s = activeStop(num), dx = s ? s.dx + STOP_OFFSET_PX : 0;
    return { x: slot.tireX + dx, y: slot.deckY + dx * Math.tan((slot.rot || 0) * Math.PI / 180) };
  }
  state.slotTarget = slotTarget;
  state.activeStop = activeStop;
  state.chockLimits = chockLimits;

  function setStatus(msg) { gameStatusEl.textContent = msg; }
  // ミスの記録はここに集約(モード側が「リアルモードは即終了」などを決める)
  // severity: 'major'(ぶつかる・乗り越える・脱輪・ピン無しで下へ入る等=安全上重大)/ 'minor'(手順の不備=道板未展開・棚を動かした・積めない車種等)
  function recordMiss(reason, severity) {
    state.misses++;
    updateMissHud();
    if (window.GAME_MODE && window.GAME_MODE.onMiss) window.GAME_MODE.onMiss(reason, severity || 'major');
  }
  state.recordMiss = recordMiss;
  function updateMissHud() { missCountEl.textContent = 'ミス: ' + state.misses; }

  // ---- 経路(道)----
  // 積み込み先は事前に選ばない。車は「今つながっている道」を矢印で走り、道の上で最初に当たる輪止め・タイヤ止め・落としで止まる。
  // 止まったスロットがその車の積み込み先になる。道は棚などの状態で決まる:
  //   U(上段) = 道板↔3番がつながっている: 3番 → 2番 → 1番の順に通る
  //   4(5番スロープ) = 5番フロアをスロープにして扇動板を搬出済み: 6番 → 5番 → 4番の順に通る
  //   L(下段) = 上記以外: 6番 → 5番の順に通る
  // 経路の各点は world座標({x,y})か、可動フロア上のローカル座標({floor,x,y})のどちらか。
  // フロア上の点は毎フレーム window.FLOOR_MECH.onFloor() で現在の傾きに変換される(1〜3番は同時操作対応)。
  var ROUTE_SLOTS = { U: ['3', '2', '1'], L: ['6', '5'], '4': ['6', '5', '4'], '7': ['6', '7'] };
  function buildRoute(id) {
    var fm = window.FLOOR_MECH, S = cfg.slots, rb = cfg.ramp.bottom, rt = cfg.ramp.top;
    var pts = [
      { x: ENTRY_STOP.x, y: ENTRY_STOP.y },
      { x: rb[0], y: rb[1] },
      { x: rt[0], y: rt[1] }
    ];
    var tg = {};   // slot -> そのスロットのタイヤ基準点(経路上の距離を測るための点。経路の頂点とは限らない)
    function slotPt(n, floor) { return floor ? { floor: floor, x: S[n].tireX, y: S[n].deckY } : { x: S[n].tireX, y: S[n].deckY }; }
    var extra = {};
    if (id === 'U') {
      var f3rear = fm.FLOORS.F3.rear.pt, f2rear = fm.FLOORS.F2.rear.pt, f2front = fm.FLOORS.F2.front.pt, f1rear = fm.FLOORS.F1.rear.pt;
      // 3番の後端が道板の付け根より後ろへはみ出していても(新しい後部は短い)、道板からは付け根の真上へ乗り移る
      pts.push({ floor: 'F3', x: Math.min(fm.FLOORS.F3.x1, rt[0]), y: f3rear[1] });   // 道板の付け根から、3番の延長板の先(x1)へ乗り移る
      pts.push({ floor: 'F2', x: f2rear[0], y: f2rear[1] });
      pts.push({ floor: 'F2', x: f2front[0], y: f2front[1] });
      extra.f2front = { floor: 'F2', x: f2front[0], y: f2front[1] };
      pts.push({ floor: 'F1', x: f1rear[0], y: f1rear[1] });
      pts.push(slotPt('1', 'F1'));
      tg['3'] = slotPt('3', 'F3'); tg['2'] = slotPt('2', 'F2'); tg['1'] = slotPt('1', 'F1');
    } else if (id === '7') {
      // 宙段(7台目): 下段の床を進み、接地した宙段の後端から前上がりのスロープを上って、宙段の上の基準位置へ
      pts.push(slotPt('7', 'F7'));
      pts.splice(3, 0, { floor: 'F7', x: fm.hangEndLocal ? fm.hangEndLocal() : 1785, y: 510 });
      tg['6'] = slotPt('6'); tg['7'] = slotPt('7', 'F7');
    } else if (id === '4') {
      // 5番フロアのスロープ(後端→持ち上がった前端)を上り、扇動板を渡って4番へ(β版のrouteToと同じ経路)
      var f5 = fm.FLOORS.F5;
      pts.push({ floor: 'F5', x: f5.rear.pt[0], y: f5.rear.pt[1] });
      pts.push({ floor: 'F5', x: 962, y: f5.front.pt[1] });
      pts.push({ x: fm.BR_ANCHOR[0], y: fm.BR_ANCHOR[1] });
      pts.push(slotPt('4'));
      tg['6'] = slotPt('6'); tg['5'] = slotPt('5', 'F5'); tg['4'] = slotPt('4');
    } else {
      pts.push(slotPt('5'));
      tg['6'] = slotPt('6'); tg['5'] = slotPt('5');
    }
    var hasFloor = pts.some(function (p) { return !!p.floor; });
    return { id: id, raw: pts, tg: tg, extra: extra, slots: ROUTE_SLOTS[id], hasFloor: hasFloor };
  }
  // いま走れる道。車がまだ動き出していない間(道板の手前にいる間)は、棚の状態に合わせて選び直す
  function lowRoute(id) { return id === 'L' || id === '4'; }
  function chooseRoute() {
    var fm = window.FLOOR_MECH;
    if (fm.upperConnected()) return 'U';
    // 宙段は、少し斜めに上げた状態(後端が接地に近い)なら後端から乗れるので宙段の道。もっと高く上げてあれば下段の道(6・5番)のまま
    if (fm.hangReachable()) return '7';
    if (fm.f5Slope() && fm.bridgeReady()) return '4';
    return 'L';
  }

  function resolvePoint(p) {
    if (p.floor) {
      var w = window.FLOOR_MECH.onFloor(p.floor, p.x, p.y);
      return { x: w[0], y: w[1] };
    }
    return { x: p.x, y: p.y };
  }
  function resolvePath(rawPts) { return rawPts.map(resolvePoint); }

  // 積み込み先の道・機構が現在つながっているか(ランプ↔3番、2番↔1番、扇動板↔4番)
  // いま舞台にいる(これから積む)車の車種。いなければ次の車
  function currentEntry() {
    var car = state.car;
    if (car && car.entry && !car.seated && car.phase !== 'docked' && car.phase !== 'exiting') return car.entry;
    return state.pendingEntry && state.pendingEntry.entry;
  }
  // 車を左右反転した画像(後ろ向き=バックで積む時用)。反転したので左タイヤは元の右タイヤの位置になる
  function flipImage(img) {
    var cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    var g = cv.getContext('2d');
    g.translate(img.width, 0); g.scale(-1, 1); g.drawImage(img, 0, 0);
    return cv;
  }
  // 走っている車が通れない理由の一覧(β版のcheckPlacementと同じ条件を、道の上の位置に合わせて判定)。
  // イージー: 理由が出ている間は前へ進めない / ノーマル・ハード: 進めるがミス(同じ理由は車1台につき続く間1回)
  function lowFloorBlocked(car) {
    // 下段(4〜6番)へ向かう通り道の上で、上段フロアが棚の絵の高さ(=下段の車が入れる高さ)より下がっていたら通れない。
    // 走行位置(初期状態)は絵より下がっているので、下段を積む前に上段の棚を上げる必要がある
    var fm = window.FLOOR_MECH, xL = car.x - car.leftTireX - 30, name = null;
    fm.FIDS.forEach(function (id) {
      if (id === 'F5' || name) return;
      var f = fm.FLOORS[id];
      for (var x = f.x0; x <= f.x1; x += 15) {
        var p = fm.onFloor(id, x, f.bottom(x));
        if (p[0] >= xL && p[0] <= cfg.ramp.top[0] && p[1] > f.bottom(x) + 8 + fm.FRAME_GAP_PX) { name = f.name; return; }
      }
    });
    return name;
  }
  // 宙段が上がっている(格納でない)間に、下段の車が宙段の下を通ろうとしていないか
  function hangBlocksCar(car) {
    // 車の前後の余白は取らない。余白を取ると、積める組み合わせの判定(hangFit、余白なし)を通った車が、実際には宙段の下の位置まで進めなくなる
    var fm = window.FLOOR_MECH, x0 = car.x - car.leftTireX;
    return fm.hangHits(x0, x0 + car.w, fm.carTopY({ img: car.img, w: car.w, h: car.h, leftTireX: car.leftTireX }, [car.x, car.y]), fm.MECH.hang);
  }
  function routeProblems(car) {
    var fm = window.FLOOR_MECH, out = [], id = car.route.id;
    if (!fm.rampReady()) out.push({ key: 'ramp', msg: '道板が出ていません。フロア昇降パネルの「道板を出す」で出してから進めてください。' });
    if (fm.tireOffGround()) out.push({ key: 'jack', msg: 'ジャッキで台車が浮いている間は車を動かせません。ジャッキを縮めて接地させてください。' });
    if (id === 'U') {
      if (car.f2FrontArc !== undefined && car.progress > car.f2FrontArc - 30 && (fm.MECH.f2Flap || !fm.f1Connected())) {
        out.push({ key: 'f1link', msg: fm.MECH.f2Flap ? '2番扇動板が開いているので1番へは通れません。閉じてください。' : '1番へはまだ2番↔1番がつながっていません。フロア昇降パネルでつなげてください。' });
      }
    } else {
      var hb = (id === 'L' || id === '4') && hangBlocksCar(car);
      if (hb) out.push({ key: 'hang', msg: '宙段フロアが上がっていて通れません。宙段を下げてから(格納してから)通ってください。' });
      var lf = lowFloorBlocked(car);
      if (lf) out.push({ key: 'lowfloor', msg: lf + 'が下がっていて通れません。下段の車が入れる高さまで棚を上げてください。' });
      if (id === 'L' && !fm.atTravel('F5') && car.arc['6'] !== undefined && car.progress > car.arc['6'] - 20) out.push({ key: 'f5flat', msg: fm.f5Slope() && !fm.bridgeReady() ? '5番フロアがスロープのままです。4番へ積むなら扇動板を出して、5番へ積むなら5番フロアを平らに戻してください。' : '5番フロアが平らになっていません。' });
    }
    return out;
  }

  // 駐車している車(OK・固定済み)の周り: 動いている車がこの範囲(タイヤ基準点の進行距離)に入ると車同士がぶつかる
  function zonesOf(car) {
    var zs = [];
    car.route.slots.forEach(function (k) {
      var occ = state.occupied[k];
      if (!occ || occ.live === car || car.arc[k] === undefined) return;
      var sp = car.arc[k] - (occ.dx || 0);
      zs.push({ slot: k, lo: sp - (occ.w - occ.leftTireX) - car.leftTireX, hi: sp + occ.leftTireX + (car.w - car.leftTireX) });
    });
    return zs;
  }

  // スロットの車種制限: 6番は車幅が1.755m以下(軽・5ナンバー・現行ステップワゴンクラスまで)の車だけ。
  // 幅の広い車は6番に載せられない(車幅はcar_libraryの各車のwidth)
  function carFitsSlot(num, entry) {
    var slot = cfg.slots[num];
    if (!slot.maxWidthM || !entry) return true;
    return (entry.width || 0) <= slot.maxWidthM;   // 幅の広い車は6番に載せられない(タイヤの格納が次のサイクルの必須条件のため)
  }
  // 経路の角を丸める(継ぎ目で車の向きが急に折れ曲がらないように)
  function smoothPath(pts, r) {
    if (pts.length < 3) return pts;
    var out = [pts[0]];
    for (var i = 1; i < pts.length - 1; i++) {
      var a = pts[i - 1], b = pts[i], c = pts[i + 1];
      var d1 = Math.hypot(b.x - a.x, b.y - a.y), d2 = Math.hypot(c.x - b.x, c.y - b.y);
      var rr = Math.min(r, d1 * 0.45, d2 * 0.45);
      if (rr < 3) { out.push(b); continue; }
      var p1 = { x: b.x + (a.x - b.x) * rr / d1, y: b.y + (a.y - b.y) * rr / d1 };
      var p2 = { x: b.x + (c.x - b.x) * rr / d2, y: b.y + (c.y - b.y) * rr / d2 };
      for (var k = 0; k <= 6; k++) {
        var t = k / 6, u = 1 - t;
        out.push({
          x: u * u * p1.x + 2 * u * t * b.x + t * t * p2.x,
          y: u * u * p1.y + 2 * u * t * b.y + t * t * p2.y
        });
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // 経路上の距離sから座標を引けるツールを作る(s<=0は最初の区間の延長線上として扱う)
  function makePathTool(rawPts) {
    var pts = smoothPath(rawPts, 55);
    var seg = [], total = 0;
    for (var i = 1; i < pts.length; i++) {
      var l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      seg.push({ a: pts[i - 1], b: pts[i], l: l, s0: total });
      total += l;
    }
    function at(s) {
      var g0 = seg[0];
      if (s <= 0) {
        var t0 = g0.l === 0 ? 0 : s / g0.l;
        return { x: g0.a.x + (g0.b.x - g0.a.x) * t0, y: g0.a.y + (g0.b.y - g0.a.y) * t0 };
      }
      for (var i = 0; i < seg.length; i++) {
        var q = seg[i];
        var isLast = i === seg.length - 1;
        if (s <= q.s0 + q.l || isLast) {
          var raw = q.l === 0 ? 0 : (s - q.s0) / q.l;
          // 最終区間は1を超えても延長する(輪止めを乗り越えた時のオーバーシュートを表現するため)
          var t = isLast ? raw : Math.min(1, raw);
          return { x: q.a.x + (q.b.x - q.a.x) * t, y: q.a.y + (q.b.y - q.a.y) * t };
        }
      }
    }
    // 点ptに一番近い経路上の距離(各スロットの基準点が、経路のどこにあるかを測る)
    function arcOf(pt) {
      var best = Infinity, bs = 0;
      seg.forEach(function (g) {
        var dx = g.b.x - g.a.x, dy = g.b.y - g.a.y, l2 = dx * dx + dy * dy;
        var t = l2 ? ((pt.x - g.a.x) * dx + (pt.y - g.a.y) * dy) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        var d = Math.hypot(pt.x - (g.a.x + dx * t), pt.y - (g.a.y + dy * t));
        if (d < best) { best = d; bs = g.s0 + t * g.l; }
      });
      return bs;
    }
    return { total: total, at: at, arcOf: arcOf };
  }

  // 回線が不安定でも表示できるよう、読み込み失敗時は間隔を空けて最大5回やり直す(data:は1回だけ)
  function loadImage(src, maxTries) {
    return new Promise(function (resolve, reject) {
      var tries = 0, max = src.indexOf('data:') === 0 ? 1 : (maxTries || 5);
      (function attempt() {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () {
          if (++tries >= max) { reject(new Error('load failed: ' + src.slice(0, 80))); return; }
          setTimeout(attempt, 400 * tries);
        };
        img.src = tries ? src + (src.indexOf('?') < 0 ? '?' : '&') + 'r=' + tries : src;
      })();
    });
  }

  // ---- 積む車(1サイクル6台)と難易度 ----
  // イージー/ノーマル: 6台全部を並べて表示し、タップした車が入場する。ハード: 1台ずつ表示し、◀▶で別の車を選ぶ。
  // 道板の手前で待機中の車・載せ終えた車は、リストの中で暗く表示する(退場した車はリストに戻る)。
  state.deckSize = 6;   // 今のサイクルの台数(6か7。newDeckで決める)
  var deckAllEl = document.getElementById('deckAll'), deckHardEl = document.getElementById('deckHard');
  var btnPrevCar = document.getElementById('btnPrevCar'), btnNextCar = document.getElementById('btnNextCar');
  var deckCountEl = document.getElementById('deckCount'), btnOrient = document.getElementById('btnOrient'), btnOrientCar = document.getElementById('btnOrientCar');
  var floorStatusEl = document.getElementById('floorStatus'), stageStatusEl = document.getElementById('status');
  var deckToken = 0;
  state.deck = [];
  state.sel = 0;
  state.difficulty = 'easy';
  state.hints = true;

  // 1サイクルの6台: ランダムに選ぶ(重複なし)。ただし6番に載せられる車(幅が上限以下)を必ず1台は入れる
  function fitsSlot6(e) { return (e.width || 0) <= (cfg.slots['6'].maxWidthM || Infinity); }
  // 軽四(軽自動車・軽箱バン・軽トラ・軽クーペ。幅1.5m以下)は、本来3台あれば上段・下段のどちらにも3台並べて積めるが、その積み方は未実装。
  // 3台以上の組み合わせは出さない(1デッキに最大2台。KEI_MAX)
  var KEI_MAX = 2;
  function isKei(e) { return (e.width || 0) <= 1.5; }
  function pickCars(n) {
    var pool = lib.slice(), out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    // 軽四が多すぎたら、余った分を軽四以外の車(まだ選ばれていない車)に入れ替える
    var spare = pool.filter(function (e) { return !isKei(e); });
    for (var i = 0; i < out.length && out.filter(isKei).length > KEI_MAX && spare.length; i++) {
      if (isKei(out[i])) out[i] = spare.splice(Math.floor(Math.random() * spare.length), 1)[0];
    }
    if (!out.some(fitsSlot6)) {
      var narrow = lib.filter(fitsSlot6);
      if (narrow.length) out[Math.floor(Math.random() * out.length)] = narrow[Math.floor(Math.random() * narrow.length)];
    }
    return out;
  }
  function drawImgFit(ctx2, cv, img) {
    ctx2.clearRect(0, 0, cv.width, cv.height);
    if (!img) return;
    var scale = Math.min(cv.width / img.width, cv.height / img.height);
    var w = img.width * scale, h = img.height * scale;
    ctx2.drawImage(img, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
  }
  function itemImg(it) { return it.flip ? it.flipImg : it.img; }
  function waiting() { return state.deck.filter(function (it) { return it.status === 'wait'; }); }
  // 選択中の車(入場待ち)を決める。選択中が使えなければ最初の入場待ちに移る
  function syncPending() {
    var it = state.deck[state.sel];
    if (!it || it.status !== 'wait') {
      var idx = -1;
      state.deck.forEach(function (d, i) { if (idx < 0 && d.status === 'wait') idx = i; });
      state.sel = idx < 0 ? 0 : idx;
      it = idx < 0 ? null : state.deck[idx];
    }
    state.pendingEntry = it && it.status === 'wait' ? it : null;
  }
  var DECK_TAG = { wait: '', road: '走行中', loaded: '積込済' };
  function renderDeck() {
    var hard = state.difficulty === 'hard';
    deckHardEl.style.display = hard ? 'block' : 'none';
    deckAllEl.style.display = hard ? 'none' : 'flex';
    if (hard) {
      var p = state.pendingEntry;
      drawImgFit(previewCtx, previewCanvas, p ? itemImg(p) : null);
      var left = waiting().length;
      btnPrevCar.disabled = btnNextCar.disabled = left < 2;
      btnOrient.disabled = !p;
      btnOrient.textContent = p && p.flip ? '向き: 後ろ向き(バック)' : '向き: 前向き(頭から)';
      btnOrientCar.style.display = carFlippable() ? 'block' : 'none';
      btnOrientCar.textContent = '待機中の車の向き: ' + (state.car && state.car.flip ? '後ろ向き(バック)' : '前向き(頭から)') + '(タップで切替)';
      deckCountEl.textContent = p ? '車(タップで入場)  幅' + (p.entry.width || 0).toFixed(2) + 'm  残り' + left + '台' : (state.deck.length ? 'すべて積み込み中・積込済' : '準備中...');
    } else {
      deckAllEl.innerHTML = '';
      state.deck.forEach(function (it, i) {
        var box = document.createElement('div');
        box.className = 'deckItem ' + it.status;
        var cv = document.createElement('canvas');
        cv.width = 208; cv.height = 132;
        drawImgFit(cv.getContext('2d'), cv, itemImg(it));
        cv.addEventListener('click', function () {
          if (it.status !== 'wait') return;
          state.sel = i; syncPending(); beginEntry();
        });
        var tag = document.createElement('div');
        tag.className = 'deckTag'; tag.textContent = (DECK_TAG[it.status] ? DECK_TAG[it.status] + ' ' : '') + '幅' + (it.entry.width || 0).toFixed(2) + 'm';
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = it.flip ? '後ろ向き(バック)' : '前向き(頭から)';
        if (it.status === 'road' && !carFlippable()) b.style.visibility = 'hidden';
        b.addEventListener('click', function () {
          if (it.status === 'road') { state.flipCar(); return; }
          it.flip = !it.flip; renderDeck();
        });
        box.appendChild(cv); box.appendChild(tag); box.appendChild(b);
        deckAllEl.appendChild(box);
      });
    }
  }
  // 動き出す前だけ向きを変えられる: 状態が変わったらボタンの出し入れだけ更新する(リストは作り直さない)
  function updateFlipUi() {
    var sel = canSelectOther();
    deckAllEl.classList.toggle('selLocked', !sel);
    deckHardEl.classList.toggle('selLocked', !sel);
    var ok = carFlippable();
    btnOrientCar.style.display = state.difficulty === 'hard' && ok ? 'block' : 'none';
    if (ok) btnOrientCar.textContent = '待機中の車の向き: ' + (state.car.flip ? '後ろ向き(バック)' : '前向き(頭から)') + '(タップで切替)';
    Array.prototype.forEach.call(deckAllEl.querySelectorAll('.deckItem.road button'), function (b) { b.style.visibility = ok ? 'visible' : 'hidden'; if (ok) b.textContent = state.car.flip ? '後ろ向き(バック)' : '前向き(頭から)'; });
  }
  setInterval(updateFlipUi, 250);

  function idleHint() {
    if (!state.car || state.car.phase === 'docked') {   // OK表示中(止まっている車がいる間)は案内文で上書きしない
      setStatus(state.difficulty === 'hard'
        ? '車をタップすると道板の手前に入場します。◀▶で別の車を選べます。矢印ボタンで進め、OKが出たらもう一度車をタップして固定します。'
        : '積む車をタップすると道板の手前に入場します。向きは車の下のボタンで選べます。矢印ボタンで進め、OKが出たらもう一度車をタップして固定します。');
    }
  }
  function refreshDeck() { syncPending(); renderDeck(); }
  btnOrient.addEventListener('click', function () {
    var p = state.pendingEntry;
    if (!p) return;
    p.flip = !p.flip;
    renderDeck();
  });
  function stepCar(dir) {
    var n = state.deck.length;
    for (var k = 1; k <= n; k++) {
      var i = ((state.sel + dir * k) % n + n) % n;
      if (state.deck[i].status === 'wait') { state.sel = i; break; }
    }
    refreshDeck();
  }
  btnOrientCar.addEventListener('click', function () { state.flipCar(); });
  btnPrevCar.addEventListener('click', function () { stepCar(-1); });
  btnNextCar.addEventListener('click', function () { stepCar(1); });
  // 退場した(積まずに戻った)車はリストに戻す
  function returnToDeck(car) {
    if (car && car.deckItem && car.deckItem.status === 'road') car.deckItem.status = 'wait';
    refreshDeck();
  }
  // 新しいサイクルの車を引く: 台数は6台か7台(ランダム。7台目は宙段)。引いた組み合わせが物理的に積めるか(LOADABLE.check)を判定して、
  // 積めなければ引き直す(ミニバン・SUV・箱バンだらけで積めない組み合わせを出さない)。車の画像は車種ごとに1回だけ読み込んで使い回す
  var itemCache = {};
  function loadItem(entry) {
    var c = itemCache[entry.id];
    if (!c) {
      var src = entry.imgSrc || ('data:image/png;base64,' + entry.img_b64);
      // 車の画像は WebP。古い端末などで WebP が読めない(2回試して失敗した)時だけ、同じ名前の .png に切り替えて読み直す
      var p = /\.webp(\?|$)/.test(src)
        ? loadImage(src, 2).catch(function () { return loadImage(src.replace(/\.webp(\?|$)/, '.png$1')); })
        : loadImage(src);
      c = itemCache[entry.id] = p.then(function (img) { return { img: img, flipImg: flipImage(img) }; });
      c.catch(function () { delete itemCache[entry.id]; });   // 読み込みに失敗した車は、次の抽選でもう一度読み込めるように、覚えておかない
    }
    return c.then(function (v) { return { entry: entry, img: v.img, flipImg: v.flipImg, flip: false, status: 'wait' }; });
  }
  var MAX_REDRAW = 60;
  // 車の輪郭(prof)だけで「積めるか」を判定してから、通ったデッキの画像だけを読み込む(不合格の抽選では画像を読まない)
  function drawLoadableDeck(size, tries) {
    var entries = pickCars(size), r = { ok: true };
    if (window.LOADABLE) r = window.LOADABLE.check(entries.map(function (en) { return { entry: en }; }));
    if (!r.ok && tries < MAX_REDRAW) return drawLoadableDeck(size, tries + 1);
    return Promise.all(entries.map(loadItem)).then(function (items) { items.drawTries = tries + 1; items.loadable = r; return items; });
  }
  // わざと積めない荷物: 6番に載せられる車(幅1.755m以下)が1台も無い組み合わせ。6番が埋まらないので、どう並べても積み終わらない(確実に積めない)
  var IMPOSSIBLE_CHANCE = 0.12;   // 新しい荷物が積めない荷物になる確率(最初の荷物は必ず積める。state.impossibleChance で上書きできる=確認用)
  function drawImpossibleDeck(size) {
    var pool = lib.filter(function (e) { return !fitsSlot6(e); }), out = [];
    while (out.length < size && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return Promise.all(out.map(loadItem)).then(function (items) { items.drawTries = 1; items.loadable = { ok: false, why: '6番に載せられる車が無い' }; items.impossible = true; return items; });
  }
  state.deckImpossible = false; state.dispatchDone = false; state.deckDrawn = 0;
  function newDeck() {
    var token = ++deckToken;
    state.deck = []; state.sel = 0; state.pendingEntry = null;
    renderDeck();
    var size = Math.random() < 0.5 ? 6 : 7;
    setStatus('車を準備しています...');
    var chance = state.impossibleChance !== undefined ? state.impossibleChance : IMPOSSIBLE_CHANCE;
    var impossible = state.deckDrawn > 0 && Math.random() < chance;
    (impossible ? drawImpossibleDeck(size) : drawLoadableDeck(size, 0)).then(function (items) {
      if (token !== deckToken) return;
      state.deckDrawn++; state.deckImpossible = !!items.impossible; state.dispatchDone = false;
      state.deck = items; state.sel = 0; state.deckSize = size; state.deckTries = items.drawTries;
      if (window.GAME_MODE && window.GAME_MODE.onTurnStart) window.GAME_MODE.onTurnStart();   // 新しい荷物が届いた(ターン開始)
      state.deckMinH = items.loadable && isFinite(items.loadable.H) ? items.loadable.H : null;   // この組み合わせをいちばん低く積める荷姿の高さ(6台。7台は無し)
      refreshDeck();
      idleHint();
    }).catch(function (err) {
      // 回線が不安定で、車の画像を読めなかった: 少し待って、引き直す(止まったままにしない)
      if (token !== deckToken) return;
      console.warn('deck load failed, retry', err);
      setStatus('車の画像を読み込めませんでした。もう一度試しています...');
      setTimeout(function () { if (token === deckToken) { newDeck(); } }, 1500);
    });
  }
  // 難易度の切り替え(modes.jsから)。イージーだけ解説(黄色い案内文・フロアの操作メッセージ)を出す
  state.setDifficulty = function (level) {
    state.difficulty = level === 'normal' || level === 'hard' ? level : 'easy';
    state.hints = state.difficulty === 'easy';
    gameStatusEl.style.display = floorStatusEl.style.display = stageStatusEl.style.display = document.getElementById('chockLabel').style.display = state.hints ? '' : 'none';
    refreshDeck();
    idleHint();
  };
  // 輪止め・落し蓋の操作パネル。車が輪止めの可動範囲に入る前(手前にいる間)だけ変更できる
  var chockLabelEl = document.getElementById('chockLabel');
  var btnChockSet = document.getElementById('btnChockSet');
  var btnChockFront = document.getElementById('btnChockFront');
  var btnChockRear = document.getElementById('btnChockRear');
  var btnLid = document.getElementById('btnLid');
  var STOP_NAME = { stopper: '輪止め', hole: '落とし穴', chock: '輪止め' };
  function describeStop(num) {
    var slot = cfg.slots[num], c = chocks[num], lim = chockLimits(num), s = activeStop(num);
    if (c && c.set) {
      var cm = c.step * lim.stepCm;
      if (cm === 0) return '輪止め セット中(基準位置)';
      return '輪止め セット中(' + (cm < 0 ? '基準より前へ' : (slot.stopKind === 'none' ? '基準より後ろへ' : (slot.stopKind === 'hole' ? '穴の手前 ' : '輪止めの手前 '))) + Math.abs(cm) + 'cm' + (cm === 0 ? '・基準位置' : '') + ')';
    }
    if (slot.stopKind === 'stopper') return '元の輪止めで停止(追加の輪止めは任意)';
    if (slot.stopKind === 'hole') return lidOpen[num] ? '落し蓋を開けた(タイヤが落ち込んで停止)' : '落し蓋を閉じている(停止するには蓋を開けるか、輪止めをセット)';
    return s ? '' : '輪止め未セット(5・6番は輪止めが必須)';
  }
  function updateChockUi() {
    var num = state.targetSlot;
    var none = !num;
    btnChockSet.disabled = btnChockFront.disabled = btnChockRear.disabled = btnLid.disabled = none;
    btnLid.style.display = (num && cfg.slots[num].stopKind === 'hole') ? '' : 'none';
    Array.prototype.forEach.call(document.querySelectorAll('#slotSel button'), function (b) { b.classList.toggle('on', b.dataset.slot === num); });
    if (none) { btnChockSet.textContent = '輪止めをセット'; chockLabelEl.textContent = '上のボタンでスロットを選ぶと、輪止め・落し蓋を操作できます'; return; }
    if (cfg.slots[num].noChock) {   // 宙段: 輪止めも落し蓋の操作も無い
      btnChockSet.disabled = btnChockFront.disabled = btnChockRear.disabled = btnLid.disabled = true;
      btnLid.style.display = 'none'; btnChockSet.textContent = '輪止めをセット';
      chockLabelEl.textContent = '宙: 輪止めはありません。宙段を上げると、落としの穴が最初から空いています(タイヤが落ち込んで停止)';
      return;
    }
    var c = chocks[num], set = !!(c && c.set), lim = chockLimits(num);
    btnChockSet.textContent = set ? '輪止めを外す' : '輪止めをセット';
    btnChockFront.disabled = !set || c.step <= lim.min;
    btnChockRear.disabled = !set || c.step >= lim.max;
    btnLid.textContent = lidOpen[num] ? '落し蓋を閉じる' : '落し蓋を開ける';
    chockLabelEl.textContent = num + '番: ' + describeStop(num) +
      ' [輪止めの位置 ' + (lim.min < 0 ? '前' + -lim.min * lim.stepCm + 'cm〜後' + lim.max * lim.stepCm + 'cm' : (cfg.slots[num].stopKind === 'hole' ? '穴' : '輪止め') + 'の手前' + lim.min * lim.stepCm + '〜' + lim.max * lim.stepCm + 'cm') + ']';
  }
  // 輪止めを動かせないのは、そのスロットに車が載っている間と、車のタイヤが輪止めの可動範囲の上にある(または近づいている)間。
  // 車がその範囲をすでに通り過ぎていれば(例: 1番に積んだ後の2番)動かせる
  function canEditStops(num) {
    if (state.occupied[num]) return false;
    var car = state.car;
    if (!car || !car.route || !car.arc || car.arc[num] === undefined) return true;
    if (car.phase !== 'ready' && car.phase !== 'moving' && car.phase !== 'entering') return true;
    var lim = chockLimits(num);
    var sLow = car.arc[num] - stepsToPx(num, lim.max), sHigh = car.arc[num] - stepsToPx(num, Math.min(0, lim.min));   // 輪止めが置かれうる範囲(進行距離)
    var p = car.progress || 0;
    if (p >= sLow - 10 && p - car.wbPx <= sHigh + 10) return false;   // 前輪は範囲の手前を過ぎ、後輪はまだ範囲を抜けていない
    return true;
  }  function editGuard() {
    var num = state.targetSlot;
    if (!num) return null;
    if (cfg.slots[num].noChock) { setStatus('宙段には輪止めも落し蓋の操作もありません(上げると穴が空いています)。'); return null; }
    if (!canEditStops(num)) { setStatus('車が輪止めの位置まで近づいたので、もう動かせません。'); return null; }
    return num;
  }
  function afterStopEdit(num, msg) { updateChockUi(); setStatus(num + '番: ' + msg); }
  btnChockSet.addEventListener('click', function () {
    var num = editGuard(); if (!num) return;
    var c = chocks[num] || (chocks[num] = { set: false, step: 0 }), lim = chockLimits(num);
    if (c.set) { c.set = false; afterStopEdit(num, '輪止めを外しました。'); return; }
    if (cfg.slots[num].stopKind === 'hole' && lidOpen[num]) { setStatus('落し蓋を開けたままでは輪止めを置けません。先に蓋を閉じてください。'); return; }
    c.set = true; c.step = Math.max(lim.min, Math.min(lim.max, 0));   // 5・6番は基準位置の穴、1〜4番は後方1段目
    afterStopEdit(num, '輪止めをセットしました。');
  });
  function moveChock(dir) {
    var num = editGuard(); if (!num) return;
    var c = chocks[num], lim = chockLimits(num);
    if (!c || !c.set) return;
    var next = c.step + dir;
    if (next < lim.min || next > lim.max) return;
    c.step = next;
    afterStopEdit(num, '輪止めを動かしました。');
  }
  btnChockFront.addEventListener('click', function () { moveChock(-1); });
  btnChockRear.addEventListener('click', function () { moveChock(+1); });
  btnLid.addEventListener('click', function () {
    var num = editGuard(); if (!num) return;
    if (!lidOpen[num] && chocks[num] && chocks[num].set) { setStatus('蓋の上に輪止めがあります。先に輪止めを外してください。'); return; }
    lidOpen[num] = !lidOpen[num];
    afterStopEdit(num, lidOpen[num] ? '落し蓋を開けました。' : '落し蓋を閉じました。');
  });
  // 経路を(棚の今の位置で)引き直す: 座標・長さ・各スロットの基準点までの距離
  function rebuildPath(car) {
    var pts = resolvePath(car.rawPath);
    car.pts = pts;
    car.pathTool = makePathTool(pts);
    car.pathLen = car.pathTool.total;
    car.arc = {};
    car.route.slots.forEach(function (k) { car.arc[k] = car.pathTool.arcOf(resolvePoint(car.route.tg[k])); });
    car.f3RearArc = car.route.id === 'U' ? car.pathTool.arcOf(pts[3]) : undefined;   // 3番フロアの後端
    car.rampArc = car.pathTool.arcOf(pts[2]);   // 道板の上端まで(上段・下段の道が分かれる前の共通部分)
    car.f2FrontArc = car.route.extra.f2front ? car.pathTool.arcOf(resolvePoint(car.route.extra.f2front)) : undefined;
  }
  function attachRoute(car, id) {
    car.route = buildRoute(id);
    car.rawPath = car.route.raw;
    car.dynamicPath = car.route.hasFloor;
    car.beyond = {};
    car.contacted = false;
    car.contactSlot = null;
    rebuildPath(car);
  }

  // スロット選択: 積み込み先ではなく、輪止め・落し蓋・フロア操作パネルの対象を選ぶ
  // スロット選択: 輪止め・落し蓋の操作パネルの対象を選ぶ(積み込み先ではない)。同じものをもう一度押すと選択を外す。
  // スロットをタップしても何も出ない仕様になったので、輪止めパネルの選択ボタンから選ぶ
  function selectSlot(num) {
    state.targetSlot = state.targetSlot === num ? null : num;
    updateChockUi();
    if (state.targetSlot) setStatus(num + '番の輪止め・落し蓋を操作できます。');
  }
  state.selectSlot = selectSlot;
  Array.prototype.forEach.call(document.querySelectorAll('#slotSel button'), function (b) {
    b.addEventListener('click', function () { selectSlot(b.dataset.slot); });
  });

  // ---- 矢印で動かす車を選ぶ・固定する ----
  // 入場した車は自動で操作対象になる。OKが出た車をもう一度タップするとその位置で固定され、次の車を呼べる。
  // 固定した車も、タップすると操作対象になり、矢印でバックなどで動かせる(動かすとOKが外れる)。
  function activateCar(c) {
    var cur = state.car;
    if (cur && cur !== c && !canSelectOther()) { selectBlockedMsg(); return; }
    function go() {
      c.locked = false; c.phase = 'ready'; c.velocity = 0;
      state.car = c;
      if (c.slot) { state.targetSlot = c.slot; updateChockUi(); }
      setStatus('この車を矢印で動かせます。もう一度OKが出たら、タップして固定してください。');
    }
    if (!cur || cur === c) { go(); return; }
    if (cur.seated) { cur.locked = true; go(); return; }   // 今の車はOKの位置で固定して切り替える
    if (cur.phase === 'exiting') return;
    cur.phase = 'exiting';
    animateExit(go);   // まだOKでない車は来た道を戻って退場してから切り替える
  }
  function tapCar(c) {
    if (c === state.car) {
      if (c.locked) { c.locked = false; setStatus('この車を矢印で動かせます。'); }
      else if (c.seated) { c.locked = true; c.velocity = 0; setStatus('その位置で固定しました。次の車を呼べます。'); }
      return;
    }
    activateCar(c);
  }
  function occPos(occ) {
    var fm = window.FLOOR_MECH;
    return occ.floor ? fm.onFloor(occ.floor, occ.localX, occ.localY) : [occ.localX, occ.localY];
  }
  function carAt(x, y) {
    function hit(cx, cy, c) { return x >= cx - c.leftTireX - 6 && x <= cx - c.leftTireX + c.w + 6 && y >= cy - c.h - 6 && y <= cy + 10; }
    var cur = state.car;
    if (cur && (cur.phase === 'ready' || cur.phase === 'moving')) {
      var p = cur.seated && state.occupied[cur.slot] ? occPos(state.occupied[cur.slot]) : [cur.x, cur.y];
      if (hit(p[0], p[1], cur)) return cur;
    }
    var found = null;
    Object.keys(state.occupied).forEach(function (k) {
      var occ = state.occupied[k];
      if (found || !occ.live || occ.live === cur) return;
      var q = occPos(occ);
      if (hit(q[0], q[1], occ)) found = occ.live;
    });
    return found;
  }

  // 車の向き: 前向き(頭から=画像のまま、左向き)/ 後ろ向き(バック=左右反転)。反転したら左タイヤの位置も反転後のものにする
  function orientCar(car, flip) {
    var e = car.entry, it = car.deckItem;
    var tl = flip ? 1 - e.tr : e.tl, tr = flip ? 1 - e.tl : e.tr;
    car.flip = flip;
    car.img = flip ? it.flipImg : it.img;
    car.tlRatio = tl; car.trRatio = tr;
    car.leftTireX = tl * car.w;
  }
  // 入場した車も、まだ動き出す前(道板の手前で待機中)なら前後を変えられる
  function carFlippable() {
    var c = state.car;
    return !!(c && c.deckItem && !c.seated && (c.phase === 'entering' || c.phase === 'ready') && (c.progress || 0) <= 1);
  }
  state.flipCar = function () {
    if (!carFlippable()) return false;
    var c = state.car;
    c.deckItem.flip = !c.deckItem.flip;
    orientCar(c, c.deckItem.flip);
    renderDeck();
    return true;
  };

  // 車を選べるのは、道板の手前に車がいる(または操作中の車がいない・固定済み)時だけ。フロアの上に操作中の車がいる間は、他の車を選べない
  // (OKの車は、タップで固定してから次の車へ)
  function canSelectOther() {
    var c = state.car;
    if (!c || c.locked) return true;
    if (c.phase === 'entering' || c.phase === 'exiting') return true;
    return (c.phase === 'ready' || c.phase === 'moving') && !c.seated && (c.progress || 0) <= (c.rampArc || 5) + 5;   // まだ道板の上(フロアに乗っていない)なら、退場させて切り替えられる
  }
  function selectBlockedMsg() { if (state.hints) setStatus('車がフロアの上にいる間は、他の車を選べません。OKの車はタップで固定してから次の車を選んでください。'); }
  state.canSelectOther = canSelectOther;

  // 「次の車」をタップ: スロット選択や道板の状態に関係なく、道板の手前に入場する
  function beginEntry() {
    if (!state.pendingEntry) return;
    if (!canSelectOther()) { selectBlockedMsg(); return; }
    var pending = state.pendingEntry;
    pending.status = 'road';
    syncPending();
    renderDeck();

    function startNewCar() {
      var e = pending.entry;
      var w = e.len * cfg.pxPerMeter;
      var h = w * e.aspect;
      state.car = {
        deckItem: pending,
        libId: e.id,
        entry: e,
        w: w, h: h,
        rwRatio: e.rw, rhRatio: e.rh,
        wheelRPx: e.rw * w,
        wbPx: e.wb * cfg.pxPerMeter,
        rawPath: null,
        dynamicPath: false,
        pathTool: null,
        pathLen: 0,
        progress: 0,
        velocity: 0,
        beyond: {}, missedKeys: {}, collided: {}, pinMissed: {}, locked: false,
        blocked: false,
        spinDeg: 0,
        x: OFFSCREEN_X, y: ENTRY_STOP.y,
        phase: 'entering'
      };
      orientCar(state.car, !!pending.flip);
      attachRoute(state.car, chooseRoute());
      setStatus('入場中...');
      animateEntry();
    }

    if (state.car && !state.car.seated && state.car.phase !== 'docked' && state.car.phase !== 'exiting') {
      state.car.phase = 'exiting';
      setStatus('前の車を退場させています...');
      animateExit(startNewCar);
    } else {
      startNewCar();
    }
  }

  // 道板の手前で待っている車を退場させる(道板をしまう時など)
  state.dismissCar = function () {
    var car = state.car;
    if (!car || car.seated || car.phase === 'docked' || car.phase === 'exiting') return;
    car.phase = 'exiting';
    animateExit(function () {});
  };
  function animateExit(done) {
    var car = state.car;
    var last = performance.now();
    function step(now) {
      if (state.car !== car || car.phase !== 'exiting') return; // 別の操作で状態が変わったら停止
      var dt = (now - last) / 1000; last = now;
      var dx = ENTRY_EXIT_SPEED_PX_S * dt;
      if (car.pathTool && car.progress > 0.5) {
        // フロアの上にいる車は、来た道を戻って道板から退場する(床の上で横に滑って出て行かない)
        if (car.dynamicPath) { car.pathTool = makePathTool(resolvePath(car.rawPath)); car.pathLen = car.pathTool.total; }
        car.progress = Math.max(0, car.progress - dx * 5);
        var q = car.pathTool.at(car.progress);
        car.x = q.x; car.y = q.y;
        car.spinDeg += (dx * 5 / car.wheelRPx) * (180 / Math.PI) * -SPIN_SIGN;
        requestAnimationFrame(step);
        return;
      }
      car.x += dx;
      car.spinDeg += (dx / car.wheelRPx) * (180 / Math.PI) * -SPIN_SIGN;
      if (car.x > OFFSCREEN_X) {
        state.car = null;
        returnToDeck(car);
        done();
        return;
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function animateEntry() {
    var car = state.car;
    var last = performance.now();
    function step(now) {
      if (state.car !== car || car.phase !== 'entering') return; // 別の操作で状態が変わったら停止
      var dt = (now - last) / 1000; last = now;
      var dx = ENTRY_EXIT_SPEED_PX_S * dt;
      car.x -= dx;
      car.spinDeg += (dx / car.wheelRPx) * (180 / Math.PI) * SPIN_SIGN;
      if (car.x <= ENTRY_STOP.x) {
        car.x = ENTRY_STOP.x;
        car.phase = 'ready';
        setStatus('道板の手前に入場しました。矢印ボタンで進め、輪止めに当たってOKが出たら、もう一度車をタップして固定します。');
        return;
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // 目標速度へ滑らかに近づける(押している間は加速、離している間は惰性で減速)
  function updateVelocity(car, pressedDir, dt) {
    if (pressedDir !== 0) {
      if (car.velocity === 0 || (car.velocity > 0) !== (pressedDir > 0)) {
        car.velocity = pressedDir * CREEP_SPEED_PX_S; // 発進/逆転時はすぐクリープ速度に乗る
      }
      var targetV = pressedDir * MAX_SPEED_PX_S;
      var maxDelta = ACCEL_PX_S2 * dt;
      car.velocity = (car.velocity < targetV)
        ? Math.min(targetV, car.velocity + maxDelta)
        : Math.max(targetV, car.velocity - maxDelta);
    } else {
      var decelStep = DECEL_PX_S2 * dt;
      car.velocity = (car.velocity > 0)
        ? Math.max(0, car.velocity - decelStep)
        : Math.min(0, car.velocity + decelStep);
    }
  }

  // ---- 走行の物理 ----
  // 輪止め・タイヤ止め・落としは「道の上の障害物」。ぶつかった瞬間の速度が閾値未満なら、その位置でぴたっと止まって
  // 即OK。閾値以上なら勢いを一部失いながら乗り越える(ミス)。止まったスロットがその車の積み込み先になる。
  // イージー: 通れない状態(道板・棚・駐車中の車など)では前へ進めない / ノーマル・ハード: 進めるが、ぶつかる・仕様上できない動きはミス。
  var CONTACT_MARGIN_PX = 8;   // 輪止めの少し手前(約4px)から当たりとみなす(当たってから前に出ないとOKにならない、を防ぐ)

  // 道の上の障害物(いま有効なもの)を手前から順に
  function barriersOf(car) {
    var list = [];
    car.route.slots.forEach(function (k) {
      var st = activeStop(k);
      if (st && car.arc[k] !== undefined) list.push({ slot: k, stop: st, s: car.arc[k] - st.dx - STOP_OFFSET_PX });
    });
    list.sort(function (a, b) { return a.s - b.s; });
    return list;
  }
  // 駐車中の車(OK・固定済み)にぶつかる範囲に入ろうとしたら、イージーは手前で止まり、それ以外はミス
  function wallClamp(car, before, next) {
    zonesOf(car).forEach(function (z) {
      var wasIn = before > z.lo && before < z.hi, willIn = next > z.lo && next < z.hi;
      if (!willIn) { delete car.collided[z.slot]; return; }
      if (wasIn) return;
      var vImp = Math.abs(car.velocity);
      triggerShake(Math.min(10, 3 + vImp / 45), 650);
      triggerSquash(car, Math.min(0.22, 0.07 + vImp / 1200), 560);
      if (state.hints) {
        next = before <= z.lo ? z.lo : z.hi;
        car.velocity = 0;
        setStatus(z.slot + '番に車があって進めません。奥から順に積み込んでください。');
      } else if (!car.collided[z.slot]) {
        car.collided[z.slot] = true;
        recordMiss(z.slot + '番の車にぶつかった');
      }
    });
    return next;
  }

  // pressedDir: 現在ボタンで指定されている方向(0/+1/-1)。戻り値: まだ速度が残っていて物理ループを継続すべきならtrue
  function physicsStep(pressedDir, dt) {
    var car = state.car;
    if (!car) return false;
    if (state.frozen) { car.velocity = 0; return false; }
    if (car.phase !== 'ready' && car.phase !== 'moving') return false;
    if (car.locked) { car.velocity = 0; return false; }   // 固定した車は矢印で動かない(タップで操作対象にすると動かせる)
    if (!car.route) { car.velocity = 0; return false; }

    // 通れない理由(イージーは前へ進めない。ノーマル・ハードは進めるがミス。理由が続いている間は1回)
    var probs = routeProblems(car), blocked = null, present = {};
    probs.forEach(function (p) {
      present[p.key] = true;
      if (state.hints) { if (!blocked) blocked = p; }
      else if (pressedDir > 0 && !car.missedKeys[p.key]) { car.missedKeys[p.key] = true; recordMiss(p.msg.split('。')[0], (p.key === 'ramp' || p.key === 'jack') ? 'minor' : 'major'); }
    });
    Object.keys(car.missedKeys).forEach(function (k) { if (!present[k]) delete car.missedKeys[k]; });
    if (blocked && pressedDir > 0) {
      car.velocity = Math.min(0, car.velocity);
      if (car.blockedMsg !== blocked.msg) { car.blockedMsg = blocked.msg; setStatus(blocked.msg); }
      return true;
    }
    if (car.blockedMsg) { car.blockedMsg = null; setStatus('矢印ボタンで車を進めてください。'); }
    updateVelocity(car, pressedDir, dt);
    if (blocked && car.velocity > 0) car.velocity = 0;

    var before = car.progress;
    var proposed = before + car.velocity * dt;
    var maxProgress = car.pathLen + OVERSHOOT_CAP_PX;
    var bars = barriersOf(car);

    // すでに通り過ぎている障害物は「乗り越えた」扱いにしておく(棚が動いて位置がずれた時など。ミスにはしない)
    bars.forEach(function (b) { if (!car.beyond[b.slot] && before > b.s + CONTACT_MARGIN_PX + 1) car.beyond[b.slot] = true; });
    var hit = null, back = null, i;
    for (i = 0; i < bars.length; i++) {
      if (!car.beyond[bars[i].slot] && car.velocity >= 0 && proposed >= bars[i].s - CONTACT_MARGIN_PX) { hit = bars[i]; break; }
    }
    if (!hit) {
      for (i = bars.length - 1; i >= 0; i--) {
        if (car.beyond[bars[i].slot] && proposed <= bars[i].s) { back = bars[i]; break; }
      }
    }

    var next;
    if (hit) {
      var nm = hit.slot + '番の' + STOP_NAME[hit.stop.kind];
      if (Math.abs(car.velocity) >= CHOCK_OVERRIDE_SPEED_PX_S) {
        // 勢いがあるので乗り越える(衝撃で速度は一部失う)
        next = Math.min(maxProgress, Math.max(0, proposed));
        car.velocity *= OVERRIDE_SPEED_KEEP;
        car.beyond[hit.slot] = true;
        car.contacted = false;
        triggerShake(Math.min(9, 3 + Math.abs(car.velocity) / 70), 600);
        triggerSquash(car, 0.07, 450);
        recordMiss(nm + 'を勢いよく乗り越えた');
        setStatus('ガタン!勢いがついていたので' + nm + 'を乗り越えてしまいました。(ミス: ' + state.misses + ') 反対方向へ動かせば戻れます。');
      } else {
        // 勢いが弱いので、その位置でぴたっと止まる(これがOKの条件)
        next = hit.s;
        var vIn = Math.abs(car.velocity);
        if (vIn > 60) triggerShake(Math.min(2.5, vIn / 130), 260);
        car.velocity = 0;
        car.contacted = true;
        car.contactSlot = hit.slot;
        if (!car.seated && car.fitMsg !== hit.slot) setStatus(hit.stop.kind === 'hole' ? 'ストン…' + hit.slot + '番のタイヤが穴に落ちて停止しました。' : 'コトッ…' + nm + 'に接触して停止しました。');
      }
    } else if (back) {
      // 乗り越えた側から手前へ戻る操作は、速度によらず素直に通過させる(リカバリー操作は妨げない)
      next = Math.max(0, proposed);
      car.beyond[back.slot] = false;
      car.contacted = false;
      setStatus('障害物を乗り越えて手前に戻りました。もう一度、慎重に進めてください。');
    } else {
      next = Math.min(maxProgress, Math.max(0, proposed));
    }
    next = wallClamp(car, before, next);
    car.progress = next;
    if (car.progress <= 0 || car.progress >= maxProgress) car.velocity = 0;

    var anyBeyond = Object.keys(car.beyond).some(function (k) { return car.beyond[k]; });
    if (car.progress >= maxProgress - 0.5) {
      if (anyBeyond) {
        // 乗り越えた後、床の端(奥の限界)まで行ってしまったら脱輪
        if (!car.derailed) { car.derailed = true; triggerShake(8, 700); triggerSquash(car, 0.16, 600); recordMiss('脱輪(床の端を越えた)'); setStatus('脱輪!タイヤが床の端を越えました。(ミス: ' + state.misses + ')'); }
      } else if (!car.ranOut) {
        // 止める物が何も無いまま奥の限界まで行ってしまった
        car.ranOut = true;
        recordMiss('止める物が無いまま奥の限界まで進んだ');
        setStatus('止める物がありません!輪止めをセットするか落し蓋を開けてください。(ミス: ' + state.misses + ')');
      }
    } else if (car.progress < maxProgress - 30) {
      car.ranOut = false;
    }

    var applied = car.progress - before;
    var p = car.pathTool.at(car.progress);
    car.x = p.x; car.y = p.y;
    car.spinDeg += (applied / car.wheelRPx) * (180 / Math.PI) * SPIN_SIGN;
    if (applied !== 0) car.phase = 'moving';
    if (car.seated && applied < -0.2) car.contacted = false;   // 輪止めから離れる向きに動かしたら、OK(固定でない限り)を外す
    // 3番フロアが道板から離れている(上げている)のに、車が3番の後端より後ろ(道板との間の空中)へ出たら、車が落ちる事故
    if (car.route.id === 'U' && car.f3RearArc !== undefined && !window.FLOOR_MECH.upperConnected() && car.progress < car.f3RearArc - 6 && car.progress > 1) {
      accident(car, '3番フロアを上げた状態で、車が後ろへ出て落ちてしまいました。');
      return false;
    }
    checkUnderFloors(car);
    updateSeated(car, bars);
    car.nb = null;
    for (i = 0; i < bars.length; i++) { if (!car.beyond[bars[i].slot]) { car.nb = bars[i]; break; } }

    return pressedDir !== 0 || Math.abs(car.velocity) > 0.5;
  }

  // ---- セットピン(第8章)----
  // 下段(4〜6番)へ向かって上段フロアの下に入る時は、そのフロアの両端の棚にセットピンを刺して、フロアがピンに載っていることが現場ルール
  // (シリンダー/ワイヤー破断時の落下防止。刺してから潜る)。ピンが無いのにフロアの下へ入ったら、フロアごとに1回ミス(重大)。
  // 3番前(継ぎ目)は下端に載るのでピンは不要。上段へ向かう道(上段の車)は対象外。
  var FLOOR_NAME = { F1: '1番', F2: '2番', F3: '3番' };
  function checkUnderFloors(car) {
    if (!car.route || car.route.id === 'U') return;
    var fm = window.FLOOR_MECH, fx = car.x - car.leftTireX;   // 車の先端
    ['F3', 'F2', 'F1'].forEach(function (id) {
      var f = fm.FLOORS[id];
      if (fx < f.x1 - 10 && !car.pinMissed[id] && !fm.floorPinsOk(id)) {
        car.pinMissed[id] = true;
        recordMiss('セットピンを刺さずに' + FLOOR_NAME[id] + 'フロアの下へ入った', 'major');
        setStatus('セットピンを刺さずに' + FLOOR_NAME[id] + 'フロアの下へ入りました!ピンを刺して、フロアをピンに載せてから入ってください。(ミス: ' + state.misses + ')');
      }
    });
  }
  // ---- 輪止め・落としに当たった(OK)----
  // 当たって止まっていれば「OK」。もう一度車をタップすると固定され、次の車に移れる(動かせば外れる)。
  // OKの間、その車は「載っている車」(occupied)として扱い、棚を動かしても床と一緒に動く。
  var SEATED_TOLERANCE_PX = 12;
  function updateSeated(car, bars) {
    var b = null;
    if (car.contacted) bars.forEach(function (x) { if (x.slot === car.contactSlot) b = x; });
    // 乗り越えた/その障害物が無くなった/手前へ離れた、のいずれかなら「当たっている」状態ではない
    if (!b || car.beyond[b.slot] || car.progress < b.s - (SEATED_TOLERANCE_PX + 6)) car.contacted = false;
    var ok = !!car.contacted && !!b && Math.abs(car.progress - b.s) <= SEATED_TOLERANCE_PX + 6;
    if (ok && !car.seated) seatCar(car);
    else if (!ok && car.seated) unseatCar(car);
  }
  function seatCar(car) {
    var num = car.contactSlot, slot = cfg.slots[num], tgt = slotTarget(num);
    var prior = state.occupied[num];
    if (prior && prior.live !== car) {
      // すでに車がいるスロットには積めない(ノーマル・ハードで車をすり抜けた場合など)
      if (!car.dupMissed) { car.dupMissed = true; recordMiss(num + '番にはすでに車がある', 'minor'); }
      return;
    }
    if (!carFitsSlot(num, car.entry)) {
      if (state.hints) {
        if (car.fitMsg !== num) { car.fitMsg = num; setStatus(slot.restrictedNote || (num + '番はこの車を積めません。')); }
        return;
      }
      if (!car.fitMissed) { car.fitMissed = true; recordMiss(num + '番には積めない車種', 'minor'); }
    }
    var stopNow = activeStop(num), rotDeg = slot.rot || 0, dip = 0;
    if (stopNow && stopNow.kind === 'hole') {
      // タイヤ落とし: 穴の深さはタイヤ直径の約1/5。左タイヤだけ沈んで車体が少し傾く
      dip = 0.2 * 2 * car.rhRatio * car.h;
      rotDeg -= Math.atan2(dip, car.wbPx) * 180 / Math.PI;
    }
    car.slot = num;
    car.seated = true;
    car.locked = false;
    car.shelfMissed = false;
    // フロア上のスロットは、フロアが動いても車が輪止め位置に追従するようローカル座標で保持する
    state.occupied[num] = {
      img: car.img, w: car.w, h: car.h, leftTireX: car.leftTireX,
      floor: slot.floor || slot.carrier || null, localX: tgt.x, localY: tgt.y + dip, rotDeg: rotDeg, dx: tgt.x - slot.tireX, live: car
    };
    if (window.GAME_MODE && window.GAME_MODE.onDock) window.GAME_MODE.onDock(num);
    setStatus(num + '番 OK!' + (stopNow.kind === 'hole' ? 'タイヤが落としに落ちました。' : STOP_NAME[stopNow.kind] + 'に当たりました。') + 'もう一度車をタップするとその位置で固定されます。');
    if (car.deckItem) car.deckItem.status = 'loaded';
    refreshDeck();
  }

  function unseatCar(car) {
    car.seated = false;
    car.locked = false;
    if (car.deckItem) car.deckItem.status = 'road';
    refreshDeck();
    if (state.occupied[car.slot] && state.occupied[car.slot].live === car) delete state.occupied[car.slot];
    if (window.GAME_MODE && window.GAME_MODE.onUndock) window.GAME_MODE.onUndock(car.slot);
    setStatus('輪止め(タイヤ止め・落とし)から外れました。');
  }
  // 動いているフロアの上に道が伸びている車(1〜3番)は、操作していない間も
  // フロアの現在の傾きに合わせて経路・進行先を再計算し続ける(同時操作対応)。
  var lastShelfKey = null, lastHang = null;
  // 車が宙段に乗りかけている(前のタイヤが後端より先、後ろのタイヤはまだ後端より手前=またいでいる)か
  function hangStraddle(car) {
    if (!car || car.seated || !car.route || car.route.id !== '7' || !car.pts || !car.pathTool || !(car.phase === 'ready' || car.phase === 'moving')) return false;
    var arcR = car.pathTool.arcOf(car.pts[3]);   // 宙段の後端の、経路上の距離
    return car.progress > arcR - 12 && car.progress - car.wbPx < arcR + 12;
  }
  state.hangStraddle = function () { return hangStraddle(state.car); };
  // 宙段が車にぶつかった(floor_mech.jsから)。イージーは手前で止まって注意だけ。ノーマル・ハードは減点+揺れ+グシャッ
  window.FLOOR_MECH_HIT = function (c) {
    var occ = state.occupied[c.slot], car = (occ && occ.live) || state.car;
    if (state.hints) { if (car) triggerSquash(car, 0.06, 300); return; }
    recordMiss(c.msg, 'major');
    triggerShake(9, 700);
    if (car) triggerSquash(car, 0.18, 650);
    setStatus(c.msg + '!(ミス: ' + state.misses + ')');
  };
  // 経路の折れ線pts上で、始点からの距離sがどの区間(i番目の点とi+1番目の点の間)の、区間始点から何pxか(割合fracも)
  function arcToPoint(pts, i) {
    var s = 0;
    for (var j = 1; j <= i; j++) s += Math.hypot(pts[j].x - pts[j - 1].x, pts[j].y - pts[j - 1].y);
    return s;
  }
  function locateOnPath(pts, s) {
    var acc = 0, n = pts.length - 1;
    for (var i = 0; i < n; i++) {
      var l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      if (s <= acc + l || i === n - 1) return { i: i, d: s - acc, frac: l > 0 ? (s - acc) / l : 0 };
      acc += l;
    }
    return { i: 0, d: s, frac: 0 };
  }
  function syncDynamicPath() {
    var car = state.car, fm = window.FLOOR_MECH;
    syncHangHole();
    // 乗りかけの車(前のタイヤは宙段の上、後ろのタイヤはまだ下段)をまたいだまま宙段を動かすと、タイヤが外れる(脱輪)
    var hg = fm.MECH.hang;
    if (car && hangStraddle(car)) {
      if (lastHang !== null && Math.abs(hg - lastHang) > 0.0005 && !state.hints && !car.hangDerailed) {
        car.hangDerailed = true;
        car.derail = { t0: performance.now(), dur: 1100 };
        triggerShake(9, 800); triggerSquash(car, 0.14, 600);
        recordMiss('車が乗りかけの時に宙段を動かして脱輪した', 'major');
        setStatus('脱輪!車が乗りかけの時に宙段を動かしました。(ミス: ' + state.misses + ')');
      }
    } else if (car) car.hangDerailed = false;
    lastHang = hg;
    // 道が分かれる前(道板の上にいる間)は、棚の今の状態で走れる道(上段/下段/5番スロープ経由)に選び直す。
    // 3番後ろのフロアが接地していれば上段、そうでなければ下段
    if (car && car.route && !car.seated && !car.locked && (car.phase === 'entering' || car.phase === 'ready' || car.phase === 'moving') && !Object.keys(car.beyond).some(function (k) { return car.beyond[k]; })) {
      var want = chooseRoute();
      if (want !== car.route.id) {
        if (car.progress <= (car.rampArc || 1) + 6) attachRoute(car, want);
        else if (lowRoute(want) && lowRoute(car.route.id) && car.arc && car.arc['5'] !== undefined && car.progress < car.arc['5'] - 30) {
          // 下段の道(5番行き'L'と4番行き'4')は、道板を過ぎて6番付近まで進んでいても、5番に着く前なら切り替えられる
          // (5番フロアを平らにして先へ進めた後でスロープ+扇動板にした時、車が通常の道のまま取り残されるため)。今いる位置を新しい道へ写して続ける
          var cx = car.x, cy = car.y;
          attachRoute(car, want);
          car.progress = car.pathTool.arcOf({ x: cx, y: cy });
        }
      }
    }
    if (car && car.route && car.dynamicPath && (car.phase === 'ready' || car.phase === 'moving')) {
      var anchor = car.seated || !car.pts ? null : locateOnPath(car.pts, car.progress);   // 棚を動かす前の、経路上の位置(どの区間のどこか)
      rebuildPath(car);
      var pts = car.pts;
      if (anchor) {
        // 床の上にいる車(OKでない車も)は、棚を動かしても床の上の同じ位置に居続ける。
        // 同じ床の上の区間は剛体なので区間の始点からの距離を保ち、床と床・床と地面をつなぐ区間(長さが変わる)は割合を保つ
        var raw = car.rawPath, rigid = !!raw[anchor.i].floor && raw[anchor.i].floor === raw[anchor.i + 1].floor;
        var segLen = Math.hypot(pts[anchor.i + 1].x - pts[anchor.i].x, pts[anchor.i + 1].y - pts[anchor.i].y);
        car.progress = Math.max(0, arcToPoint(pts, anchor.i) + (rigid ? anchor.d : anchor.frac * segLen));
      }
      if (car.seated) {
        // 床が傾いて経路の長さが変わっても、OKの車は輪止めに当たったまま床と一緒に動く
        var sp = activeStop(car.slot);
        if (sp && car.arc[car.slot] !== undefined) car.progress = car.arc[car.slot] - sp.dx - STOP_OFFSET_PX;
      }
      var p = car.pathTool.at(car.progress);
      car.x = p.x; car.y = p.y;
    }
    // 輪止めに当たったまま止まっている車は、状態が変わった時(タイヤを張り出して6番に積めるようになった等)にもOKを判定し直す
    if (car && car.route && car.arc && car.contacted && !car.seated && !car.locked && (car.phase === 'ready' || car.phase === 'moving')) updateSeated(car, barriersOf(car));
    // 輪止め(タイヤ落とし)に当たっていない車がいる間に棚を動かしたら減点(1台につき1回)
    var offsNow = fm.curOffs(); offsNow = Object.assign({}, offsNow); delete offsNow.F7;   // 宙段を動かした場合は、脱輪・ぶつかりで別に判定する(ここでは数えない)
    var key = JSON.stringify(offsNow) + '|' + fm.MECH.lift;
    if (lastShelfKey !== null && key !== lastShelfKey && car && car.phase === 'moving' && car.progress > 0 && !car.seated && !car.shelfMissed) {
      car.shelfMissed = true;
      recordMiss('輪止め(タイヤ落とし)に当たっていないのに棚を動かした', 'minor');
      setStatus('棚を動かしました!車が輪止め(タイヤ落とし)に当たってからにしてください。(ミス: ' + state.misses + ')');
    }
    lastShelfKey = key;
    requestAnimationFrame(syncDynamicPath);
  }
  requestAnimationFrame(syncDynamicPath);

  // --- 入力配線 ---
  // 離した後も惰性で滑らかに減速するため、ボタンを離しても速度が残っている間はループを続ける
  var pressedDir = 0;
  var physicsRafId = null;
  var lastFrameTs = null;

  function physicsLoop(ts) {
    if (lastFrameTs === null) lastFrameTs = ts;
    var dt = Math.min(0.05, (ts - lastFrameTs) / 1000);
    lastFrameTs = ts;
    var keepGoing = physicsStep(pressedDir, dt);
    if (keepGoing) {
      physicsRafId = requestAnimationFrame(physicsLoop);
    } else {
      physicsRafId = null;
      lastFrameTs = null;
    }
  }

  function ensurePhysicsLoop() {
    if (physicsRafId === null) {
      lastFrameTs = null;
      physicsRafId = requestAnimationFrame(physicsLoop);
    }
  }

  function attachPress(btn, dir) {
    function start(e) {
      e.preventDefault();
      pressedDir = dir;
      ensurePhysicsLoop();
    }
    function stop() {
      if (pressedDir !== dir) return;
      pressedDir = 0;
    }
    btn.addEventListener('mousedown', start);
    btn.addEventListener('touchstart', start, { passive: false });
    ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(function (ev) {
      btn.addEventListener(ev, stop);
    });
  }
  attachPress(btnLeft, +1);
  attachPress(btnRight, -1);

  previewCanvas.addEventListener('click', beginEntry);

  canvas.addEventListener('click', function (e) {
    if (window.VIEW && window.VIEW.dragSuppressed()) return;   // ドラッグ・ダブルタップの直後のクリックは、車やスイッチのタップにしない
    var pt = window.VIEW.clientToStage(e.clientX, e.clientY);
    var scaleX = pt.perCss;
    var x = pt.x;
    var y = pt.y;
    // トレーラー上のスイッチ(とその周り)をタップ: そのグループの操作盤を出す
    var groups = (cfg.newArt && cfg.newArt.switchGroups) || [];
    // スマホでは画面縮小でスイッチが数pxになるので、指の太さ分(画面上24px)まで外側のタップも拾い、いちばん近いグループを選ぶ
    var SLOP = 24 * scaleX, best = null, bestD = Infinity;
    for (var gi = 0; gi < groups.length; gi++) {
      var r = groups[gi].rect;
      var dx = Math.max(r[0] - x, 0, x - (r[0] + r[2])), dy = Math.max(r[1] - y, 0, y - (r[1] + r[3]));
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= SLOP && dist < bestD) { best = groups[gi]; bestD = dist; }
    }
    // 優先順位: ①スイッチの枠の中 → ②車の上 → ③スイッチの近く(指の太さ分)。広げた判定が車のタップを奪わないように
    if (best && bestD > 0) {
      var carHit = carAt(x, y);
      if (carHit) { tapCar(carHit); return; }
    }
    if (best) {
      if (window.SWITCH_UI) window.SWITCH_UI.open(best.id);
      if (window.VIEW) window.VIEW.focusRect(best.rect);   // スイッチの辺りへ寄る
      return;
    }
    // 車をタップ: 操作対象にする / OKの車なら固定する(固定した車はタップで操作対象に戻る)。
    // フロアや車をタップしても、操作盤は出ない(スロットの選択は輪止めパネルのボタンで)
    var tapped = carAt(x, y);
    if (tapped) tapCar(tapped);
  });
  // 次のサイクルへ: 積んだ車・輪止め・落し蓋・選択を片付けて、新しい車を引き直す(ミス数は持ち越す)
  // 荷物の変更(配車担当への連絡・時間切れ): トレーラーを積み始めの状態に戻して、新しい荷物を引く
  state.changeCargo = function () {
    if (window.FLOOR_MECH && window.FLOOR_MECH.resetAll) window.FLOOR_MECH.resetAll();
    state.resetTrailer();
  };
  state.resetTrailer = function () {
    Object.keys(state.occupied).forEach(function (k) { delete state.occupied[k]; });
    Object.keys(chocks).forEach(function (k) { delete chocks[k]; });
    setDefaultChocks();
    Object.keys(lidOpen).forEach(function (k) { delete lidOpen[k]; });
    state.car = null;
    state.targetSlot = null;
    updateChockUi();
    newDeck();
  };

  updateChockUi();
  newDeck();
})();
