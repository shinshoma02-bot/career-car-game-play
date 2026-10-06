(function () {
  var cfg = window.TRAILER_CONFIG;
  var assets = window.TRAILER_ASSETS;
  var statusEl = document.getElementById('status');
  var canvas = document.getElementById('stage');
  var ctx = canvas.getContext('2d');

  canvas.width = cfg.stage.w;
  canvas.height = cfg.stage.h;

  var chk = {
    hit: document.getElementById('chkHit'),
    pin: document.getElementById('chkPin'),
    floors: document.getElementById('chkFloors'),
    tractor: document.getElementById('chkTractor'),
    wheel: document.getElementById('chkWheel'),
    fg: document.getElementById('chkFg')
  };
  Object.keys(chk).forEach(function (k) {
    chk[k].addEventListener('change', draw);
  });

  // 回線が不安定でも表示できるよう、読み込み失敗時は間隔を空けて最大5回やり直す(data:は1回だけ)
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var tries = 0, max = src.indexOf('data:') === 0 ? 1 : 5;
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

  var images = {};
  // 新素材(assets/semi-6/)があればそちらを使う。無ければ従来のb64画像
  var NA = cfg.newArt || null;
  function newSrc(path) { return path + '?v=' + NA.v; }
  function floorSrc(id) { return NA && NA.floors && NA.floors[id] ? newSrc(NA.floors[id]) : assets.floors[id]; }

  // 2番フロア画像(f2_v2.b64.txt)に、以前の描き込みシリンダーの取付部の残骸が緑のノイズとして残っている。
  // 画像ファイルは変えず、読み込み時にゲーム側でだけ消す(梁の中の小さな四角=隣の梁の面で塗り直し、梁の下にはみ出した三角=透明にする)
  function cleanF2(img) {
    var cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    var g = cv.getContext('2d');
    g.drawImage(img, 0, 0);
    g.drawImage(cv, 1405, 314, 14, 16, 1419, 314, 14, 16);          // 梁の面の小さな四角(1423〜432, 316〜326)を左隣の面で上書き
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();                                                    // 梁の下端(y≈340)より下にはみ出した斜めの部品
    g.moveTo(1452, 338); g.lineTo(1484, 338); g.lineTo(1484, 354); g.lineTo(1466, 354); g.closePath();
    g.fill();
    g.restore();
    return cv;
  }

  // トレーラー後端(テール)の部材は背景画像(bg)にだけ描かれていて、前景(fg)はx≈2040で切れている。
  // そのため道板を上った車がテール付近を通ると、x≈2040より後ろでは車がシャーシの上に描かれていた。
  // 背景画像から後端の部材だけ(背景の灰色・地面の影以外の画素)を切り出し、車の手前に重ねる。画像ファイルは変えない
  var TAIL = NA && NA.tail ? NA.tail : { x0: 1990, x1: 2112, y0: 380, y1: 548 };
  var TAIL_FAR = NA && NA.tail ? NA.tail.far : { x0: 1990, x1: 2052, y0: 440, y1: 518 };   // 後端の枠の開口部の中(上の梁と下の梁・右の板の間)
  function makeTailOcc(img) {
    var w = TAIL.x1 - TAIL.x0, h = TAIL.y1 - TAIL.y0;
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var g = cv.getContext('2d');
    g.drawImage(img, TAIL.x0, TAIL.y0, w, h, 0, 0, w, h);
    var d = g.getImageData(0, 0, w, h), p = d.data;
    for (var i = 0; i < p.length; i += 4) {
      var dr = p[i] - 90, dg = p[i + 1] - 97, db = p[i + 2] - 108;   // 背景の灰色(90,97,108)に近い画素は抜く
      if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) < 30) p[i + 3] = 0;
    }
    g.putImageData(d, 0, 0);
    // 後端の枠の開口部の中(TAIL_FAR)に見えているのは反対側のシャーシ。これは車より奥なので重ねない
    g.clearRect(TAIL_FAR.x0 - TAIL.x0, TAIL_FAR.y0 - TAIL.y0, TAIL_FAR.x1 - TAIL_FAR.x0, TAIL_FAR.y1 - TAIL_FAR.y0);
    return cv;
  }
  // 前景画像にも開口部の中(反対側のシャーシの縦の部材・白い配管)が描かれていて、車の手前に出てしまうので抜く(背景画像に同じ絵があるので奥に見える)
  function cleanFg(img) {
    var cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    var g = cv.getContext('2d');
    g.drawImage(img, 0, 0);
    g.clearRect(TAIL_FAR.x0, TAIL_FAR.y0, TAIL_FAR.x1 - TAIL_FAR.x0, TAIL_FAR.y1 - TAIL_FAR.y0);
    return cv;
  }

  var loadList = [
    loadImage(NA && NA.frameBack ? newSrc(NA.frameBack) : assets.bg).then(function (img) { images.bg = img; images.tailOcc = makeTailOcc(img); }),
    loadImage(NA && NA.frameFront ? newSrc(NA.frameFront) : assets.fg).then(function (img) { images.fg = cleanFg(img); }),
    loadImage(assets.wheel).then(function (img) { images.wheel = img; }),
    (NA && NA.parts && NA.parts.tractor ? Promise.resolve() : loadImage(assets.tractor).then(function (img) { images.tractor = img; })),
    loadImage(floorSrc('F1')).then(function (img) { images.F1 = img; }),
    loadImage(floorSrc('F2')).then(function (img) { images.F2 = NA ? img : cleanF2(img); }),
    loadImage(floorSrc('F3')).then(function (img) { images.F3 = img; }),
    loadImage(floorSrc('F5')).then(function (img) { images.F5 = img; })
  ].concat(NA && NA.parts ? Object.keys(NA.parts).map(function (k) { return loadImage(newSrc(NA.parts[k])).then(function (img) { images[k] = img; }); }) : [],
    NA && NA.switchParts ? NA.switchParts.map(function (k) { return loadImage(newSrc(NA.switchDir + k + '.png')).then(function (img) { images[k] = img; }); }) : []);
  Promise.all(loadList).then(function () {
    try { sessionStorage.removeItem('reloadedOnce'); } catch (e) { }
    statusEl.textContent = '読み込み完了: ' + cfg.name + ' (' + cfg.stage.w + 'x' + cfg.stage.h + 'px, ' + cfg.pxPerMeter + 'px/m)';
    requestAnimationFrame(loop);
  }).catch(function (err) {
    statusEl.textContent = '画像読み込みエラー: ' + (err && err.message ? err.message : err);
    console.error(err);
    // 回線の失敗なら再読み込みで直ることが多いので、1回だけ自動でやり直す。それでもだめなら、エラー内容と再読み込みボタンを画面に出す
    var again = false;
    try { again = !sessionStorage.getItem('reloadedOnce'); sessionStorage.setItem('reloadedOnce', '1'); } catch (e) { }
    if (again) { setTimeout(function () { location.reload(); }, 800); return; }
    var bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:99;background:#7a1f1f;color:#fff;padding:10px;border-radius:8px;font-size:13px;';
    bar.textContent = '画像の読み込みに失敗しました(' + statusEl.textContent + ') ';
    var b = document.createElement('button');
    b.textContent = '再読み込み'; b.style.cssText = 'margin-left:6px;padding:6px 10px;';
    b.addEventListener('click', function () { location.reload(); });
    bar.appendChild(b); document.body.appendChild(bar);
  });

  // ---- カメラ(見ている所に寄って表示。D8 A-1)----
  // ステージ(2520×724)全体を画面幅に縮めず、見ている所に寄って表示する。zoom=1 で幅いっぱい(全体)、大きいほど寄る。
  // 自動: スイッチを開いたらその辺り、車が動いている間は車を追う。手動: 2本指で拡大縮小・1本指のドラッグで移動・ダブルタップで全体。
  var VIEW = window.VIEW = (function () {
    var SW = cfg.stage.w, SH = cfg.stage.h;
    var wrap = document.getElementById('stageWrap'), mini = document.getElementById('miniMap');
    var mctx = mini ? mini.getContext('2d') : null;
    var cam = { cx: SW / 2, cy: SH / 2, zoom: 1 }, tgt = { cx: SW / 2, cy: SH / 2, zoom: 1 };
    var portrait = false, manual = false, suppressUntil = 0, lastT = 0, lastCar = null, lastSeated = false, miniT = 0;
    var MAXZ = 4, TAU = 0.1;   // TAU: 追いつく速さ(秒)。約0.3秒でほぼ着く
    function defZoom() { return portrait ? 1.8 : 1; }
    function visW() { return SW / cam.zoom; }
    function visH() { return visW() * (canvas.width > 0 ? canvas.height / canvas.width : SH / SW); }
    function clampTarget(t) {
      if (!isFinite(t.zoom)) t.zoom = 1;
      if (!isFinite(t.cx)) t.cx = SW / 2;
      if (!isFinite(t.cy)) t.cy = SH / 2;   // 画面の幅が0の時(非表示のまま開いた時など)に計算が NaN になって、カメラが壊れたままにならないように
      t.zoom = Math.max(1, Math.min(MAXZ, t.zoom));
      var asp = canvas.width > 0 && canvas.height > 0 ? canvas.height / canvas.width : SH / SW;
      var vw = SW / t.zoom, vh = vw * asp;
      t.cx = vw >= SW ? SW / 2 : Math.max(vw / 2, Math.min(SW - vw / 2, t.cx));
      t.cy = vh >= SH ? SH / 2 : Math.max(vh / 2, Math.min(SH - vh / 2, t.cy));
    }
    function layout() {
      var w = wrap.clientWidth || window.innerWidth;
      if (!(w > 0)) return;   // 非表示で幅が0の間は、何もしない(表示された時の resize でもう一度ここへ来る)
      portrait = window.innerWidth < 700 && window.innerHeight > window.innerWidth;
      var h = Math.round(w * (portrait ? 0.62 : SH / SW));
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var cw = Math.round(w * dpr), ch = Math.round(h * dpr);
      canvas.style.height = h + 'px';
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      if (mini) {
        var mw = Math.round(w * (portrait ? 0.46 : 0.2)), mh = Math.round(mw * SH / SW);
        mini.style.width = mw + 'px'; mini.style.height = mh + 'px';
        if (mini.width !== mw * 2) { mini.width = mw * 2; mini.height = mh * 2; }
      }
      clampTarget(tgt); clampTarget(cam);
    }
    function focusRect(r, zoom) {
      manual = false;
      tgt.cx = r[0] + r[2] / 2; tgt.cy = r[1] + r[3] / 2;
      tgt.zoom = zoom || (portrait ? 2.4 : 1.4);
      clampTarget(tgt);
    }
    function fitAll() { manual = true; tgt.zoom = 1; tgt.cx = SW / 2; tgt.cy = SH / 2; clampTarget(tgt); }
    function update(now) {
      var dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000)); lastT = now;
      var gs = window.GAME_STATE, car = gs && gs.car;
      if (car !== lastCar) { if (car) manual = false; lastCar = car; lastSeated = false; }
      if (!manual && car && !car.seated) {   // 車が動いている間は車を追う
        tgt.cx = car.x - car.leftTireX + car.w / 2; tgt.cy = car.y - car.h / 2; tgt.zoom = defZoom(); clampTarget(tgt);
      } else if (!manual && car && car.seated && !lastSeated) {   // 固定できたら少し引く
        lastSeated = true; tgt.zoom = Math.max(1, defZoom() * 0.8); clampTarget(tgt);
      }
      var a = 1 - Math.exp(-dt / TAU);
      cam.cx += (tgt.cx - cam.cx) * a; cam.cy += (tgt.cy - cam.cy) * a; cam.zoom += (tgt.zoom - cam.zoom) * a;
      clampTarget(cam);
    }
    // 描画の始まり: 背景を塗って、ステージ座標で描けるように変換をかける
    function begin() {
      var k = canvas.width / SW * cam.zoom;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#2b3037';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(k, 0, 0, k, -(cam.cx - visW() / 2) * k, -(cam.cy - visH() / 2) * k);
    }
    function clientToStage(cx, cy) {
      var r = canvas.getBoundingClientRect(), vw = visW(), vh = visH();
      return { x: cam.cx - vw / 2 + (cx - r.left) / r.width * vw, y: cam.cy - vh / 2 + (cy - r.top) / r.height * vh, perCss: vw / r.width };
    }
    function stageToClient(x, y) {
      var r = canvas.getBoundingClientRect(), vw = visW(), vh = visH();
      return { x: r.left + (x - (cam.cx - vw / 2)) / vw * r.width, y: r.top + (y - (cam.cy - vh / 2)) / vh * r.height };
    }
    function drawMini(now) {
      if (!mctx || now - miniT < 90) return;
      miniT = now;
      var show = cam.zoom > 1.06;
      mini.style.display = show ? 'block' : 'none';
      if (!show || !images.bg) return;
      var k = mini.width / SW;
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.clearRect(0, 0, mini.width, mini.height);
      mctx.fillStyle = 'rgba(30,34,40,.82)'; mctx.fillRect(0, 0, mini.width, mini.height);
      mctx.setTransform(k, 0, 0, k, 0, 0);
      mctx.drawImage(images.bg, 0, 0);
      var gs = window.GAME_STATE;
      if (gs && gs.occupied) Object.keys(gs.occupied).forEach(function (n) {   // 積んだ車の位置
        var o = gs.occupied[n], p = o.floor && window.FLOOR_MECH ? window.FLOOR_MECH.onFloor(o.floor, o.localX, o.localY) : [o.localX, o.localY];
        mctx.fillStyle = 'rgba(255,214,77,.9)'; mctx.fillRect(p[0] - o.leftTireX, p[1] - o.h, o.w, o.h);
      });
      if (images.fg) mctx.drawImage(images.fg, 0, 0);
      if (images.tractor) mctx.drawImage(images.tractor, 0, 0);
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      var vw = visW(), vh = visH();
      mctx.strokeStyle = '#ffd34d'; mctx.lineWidth = 3;
      mctx.strokeRect((cam.cx - vw / 2) * k, Math.max(0, (cam.cy - vh / 2) * k), vw * k, Math.min(mini.height, vh * k));
    }
    // ---- 手で動かす ----
    var ptrs = {}, dragged = false, pinch = null, tapT = 0, tapX = 0, tapY = 0;
    function count() { return Object.keys(ptrs).length; }
    function pdist() { var k = Object.keys(ptrs); var a = ptrs[k[0]], b = ptrs[k[1]]; return Math.hypot(a.x - b.x, a.y - b.y); }
    function panBy(dx, dy) {   // 画面のpx分だけ動かす
      var perCss = visW() / canvas.getBoundingClientRect().width;
      tgt.cx -= dx * perCss; tgt.cy -= dy * perCss; clampTarget(tgt); cam.cx = tgt.cx; cam.cy = tgt.cy;
    }
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', function (e) {
      try { canvas.setPointerCapture(e.pointerId); } catch (x) { }
      if (!count()) dragged = false;
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
      if (count() === 2) { pinch = { d: pdist(), z: tgt.zoom }; dragged = true; manual = true; }
    });
    canvas.addEventListener('pointermove', function (e) {
      var p = ptrs[e.pointerId]; if (!p) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (count() >= 2 && pinch) {
        var nz = pinch.z * pdist() / Math.max(1, pinch.d);
        tgt.zoom = nz; clampTarget(tgt); cam.zoom = tgt.zoom; panBy(dx / 2, dy / 2);
      } else if (count() === 1) {
        if (!dragged && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) { dragged = true; manual = true; }
        if (dragged) panBy(dx, dy);
      }
    });
    function up(e) {
      var p = ptrs[e.pointerId]; if (!p) return;
      delete ptrs[e.pointerId];
      if (count() < 2) pinch = null;
      if (count()) return;
      var now = performance.now();
      if (dragged) { suppressUntil = now + 350; return; }
      if (e.type === 'pointerup') {   // ダブルタップ: 全体表示に戻る
        if (now - tapT < 300 && Math.hypot(e.clientX - tapX, e.clientY - tapY) < 30) { fitAll(); tapT = 0; suppressUntil = now + 350; }
        else { tapT = now; tapX = e.clientX; tapY = e.clientY; }
      }
    }
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', function (e) {   // PC: ホイールで拡大縮小
      e.preventDefault(); manual = true;
      var st = clientToStage(e.clientX, e.clientY), f = Math.exp(-e.deltaY * 0.0015), oz = tgt.zoom;
      tgt.zoom = oz * f; clampTarget(tgt);
      var k = oz / tgt.zoom;   // タップした点を動かさない
      tgt.cx = st.x + (tgt.cx - st.x) * k; tgt.cy = st.y + (tgt.cy - st.y) * k; clampTarget(tgt);
    }, { passive: false });
    if (mini) {   // 地図をタップ: その場所へ移る
      mini.style.touchAction = 'none';
      var jump = function (e) {
        var r = mini.getBoundingClientRect(); manual = true;
        tgt.cx = (e.clientX - r.left) / r.width * SW; tgt.cy = (e.clientY - r.top) / r.height * SH; clampTarget(tgt);
        e.preventDefault(); e.stopPropagation();
      };
      mini.addEventListener('pointerdown', jump);
      mini.addEventListener('pointermove', function (e) { if (e.buttons || e.pressure > 0) jump(e); });
    }
    window.addEventListener('resize', layout);
    layout();
    tgt.zoom = cam.zoom = defZoom(); clampTarget(tgt); clampTarget(cam);
    return {
      begin: begin, update: update, drawMini: drawMini, layout: layout, focusRect: focusRect, fitAll: fitAll, clientToStage: clientToStage, stageToClient: stageToClient,
      state: function () { return { cx: cam.cx, cy: cam.cy, zoom: cam.zoom, manual: manual }; },
      dragSuppressed: function () { return performance.now() < suppressUntil; },
      isPortrait: function () { return portrait; }
    };
  })();

  function loop(now) {
    VIEW.update(now || performance.now());
    draw();
    VIEW.drawMini(now || performance.now());
    requestAnimationFrame(loop);
  }

  function draw() {
    // ジャッキでトレーラーが持ち上がると、キングピンを支点にトレーラー全体(トラクタ以外)が傾く(β版の#rig回転と同じ)
    var fm = window.FLOOR_MECH;
    if (fm) fm.rampUpdate();
    updateShake();
    updateTireOut();
    updateAirSus();
    var tilt = (fm ? fm.jackTiltDeg() : 0) - airSusTiltDeg();
    curTilt = tilt;

    VIEW.begin();   // カメラの位置・拡大(ステージ座標で描けるように変換をかける)
    ctx.fillStyle = '#5a616c';
    ctx.fillRect(0, 0, cfg.stage.w, cfg.stage.h);

    // z-order (back -> front) はβ版(old/tsumikomi-simulator-beta.html)のz-indexに合わせる:
    // 背景 -> 道板 -> 車 -> フロア(柱) -> 扇動板・1番ワイヤー・ジャッキ -> 前景(手前のフレーム) -> 台車タイヤ -> シリンダー -> トラクタ -> デバッグ表示
    // 車は前景フレーム・後輪より奥にある(トレーラーの枠の内側に積まれている)ので、fg/台車タイヤは必ず車の後に描く。
    beginRig(tilt);
    ctx.drawImage(images.bg, 0, 0);
    ctx.restore();

    drawRamp(tilt); // 道板は先端が地面に着くよう、傾きに合わせて角度を計算し直す(画面座標で描く)

    beginRig(tilt);
    updateLids();
    drawPitBack();
    drawHolesUnder();
    drawCars();
    if (images.tailOcc) ctx.drawImage(images.tailOcc, TAIL.x0, TAIL.y0);   // 後端の部材は車より手前
    drawChocks('holes');
    if (chk.floors.checked) {
      drawCarOcclusion();
      drawMechanismBehindFg();
    }
    if (chk.fg.checked) ctx.drawImage(images.fg, 0, 0);
    drawPillarScale();
    if (chk.floors.checked) drawJack('leg');
    if (chk.wheel.checked) drawTrailerWheel();
    drawChocks('blocks'); // 輪止め本体は小さく、下段では前景フレームの梁に隠れるので手前に描く
    drawPins();
    drawStopPin();
    drawSwitches();
    drawSwitchGroupFrame();
    if (chk.floors.checked) drawMechanismFront();
    drawChockMarkers();
    drawSlotMarks();
    if (chk.hit.checked) drawHitBoxes();
    if (chk.pin.checked) drawPinMarks();
    ctx.restore();

    if (chk.tractor.checked) ctx.drawImage(images.tractor, 0, 0);
  }

  // ぶつかった衝撃でトレーラーが揺れる(減衰する振動)
  function updateShake() {
    var gs = window.GAME_STATE, sk = gs && gs.fx && gs.fx.shake;
    rigShake = [0, 0];
    if (!sk) return;
    var e = performance.now() - sk.t0;
    if (e >= sk.dur) { gs.fx.shake = null; return; }
    var p = e / sk.dur, k = (1 - p) * (1 - p) * sk.amp;
    rigShake = [Math.sin(e * 0.06) * k, Math.sin(e * 0.047 + 1.3) * k * 0.7];
  }

  // トレーラー座標系を開始(キングピンを支点に-tilt度回転)。呼び出し側でctx.restore()する
  var rigShake = [0, 0];   // 衝撃で揺れる分(draw()の先頭で更新)
  function beginRig(tilt) {
    var k = cfg.outrigger.kingpin;
    ctx.save();
    if (rigShake[0] || rigShake[1]) ctx.translate(rigShake[0], rigShake[1]);
    if (tilt) {
      ctx.translate(k[0], k[1]);
      ctx.rotate(-tilt * Math.PI / 180);
      ctx.translate(-k[0], -k[1]);
    }
  }
  var curTilt = 0;
  // 画面座標の点をトレーラー座標へ(rigToWorldの逆)
  function worldToRig(p, tilt) { return rigToWorld(p, -tilt); }

  // エアサス: タイヤを突出させてジャッキを縮め、タイヤが接地したら台車の車高が少し下がる(約1秒で沈む/戻る)。
  // 車高が下がる=キングピンを支点にトレーラー後部がairSusDrop px下がる。タイヤ自体は地面に残る
  var airSusCur = 0, airSusLast = null;
  function updateAirSus() {
    var fm = window.FLOOR_MECH, o = cfg.outrigger;
    var now = performance.now(), dt = airSusLast === null ? 0 : Math.min(0.1, (now - airSusLast) / 1000);
    airSusLast = now;
    // ジャッキの足が地面から離れている(=タイヤだけで支えている)時だけ沈む
    var grounded = fm && fm.MECH.tireOut && fm.MECH.jack <= o.jackContact - o.airSusDrop;
    var target = grounded ? o.airSusDrop : 0, step = o.airSusDrop * dt / 1.0;
    airSusCur = airSusCur < target ? Math.min(target, airSusCur + step) : Math.max(target, airSusCur - step);
  }
  function airSusTiltDeg() {
    var k = cfg.outrigger.kingpin, w = cfg.outrigger.wheel;
    return Math.asin(Math.min(1, airSusCur / (w.cx - k[0]))) * 180 / Math.PI;
  }

  // トレーラー座標の点を画面座標へ
  function rigToWorld(p, tilt) {
    if (!tilt) return [p[0], p[1]];
    var k = cfg.outrigger.kingpin, a = -tilt * Math.PI / 180, dx = p[0] - k[0], dy = p[1] - k[1];
    return [k[0] + dx * Math.cos(a) - dy * Math.sin(a), k[1] + dx * Math.sin(a) + dy * Math.cos(a)];
  }

  // タイヤ突出のアニメーション(0=格納、1=突出。約0.5秒で滑らかに移行)
  var tireOutT = 0, tireOutLast = null;
  function updateTireOut() {
    var now = performance.now(), dt = tireOutLast === null ? 0 : Math.min(0.1, (now - tireOutLast) / 1000);
    tireOutLast = now;
    var target = window.FLOOR_MECH && window.FLOOR_MECH.MECH.tireOut ? 1 : 0;
    var step = dt / 0.5;
    tireOutT = tireOutT < target ? Math.min(target, tireOutT + step) : Math.max(target, tireOutT - step);
  }
  // 柱・骨組みは各フロア画像自身に描かれている(ほぼ透明背景で、柱の部分だけ不透明)。
  // 車を描いた後にもう一度フロア画像を重ねて描くことで、実車と同じく「車が柱の内側に
  // 収まって見える」見た目になる。車は移動中に複数のフロアの範囲をまたいで通過する
  // (例: 5番へ向かう途中でF3の範囲を先に通る)ため、スロット単位ではなく常に
  // 全フロアを重ね直す(フロア画像は該当箇所以外ほぼ透明なので、余分な重ね描きをしても
  // 見た目への影響はない)。
  function drawCarOcclusion() {
    ['F1', 'F2', 'F3', 'F5'].forEach(function (id) {
      if (images[id]) drawTransformedFloor(id, images[id]);
    });
    drawHangFloor();
  }

  // フロアの現在の傾き(ang)・上下量(dh)に合わせて画像を変形して描く
  // 宙段フロア(5番と6番の間の持ち上がる棚): 素材の前端pivot(3,10)を今の前端の位置に合わせ、前端→後端の角度に回して描く
  // 宙段の新素材(実車合わせ: 前の柱は1本物、後ろは長い柱+中から伸びる支柱、前の柱と平行に持ち上げシリンダー)が読めているか
  function chuudanArt() {
    var C = NA && NA.chuudan;
    return C && images.floor_chuudan && images.chuudan_arm_front && images.chuudan_post_outer && images.chuudan_post_inner && images.chuudan_base && images.cyl_rod && images.cyl_barrel ? C : null;
  }
  // 宙段の窪みの奥(車・宙段より先に描く。下段の床・フレームの上)
  function drawPitBack() {
    var C = chuudanArt();
    if (C && images.hang_pit_back) ctx.drawImage(images.hang_pit_back, C.pitBack[0], C.pitBack[1]);
  }
  // 柱 → 宙段フロア → 窪みの手前の縁 の順に描く(柱の上端が宙段の受け金具に隠れてつながって見える)。
  // 柱は宙段の今の姿勢に合わせて、下端ピン(車体側・固定)から宙段の受け金具(前 armPinF・後ろ armPinR)へ向ける
  function drawChuudan(C, fm) {
    var p = fm.hangPose(), a = p.ang * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    function onFl(pt) { var dx = pt[0] - C.floorPivot[0], dy = pt[1] - C.floorPivot[1]; return [p.F[0] + dx * ca - dy * sa, p.F[1] + dx * sa + dy * ca]; }
    var pinF = onFl(C.armPinF), pinR = onFl(C.armPinR), pf = C.pivotF, pr = C.pivotR;
    function ang(from, to) { return Math.atan2(to[1] - from[1], to[0] - from[0]) * 180 / Math.PI; }
    // 後ろ: 長い柱(長さ固定)の口から、中の支柱が伸びる(縮みきった長さ minRear まで)
    var vR = [pinR[0] - pr[0], pinR[1] - pr[1]], LR = Math.max(C.minRear, Math.hypot(vR[0], vR[1])), degR = ang(pr, pinR), rr = degR * Math.PI / 180;
    var inAt = [pr[0] + Math.cos(rr) * C.innerStart, pr[1] + Math.sin(rr) * C.innerStart];
    drawStrip('chuudan_post_inner', LR - C.innerStart, inAt, degR, 0);
    drawStrip('chuudan_post_outer', C.outerLen, pr, degR, 0);
    // 後ろの柱のセットピン(外筒の口に差す。素材 images.pin_rear があればそれ、無ければ仮の丸とピン。R13)
    var mouth = [pr[0] + Math.cos(rr) * 90, pr[1] + Math.sin(rr) * 90];   // 外筒のピン穴(外筒の画像 x=100 − pivot 10 = 付け根から90px)
    if (images.pin_rear) { ctx.save(); ctx.translate(mouth[0], mouth[1]); ctx.rotate(rr); ctx.drawImage(images.pin_rear, -6, -6); ctx.restore(); }
    else { ctx.save(); ctx.translate(mouth[0], mouth[1]); ctx.rotate(rr); ctx.fillStyle = '#c33'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1; ctx.fillRect(-10, -9, 4, 18); ctx.strokeRect(-10, -9, 4, 18); ctx.fillStyle = '#d9dde0'; ctx.beginPath(); ctx.arc(-8, 0, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore(); }
    // 宙段フロア → 前端の受け耳(D18。フロア上面の上に出る柱の受け)→ 前の柱(柱の上端が耳の穴に重なる)の順に描く。後ろの柱はフロアの下(上で先に描いた)
    ctx.save();
    ctx.translate(p.F[0], p.F[1]);
    ctx.rotate(a);
    ctx.drawImage(images.floor_chuudan, -C.floorPivot[0], -C.floorPivot[1]);
    ctx.restore();
    if (C.floorEar && !C.floorEar.off && images[C.floorEar.img]) {   // off:true で描かない(D19: 柱の上端がフロア先端の上面の角に付くので、今の耳は合わない。R12 で作り直し)
      ctx.save(); ctx.translate(pinF[0], pinF[1]); ctx.rotate(a);
      ctx.drawImage(images[C.floorEar.img], -C.floorEar.pivot[0], -C.floorEar.pivot[1]);
      ctx.restore();
    }
    // 前: 1本物の柱(取付点間の長さに合わせて表示)と、平行な持ち上げシリンダー
    var vF = [pinF[0] - pf[0], pinF[1] - pf[1]], LF = Math.hypot(vF[0], vF[1]), degF = ang(pf, pinF);
    drawStrip('chuudan_arm_front', LF, pf, degF, 0);
    var tip = [pf[0] + vF[0] * C.cylOnArmF, pf[1] + vF[1] * C.cylOnArmF], ca0 = C.cylAnchor, ST = C.stay, stayP = null;
    if (ST && LF > 1) {
      // ステー(仮の絵): 柱の at 割りの所から、柱に直角に len だけ出る腕。シリンダーの先はステーの先。
      // シリンダーの付け根は、柱の付け根から loadU の姿勢で柱と直角の向きに len だけずれた位置(柱と平行四辺形。loadU の姿勢で完全に平行)
      var perp = function (dx, dy) { var l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
      var cfgH = cfg.hangFloor, lu = (ST.refU !== undefined ? ST.refU : ((cfgH && cfgH.loadU) || 2)), ld = fm.hangSolve(lu),   // lu = シリンダーが柱と完全に平行になる姿勢(設定 stay.refU。0=格納。D17 のおすすめ。無ければ loadU)
         pL = [ld.aF[0] - pf[0], ld.aF[1] - pf[1]], sL = perp(pL[0], pL[1]);
      var sNow = perp(vF[0], vF[1]), P = [pf[0] + vF[0] * ST.at, pf[1] + vF[1] * ST.at];
      stayP = { P: P, T: [P[0] + sNow[0] * ST.len, P[1] + sNow[1] * ST.len], deg: ang([0, 0], sNow) };
      ca0 = [pf[0] + sL[0] * ST.len, pf[1] + sL[1] * ST.len];
      tip = stayP.T;
    }
    var Lc = Math.hypot(tip[0] - ca0[0], tip[1] - ca0[1]);
    // 格納の姿勢(u=0〜0.2)では、ステーが柱の下へ向くので、シリンダーの先が下段の枠の底より下へはみ出して見える。枠の底(y=FRAME_BOTTOM)より下は描かない
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cfg.stage.w, (C.clipBottomY || 700)); ctx.clip();
    // 筒(バレル)の長さ: 縮んだ長さの 0.6 倍(実車の比率に近づける。上限 60px だった)。ロッドは筒の中に隠れる分を残す
    // 前のシリンダーだけ、太い筒・ロッド(cyl_barrel_front・cyl_rod_front。D16)で描く(読めない時は普通の cyl_barrel・cyl_rod)
    var frontCyl = images.cyl_barrel_front && images.cyl_rod_front && NA.cylInfo.cyl_barrel_front && NA.cylInfo.cyl_rod_front;
    if (Lc > 30) drawCylinderArt({ anchor: ca0, barrel: Math.max(20, Math.min(Lc * 0.6, Lc - 14)), two: false, barrelName: frontCyl ? 'cyl_barrel_front' : null, rodName: frontCyl ? 'cyl_rod_front' : null }, Lc, ang(ca0, tip));
    if (stayP) {
      // ステー(chuudan_stay。pivot=柱側の端の中心、先端の穴 tipAt=シリンダーの先)。柱の向きから90度回した向き。素材が読めない時だけ、仮の灰色の板とボルトで描く
      if (ST.img && images[ST.img]) {
        // 素材のステーは長さ(tipAt.x − pivot.x)35px。設定の len が違う間は、柱の向きに沿って縮めて描く(実車のステーは極端に短い。短い素材ができたら、len と素材の長さを合わせて、この縮めは不要になる)
        var stayK = ST.len / Math.max(1, ST.tipAt[0] - ST.pivot[0]);
        ctx.save(); ctx.translate(stayP.P[0], stayP.P[1]); ctx.rotate(stayP.deg * Math.PI / 180); ctx.scale(stayK, 1);
        ctx.drawImage(images[ST.img], -ST.pivot[0], -ST.pivot[1]); ctx.restore();
      } else {
        drawPlate(stayP.P, ST.len, stayP.deg, ST.w || 8);
        ctx.fillStyle = '#d9dde0'; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1;
        [stayP.P, stayP.T].forEach(function (b) { ctx.beginPath(); ctx.arc(b[0], b[1], 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
      }
      // 根元の取付金具(chuudan_cyl_base。回さない。pivot=穴の中心=シリンダーの根元)。シリンダーの後(上)に描く
      if (!(ST.baseImg && images[ST.baseImg])) { drawPlate([ca0[0], ca0[1]], Math.max(6, 512 - ca0[1]), 90, 12); ctx.beginPath(); ctx.arc(ca0[0], ca0[1], 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    }
    ctx.restore();   // ↑の clip の終わり
    // 前の柱の下端は大きい丸い板(chuudan_base_front。シリンダーの取付も兼ねる)、後ろは chuudan_base
    var bf = images.chuudan_base_front && C.baseFront ? [images.chuudan_base_front, C.baseFront.pivot] : [images.chuudan_base, C.base.pivot];
    ctx.drawImage(bf[0], pf[0] - bf[1][0], pf[1] - bf[1][1]);
    if (stayP && ST.baseImg && images[ST.baseImg]) ctx.drawImage(images[ST.baseImg], ca0[0] - ST.basePivot[0], ca0[1] - ST.basePivot[1]);   // シリンダーの根元の取付耳(D17: 前の柱の付け根の丸い板の後に描く)
    ctx.drawImage(images.chuudan_base, pr[0] - C.base.pivot[0], pr[1] - C.base.pivot[1]);
    if (images.hang_pit_front) ctx.drawImage(images.hang_pit_front, C.pitFront[0], C.pitFront[1]);
  }
  // フレーム側の固定ピン(D25): 赤い差し込み板はフレームの絵(frame_front)にある。差してある時は、穴の位置にピンの頭(stop_pin。12×12・pivot [5,5]=穴の中心)を、前景フレームの後に描く。
  // pts は『ピンの上面』の位置で、穴の中心はその3px 下。素材が読めない時だけ仮の丸
  function drawStopPin() {
    var fm = window.FLOOR_MECH, SPc = fm && fm.stopPinCfg;
    if (!SPc || !fm.stopPin.inserted) return;
    var pp = SPc.pts[fm.stopPin.hole - 1], hx = pp[0], hy = pp[1] + 3;
    if (images.stop_pin) ctx.drawImage(images.stop_pin, hx - 5, hy - 5);
    else { ctx.fillStyle = '#d9dde0'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  }
  function drawHangFloor() {
    var fm = window.FLOOR_MECH;
    if (!fm || !fm.hangPose) return;
    var C = chuudanArt();
    if (C) drawChuudan(C, fm);   // 宙段の素材が読めていなければ描かない(素材は全て読み込んでからゲームが始まる)
  }
  function drawTransformedFloor(id, img) {
    var fm = window.FLOOR_MECH;
    if (!fm) { ctx.drawImage(img, 0, 0); return; }
    var pose = fm.poseOf(id);
    var p = fm.FLOORS[id].pivot;
    ctx.save();
    ctx.translate(0, pose.dh);
    ctx.translate(p[0], p[1]);
    ctx.rotate(pose.ang * Math.PI / 180);
    ctx.translate(-p[0], -p[1]);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  function roundRectPath(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, h / 2, w / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 油圧シリンダー: 根本の太いバレル(グラデーションで円柱感)+ 先端まで伸びる細いロッド + 取付ピン
  function drawCylinder(anchor, len, deg, thick, barrelLen) {
    ctx.save();
    ctx.translate(anchor[0], anchor[1]);
    ctx.rotate(deg * Math.PI / 180);

    // 二段式(テレスコピック): 外筒(バレル)から1段目の筒が先に伸び、伸びきったらその筒から細いロッドが伸びる
    var bl = Math.max(thick, Math.min(barrelLen, len));
    var ext = Math.max(0, len - bl);
    var e1 = Math.min(ext, bl * 0.9), e2 = ext - e1;   // 1段目の突き出し量 / ロッドの突き出し量
    var rodThick = Math.max(3, thick * 0.4), midThick = thick * 0.72;
    var rodGrad = ctx.createLinearGradient(0, -rodThick / 2, 0, rodThick / 2);
    rodGrad.addColorStop(0, '#eef1f3');
    rodGrad.addColorStop(0.5, '#a7b0b6');
    rodGrad.addColorStop(1, '#767e84');
    ctx.fillStyle = rodGrad;
    roundRectPath(bl + e1 * 0.5, -rodThick / 2, Math.max(0, len - bl - e1 * 0.5), rodThick, rodThick / 2);
    ctx.fill();
    if (e1 > 0.5) {
      var midGrad = ctx.createLinearGradient(0, -midThick / 2, 0, midThick / 2);
      midGrad.addColorStop(0, '#dfe5e8');
      midGrad.addColorStop(0.35, '#b4bdc2');
      midGrad.addColorStop(0.8, '#7b848a');
      midGrad.addColorStop(1, '#5a6267');
      ctx.fillStyle = midGrad;
      roundRectPath(bl * 0.4, -midThick / 2, bl * 0.6 + e1, midThick, Math.min(3, midThick / 2));
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      roundRectPath(bl * 0.4, -midThick / 2, bl * 0.6 + e1, midThick, Math.min(3, midThick / 2));
      ctx.stroke();
      if (e2 > 0.5) {   // 1段目の先端の口金(ここからロッドが出る)
        ctx.fillStyle = '#3a4146';
        ctx.fillRect(bl + e1 - 3, -midThick / 2 - 0.5, 3, midThick + 1);
      }
    }
    var barrelGrad = ctx.createLinearGradient(0, -thick / 2, 0, thick / 2);
    barrelGrad.addColorStop(0, '#6d767c');
    barrelGrad.addColorStop(0.2, '#d3dade');
    barrelGrad.addColorStop(0.55, '#454d52');
    barrelGrad.addColorStop(0.85, '#93999e');
    barrelGrad.addColorStop(1, '#33393d');
    ctx.fillStyle = barrelGrad;
    roundRectPath(0, -thick / 2, bl, thick, Math.min(4, thick / 2));
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    roundRectPath(0, -thick / 2, bl, thick, Math.min(4, thick / 2));
    ctx.stroke();

    ctx.fillStyle = '#252a2d';
    ctx.beginPath(); ctx.arc(0, 0, Math.max(3, thick * 0.32), 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(len, 0, Math.max(2.4, rodThick * 0.6), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---- シリンダー(新素材): 外筒・ロッド(・1段目)の画像を、取付点の間の長さに合わせて組み立てる ----
  // 素材は水平に寝かせた状態(左端=根元)。tile範囲を繰り返して長さLにする(参考: assets/semi-6/parts/make_preview_assembly.py)
  var stripCache = {};
  function cylStrip(name, L) {
    var info = NA.cylInfo[name], src = images[name];
    var key = name + ':' + Math.round(L);
    if (stripCache[key]) return stripCache[key];
    var t0 = info.tile[0], t1 = info.tile[1], W = src.width, H = src.height;
    var body = Math.max(0, Math.round(L - (t0 - info.pivot[0]) - (info.tipX - t1)));
    var cv = document.createElement('canvas'); cv.width = t0 + body + (W - t1); cv.height = H;
    var g = cv.getContext('2d');
    g.drawImage(src, 0, 0, t0, H, 0, 0, t0, H);
    var x = t0, mw = t1 - t0;
    while (x < t0 + body) { var sw = Math.min(mw, t0 + body - x); g.drawImage(src, t0, 0, sw, H, x, 0, sw, H); x += sw; }
    g.drawImage(src, t1, 0, W - t1, H, t0 + body, 0, W - t1, H);
    return (stripCache[key] = cv);
  }
  function drawStrip(name, L, at, deg, along) {
    var info = NA.cylInfo[name], cv = cylStrip(name, L);
    ctx.save();
    ctx.translate(at[0], at[1]);
    ctx.rotate(deg * Math.PI / 180);
    ctx.translate(along, 0);
    ctx.drawImage(cv, -info.pivot[0], -info.pivot[1]);
    ctx.restore();
  }
  // c=シリンダーの定義(anchor=車体側の根元)、L=今の取付点間の長さ、deg=根元から棚側へ向かう角度
  function drawCylinderArt(c, L, deg) {
    var at = c.anchor;
    if (!c.two) {
      drawStrip(c.rodName || 'cyl_rod', L - 6, at, deg, 6);
      drawStrip(c.barrelName || 'cyl_barrel', c.barrel, at, deg, 0);
    } else {
      var b = c.barrel, s1 = c.stage1;
      drawStrip('cyl2_rod', Math.max(10, L - b - s1 * 0.8), at, deg, b + s1 * 0.8 - 4);
      drawStrip('cyl2_stage1', s1, at, deg, b - 6);
      drawStrip('cyl2_barrel', b, at, deg, 0);
    }
  }
  // 扇動板など平板状の部材(円柱の質感は不要、金属板のグラデーションのみ)
  function drawPlate(anchor, len, deg, thick) {
    ctx.save();
    ctx.translate(anchor[0], anchor[1]);
    ctx.rotate(deg * Math.PI / 180);
    var grad = ctx.createLinearGradient(0, -thick / 2, 0, thick / 2);
    grad.addColorStop(0, '#b7bec2');
    grad.addColorStop(0.3, '#8c9398');
    grad.addColorStop(0.7, '#6b7278');
    grad.addColorStop(1, '#4b5257');
    ctx.fillStyle = grad;
    roundRectPath(0, -thick / 2, len, thick, 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    roundRectPath(0, -thick / 2, len, thick, 2);
    ctx.stroke();
    ctx.restore();
  }

  // 中央柱の側面の番号札(0〜30番、5ごと)と赤いテープ(継ぎ目の上限)。手前のフレームの後に重ねる
  function drawPillarScale() {
    var M = NA && NA.midLink, im = images.mid_pillar_scale;
    if (M && im && M.pillarScaleHome) ctx.drawImage(im, M.pillarScaleHome[0], M.pillarScaleHome[1]);
  }
  // 3番前(継ぎ目MID)の実車の機構: シリンダーは柱の左の面に沿って x=1500 に真上へ立ち(根元 y=518)、上端は柱の側面の金具(mid_slider)に付く。
  // 金具のピンは、継ぎ目の y - 6。金具は、柱の中の部材とつながって棚と一緒に動く(柱の中の部材は、横から見えないので描かない)。
  // 金具のピンと、2番の棚の下の金具(2番と一緒に動く)を、リンク(44px)でつなぐ。シリンダーの長さ = 根元 y − 金具のピンの y(102〜284)
  function midLinkArt() {
    var M = NA && NA.midLink;
    return M && images.mid_link && images.mid_slider && images.mid_cyl_barrel && images.mid_cyl_stage1 && images.mid_cyl_rod ? M : null;
  }
  function drawMidLink(M, fm) {
    var offs = fm.curOffs();
    var midY = fm.FLOORS.F2.rear.pt[1] + offs.MID;                       // 継ぎ目の y
    var pin = [M.cylAnchor[0], midY + M.sliderPinDy];                    // 金具のピン(シリンダーの先・リンクの下端)
    var L = M.cylAnchor[1] - pin[1];
    // 専用の長い二段シリンダー: 縮みきり(minCyl)から、1段目が stage1Max 伸びて、その後2段目(ロッド)が stage2Max 伸びる。ロッド・1段目・外筒の順に奥から描く
    var s1 = Math.min(M.stage1Max, Math.max(0, L - M.minCyl));
    drawStrip('mid_cyl_rod', M.rodLen, M.cylAnchor, -90, L - M.rodLen);
    drawStrip('mid_cyl_stage1', M.stage1Len, M.cylAnchor, -90, M.barrelLen + s1 - M.stage1Len);   // 外筒の口 + 1段目の伸び − 1段目の長さ
    drawStrip('mid_cyl_barrel', M.barrelLen, M.cylAnchor, -90, 0);
    // リンク: 金具のピン → 2番の棚の下の金具。距離は姿勢で少し変わるので、横に伸び縮みさせて描く
    var lp = fm.onFloor('F2', M.linkTopOnF2[0], M.linkTopOnF2[1]);
    var vx = lp[0] - pin[0], vy = lp[1] - pin[1], d = Math.hypot(vx, vy);
    ctx.save();
    ctx.translate(pin[0], pin[1]);
    ctx.rotate(Math.atan2(vy, vx));
    ctx.scale(d / M.linkLen, 1);
    ctx.drawImage(images.mid_link, -M.linkPivot[0], -M.linkPivot[1]);
    ctx.restore();
    ctx.drawImage(images.mid_slider, pin[0] - M.sliderPivot[0], pin[1] - M.sliderPivot[1]);
  }  // 前景フレームより手前に出る機構(β版で z-index:6 だったもの): シリンダー・アウトリガー
  function drawMechanismFront() {
    var fm = window.FLOOR_MECH;
    if (!fm) return;

    // シリンダー(f2mid / f3rear / midvert)
    var mlArt = midLinkArt();
    if (mlArt) drawMidLink(mlArt, fm);
    fm.CYLS.forEach(function (c) {
      if (mlArt && c.id === 'midvert') return;   // 新しい機構(金具+リンク+専用の二段シリンダー)で描く
      var r = fm.cylLen(c);
      if (NA && images.cyl_barrel) drawCylinderArt(c, r.L, r.deg);
      else drawCylinder(c.anchor, r.L, r.deg, c.thick, Math.min(c.barrel, r.L - 6));
    });

    drawPulley(fm.WIRE_TOP); // 1番後ろのワイヤーが掛かる、後ろの柱のてっぺんの滑車

  }

  function drawPulley(p) {
    var pg = ctx.createRadialGradient(p[0] - 2, p[1] - 2, 1, p[0], p[1], 7);
    pg.addColorStop(0, '#eef1f3'); pg.addColorStop(0.6, '#9aa3a9'); pg.addColorStop(1, '#4d555a');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a2f33';
    ctx.beginPath(); ctx.arc(p[0], p[1], 2.2, 0, Math.PI * 2); ctx.fill();
  }

  // 前景フレームの奥に隠れる機構(β版で z-index:3〜4 だったもの): 1番の昇降リグ・扇動板
  function drawMechanismBehindFg() {
    var fm = window.FLOOR_MECH;
    if (!fm) return;

    // 1番後ろの昇降リグ(β版準拠): 1番フロアに横向きに付いたシリンダー → ワイヤー(2本掛け)→ フロア後端の滑車 → 後ろの柱のてっぺんの滑車。
    // シリンダーはフロアと一緒に動き・傾く。後ろが上がるほどシリンダーが縮んでワイヤーを巻き取る
    var cy = fm.F1_CYL[2], cylLen1 = fm.f1CylLen();
    var base = fm.onFloor('F1', fm.F1_CYL[0], cy), cylTip = fm.onFloor('F1', fm.F1_CYL[0] + cylLen1, cy);
    var cylDeg = fm.poseOf('F1').ang;
    var barrel = (fm.F1_CYL[1] - fm.F1_CYL[0]) * cfg.f1Rig.barrelRatio;
    drawCylinder(base, cylLen1, cylDeg, 9, Math.min(barrel, cylLen1 - 6));
    var sheave = fm.onFloor('F1', fm.SHEAVE[0], fm.SHEAVE[1]), top = fm.WIRE_TOP;
    ctx.save();
    ctx.lineCap = 'round';
    [[0, 0], [0, 3]].forEach(function (o) {
      ctx.strokeStyle = '#3d4448'; ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(cylTip[0], cylTip[1] + o[1] * 0.5); ctx.lineTo(sheave[0], sheave[1] + o[1] * 0.5); ctx.lineTo(top[0] + o[1], top[1]); ctx.stroke();
      ctx.strokeStyle = '#dfe4e7'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(cylTip[0], cylTip[1] + o[1] * 0.5); ctx.lineTo(sheave[0], sheave[1] + o[1] * 0.5); ctx.lineTo(top[0] + o[1], top[1]); ctx.stroke();
    });
    drawPulley(sheave); // フロア後端の滑車(柱のてっぺんの滑車は柱に隠れないよう前景の後に描く)
    ctx.restore();



    // 4番扇動板(4-5番間): 4番フロア後端のヒンジを軸に、格納(下に垂らす)⇔ 搬出(5番フロアの前端へ架ける)を約0.9秒で回転させる。
    // 実車と同じく柱・フレームの奥(車線側)に組み込む(前景フレームより先に描く)
    var bt = fm.bridgeT(), be = bt * bt * (3 - 2 * bt);
    var tip = fm.bridgeTip(); // 5番フロアの今の位置に関わらず、スロープにセットした時の高さまで固定で倒れる
    var outDx = tip[0] - fm.BR_ANCHOR[0], outDy = tip[1] - fm.BR_ANCHOR[1];
    var outLen = Math.max(40, Math.hypot(outDx, outDy)), outDeg = Math.atan2(outDy, outDx) * 180 / Math.PI;
    var stowLen = 62, stowDeg = 92;
    drawBridgePlate(fm.BR_ANCHOR, stowLen + (outLen - stowLen) * be, stowDeg + (outDeg - stowDeg) * be);

    drawF2Flap();
    drawJack();
  }

  // 4番扇動板(実車写真準拠): 四角パイプの枠+エキスパンドメタルの網、先端に黄・赤の帯。色は実車の白ではなくトレーラーの緑に合わせる。
  // 横から見るので、枠の側面(厚み)の上に網の上面がわずかに見える形で描く
  function drawBridgePlate(anchor, len, deg) {
    var rail = 7, top = 6;
    ctx.save();
    ctx.translate(anchor[0], anchor[1]);
    ctx.rotate(deg * Math.PI / 180);
    // 網の上面
    ctx.save();
    ctx.beginPath(); ctx.rect(0, -top, len, top); ctx.clip();
    ctx.fillStyle = '#9fe9dc'; ctx.fillRect(0, -top, len, top);
    ctx.fillStyle = '#f2c230'; ctx.fillRect(len * 0.62, -top, len * 0.13, top);   // 黄色の帯
    ctx.fillStyle = '#e2574c'; ctx.fillRect(len * 0.75, -top, len * 0.11, top);   // 赤の帯
    ctx.strokeStyle = 'rgba(20,90,80,0.75)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (var d = -top; d < len; d += 5) { ctx.moveTo(d, 0); ctx.lineTo(d + top, -top); ctx.moveTo(d + top, 0); ctx.lineTo(d, -top); }
    ctx.stroke();
    ctx.restore();
    // 四角パイプの枠(側面)
    var g = ctx.createLinearGradient(0, 0, 0, rail);
    g.addColorStop(0, '#5fe3cd'); g.addColorStop(0.45, '#2cc9b0'); g.addColorStop(1, '#138d7b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, len, rail);
    ctx.strokeStyle = '#0d2b27'; ctx.lineWidth = 1.2;
    ctx.strokeRect(0, -top, len, top + rail);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
    // 付け根のヒンジ
    ctx.fillStyle = '#1c3a35';
    ctx.beginPath(); ctx.arc(0, rail / 2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // 2番扇動板: 閉じている時は2番フロアの床の一部なので描かない(フロア画像に含まれる)。
  // 開いている時は、ヒンジ(前端の梁の上)から立ち上がったメッシュ板として描く(実車写真準拠)
  function drawF2Flap() {
    var fm = window.FLOOR_MECH;
    // 外側へ開く(ヒンジ軸は前後方向)ので、横から見ると開くにつれて板の面が立ち上がって見える(約0.7秒)
    var ft = fm.flapT();
    if (ft <= 0) return;
    var f2 = fm.FLOORS.F2, x0 = f2.x0 + 6, x1 = f2.x0 + fm.F2_FLAP_LEN, deckY = f2.front.pt[1];
    var a = fm.onFloor('F2', x0, deckY), b = fm.onFloor('F2', x1, deckY);
    var ang = Math.atan2(b[1] - a[1], b[0] - a[0]), w = Math.hypot(b[0] - a[0], b[1] - a[1]);
    var h = Math.max(2, 62 * Math.sin(ft * Math.PI / 2));
    ctx.save();
    ctx.translate(a[0], a[1]);
    ctx.rotate(ang);
    ctx.fillStyle = 'rgba(95,227,205,0.35)';
    ctx.fillRect(0, -h, w, h);
    ctx.strokeStyle = '#8fe6d8';
    ctx.lineWidth = 1.5;
    ctx.save(); ctx.beginPath(); ctx.rect(0, -h, w, h); ctx.clip();
    ctx.beginPath();
    for (var e = -h; e < w; e += 12) { ctx.moveTo(e, 0); ctx.lineTo(e + h, -h); ctx.moveTo(e + h, 0); ctx.lineTo(e, -h); }
    ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#2cc9b0';
    ctx.strokeRect(0, -h, w, h);
    ctx.fillStyle = '#138d7b';
    [0.15, 0.5, 0.85].forEach(function (r) { ctx.fillRect(w * r - 7, -5, 14, 7); }); // ヒンジ
    ctx.restore();
  }

  // アウトリガー(ジャッキ): タイヤ後方の台車フレーム内に縦のシリンダー、下の梁から角パイプの足が出る(実車写真準拠)。
  // 前景フレームより先に描くので、フレームの部材がシリンダーの手前に重なって「フレーム内部」に見える。
  // 足先はjack=jackContactで地面に接地し、それ以上伸ばすとトレーラーが持ち上がる(足先は地面に残る)。
  // part: 'cyl'=シリンダー(前景フレームの奥) / 'leg'=梁から下の足と接地板(前景の地面の影より手前に描いて、接地が見えるように)
  function drawJack(part) {
    var o = cfg.outrigger, x = o.jackX, jack = window.FLOOR_MECH.MECH.jack;
    var footY = o.footStowedY + jack;
    ctx.save();
    if (part === 'leg') {
      var lw = 11, lg = ctx.createLinearGradient(x - lw / 2, 0, x + lw / 2, 0);
      lg.addColorStop(0, '#1c1714'); lg.addColorStop(0.3, '#5a4a3d'); lg.addColorStop(0.6, '#342a24'); lg.addColorStop(1, '#120f0d');
      ctx.fillStyle = lg;
      ctx.fillRect(x - lw / 2, o.frameBottom, lw, Math.max(0, footY - o.frameBottom - 4));
      ctx.fillStyle = '#2a2420';
      ctx.fillRect(x - 17, footY - 5, 34, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x - 17, footY - 5, 34, 1);
      ctx.restore();
      return;
    }
    // シリンダー本体(銀色の筒)
    var bw = 14, g = ctx.createLinearGradient(x - bw / 2, 0, x + bw / 2, 0);
    g.addColorStop(0, '#7d8285'); g.addColorStop(0.4, '#eef1f3'); g.addColorStop(1, '#858a8e');
    ctx.fillStyle = g;
    ctx.fillRect(x - bw / 2, o.cylTop, bw, o.frameBottom - o.cylTop - 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1;
    ctx.strokeRect(x - bw / 2, o.cylTop, bw, o.frameBottom - o.cylTop - 6);
    ctx.fillStyle = '#3a3a36';
    ctx.fillRect(x - 5, o.cylTop - 5, 10, 5); // 上端の取付金具
    // 足(角パイプ。黒っぽい鉄+少し錆)
    var lw = 11, lg = ctx.createLinearGradient(x - lw / 2, 0, x + lw / 2, 0);
    lg.addColorStop(0, '#1c1714'); lg.addColorStop(0.3, '#5a4a3d'); lg.addColorStop(0.6, '#342a24'); lg.addColorStop(1, '#120f0d');
    ctx.fillStyle = lg;
    ctx.fillRect(x - lw / 2, o.frameBottom - 12, lw, footY - (o.frameBottom - 12) - 4);
    // 足先の接地板
    ctx.fillStyle = '#2a2420';
    ctx.fillRect(x - 17, footY - 5, 34, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x - 17, footY - 5, 34, 1);
    ctx.restore();
  }

  // 台車タイヤ(実車写真準拠): 黒いタイヤ+トレッド、銀色のスチールディスクホイール(飾り穴10・ナット10・黒いハブキャップ)、フェンダー。
  // タイヤを突出させると手前(外側)に出るので、接地点はそのままで少し大きく見え、フェンダーより手前に来る。
  // ※画像wheel_v2.b64.txtは応援サイトが部品取りに使っているため差し替えず、ゲームではこちらを描く
  function drawTrailerWheel() {
    var w = cfg.outrigger.wheel, t = tireOutT, e = t * t * (3 - 2 * t);
    var r = w.r * (1 + (cfg.outrigger.tireOutScale - 1) * e);
    // エアサスで車高が下がる時、接地しているタイヤとフェンダー(足回り)はその位置に固定し、奥の台車だけが沈む。
    // → エアサス分の傾きを打ち消した位置に描く(タイヤとフェンダーは一体なので被らない)
    var fm = window.FLOOR_MECH, jt = fm ? fm.jackTiltDeg() : 0;
    var fixed = worldToRig(rigToWorld([w.cx, w.cy], jt), curTilt);
    var ox = fixed[0] - w.cx, oy = fixed[1] - w.cy;
    var cx = w.cx, cy = w.cy + (w.r - r);
    ctx.save();
    ctx.translate(ox, oy);
    if (e < 0.5) { drawTire(cx, cy, r); drawFender(w); }
    else { drawFender(w); drawTire(cx, cy, r); }
    ctx.restore();
  }
  function drawFender(w) {
    if (NA && images.fender) {   // 新素材: 実車どおり前側に黄黒の縞、後ろに黒い泥よけ。pivot(82,82)=タイヤ中心
      ctx.drawImage(images.fender, w.cx - 82, w.cy - 82);
      return;
    }
    ctx.save();
    ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(w.cx, w.cy, w.fenderR, Math.PI * 1.02, Math.PI * 1.98);
    ctx.strokeStyle = '#11181a'; ctx.lineWidth = 13; ctx.stroke();
    ctx.beginPath(); ctx.arc(w.cx, w.cy, w.fenderR, Math.PI * 1.02, Math.PI * 1.98);
    ctx.strokeStyle = '#2cc9b0'; ctx.lineWidth = 9; ctx.stroke();
    // 後ろ側の泥よけ
    ctx.fillStyle = '#16191b';
    ctx.fillRect(w.cx + w.fenderR - 5, w.cy - 4, 7, 36);
    ctx.restore();
  }
  function drawTire(cx, cy, r) {
    if (NA && images.wheel_alu) {   // 新素材(122×122、半径59で作成): 突出時の拡大は画像の拡大で表す
      var ws = r / 59;
      ctx.drawImage(images.wheel_alu, cx - 61 * ws, cy - 61 * ws, 122 * ws, 122 * ws);
      return;
    }
    ctx.save();
    ctx.translate(cx, cy);
    // タイヤ(側面は外側ほど少し明るいゴム)
    var tg = ctx.createRadialGradient(0, 0, r * 0.55, 0, 0, r);
    tg.addColorStop(0, '#0f1011'); tg.addColorStop(0.8, '#1d1e20'); tg.addColorStop(1, '#2a2b2d');
    ctx.fillStyle = tg;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    // トレッドのブロック
    ctx.strokeStyle = '#0a0a0b'; ctx.lineWidth = r * 0.09; ctx.setLineDash([r * 0.1, r * 0.09]);
    ctx.beginPath(); ctx.arc(0, 0, r - r * 0.045, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.84, 0, Math.PI * 2); ctx.stroke();
    // スチールディスクホイール
    var rr = r * 0.6;
    var rg = ctx.createRadialGradient(-rr * 0.25, -rr * 0.3, rr * 0.1, 0, 0, rr);
    rg.addColorStop(0, '#f1f3f4'); rg.addColorStop(0.7, '#c5cbcf'); rg.addColorStop(1, '#9aa2a7');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7d858a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, rr - 1, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, rr * 0.88, 0, Math.PI * 2); ctx.stroke();
    // 飾り穴(楕円×10)
    ctx.fillStyle = '#18191b';
    for (var i = 0; i < 10; i++) {
      var a = (i + 0.5) / 10 * Math.PI * 2;
      ctx.save(); ctx.rotate(a); ctx.translate(rr * 0.7, 0);
      ctx.beginPath(); ctx.ellipse(0, 0, rr * 0.085, rr * 0.14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // ハブ面とナット×10
    ctx.fillStyle = '#d7dcdf'; ctx.strokeStyle = '#8e969b'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, rr * 0.46, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    for (var n = 0; n < 10; n++) {
      var b = n / 10 * Math.PI * 2;
      ctx.beginPath(); ctx.arc(Math.cos(b) * rr * 0.34, Math.sin(b) * rr * 0.34, rr * 0.06, 0, Math.PI * 2);
      ctx.fillStyle = '#b3babf'; ctx.fill(); ctx.strokeStyle = '#5f676c'; ctx.stroke();
    }
    // 黒いハブキャップ
    ctx.fillStyle = '#141516';
    ctx.beginPath(); ctx.arc(0, 0, rr * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(-rr * 0.06, -rr * 0.06, rr * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // 道板: 上面(車のタイヤが通る面)の先端が地面に着く。厚みは付け根側だけで、先端は斜めに削れている
  function drawRamp(tilt) {
    // 出し入れ: 0〜0.55は床下から真横にスライド(後端から出てくるように後端より後ろだけ見せる)、0.55〜1は地面へ傾ける
    var fm = window.FLOOR_MECH, rt = fm ? fm.rampT() : 1;
    if (rt <= 0) return;
    var slide = Math.min(1, rt / 0.55), u = Math.max(0, (rt - 0.55) / 0.45);
    u = u * u * (3 - 2 * u);
    var top = rigToWorld(cfg.ramp.top, tilt), bot = cfg.ramp.bottom;
    var len = Math.hypot(bot[0] - cfg.ramp.top[0], bot[1] - cfg.ramp.top[1]);
    var vy = cfg.ramp.groundY - top[1], vx = Math.sqrt(Math.max(0, len * len - vy * vy));
    var angle = Math.atan2(vy, vx) * u;
    var thick = 10, bevel = 60;

    ctx.save();
    if (slide < 1) { ctx.beginPath(); ctx.rect(top[0] - 4, top[1] - 80, len + 120, 200); ctx.clip(); }
    ctx.translate(top[0] - len * (1 - slide), top[1]);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.lineTo(len - bevel, thick); ctx.lineTo(0, thick);
    ctx.closePath();
    var grad = ctx.createLinearGradient(0, 0, 0, thick);
    grad.addColorStop(0, '#e3e8eb');
    grad.addColorStop(0.35, '#b7c0c5');
    grad.addColorStop(1, '#6d767c');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1.5;
    for (var x = 4; x < len; x += 22) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, thick); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = '#2c3135';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }
  // ぶつかった車のグシャッ(前端を固定して前後に縮み、少し膨らんで戻る)の拡大率
  function squashOf(car) {
    var sq = car && car.squash;
    if (!sq) return null;
    var se = performance.now() - sq.t0;
    if (se >= sq.dur) return null;
    var sp = se / sq.dur, sd = (1 - sp) * (1 - sp), so = 0.6 + 0.4 * Math.cos(sp * 9);
    return [1 - sq.a * sd * so, 1 + sq.a * 0.5 * sd * so];
  }
  // 左タイヤ接地点(x,y)を軸に、rotDeg度回転させて車体画像を描く
  function drawCarBody(img, x, y, w, h, leftTireX, rotDeg, car) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotDeg * Math.PI / 180);
    var sqz = squashOf(car);
    if (sqz) { ctx.translate(-leftTireX, 0); ctx.scale(sqz[0], sqz[1]); ctx.translate(leftTireX, 0); }
    ctx.drawImage(img, -leftTireX, -h, w, h);
    ctx.restore();
  }

  // 操作中の車: 車体に加えて、タイヤ位置を丸くくり抜いて回転させるホイールスピン演出を重ねる
  function drawDrivingCar(car, rotDeg) {
    var w = car.w, h = car.h, leftTireX = car.leftTireX;

    // 輪止めを勢いよく乗り越えている最中は、タイヤが段差に乗り上げる分だけ一瞬浮かせる
    // (段差は「今有効な障害物」の位置だけ。輪止めを動かしたら基準位置には何も無い。落とし穴は乗り上げない)
    var bumpY = 0, nb = car.nb;
    if (nb && nb.stop.kind !== 'hole') {
      var BUMP_ZONE = 16;
      var dist = Math.abs(car.progress - nb.s);
      if (dist < BUMP_ZONE && Math.abs(car.velocity || 0) > 45) {
        bumpY = -6 * Math.sin((1 - dist / BUMP_ZONE) * Math.PI / 2);
      }
    }

    // 落し蓋を開けた穴に近づくと、左タイヤが穴に落ち込んで車体が少し前下がりに傾く(深さ=タイヤ直径の約1/5)
    var sink = 0, sinkDeg = 0, gs = window.GAME_STATE;
    if (nb && nb.stop.kind === 'hole') {
      {
        var dip = 0.2 * 2 * car.rhRatio * h;
        var dd = Math.max(0, Math.min(1, (car.progress - (nb.s - 36)) / 36));
        dd = dd * dd * (3 - 2 * dd);
        sink = dip * dd;
        sinkDeg = -Math.atan2(sink, car.wbPx) * 180 / Math.PI;
      }
    }

    // 事故(落下): 道板との間の空中から地面へ落ちて、傾きながら地面に叩きつけられる。着地でグシャッと縮む
    var fallY = 0, fallRot = 0, acc = car.accident;
    if (acc) {
      var ft = (performance.now() - acc.t0) / 1000, maxFall = Math.max(0, cfg.ramp.groundY - car.y);
      fallY = Math.min(maxFall, 700 * ft * ft);
      fallRot = -Math.min(38, 55 * ft);
      if (fallY >= maxFall && !acc.landed) {
        acc.landed = true;
        var gst = window.GAME_STATE;
        if (gst && gst.fx) gst.fx.shake = { t0: performance.now(), dur: 1100, amp: 13 };
        acc.landT = performance.now();
      }
    }
    // 脱輪(宙段を動かされて乗りかけのタイヤが外れた): 前のめりに傾いてガクンと沈み、揺れながら戻る
    var drY = 0, drDeg = 0, dr = car.derail;
    if (dr) {
      var dp = (performance.now() - dr.t0) / dr.dur;
      if (dp >= 1) car.derail = null;
      else { var de = (1 - dp) * (1 - dp); drDeg = -17 * de * (0.55 + 0.45 * Math.cos(dp * 11)); drY = 11 * de * (0.6 + 0.4 * Math.cos(dp * 11)); }
    }
    ctx.save();
    ctx.translate(car.x, car.y + bumpY + sink + fallY + drY);
    ctx.rotate((rotDeg + sinkDeg + fallRot + drDeg) * Math.PI / 180);
    // ぶつかった時のグシャッ: 前端を固定して前後に縮み、少し上に膨らんで戻る(減衰する振動)
    var sqz = squashOf(car);
    if (!sqz && acc && acc.landed) {   // 落下の着地
      var le = performance.now() - acc.landT;
      if (le < 700) { var lp = le / 700, ld = (1 - lp) * (1 - lp); sqz = [1 - 0.3 * ld * (0.6 + 0.4 * Math.cos(lp * 9)), 1 + 0.15 * ld]; }
      else sqz = [0.78, 1.1];   // 潰れたまま
    }
    if (sqz) { ctx.translate(-leftTireX, 0); ctx.scale(sqz[0], sqz[1]); ctx.translate(leftTireX, 0); }
    ctx.drawImage(car.img, -leftTireX, -h, w, h);

    var K = 0.72; // タイヤ外周のうち、回転させるホイール部分の比率
    [car.tlRatio, car.trRatio].forEach(function (ratio) {
      var wheelImgX = ratio * w;
      var wheelImgY = (1 - car.rhRatio) * h;
      var localX = wheelImgX - leftTireX;
      var localY = wheelImgY - h;
      var rx = car.rwRatio * w * K, ry = car.rhRatio * h * K;

      ctx.save();
      ctx.beginPath();
      ctx.ellipse(localX, localY, rx, ry, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(localX, localY);
      ctx.rotate(car.spinDeg * Math.PI / 180);
      ctx.drawImage(car.img, -wheelImgX, -wheelImgY, w, h);
      ctx.restore();
    });
    ctx.restore();
  }

  function drawCars() {
    var st = window.GAME_STATE;
    if (!st) return;

    var fm = window.FLOOR_MECH;
    Object.keys(st.occupied).forEach(function (num) {
      var c = st.occupied[num];
      var pos, rotDeg = c.rotDeg || 0;
      if (c.floor && fm) {
        pos = fm.onFloor(c.floor, c.localX, c.localY);
        rotDeg += fm.poseOf(c.floor).ang;
      } else {
        pos = [c.localX, c.localY];
      }
      drawCarBody(c.img, pos[0], pos[1], c.w, c.h, c.leftTireX, rotDeg, c.live);
    });

    if (st.car && !st.car.seated) {
      var car = st.car;
      var rotDeg = 0;
      if (car.pathTool && (car.phase === 'ready' || car.phase === 'moving')) {
        var L = car.pathTool.at(car.progress);
        var R = car.pathTool.at(car.progress - car.wbPx);
        rotDeg = Math.atan2(-(L.y - R.y), -(L.x - R.x)) * 180 / Math.PI;
      }
      if (curTilt) {
        var rb = cfg.ramp.bottom[0], rt = cfg.ramp.top[0];
        var onRig = Math.max(0, Math.min(1, (rb - car.x) / (rb - rt)));   // 1=トレーラー上、0=地面
        var wp = rigToWorld([car.x, car.y], curTilt);
        var world = [car.x + (wp[0] - car.x) * onRig, car.y + (wp[1] - car.y) * onRig];
        var rp = worldToRig(world, curTilt);
        car = Object.create(car); car.x = rp[0]; car.y = rp[1];
        rotDeg += curTilt * (1 - onRig);
      }
      drawDrivingCar(car, rotDeg);
    }
  }

  // スロットの基準位置からdx(px、+は後方)ずれた点を原点・床の傾きを角度にして描く。フロア上のスロットは床に追従する
  function placeOnSlot(slot, dx, fn) {
    var fm = window.FLOOR_MECH;
    var x = slot.tireX + dx, y = slot.deckY + dx * Math.tan((slot.rot || 0) * Math.PI / 180), deg = slot.rot || 0;
    var carrier = slot.floor || slot.carrier; // 5番は下段だが、5番フロアの上に載っている(穴・輪止め・車は床の傾きに追従)
    if (carrier && fm) {
      var p = fm.onFloor(carrier, x, y);
      x = p[0]; y = p[1]; deg += fm.poseOf(carrier).ang;
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate(deg * Math.PI / 180); fn(); ctx.restore();
  }

  // オレンジ色の輪止め(横から見たくさび形)。原点=タイヤの接地点、輪止めはその前(-x側)に置き、タイヤ側の面はタイヤの丸みに沿ってえぐれている。
  // 実物(目安8cm)のままでは画面上で判別できないため、見やすい大きさ(長さ26px・高さ15px)で描く
  function drawChockBlock(sel) {
    var L = 26, H = 15;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-1, 0);
    ctx.lineTo(-L, 0);
    ctx.lineTo(-L + 5, -H * 0.55);
    ctx.lineTo(-L * 0.42, -H);
    ctx.lineTo(-5, -H);
    ctx.quadraticCurveTo(-11, -H * 0.35, -1, 0);   // タイヤ側のえぐれ
    ctx.closePath();
    var g = ctx.createLinearGradient(0, -H, 0, 0);
    g.addColorStop(0, '#ffb24d'); g.addColorStop(0.55, '#ff8a1e'); g.addColorStop(1, '#d4600c');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = sel ? 2.4 : 1.6;
    ctx.strokeStyle = sel ? '#ffffff' : '#4a2206';
    ctx.stroke();
    // 滑り止めのリブ
    ctx.strokeStyle = 'rgba(90,40,5,0.55)'; ctx.lineWidth = 1.2;
    [-L * 0.72, -L * 0.52, -L * 0.32].forEach(function (x) {
      ctx.beginPath(); ctx.moveTo(x, -2); ctx.lineTo(x + 3, -H * 0.8); ctx.stroke();
    });
    ctx.restore();
  }

  // 輪止め周りの描画。フロア上のスロットはフロアの傾きに追従する。
  //  - 5・6番: 床の穴(輪止めをはめ込む場所)を基準位置の前後に並べて表示
  //  - 2・3番: 落し蓋を開けている間だけ、タイヤ落としの穴を表示
  //  - 輪止め: セット中のものを約8cmの三角ブロックで表示(選択中のスロットは白枠)
  // 落し蓋(2・3番のタイヤ落とし)の開閉アニメーション。0=閉(床の一部なので描かない)、1=開。約0.6秒
  var lidAnim = {};
  function updateLids() {
    var st = window.GAME_STATE;
    if (!st) return;
    Object.keys(cfg.slots).forEach(function (num) {
      if (cfg.slots[num].stopKind !== 'hole') return;
      var a = lidAnim[num] || (lidAnim[num] = { t: 0, last: null });
      var now = performance.now(), dt = a.last === null ? 0 : Math.min(0.1, (now - a.last) / 1000);
      a.last = now;
      var step = dt / 0.6, target = st.lidOpen[num] ? 1 : 0;
      if (cfg.slots[num].instantLid) { a.t = target; return; }   // 宙段の穴は、上げた時には最初から空いている(蓋の動きは見せない)
      a.t = a.t < target ? Math.min(target, a.t + step) : Math.max(target, a.t - step);
    });
  }
  function lidT(num) { return lidAnim[num] ? lidAnim[num].t : 0; }
  // タイヤ落としの穴: 蓋がどいた分だけ見える。車より先(奥)に描くので、落ち込んだタイヤが穴の中に入って見える
  function drawHolesUnder() {
    var st = window.GAME_STATE;
    if (!st) return;
    Object.keys(cfg.slots).forEach(function (num) {
      var slot = cfg.slots[num];
      if (slot.stopKind !== 'hole') return;
      if (slot.instantLid && chuudanArt()) return;   // 宙段の穴は宙段フロアの絵に描いてある
      var t = lidT(num); if (t <= 0) return;
      var e = t * t * (3 - 2 * t);
      placeOnSlot(slot, 0, function () {
        ctx.fillStyle = 'rgba(8,10,10,' + (0.92 * Math.min(1, e * 1.6)) + ')';
        ctx.fillRect(-22, 0, 44, 9);
      });
    });
  }
  // 落し蓋: 後ろ側の縁がヒンジ(車の進行方向に直交する軸)。前の縁が持ち上がり、後ろへ180度ひっくり返って、穴の後ろ側に裏返しで寝る。
  // 横から見ると、薄い鉄板がヒンジを軸に前→上→後ろへ回る。質感は薄い鉄板、色はフロア(トレーラー)と同じ緑。
  // 開くにつれて下のタイヤ落としの穴が見える。原点=穴の中心(タイヤの停止点)、+xが後ろ
  function drawDropLid(t) {
    var W = 44, T = 4, e = t * t * (3 - 2 * t);
    var a = Math.PI + Math.PI * e;          // 板の向き: 前向き(π)→ 真上(1.5π)→ 後ろ向き(2π)
    var under = e > 0.5;                     // 90度を過ぎると裏面が上
    ctx.save();
    // 蓋(ヒンジ=穴の後ろの縁)
    ctx.translate(W / 2, 0);
    ctx.rotate(a);
    var g = ctx.createLinearGradient(0, -T, 0, 0);
    if (!under) { g.addColorStop(0, '#7ff0dd'); g.addColorStop(1, '#1fae98'); }
    else { g.addColorStop(0, '#1d9c88'); g.addColorStop(1, '#0f5f53'); }
    ctx.fillStyle = g;
    // 回転後の座標系で、板はヒンジから+x方向へW、厚みは板の「上面」側(-y)
    ctx.fillRect(0, -T, W, T);
    ctx.strokeStyle = '#0d2b27'; ctx.lineWidth = 1;
    ctx.strokeRect(0, -T, W, T);
    ctx.fillStyle = 'rgba(255,255,255,' + (under ? 0.08 : 0.3) + ')';   // 薄い鉄板の光沢
    ctx.fillRect(2, -T, W - 4, 1);
    // ヒンジ
    ctx.fillStyle = '#0b3f37';
    ctx.beginPath(); ctx.arc(0, -T / 2, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // 輪止めの新素材: 1番=オレンジの鉄板、上段(2・3番)と4番=低い黄色いくさび、5・6番=黄色いくさび。素材は左=タイヤ側なので、タイヤの前に置く向きに左右反転して描く
  var CHOCK_ART = { '7': 'chock_wedge', '1': 'chock_plate', '2': 'chock_wedge_flat', '3': 'chock_wedge_flat', '4': 'chock_wedge_flat', '5': 'chock_wedge', '6': 'chock_wedge' };
  function drawChockArt(num) {
    var key = CHOCK_ART[num], img = key && images[key], info = NA && NA.chockInfo && NA.chockInfo[key];
    if (!img || !info) return false;
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(img, -info.pivot[0], -info.pivot[1]);
    ctx.restore();
    return true;
  }
  // セットピン: 柱の穴は横から見えないので、見えるのは差したピンの赤いコの字の取手だけ(柱の前の面から前へ出る)。
  // 抜いている間は、鎖でぶら下がる絵を、次に差す穴(ピンボタンの番号)の位置に出す。位置は pinMarks(その棚の端の柱のx、棚が走行位置の絵の時のy)+ピンの上下量
  function drawPins() {
    var fm = window.FLOOR_MECH;
    if (!NA || !images.pin || !fm || !fm.PINS) return;
    Object.keys(cfg.pinMarks).forEach(function (k) {
      var m = cfg.pinMarks[k], v = fm.PINS[k], img = images.pin;
      var y = v !== null ? m[1] + v : m[1] + fm.offOfHole(k, fm.pinTarget(k));
      if (v === null) img = images.pin_out;
      if (img) ctx.drawImage(img, m[0] - 4, y - 6);
    });
  }
  // トレーラー上のスイッチ・ランプ盤(実寸=素材の0.27倍)。上端の中央を設定の位置に合わせる。2ボタンは、その棚を動かしている間、上/下を押した絵にする。
  // 斜材に沿うもの(ランプ盤・6ボタン)は約30度傾けて置く(上端が後ろへ)
  function drawSwitches() {
    var fm = window.FLOOR_MECH;
    if (!NA || !NA.switchLayout || !images.sw_pendant2 || !fm || !fm.pressInfo) return;
    var pr = fm.pressInfo(), sc = NA.switchScale || 0.27;
    // 取付板(R6)。スイッチより先に、1:1で描く(pivot を at に合わせ、rot 度回す)
    (NA.swMounts || []).forEach(function (m) {
      var im = images[m.img];
      if (!im || (NA.swMountsOff && NA.swMountsOff.indexOf(m.img) >= 0)) return;   // 位置を変えたスイッチの古い取付板は描かない(R8 で新しい板を依頼)
      ctx.save();
      ctx.translate(m.at[0], m.at[1]);
      if (m.rot) ctx.rotate(m.rot * Math.PI / 180);
      ctx.drawImage(im, -m.pivot[0], -m.pivot[1]);
      ctx.restore();
    });
    NA.switchLayout.forEach(function (s) {
      var body = images[s.body];
      if (!body) return;
      ctx.save();
      ctx.translate(s.at[0], s.at[1]);
      if (s.rot) ctx.rotate(s.rot * Math.PI / 180);
      var kk = s.scale || sc;   // 狭い所(中央の柱と斜めの柱の間)のスイッチは、設定の scale(0.21)で小さく描く
      ctx.scale(kk, kk);
      ctx.translate(-body.width / 2, 0);
      ctx.drawImage(body, 0, 0);
      function put(name, x, y) { var im = images[name]; if (im) ctx.drawImage(im, x - im.width / 2, y - im.height / 2); }
      if (s.body === 'sw_pendant2') {
        var d = 0;   // -1=上を押している / +1=下を押している
        if (s.bind === 'F7') d = pr.hang > 0 ? -1 : (pr.hang < 0 ? 1 : 0);
        else if (s.bind === 'jack') d = pr.jack > 0 ? 1 : (pr.jack < 0 ? -1 : 0);
        else if (pr.hold && pr.hold.end === s.bind) d = pr.hold.dir;
        put(d < 0 ? 'btn_cap_ue_big_pressed' : 'btn_cap_ue_big', 22, 26);
        put(d > 0 ? 'btn_cap_shita_big_pressed' : 'btn_cap_shita_big', 22, 44);
      } else if (s.body === 'sw_box2') {
        put('btn_sq', 22, 28); put('btn_sq', 22, 46);
      } else if (s.body === 'lamp_panel_lock') {
        put(fm.workReady() ? 'lamp_red' : 'lamp_red_off', 16, 16);
        put(fm.MECH.lockR ? 'lamp_green' : 'lamp_green_off', 16, 48);
        put(fm.MECH.lockL ? 'lamp_green' : 'lamp_green_off', 16, 80);
      } else if (s.body === 'sw_pendant6') {
        ['nobi', 'chiji', 'migi_oshi', 'migi_hiki', 'hidari_oshi', 'hidari_hiki'].forEach(function (n, k) { put('btn_cap6_' + n + (fm.MECH.press6 === k ? '_big_pressed' : '_big'), 27, 28 + 24 * k); });   // 操作盤の6ボタンを押している間は押した絵
      }
      ctx.restore();
    });
  }
  // 操作盤を開いているスイッチのグループ(タップ範囲)を、薄い枠で示す
  // 光る枠(hint_glow。角丸の9分割 slice=16)で、タップできるスイッチのグループを示す。
  //  ・操作盤を開いている間: そのグループ(同じ操作盤を開く範囲が複数あってもすべて)を、はっきり光らせる
  //  ・何も開いていない間: イージーだけ、全てのグループをゆっくり点滅させて「ここを押せる」と教える
  function draw9(im, x, y, w, h, s) {
    var W = im.width, H = im.height, mw = W - 2 * s, mh = H - 2 * s;
    w = Math.max(w, 2 * s); h = Math.max(h, 2 * s);
    var sx = [0, s, W - s], sw = [s, mw, s], dx = [x, x + s, x + w - s], dw = [s, w - 2 * s, s];
    var sy = [0, s, H - s], sh = [s, mh, s], dy = [y, y + s, y + h - s], dh = [s, h - 2 * s, s];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) ctx.drawImage(im, sx[i], sy[j], sw[i], sh[j], dx[i], dy[j], dw[i], dh[j]);
  }
  function drawSwitchGroupFrame() {
    var ui = window.SWITCH_UI, groups = NA && NA.switchGroups, gs = window.GAME_STATE;
    if (!groups) return;
    var cur = ui && ui.current, glow = images.hint_glow, idleHint = !cur && gs && gs.hints;
    if (!cur && !idleHint) return;
    var pulse = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(performance.now() / 420));
    ctx.save();
    groups.forEach(function (g) {
      var active = cur && g.id === cur;
      if (!active && !idleHint) return;
      var r = g.rect, m = 8;
      if (glow) { ctx.globalAlpha = active ? 0.95 : pulse; draw9(glow, r[0] - m, r[1] - m, r[2] + 2 * m, r[3] + 2 * m, 16); }
      else if (active) { ctx.strokeStyle = 'rgba(255,230,120,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(r[0], r[1], r[2], r[3]); }
    });
    ctx.restore();
  }  // pass: 'holes'=床の穴(前景フレームの奥) / 'blocks'=輪止め本体(前景フレームの手前)
  function drawChocks(pass) {
    var st = window.GAME_STATE, fm = window.FLOOR_MECH;
    if (!st || !st.slotTarget) return;
    var size = cfg.chock.sizeCm / 100 * cfg.pxPerMeter;
    var place = placeOnSlot;
    Object.keys(cfg.slots).forEach(function (num) {
      var slot = cfg.slots[num], sel = st.targetSlot === num, lim = st.chockLimits(num);
      if (pass === 'holes' && slot.stopKind === 'none') {
        for (var i = lim.min; i <= lim.max; i++) {
          place(slot, i * lim.stepCm / 100 * cfg.pxPerMeter, function () {
            ctx.fillStyle = 'rgba(20,20,20,0.85)';
            ctx.fillRect(-size * 0.45, -size * 0.3, size * 0.9, size * 0.3);
          });
        }
      }
      if (pass === 'blocks' && slot.stopKind === 'hole' && !(slot.instantLid && chuudanArt())) {
        var lt = lidT(num);
        if (lt > 0) place(slot, 0, function () { drawDropLid(lt); });
      }
      var c = st.chocks[num];
      if (pass === 'blocks' && c && c.set) {
        place(slot, c.step * lim.stepCm / 100 * cfg.pxPerMeter, function () { if (!drawChockArt(num)) drawChockBlock(sel); });
      }
    });
  }
  // 輪止め・タイヤ止め・穴の位置の目印。輪止め本体は小さくて柱の陰に隠れるため、矢印とラベルを最前面に描く。
  //  - 選択中のスロット: 輪止めを置ける位置の目盛り+今止まる位置(大きな矢印とラベル)
  //  - それ以外: セット中の輪止め/開いている落し蓋だけ小さな矢印
  function drawChockMarkers() {
    var st = window.GAME_STATE;
    if (!st || !st.activeStop) return;
    function arrow(label, color, big) {
      ctx.translate(0, -18); // 輪止め本体(高さ15px)に重ならないよう、その上に出す
      var w = big ? 32 : 18, h = big ? 74 : 42;
      ctx.beginPath();
      ctx.moveTo(0, -10); ctx.lineTo(-w, -10 - h); ctx.lineTo(w, -10 - h);
      ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 16); ctx.lineWidth = 6; ctx.strokeStyle = color; ctx.stroke();
      if (label) {
        ctx.font = 'bold ' + (big ? 54 : 36) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 10; ctx.lineJoin = 'round'; ctx.strokeStyle = '#000'; ctx.strokeText(label, 0, -10 - h - 12);
        ctx.fillStyle = color; ctx.fillText(label, 0, -10 - h - 12);
      }
    }
    var KIND_LABEL = { chock: '輪止め', stopper: '輪止め', hole: '落とし穴' };
    var KIND_COLOR = { chock: '#ffb020', stopper: '#c8d0d4', hole: '#6cc8ff' };
    Object.keys(cfg.slots).forEach(function (num) {
      var slot = cfg.slots[num], sel = st.targetSlot === num, lim = st.chockLimits(num);
      var stop = st.activeStop(num), c = st.chocks[num];
      if (sel) {
        // 輪止めを置ける位置の目盛り(前後どちらへ動かせるかが分かる)
        for (var i = lim.min; i <= lim.max; i++) {
          placeOnSlot(slot, i * lim.stepCm / 100 * cfg.pxPerMeter, function () {
            ctx.fillStyle = 'rgba(255,150,40,0.85)'; ctx.beginPath(); ctx.arc(0, -4, 4, 0, Math.PI * 2); ctx.fill();
          });
        }
        // 輪止めが無い間も、元のタイヤ止め・落し蓋の位置は示す
        if (!stop && slot.stopKind === 'hole') {
          placeOnSlot(slot, 0, function () { arrow('落し蓋(閉)', 'rgba(150,170,180,0.95)', true); });
        }
      }
      if (!stop) return;
      if (!(sel || stop.kind === 'chock' || stop.kind === 'hole')) return;
      placeOnSlot(slot, stop.dx, function () {
        var cm = stop.kind === 'chock' && c ? Math.round(c.step * lim.stepCm) : null;
        var label = sel ? (KIND_LABEL[stop.kind] + (cm !== null && cfg.slots[num].stopKind === 'none' ? (cm === 0 ? '(基準)' : (cm < 0 ? '(前' : '(後') + Math.abs(cm) + 'cm)') : '')) : '';
        arrow(label, KIND_COLOR[stop.kind], sel);
      });
    });
  }

  // 輪止め(タイヤ止め・落とし)に当たって止まっている車に「OK」を出す。以前の選択中スロットの四角い囲いは廃止
  function drawSlotMarks() {
    var st = window.GAME_STATE;
    if (!st) return;
    // 操作中でOKの車に緑の「OK」、固定した車には小さな「固定」を出す
    Object.keys(st.occupied).forEach(function (num) {
      var occ = st.occupied[num], c = occ.live;
      if (!c) return;
      var locked = !!c.locked, active = c === st.car && !locked;
      if (!locked && !active) return;
      placeOnSlot(cfg.slots[num], occ.dx || 0, function () {
        var w = locked ? 64 : 92, h = locked ? 30 : 46, y = locked ? -80 : -95;
        var col = locked ? 'rgba(90,100,115,0.95)' : 'rgba(30,160,90,0.95)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-w / 2, y, w, h, 12); else ctx.rect(-w / 2, y, w, h);
        ctx.fillStyle = col; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#eafff2'; ctx.stroke();
        ctx.font = 'bold ' + (locked ? 20 : 34) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff'; ctx.fillText(locked ? '固定' : 'OK', 0, y + h / 2 + 1);
        ctx.beginPath(); ctx.moveTo(-8, y + h); ctx.lineTo(8, y + h); ctx.lineTo(0, y + h + 10); ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
      });
    });
  }  function drawHitBoxes() {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.font = '20px sans-serif';
    Object.keys(cfg.slots).forEach(function (num) {
      var slot = cfg.slots[num];
      var hit = slot.hit;
      ctx.strokeStyle = slot.restricted ? '#ff5050' : '#50ff80';
      ctx.strokeRect(hit[0], hit[1], hit[2], hit[3]);

      // tireX / deckY 基準点
      ctx.fillStyle = '#ffdd50';
      ctx.beginPath();
      ctx.arc(slot.tireX, slot.deckY, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.fillText(num + '番', hit[0] + 4, hit[1] + 22);
    });
    ctx.restore();
  }

  function drawPinMarks() {
    ctx.save();
    ctx.fillStyle = '#50c8ff';
    ctx.font = '14px sans-serif';
    Object.keys(cfg.pinMarks).forEach(function (key) {
      var p = cfg.pinMarks[key];
      ctx.beginPath();
      ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(key, p[0] + 6, p[1] - 6);
    });
    ctx.restore();
  }
})();
