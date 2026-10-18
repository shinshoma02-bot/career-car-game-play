// 効果音(2026-10-18 ユーザー指示「衝突・擦れ・フロアを動かす・トレーラーが入ってくる・車がフロアを上り下りする時等に音を付けたい」)
// 音の素材ファイルは使わず、Web Audio で作る(その場で合成)。window.SFX に、各場面の音の関数を出す。
//   impact(sev, kind) … ぶつかった(sev 0〜1。重いほど低く大きく、金属の割れ音・ガラスが加わる)
//   scrape()          … 擦れる(呼ぶたびに短い擦れ音。間引きあり)
//   hyd()             … フロア・ジャッキを動かしている間、毎フレーム呼ぶ(油圧のうなり。呼ばれなくなると止まる)
//   drive(speed)      … 車が走っている間、毎フレーム呼ぶ(エンジン+タイヤ。speed=px/秒。呼ばれなくなると止まる)
//   truckIn(sec)/truckOut(sec) … トレーラーが入ってくる(エンジンが下がり、エアブレーキ)/走り去る(エンジンが上がる)
//   click()/clank()/dock()/bump()/warn()/ok() … 操作・ストッパーに着く・乗り越え・できない・OK
// ブラウザは、画面を触るまで音を出せないので、最初のタップで有効にする。画面上の「音:ON/OFF」で切り替え(記憶する)。
(function () {
  var AC = null, master = null, noiseBuf = null, on = true;
  try { on = localStorage.getItem('sfx') !== 'off'; } catch (e) { }

  function ctx() {
    if (AC) return AC;
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { AC = new C(); } catch (e) { return null; }
    master = AC.createGain(); master.gain.value = 0.5; master.connect(AC.destination);
    var n = AC.sampleRate * 2, b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf = b;
    return AC;
  }
  function ready() {
    if (!on) return null;
    var a = ctx();
    if (!a) return null;
    if (a.state !== 'running') { try { a.resume(); } catch (e) { } }
    return a.state === 'running' ? a : null;   // 有効になる前の音は鳴らさない(iOS は 'interrupted' の時もあるので、毎回 resume を試す)
  }
  // iPhone/iPad対策(2026-10-18 スマホで鳴らなかった): ①iOS は、タップを離した時(touchend/click)でないと音を有効にできない。②マナーモード(消音スイッチ)だと、Web Audio は消される。
  //   「再生」扱いの音(audio要素・navigator.audioSession)にすると、消音スイッチの影響を受けずに鳴る。
  var silentEl = null;
  function unlock() {
    if (!on) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { }
    var a = ctx();
    if (!a) return;
    if (a.state !== 'running') { try { a.resume(); } catch (e) { } }
    try {   // 無音の短い音を鳴らして、音声を有効にする(iOS)
      var b = a.createBuffer(1, 1, 22050), s = a.createBufferSource(); s.buffer = b; s.connect(a.destination); s.start(0);
    } catch (e) { }
    if (!silentEl) {   // 無音の audio 要素を再生し続けて、消音スイッチを越える
      try {
        silentEl = document.createElement('audio'); silentEl.loop = true; silentEl.setAttribute('playsinline', ''); silentEl.preload = 'auto';
        silentEl.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
        var pr = silentEl.play(); if (pr && pr.catch) pr.catch(function () { silentEl = null; });
      } catch (e) { silentEl = null; }
    }
  }
  ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown'].forEach(function (ev) { document.addEventListener(ev, unlock, { passive: true }); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && AC && AC.state !== 'running') { try { AC.resume(); } catch (e) { } } });

  // 雑音(ノイズ)を、フィルタと音量の包みを通して鳴らす
  function noise(a, t, dur, type, f, q, gain, fEnd) {
    var s = a.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    var fl = a.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q || 0.7;
    if (fEnd) fl.frequency.exponentialRampToValueAtTime(Math.max(20, fEnd), t + dur);
    var g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + Math.min(0.01, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  function tone(a, t, dur, type, f, fEnd, gain) {
    var o = a.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (fEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, fEnd), t + dur);
    var g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }

  // 鳴らし続ける音(油圧・エンジン): 毎フレーム呼ばれている間だけ鳴る。呼ばれなくなると、少しして消える
  var loops = {};
  function loop(name, make, vol, freq) {
    var a = ready(); if (!a) return;
    var L = loops[name], now = a.currentTime;
    if (!L) {
      L = loops[name] = make(a); L.gain.gain.setValueAtTime(0.0001, now);
    }
    L.last = performance.now();
    L.gain.gain.setTargetAtTime(vol, now, 0.05);
    if (freq && L.setFreq) L.setFreq(freq, now);
  }
  setInterval(function () {
    var now = performance.now();
    Object.keys(loops).forEach(function (k) {
      var L = loops[k];
      if (now - L.last > 220 && AC) {
        L.gain.gain.setTargetAtTime(0.0001, AC.currentTime, 0.06);
        if (now - L.last > 700) { try { L.stop(); } catch (e) { } delete loops[k]; }
      }
    });
  }, 100);
  function makeLoop(a, type, f, lpf, noiseGain) {
    var o = a.createOscillator(); o.type = type; o.frequency.value = f;
    var lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lpf;
    var g = a.createGain(); g.gain.value = 0.0001;
    o.connect(lp); lp.connect(g); g.connect(master); o.start();
    var s = null;
    if (noiseGain) {
      s = a.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      var nf = a.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 700; nf.Q.value = 0.8;
      var ng = a.createGain(); ng.gain.value = noiseGain;
      s.connect(nf); nf.connect(ng); ng.connect(g); s.start();
    }
    return { osc: o, gain: g, last: 0, setFreq: function (f, now) { o.frequency.setTargetAtTime(f, now, 0.06); }, stop: function () { o.stop(); if (s) s.stop(); } };
  }
  // 油圧シリンダーの「ウィーーン」: 滑らかな高めのうなり(ポンプ)+低いモーターの唸り+かすかな空気の音。始まりで少し音程が上がる
  function makeWhine(a) {
    var g = a.createGain(); g.gain.value = 0.0001;
    var lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
    var o1 = a.createOscillator(); o1.type = 'sine'; o1.frequency.value = 300;
    var o2 = a.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 600;
    var g2 = a.createGain(); g2.gain.value = 0.35;
    var o3 = a.createOscillator(); o3.type = 'sine'; o3.frequency.value = 62;   // モーターの低い唸り
    var g3 = a.createGain(); g3.gain.value = 0.7;
    var lfo = a.createOscillator(); lfo.frequency.value = 6; var lg = a.createGain(); lg.gain.value = 9;   // ごくわずかなゆらぎ
    lfo.connect(lg); lg.connect(o1.frequency);
    o1.connect(lp); o2.connect(g2); g2.connect(lp); o3.connect(g3); g3.connect(lp); lp.connect(g); g.connect(master);
    var ns = a.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true;
    var nf = a.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2400; nf.Q.value = 1.2; var ng = a.createGain(); ng.gain.value = 0.05;
    ns.connect(nf); nf.connect(ng); ng.connect(g);
    var t0 = a.currentTime; o1.frequency.setValueAtTime(240, t0); o1.frequency.exponentialRampToValueAtTime(330, t0 + 0.35); o2.frequency.setValueAtTime(480, t0); o2.frequency.exponentialRampToValueAtTime(660, t0 + 0.35);
    o1.start(); o2.start(); o3.start(); lfo.start(); ns.start();
    return { gain: g, last: 0, stop: function () { o1.stop(); o2.stop(); o3.stop(); lfo.stop(); ns.stop(); } };
  }
  // 乗用車の走行音: 低くこもったエンジンの響き+タイヤが路面を転がる音(うるさくしない)
  function makeRumble(a) {
    var g = a.createGain(); g.gain.value = 0.0001;
    var lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
    var o = a.createOscillator(); o.type = 'triangle'; o.frequency.value = 40;
    var o2 = a.createOscillator(); o2.type = 'sine'; o2.frequency.value = 80; var g2 = a.createGain(); g2.gain.value = 0.5;
    o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g);
    var ns = a.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true;
    var nf = a.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 380; var ng = a.createGain(); ng.gain.value = 0.9;
    ns.connect(nf); nf.connect(ng); ng.connect(g); g.connect(master);
    o.start(); o2.start(); ns.start();
    return { gain: g, last: 0, setFreq: function (f, now) { o.frequency.setTargetAtTime(f, now, 0.1); o2.frequency.setTargetAtTime(f * 2, now, 0.1); }, stop: function () { o.stop(); o2.stop(); ns.stop(); } };
  }

  var lastScrape = 0, lastWarn = 0, lastClick = 0;
  window.SFX = {
    get enabled() { return on; },
    set enabled(v) { on = !!v; try { localStorage.setItem('sfx', on ? 'on' : 'off'); } catch (e) { } if (on) ready(); else Object.keys(loops).forEach(function (k) { try { loops[k].stop(); } catch (e) { } delete loops[k]; }); updateBtn(); },
    unlock: unlock,
    // ぶつかった: 重さ sev(0〜1)。①車体の「ドン」(低い胴鳴り)②パネルの「ベコッ」(中音のこもった衝撃)③金属・樹脂が割れる「バキッ」(間隔をずらした短い破裂音を重ねる)
    //  ④パネルが震える余韻(ずれた高さの金属音)⑤強い時は、ガラスの破片が落ちる「チリチリ」と部品が転がる音
    impact: function (sev, kind) {
      var a = ready(); if (!a) return; var t = a.currentTime; sev = Math.max(0, Math.min(1, sev || 0));
      var R = Math.random;
      tone(a, t, 0.22 + 0.35 * sev, 'sine', 120 - 35 * sev, 38, 0.3 + 0.45 * sev);   // ドン
      noise(a, t, 0.1 + 0.18 * sev, 'lowpass', 260 + 200 * sev, 0.8, 0.35 + 0.45 * sev, 90);   // 胴鳴り
      noise(a, t, 0.05 + 0.06 * sev, 'bandpass', 900 + 500 * sev, 1.2, 0.2 + 0.3 * sev);   // ベコッ
      if (sev > 0.06) {
        var n = 2 + Math.round(4 * sev);   // バキッ(短い破裂を、少しずつずらして)
        for (var i = 0; i < n; i++) noise(a, t + i * (0.012 + 0.02 * R()), 0.03 + 0.05 * R(), 'bandpass', 1200 + 2600 * R(), 3 + 3 * R(), (0.12 + 0.28 * sev) * (1 - i / (n + 1)));
        var f0 = 380 + 300 * R();   // 余韻: 金属のパネルが震える(割り切れない比の音を重ねる)
        [1, 1.58, 2.31, 3.12].forEach(function (m, k) { tone(a, t + 0.012, 0.16 + 0.34 * sev - 0.03 * k, 'triangle', f0 * m, f0 * m * 0.97, (0.05 + 0.1 * sev) / (k + 1)); });
      }
      if (sev > 0.35) {
        noise(a, t + 0.02, 0.35, 'highpass', 4800, 0.8, 0.1 + 0.12 * sev);
        if (kind !== 'side') for (var g = 0; g < 4 + Math.round(6 * sev); g++) tone(a, t + 0.04 + 0.5 * R(), 0.05 + 0.05 * R(), 'sine', 3000 + 5000 * R(), 0, 0.03 + 0.05 * R());   // ガラスの破片
        for (var d = 0; d < 3; d++) noise(a, t + 0.15 + 0.4 * R(), 0.04, 'lowpass', 700 + 500 * R(), 1, 0.12 * sev);   // 部品が転がって落ちる
      }
    },
    // 擦れる(キーッ・ザザッ)
    scrape: function () {
      var now = performance.now(); if (now - lastScrape < 90) return; lastScrape = now;
      var a = ready(); if (!a) return; var t = a.currentTime, f = 2000 + Math.random() * 1500;
      noise(a, t, 0.13, 'bandpass', f, 5, 0.1);
      noise(a, t, 0.13, 'lowpass', 600, 0.7, 0.08);
    },
    // フロア・ジャッキを動かしている間の油圧のうなり(毎フレーム呼ぶ)
    hyd: function () { loop('hyd', function (a) { return makeWhine(a); }, 0.075, 0); },
    // 車が走っている間の、低いエンジンの響きとタイヤの音(毎フレーム呼ぶ。speed=px/秒)。うるさくしない
    drive: function (speed) {
      if (!(speed > 8)) return; var k = Math.min(1, speed / 600);
      loop('drive', function (a) { return makeRumble(a); }, 0.03 + 0.05 * k, 36 + 30 * k);
    },
    // トレーラーが入ってくる: 太いエンジン音が下がっていき、止まる時にエアブレーキの「プシュー」
    truckIn: function (sec) {
      var a = ready(); if (!a) return; var t = a.currentTime;
      tone(a, t, sec, 'sawtooth', 120, 48, 0.07);
      noise(a, t, sec, 'lowpass', 500, 0.8, 0.25, 160);
      noise(a, t + sec - 0.05, 0.7, 'highpass', 3000, 0.8, 0.22, 1500);
      tone(a, t + sec - 0.05, 0.12, 'sine', 90, 50, 0.3);
    },
    // トレーラーが走り去る: エアが抜けて、エンジンが上がっていく
    truckOut: function (sec) {
      var a = ready(); if (!a) return; var t = a.currentTime;
      noise(a, t, 0.45, 'highpass', 3000, 0.8, 0.2, 1800);
      tone(a, t + 0.35, sec - 0.2, 'sawtooth', 48, 150, 0.08);
      noise(a, t + 0.35, sec - 0.2, 'lowpass', 220, 0.8, 0.22, 700);
    },
    click: function () { var now = performance.now(); if (now - lastClick < 40) return; lastClick = now; var a = ready(); if (!a) return; var t = a.currentTime; tone(a, t, 0.05, 'square', 900, 380, 0.1); noise(a, t, 0.03, 'highpass', 3000, 1, 0.1); },
    clank: function () { var a = ready(); if (!a) return; var t = a.currentTime; tone(a, t, 0.28, 'triangle', 240, 200, 0.18); tone(a, t, 0.22, 'triangle', 377, 320, 0.1); noise(a, t, 0.08, 'bandpass', 3200, 2, 0.15); },
    // 輪止め・タイヤストッパに着いた「コツン」+ OK
    dock: function () { var a = ready(); if (!a) return; var t = a.currentTime; tone(a, t, 0.12, 'sine', 160, 70, 0.4); noise(a, t, 0.05, 'lowpass', 900, 0.8, 0.25); },
    ok: function () { var a = ready(); if (!a) return; var t = a.currentTime; tone(a, t + 0.08, 0.12, 'sine', 660, 0, 0.1); tone(a, t + 0.2, 0.2, 'sine', 880, 0, 0.1); },
    // 輪止めや穴を乗り越えた「ガタン」
    bump: function () { var a = ready(); if (!a) return; var t = a.currentTime; tone(a, t, 0.14, 'sine', 120, 50, 0.3); noise(a, t, 0.08, 'lowpass', 700, 0.7, 0.2); },
    // 動かせない・できない(低いブザー。間引き)
    warn: function () { var now = performance.now(); if (now - lastWarn < 400) return; lastWarn = now; var a = ready(); if (!a) return; var t = a.currentTime; tone(a, t, 0.14, 'square', 150, 110, 0.07); }
  };

  // 画面上の「音:ON/OFF」(モードバーの右端)
  var btn = null;
  function updateBtn() { if (btn) btn.textContent = on ? '音:ON' : '音:OFF'; }
  function addBtn() {
    var bar = document.getElementById('modeBar');
    if (!bar || btn) return;
    btn = document.createElement('button');
    btn.id = 'btnSfx'; btn.type = 'button'; btn.title = '効果音のON/OFF';
    btn.addEventListener('click', function (e) { e.stopPropagation(); window.SFX.enabled = !on; if (on) window.SFX.click(); });
    updateBtn();
    bar.appendChild(btn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addBtn); else addBtn();
})();
