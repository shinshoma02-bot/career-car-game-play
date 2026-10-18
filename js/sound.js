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
    if (a.state === 'suspended') { try { a.resume(); } catch (e) { } }
    return a.state === 'running' ? a : null;
  }
  function unlock() { if (on) ready(); }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, unlock, { passive: true }); });

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
    if (freq && L.osc) L.osc.frequency.setTargetAtTime(freq, now, 0.06);
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
    return { osc: o, gain: g, last: 0, stop: function () { o.stop(); if (s) s.stop(); } };
  }

  var lastScrape = 0, lastWarn = 0, lastClick = 0;
  window.SFX = {
    get enabled() { return on; },
    set enabled(v) { on = !!v; try { localStorage.setItem('sfx', on ? 'on' : 'off'); } catch (e) { } if (on) ready(); else Object.keys(loops).forEach(function (k) { try { loops[k].stop(); } catch (e) { } delete loops[k]; }); updateBtn(); },
    unlock: unlock,
    // ぶつかった: 重さ sev(0〜1)で、低い「ドン」・金属のきしみ・ガラス
    impact: function (sev, kind) {
      var a = ready(); if (!a) return; var t = a.currentTime; sev = Math.max(0, Math.min(1, sev || 0));
      tone(a, t, 0.16 + 0.3 * sev, 'sine', 140 - 40 * sev, 42, 0.35 + 0.5 * sev);
      noise(a, t, 0.1 + 0.2 * sev, 'lowpass', 500 + 400 * sev, 0.7, 0.3 + 0.4 * sev);
      if (sev > 0.08) { noise(a, t, 0.18 + 0.3 * sev, 'bandpass', 1500 + 600 * sev, 2.5, 0.16 + 0.3 * sev); tone(a, t + 0.01, 0.2 + 0.2 * sev, 'square', 320, 180, 0.04 + 0.12 * sev); }
      if (sev > 0.4 && kind !== 'side') noise(a, t + 0.03, 0.45, 'highpass', 5200, 1, 0.16 + 0.15 * sev);   // ガラス
    },
    // 擦れる(キーッ・ザザッ)
    scrape: function () {
      var now = performance.now(); if (now - lastScrape < 90) return; lastScrape = now;
      var a = ready(); if (!a) return; var t = a.currentTime, f = 2000 + Math.random() * 1500;
      noise(a, t, 0.13, 'bandpass', f, 5, 0.1);
      noise(a, t, 0.13, 'lowpass', 600, 0.7, 0.08);
    },
    // フロア・ジャッキを動かしている間の油圧のうなり(毎フレーム呼ぶ)
    hyd: function () { loop('hyd', function (a) { return makeLoop(a, 'sawtooth', 58, 420, 0.5); }, 0.1, 56 + Math.random() * 3); },
    // 車が走っている間のエンジンとタイヤ(毎フレーム呼ぶ。speed=px/秒)
    drive: function (speed) {
      if (!(speed > 8)) return; var k = Math.min(1, speed / 600);
      loop('drive', function (a) { return makeLoop(a, 'sawtooth', 60, 500, 0.35); }, 0.035 + 0.1 * k, 52 + 85 * k);
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
