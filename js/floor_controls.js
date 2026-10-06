// フロア機構の操作画面。トレーラーについている実物のスイッチ(素材)と同じものを、手元用に大きく表示する。
// トレーラー上のスイッチ(の周り)をタップすると、そのスイッチのグループの操作盤が出る(game.js → SWITCH_UI.open)。
// 操作中は、トレーラー上の同じスイッチも押した絵になり、ランプも連動する(main.jsのdrawSwitchesがfm.pressInfo()・ロック状態を見て描く)。
(function () {
  var fm = window.FLOOR_MECH;
  var statusEl = document.getElementById('floorStatus');
  var lastMsg = null, lastMsgTimer = null;

  window.FLOOR_MECH_NOTIFY = function (msg, kind) {
    lastMsg = msg;
    statusEl.textContent = msg;
    statusEl.style.color = kind === 'warn' ? '#ff8080' : '#9c9';
    clearTimeout(lastMsgTimer);
    lastMsgTimer = setTimeout(function () {
      lastMsg = null;
      refreshStatusLine();
    }, 1800);
  };

  function refreshStatusLine() {
    var msgs = [];
    if (!fm.atTravel('F1')) msgs.push('1番 調整中');
    if (!fm.atTravel('F2')) msgs.push('2番 調整中');
    if (!fm.atTravel('F3')) msgs.push('3番 調整中');
    if (fm.f1Connected() && fm.upperConnected()) msgs.push('1番↔2番つながり');
    if (fm.upperConnected()) msgs.push('3番↔下段(道板)つながり');
    if (!fm.MECH.ramp) msgs.push('道板 格納中(積み込み前に出す)');
    if (fm.MECH.bridge) msgs.push('4番↔5番(扇動板)つながり');
    if (fm.MECH.f2Flap) msgs.push('2番扇動板 開(1番へは通れない)');
    if (fm.tireOffGround()) msgs.push('台車タイヤ浮いています');
    statusEl.textContent = msgs.length ? msgs.join(' / ') : '全て走行位置';
    statusEl.style.color = fm.upperConnected() ? '#8f8' : (msgs.length ? '#ffd080' : '#9c9');
  }

  // ---- 機構のボタン(道板・扇動板・ストッパー)は常に表示 ----
  var btnStopper = document.getElementById('btnStopper');
  var btnBridge = document.getElementById('btnBridge');
  btnStopper.addEventListener('click', function () { fm.toggleStopper(); renderMechButtons(); });
  btnBridge.addEventListener('click', function () { fm.toggleBridge(); renderMechButtons(); });
  var btnRamp = document.getElementById('btnRamp');
  btnRamp.addEventListener('click', function () { fm.toggleRamp(); renderMechButtons(); });
  var btnF2Flap = document.getElementById('btnF2Flap');
  btnF2Flap.addEventListener('click', function () { fm.toggleF2Flap(); renderMechButtons(); });
  function renderMechButtons() {
    btnStopper.textContent = fm.MECH.stopper ? '5番ストッパーを外す' : '5番ストッパーを掛ける';
    btnStopper.classList.toggle('on', fm.MECH.stopper);
    btnBridge.textContent = fm.MECH.bridge ? '扇動板を格納' : '扇動板を搬出';
    btnBridge.classList.toggle('on', fm.MECH.bridge);
    btnRamp.textContent = fm.MECH.ramp ? '道板をしまう' : '道板を出す';
    btnRamp.classList.toggle('on', fm.MECH.ramp);
    btnF2Flap.textContent = fm.MECH.f2Flap ? '2番扇動板を閉じる' : '2番扇動板を開く(4番の長い車用)';
    btnF2Flap.classList.toggle('on', fm.MECH.f2Flap);
  }

  // ---- スイッチ操作盤 ----
  var SWD = 'assets/common/switches/', V = '?v=3';
  // グループ(トレーラー上のスイッチの固まり)ごとに、載せるスイッチ。end=棚の端 / jack=アウトリガー / tire=6ボタンとランプ盤
  var GROUPS = {
    front: { title: '前側のスイッチ(1番・2番)', items: [{ label: '1番 前', end: 'F1f' }, { label: '1番 後', end: 'F1r' }, { label: '2番 前', end: 'F2f' }] },
    rear: { title: '後ろ側のスイッチ(3番・宙段)', items: [{ label: '3番 前(継ぎ目)', end: 'MID' }, { label: '3番 後', end: 'F3r' }, { label: '宙段', end: 'F7' }, { label: '宙段 後ろの柱', rearPin: true }] },
    // アウトリガーとタイヤの突出(6ボタン・ランプ盤)は、一緒に操作する(タイヤを張り出す・戻す時にジャッキも使うため)
    tire: { title: 'アウトリガーとタイヤ操作盤', tire: true, items: [{ label: 'アウトリガー', jack: true }] }
  };
  var swPanel = document.getElementById('swPanel'), floorTitle = document.getElementById('floorTitle'), swHint = document.getElementById('swHint');
  var current = null, tireLamps = null;
  var PEND2 = 1.5, SIX = 1.25;  // 手元用の拡大率(素材は等倍で表示すると小さいので、拡大して見やすく)

  function box(w, h, sc) { var d = document.createElement('div'); d.style.cssText = 'position:relative;width:' + w * sc + 'px;height:' + h * sc + 'px;flex:none;'; return d; }
  function img(name, cx, cy, w, h, piv, sc) {
    var i = document.createElement('img');
    i.src = SWD + name + '.png' + V; i.draggable = false;
    var retry = 0; i.onerror = function () { if (retry < 4) { retry++; setTimeout(function () { i.src = SWD + name + '.png' + V + '&r=' + retry; }, 400 * retry); } };
    i.style.cssText = 'position:absolute;width:' + w * sc + 'px;height:' + h * sc + 'px;left:' + (cx - piv[0]) * sc + 'px;top:' + (cy - piv[1]) * sc + 'px;user-select:none;-webkit-user-drag:none;image-rendering:auto;';
    return i;
  }
  // 押している間だけ押した絵にして、押した瞬間にdown()・離したらup()を呼ぶキャップ
  function pressable(el, name, down, up) {
    el.style.cursor = 'pointer';
    var on = false;
    function d(e) { e.preventDefault(); if (on) return; on = true; el.src = SWD + name + '_pressed.png' + V; down(); }
    function u() { if (!on) return; on = false; el.src = SWD + name + '.png' + V; up(); }
    el.addEventListener('mousedown', d); el.addEventListener('touchstart', d, { passive: false });
    ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(function (ev) { el.addEventListener(ev, u); });
  }

  // 2ボタン押ボタン(上・下)。押している間、その棚(ジャッキ・宙段)が動く
  // 後ろの柱のセットピン(内側パイプの穴に差す。番号が大きいほど縮み幅が小さい)
  function rearPinCard(item) {
    var card = document.createElement('div'); card.className = 'swCard';
    var lab = document.createElement('div'); lab.className = 'swLabel'; lab.textContent = item.label; card.appendChild(lab);
    var row = document.createElement('div'); row.className = 'pinRow';
    var m = document.createElement('button'); m.className = 'pinStep'; m.textContent = '−';
    var p = document.createElement('button'); p.className = 'pinBtn on'; p.id = 'rearPinLabel';
    var pl = document.createElement('button'); pl.className = 'pinStep'; pl.textContent = '＋';
    m.addEventListener('click', function () { fm.setRearPinHole(fm.rearPin.hole - 1); renderRearPin(); });
    pl.addEventListener('click', function () { fm.setRearPinHole(fm.rearPin.hole + 1); renderRearPin(); });
    row.appendChild(m); row.appendChild(p); row.appendChild(pl); card.appendChild(row);
    var note = document.createElement('div'); note.style.cssText = 'font-size:12px;color:#aab;line-height:1.5;margin-top:6px;max-width:150px;';
    note.textContent = '1番=一番縮む。番号が大きいほど縮み幅が小さい(宙段が格納位置の時だけ変更可)'; card.appendChild(note);
    return card;
  }
  function renderRearPin() {
    var b = document.getElementById('rearPinLabel');
    if (b) b.textContent = 'ピン' + fm.rearPin.hole + '/' + fm.rearPinHoles;
  }
  // フレーム側の固定ピン(赤い板): 位置を前後5段階で変える・抜き差し。刺してあると、上げた宙段のフロアがピンに当たって止まる
  function stopPinCard(item) {
    var card = document.createElement('div'); card.className = 'swCard';
    var lab = document.createElement('div'); lab.className = 'swLabel'; lab.textContent = item.label; card.appendChild(lab);
    var row = document.createElement('div'); row.className = 'pinRow';
    var m = document.createElement('button'); m.className = 'pinStep'; m.textContent = '−';
    var p = document.createElement('button'); p.className = 'pinBtn'; p.id = 'stopPinLabel';
    var pl = document.createElement('button'); pl.className = 'pinStep'; pl.textContent = '＋';
    m.addEventListener('click', function () { fm.setStopPinHole(fm.stopPin.hole - 1); renderStopPin(); });
    pl.addEventListener('click', function () { fm.setStopPinHole(fm.stopPin.hole + 1); renderStopPin(); });
    p.addEventListener('click', function () { fm.toggleStopPin(); renderStopPin(); });
    row.appendChild(m); row.appendChild(p); row.appendChild(pl); card.appendChild(row);
    var note = document.createElement('div'); note.style.cssText = 'font-size:12px;color:#aab;line-height:1.5;margin-top:6px;max-width:150px;';
    note.textContent = '−/＋で位置(前→後ろ)。ピンの位置で宙段の止まる高さが変わる。中央のボタンで抜く/刺す(位置の変更はスロープより下げてから)'; card.appendChild(note);
    return card;
  }
  function renderStopPin() {
    var b = document.getElementById('stopPinLabel');
    if (!b) return;
    b.textContent = (fm.stopPin.inserted ? '抜く' : '刺す') + '(' + fm.stopPin.hole + '/' + fm.stopPinHoles + ')';
    b.classList.toggle('on', fm.stopPin.inserted);
  }
  function pendant2Card(item) {
    if (item.rearPin) return rearPinCard(item);
    if (item.stopPin) return stopPinCard(item);
    var card = document.createElement('div');
    card.className = 'swCard';
    var lab = document.createElement('div'); lab.className = 'swLabel'; lab.textContent = item.label; card.appendChild(lab);
    var b = box(44, 105, PEND2); b.appendChild(img('sw_pendant2', 0, 0, 44, 105, [0, 0], PEND2));
    function startHold(dir) { if (item.jack) fm.jackHoldStart(dir); else fm.holdStart(item.end, dir); }
    function stopHold() { if (item.jack) fm.jackHoldStop(); else fm.holdStop(); }
    // 上=▲(-1。棚は上がる)/ 下=▼(+1)。アウトリガーは 下=脚を伸ばす(+1)・上=縮める(-1)
    var up = img('btn_cap_ue_big', 22, 26, 18, 18, [9, 9], PEND2), down = img('btn_cap_shita_big', 22, 44, 18, 18, [9, 9], PEND2);
    pressable(up, 'btn_cap_ue_big', function () { startHold(-1); }, stopHold);
    pressable(down, 'btn_cap_shita_big', function () { startHold(1); }, stopHold);
    b.appendChild(up); b.appendChild(down);
    card.appendChild(b);
    if (item.end === 'F7') {   // 宙段: セットピンは廃止。真ん中のボタンはフレーム側の固定ピン(赤い板)の抜き差し、−/＋はその位置(前→後ろ5段階)
      var row7 = document.createElement('div'); row7.className = 'pinRow';
      var m7 = document.createElement('button'); m7.className = 'pinStep'; m7.textContent = '−';
      var p7 = document.createElement('button'); p7.className = 'pinBtn'; p7.id = 'stopPinLabel';
      var pl7 = document.createElement('button'); pl7.className = 'pinStep'; pl7.textContent = '＋';
      m7.addEventListener('click', function () { fm.setStopPinHole(fm.stopPin.hole - 1); renderStopPin(); });
      pl7.addEventListener('click', function () { fm.setStopPinHole(fm.stopPin.hole + 1); renderStopPin(); });
      p7.addEventListener('click', function () { fm.toggleStopPin(); renderStopPin(); });
      row7.appendChild(m7); row7.appendChild(p7); row7.appendChild(pl7);
      card.appendChild(row7);
    } else if (item.end) {
      var row = document.createElement('div'); row.className = 'pinRow';
      var m = document.createElement('button'); m.className = 'pinStep'; m.dataset.pin = item.end; m.dataset.d = '-1'; m.textContent = '−';
      var p = document.createElement('button'); p.className = 'pinBtn'; p.dataset.pin = item.end; p.textContent = 'ピン';
      var pl = document.createElement('button'); pl.className = 'pinStep'; pl.dataset.pin = item.end; pl.dataset.d = '1'; pl.textContent = '＋';
      m.addEventListener('click', function () { fm.stepPinTarget(item.end, -1); renderPinButtons(); });
      pl.addEventListener('click', function () { fm.stepPinTarget(item.end, 1); renderPinButtons(); });
      p.addEventListener('click', function () { fm.togglePin(item.end); renderPinButtons(); });
      row.appendChild(m); row.appendChild(p); row.appendChild(pl);
      card.appendChild(row);
    }
    return card;
  }

  // タイヤ操作盤: 表示ランプ盤(作業/右ロック/左ロック)+6ボタン(伸/縮/右押/右引/左押/左引)
  function tireCard() {
    var wrap = document.createElement('div');
    wrap.className = 'swCard tire';
    var lampBox = box(38, 108, SIX); lampBox.appendChild(img('lamp_panel_lock', 0, 0, 38, 108, [0, 0], SIX));
    tireLamps = [['lamp_red', 16, 16], ['lamp_green', 16, 48], ['lamp_green', 16, 80]].map(function (l) {
      var i = img(l[0] + '_off', l[1], l[2], 18, 18, [9, 9], SIX); i.dataset.on = l[0]; lampBox.appendChild(i); return i;
    });
    var pend = box(54, 211, SIX); pend.appendChild(img('sw_pendant6', 0, 0, 54, 211, [0, 0], SIX));
    var caps = [['nobi', function () { fm.moveTire('out'); }], ['chiji', function () { fm.moveTire('in'); }], ['migi_oshi', function () { fm.setLock('R', true); }], ['migi_hiki', function () { fm.setLock('R', false); }], ['hidari_oshi', function () { fm.setLock('L', true); }], ['hidari_hiki', function () { fm.setLock('L', false); }]];
    caps.forEach(function (c, k) {
      var el = img('btn_cap6_' + c[0] + '_big', 27, 28 + 24 * k, 22, 22, [11, 11], SIX);
      pressable(el, 'btn_cap6_' + c[0] + '_big', function () { fm.MECH.press6 = k; c[1](); }, function () { fm.MECH.press6 = -1; });
      pend.appendChild(el);
    });
    var row = document.createElement('div'); row.style.cssText = 'display:flex;gap:16px;align-items:flex-start;';
    row.appendChild(lampBox); row.appendChild(pend);
    var cap = document.createElement('div');
    cap.style.cssText = 'font-size:12px;color:#aab;line-height:1.7;max-width:240px;';
    cap.innerHTML = '<b>タイヤの突出・格納</b><br>① ジャッキを伸ばす(アウトリガー)<br>② 右引・左引でロック解除<br>③ 伸(突出)/縮(格納)<br>④ 右押・左押でロック<br>⑤ ジャッキを縮める<br><br>ランプ: 作業=解除済みでタイヤが浮いている / 右・左ロック=ロック中';
    cap.style.maxWidth = 'none'; cap.style.margin = '8px 0 0';
    wrap.help = cap;   // 説明文は、アウトリガーと横に並べるため、カードの外(パネルの下)に出す
    wrap.appendChild(row);
    return wrap;
  }

  function open(id) {
    var g = GROUPS[id];
    if (!g) return;
    current = id;
    swPanel.innerHTML = '';
    tireLamps = null;
    floorTitle.textContent = g.title;
    swHint.style.display = 'none';
    var cards = document.createElement('div'); cards.className = 'swCards';
    g.items.forEach(function (it) { cards.appendChild(pendant2Card(it)); });
    var tc = null;
    if (g.tire) { tc = tireCard(); cards.appendChild(tc); }
    swPanel.appendChild(cards);
    if (tc && tc.help) swPanel.appendChild(tc.help);
    renderPinButtons(); renderRearPin(); renderStopPin();
    swPanel.scrollIntoView({ block: 'nearest' });
  }
  function close() {
    current = null; tireLamps = null;
    swPanel.innerHTML = '';
    floorTitle.textContent = 'スイッチ操作';
    swHint.style.display = '';
  }
  document.getElementById('btnSwClose').addEventListener('click', close);
  window.SWITCH_UI = { open: open, close: close, get current() { return current; } };

  function renderPinButtons() {
    document.querySelectorAll('#swPanel .pinBtn[data-pin]').forEach(function (btn) {
      var k = btn.dataset.pin;
      var on = fm.PINS[k] !== null;
      btn.textContent = on ? ('抜く(' + fm.holeNo(k, fm.PINS[k]) + ')') : ('ピン' + fm.pinTarget(k));
      btn.classList.toggle('on', on);
    });
  }
  function updateTirePanel() {
    if (!tireLamps) return;
    var on = [fm.workReady(), fm.MECH.lockR, fm.MECH.lockL];
    tireLamps.forEach(function (el, i) {
      var name = el.dataset.on + (on[i] ? '' : '_off');
      if (el.dataset.cur !== name) { el.dataset.cur = name; el.src = SWD + name + '.png' + V; }
    });
  }

  function tick() {
    if (current) { renderPinButtons(); updateTirePanel(); renderStopPin(); }
    renderMechButtons();
    if (!lastMsg) refreshStatusLine();
    requestAnimationFrame(tick);
  }
  renderMechButtons();
  refreshStatusLine();
  requestAnimationFrame(tick);
})();
