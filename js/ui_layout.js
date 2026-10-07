// 画面の作り(D8 A-3「必要な時だけ出す」)。HTMLの部品を動かしたり、押せる操作を目立たせる。ゲームの仕組みには触らない。
(function () {
  function $(id) { return document.getElementById(id); }
  var gs = window.GAME_STATE, fm = window.FLOOR_MECH;

  // ボタンの素材は、押した・押せない・選んだ時に初めて表示されるので、先に全部読み込んでおく(回線が遅いと、押した時に板が一瞬消えて見える)
  // CSSの url(...?v=) をそのまま読む(?v= 付きはサーバーが10分キャッシュする)
  (function () {
    var css = ''; Array.prototype.forEach.call(document.querySelectorAll('style'), function (s) { css += s.textContent; });
    var seen = {}; (css.match(/assets\/common\/ui\/[a-z0-9_]+\.png\?v=\d+/g) || []).forEach(function (u) { if (!seen[u]) { seen[u] = 1; var i = new Image(); i.src = u; } });
  })();

  // ミスの数は、上の情報欄(modeBar)の右端へ移す(確認用の toolbar は debug の時だけ出る)
  var mb = $('modeBar'), miss = $('missCount');
  if (mb && miss) { miss.style.marginLeft = ''; mb.appendChild(miss); }

  // 上の情報欄(modeBar)の高さを --mbh に入れる(ステージの固定部分が、その下に付くように)。回転・折り返しで高さが変わった時も追いかける
  (function () {
    var root = document.documentElement, last = -1;
    function setH() {
      var st = window.getComputedStyle(mb), h = mb && st.display !== 'none' && st.position === 'sticky' ? Math.round(mb.getBoundingClientRect().height) : 0;
      if (h !== last) { last = h; root.style.setProperty('--mbh', h + 'px'); }
    }
    if (mb) { setH(); if (window.ResizeObserver) new ResizeObserver(setH).observe(mb); window.addEventListener('resize', setH); setInterval(setH, 500); }
  })();

  // スイッチの説明文は、? を押した時だけ出す
  var h3 = document.querySelector('#floorPanel h3'), hint = $('swHint'), close = $('btnSwClose');
  if (h3 && hint) {
    var help = document.createElement('button');
    help.id = 'btnHelp'; help.type = 'button'; help.title = 'スイッチの使い方'; help.textContent = '?';
    h3.insertBefore(help, close);
    help.addEventListener('click', function () { hint.classList.toggle('show'); });
  }

  // 車の一覧は引き出し式: 普段は閉じて、取っ手(車の一覧・残り台数)だけ。車を呼ぶ時・積み終わった時に自動で開く
  var controls = $('controls'), deckAll = $('deckAll'), deckHard = $('deckHard');
  var drawer = document.createElement('div'); drawer.id = 'deckDrawer';
  var handle = document.createElement('button');
  handle.id = 'deckDrawerHandle'; handle.type = 'button';
  var hLabel = document.createElement('span'); hLabel.textContent = '車の一覧';
  var hCnt = document.createElement('span'); hCnt.className = 'cnt';
  handle.appendChild(hLabel); handle.appendChild(hCnt);
  if (controls && deckAll && deckHard) {
    controls.insertBefore(drawer, controls.firstChild);
    drawer.appendChild(deckAll); drawer.appendChild(deckHard);
    controls.insertBefore(handle, drawer);
    var open = false;
    function setOpen(v) { open = !!v; drawer.classList.toggle('open', open); handle.setAttribute('aria-expanded', open ? 'true' : 'false'); }
    handle.addEventListener('click', function () { setOpen(!open); });
    setOpen(true);   // 最初の車を呼ぶために開いておく
    var lastCar = null, lastDeck = null, lastLeft = -1;
    // 呼べる車が残っていて、今呼んでいる車がいない時は開く。車を呼んだら閉じる(自分で開け閉めした後は、次の変化まで変えない)
    setInterval(function () {
      if (!gs) return;
      var car = gs.car || null, deck = gs.deck || null;
      var left = deck ? deck.filter(function (d) { return d.status === 'wait'; }).length : 0;
      if (left !== lastLeft) { hCnt.textContent = left ? '残り' + left + '台' : (deck && deck.length ? '全て積み込み' : ''); lastLeft = left; }
      if (car !== lastCar || deck !== lastDeck) {
        if (car && !lastCar) setOpen(false);
        else if (!car && left) setOpen(true);
        lastCar = car; lastDeck = deck;
      }
    }, 200);
  }

  // 前進・後退の丸いボタンは、押している間、沈んだ絵にする(スマホでは :active が効かないことがあるため)
  [['btnLeft'], ['btnRight']].forEach(function (a) {
    var b = $(a[0]); if (!b) return;
    function on() { b.classList.add('down'); }
    function off() { b.classList.remove('down'); }
    b.addEventListener('mousedown', on); b.addEventListener('touchstart', on, { passive: true });
    ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(function (ev) { b.addEventListener(ev, off); });
  });

  // 今は押せない操作(ゲームが断る条件と同じ。fm.toggle* の中の判定): 灰色の板にする(押すと理由が出る)
  var btnBridge = $('btnBridge'), btnFlap = $('btnF2Flap');
  setInterval(function () {
    if (!fm || !gs) return;
    var car = gs.car, moving = !!(car && !car.seated && car.phase !== 'docked');
    var rid = car && car.route && car.route.id;
    if (btnRamp) btnRamp.classList.toggle('na', !!(fm.MECH.ramp && moving && !(car.phase === 'ready' && !(car.progress > 0))));   // 道板の上・作業中の車がいる
    if (btnBridge) btnBridge.classList.toggle('na', !!(fm.MECH.bridge && moving && rid === '4' && car.progress > 0));          // 4番へ向かう車が扇動板を渡る
    if (btnFlap) btnFlap.classList.toggle('na', !!(!fm.MECH.f2Flap && moving && car.dynamicPath && rid === 'U' && car.progress > 0));   // 1番へ向かう車が2番扇動板の上を通る
  }, 200);

  // 今やるべき操作(道板):車を積む前に道板を出す・積み終わったら道板をしまう → 緑(go)で目立たせる
  var btnRamp = $('btnRamp');
  setInterval(function () {
    if (!btnRamp || !fm || !gs) return;
    var waiting = gs.deck && gs.deck.some(function (d) { return d.status === 'wait'; });
    var done = false;
    try { done = window.GAME_MODE && window.GAME_MODE.cycleComplete && window.GAME_MODE.cycleComplete(); } catch (e) { }
    btnRamp.classList.toggle('go', (!fm.MECH.ramp && !!waiting) || (fm.MECH.ramp && !!done));
  }, 250);
})();
