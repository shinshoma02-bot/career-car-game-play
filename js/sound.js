// 効果音(2026-10-18 ユーザー指示「衝突・擦れ・フロアを動かす・トレーラーが入ってくる・車がフロアを上り下りする時等に音を付けたい」)
// 音の素材ファイルは使わず、Web Audio で作る(その場で合成)。window.SFX に、各場面の音の関数を出す。
//   impact(sev, kind) … ぶつかった(sev 0〜1。重いほど低く大きく、金属の割れ音・ガラスが加わる)
//   scrape()          … 擦れる(呼ぶたびに短い擦れ音。間引きあり)
//   hyd()             … フロア・ジャッキを動かしている間、毎フレーム呼ぶ(油圧のうなり。呼ばれなくなると止まる)
//   drive(speed)      … 車が走っている間、毎フレーム呼ぶ(エンジン+タイヤ。speed=px/秒。呼ばれなくなると止まる)
//   truckIn(sec)/truckOut(sec) … トレーラーが入ってくる(エンジンが下がり、エアブレーキ)/走り去る(エンジンが上がる)
//   click()/clank()/dock()/bump()/warn()/ok() … 操作・ストッパーに着く・乗り越え・できない・OK
//   bgm(scene)        … BGM を切り替える('title' | 'play' | 'result' | 'off')。同じ場面を呼び直しても、続きから鳴る
//   ramp()/ratchet()/airBrake()/engineStart() … 道板・板の動き / ワイヤー荷締め機の「カチカチ」/ エアブレーキ / エンジン始動(2026-10-18 追加。呼ぶ場所は SOUND_MEMO.md の A番号)
// ブラウザは、画面を触るまで音を出せないので、最初のタップで有効にする。画面上の「音:ON/OFF」で切り替え(記憶する)。
(function () {
  if (window.SFX) return;   // 二重に読み込まれても、1回だけ動く
  var AC = null, master = null, sfxOut = null, musicOut = null, noiseBuf = null, on = true;
  var vol = { bgm: 100, se: 100 };   // 音量(0〜100%)。BGM と SE を別々に調節する。画面の「音設定」で変える
  try { on = localStorage.getItem('sfx') !== 'off'; } catch (e) { }
  try {
    var vb = parseInt(localStorage.getItem('volBgm'), 10), vs = parseInt(localStorage.getItem('volSe'), 10);
    if (vb >= 0 && vb <= 100) vol.bgm = vb; if (vs >= 0 && vs <= 100) vol.se = vs;
  } catch (e) { }

  function ctx() {
    if (AC) return AC;
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { AC = new C(); } catch (e) { return null; }
    master = AC.createGain(); master.gain.value = 0.5; master.connect(AC.destination);
    sfxOut = AC.createGain(); sfxOut.connect(master);      // SE(効果音)の出口
    musicOut = AC.createGain(); musicOut.connect(master);  // BGM(音楽)の出口
    applyVol();
    var n = AC.sampleRate * 2, b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf = b;
    setTimeout(loadSamples, 0);
    if (AC.state !== 'running') { if (document.body) showTapHint(); else document.addEventListener('DOMContentLoaded', showTapHint); }
    return AC;
  }
  // 音は、画面に触るまで出せない(ブラウザの決まり)。音が出ない間だけ、下に案内を出す
  function showTapHint() {
    if (!on || document.getElementById('sfxTapHint')) return;
    var d = document.createElement('div'); d.id = 'sfxTapHint'; d.textContent = '画面をタップすると音が出ます';
    d.style.cssText = 'position:fixed;left:50%;bottom:44px;transform:translateX(-50%);z-index:9;background:rgba(0,0,0,.6);color:#fff;font:13px/1.4 sans-serif;padding:6px 12px;border-radius:14px;pointer-events:none';
    document.body.appendChild(d);
  }
  function hideTapHint() { var d = document.getElementById('sfxTapHint'); if (d) d.parentNode.removeChild(d); }
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
    if (a.state === 'running') hideTapHint(); else a.resume().then(function () { if (a.state === 'running') hideTapHint(); }, function () { });
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
    bgmEnsure();
  }
  ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown'].forEach(function (ev) { document.addEventListener(ev, unlock, { passive: true }); });
  // ページを開いた時に、音の仕組みを作っておく(まだ鳴らない。効果音の読み込みを先に始めて、タップ前に案内を出すため)
  document.addEventListener('DOMContentLoaded', function () { ctx(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && AC && AC.state !== 'running') { try { AC.resume(); } catch (e) { } } });

  // 雑音(ノイズ)を、フィルタと音量の包みを通して鳴らす
  function noise(a, t, dur, type, f, q, gain, fEnd) {
    var s = a.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    var fl = a.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q || 0.7;
    if (fEnd) fl.frequency.exponentialRampToValueAtTime(Math.max(20, fEnd), t + dur);
    var g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + Math.min(0.01, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(sfxOut); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  function tone(a, t, dur, type, f, fEnd, gain) {
    var o = a.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (fEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, fEnd), t + dur);
    var g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxOut); o.start(t); o.stop(t + dur + 0.02);
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
    o.connect(lp); lp.connect(g); g.connect(sfxOut); o.start();
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
    o1.connect(lp); o2.connect(g2); g2.connect(lp); o3.connect(g3); g3.connect(lp); lp.connect(g); g.connect(sfxOut);
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
    ns.connect(nf); nf.connect(ng); ng.connect(g); g.connect(sfxOut);
    o.start(); o2.start(); ns.start();
    return { gain: g, last: 0, setFreq: function (f, now) { o.frequency.setTargetAtTime(f, now, 0.1); o2.frequency.setTargetAtTime(f * 2, now, 0.1); }, stop: function () { o.stop(); o2.stop(); ns.stop(); } };
  }


  // ---- BGM(Web Audio で合成。少し先の音まで予約していく方式)----
  // 場面ごとに、コード進行(根音の周波数)・テンポ・音色を変える。効果音の邪魔をしないよう、小さめの音量。
  var bgmBus = null, bgmScene = 'off', bgmTimer = null, bgmNext = 0, bgmStep = 0, bgmFade = null;
  var SCENES = {
    title:  { bpm: 72,  vol: 0.55, roots: [110, 87.31, 130.81, 98], minor: [1, 1, 0, 0] },    // しっとり(Am F C G)
    play:   { bpm: 96,  vol: 0.4,  roots: [98, 98, 110, 87.31],   minor: [1, 1, 1, 0] },      // 一定のリズムで、考える邪魔をしない
    result: { bpm: 84,  vol: 0.6,  roots: [130.81, 98, 110, 87.31], minor: [0, 0, 1, 0] },    // 明るく締める
    play_easy: { bpm: 95,  vol: 0.4,  roots: [98, 98, 110, 87.31], minor: [0, 1, 1, 0] },     // ゆったり(イージー・ファイル無しの時の予備)
    play_hard: { bpm: 128, vol: 0.4,  roots: [98, 110, 87.31, 98], minor: [1, 1, 1, 1] },     // 速く緊張感(ハード・ファイル無しの時の予備)
    tutorial:  { bpm: 85,  vol: 0.4,  roots: [130.81, 110, 98, 87.31], minor: [0, 1, 0, 0] }   // やさしい(チュートリアル・ファイル無しの時の予備)
  };
  function bgmNote(a, t, f, dur, type, gain, lpf) {
    var o = a.createOscillator(); o.type = type; o.frequency.value = f;
    var lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lpf || 1800;
    var g = a.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(bgmBus); o.start(t); o.stop(t + dur + 0.05);
  }
  function bgmHat(a, t, gain) {
    var s = a.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    var fl = a.createBiquadFilter(); fl.type = 'highpass'; fl.frequency.value = 7000;
    var g = a.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(fl); fl.connect(g); g.connect(bgmBus); s.start(t, Math.random()); s.stop(t + 0.07);
  }
  // 1拍分(8分音符 = 1ステップ)を予約。bgmStep: 0〜31(4小節 x 8)
  function bgmSchedule(a, t, sc, step) {
    var beat = 60 / sc.bpm, bar = (step >> 3) & 3, i = step & 7;
    var root = sc.roots[bar], third = sc.minor[bar] ? 1.1892 : 1.2599, fifth = 1.4983;
    if (i === 0) {   // 小節の頭: 低いベース+やわらかいパッド
      bgmNote(a, t, root / 2, beat * 3.6, 'triangle', 0.5, 400);
      bgmNote(a, t, root * 2, beat * 7.5, 'sine', 0.1, 1200);
      bgmNote(a, t, root * 2 * third, beat * 7.5, 'sine', 0.08, 1200);
      bgmNote(a, t, root * 2 * fifth, beat * 7.5, 'sine', 0.08, 1200);
    }
    if (i === 4) bgmNote(a, t, root / 2 * fifth, beat * 2.6, 'triangle', 0.35, 400);
    if (/^play/.test(bgmScene) || bgmScene === 'result') {   // 軽いリズム(裏拍のハット)
      if (i & 1) bgmHat(a, t, /^play/.test(bgmScene) ? 0.05 : 0.035);
    }
    var arp = [0, 2, 4, 2, 5, 4, 2, 1], mult = [1, third, fifth, 2, 2 * third, 2 * fifth];   // メロディ代わりのアルペジオ
    if (bgmScene === 'title' ? (i & 1) === 0 : (bgmScene === 'result' ? i !== 3 : (i % 4 === 2 || i === 7)))
      bgmNote(a, t, root * 2 * mult[arp[(i + bar) % 8] % mult.length] * (bgmScene === 'title' ? 1 : 2), beat * 0.9, 'triangle', /^play/.test(bgmScene) ? 0.07 : 0.1, 2400);
  }
  function bgmTick() {
    var a = AC; if (!a || bgmScene === 'off' || !on) return;
    var sc = SCENES[bgmScene]; if (!sc) return;
    var stepLen = 30 / sc.bpm;
    if (bgmNext < a.currentTime) bgmNext = a.currentTime + 0.05;
    while (bgmNext < a.currentTime + 0.4) { bgmSchedule(a, bgmNext, sc, bgmStep); bgmNext += stepLen; bgmStep = (bgmStep + 1) & 31; }
  }
  // ---- ファイルのBGM(ElevenLabs Music)。読めない時は、上の合成BGMにする ----
  // [ファイル, 音量]。音量は、曲ごとの大きさ(ffmpeg の平均音量)をそろえた値(2026-10-19)
  var BGM_FILES = {
    title: ['assets/bgm/bgm_title_title_depot_v1_el.mp3', 0.5],
    play: ['assets/bgm/bgm_play_normal_play_night_v1_el.mp3', 0.4],
    play_easy: ['assets/bgm/bgm_play_easy_easy_road_v1_el.mp3', 0.4],
    play_hard: ['assets/bgm/bgm_play_hard_deadline_push_v1_el.mp3', 0.33],
    result: ['assets/bgm/bgm_result_delivered_v1_el.mp3', 0.6],
    tutorial: ['assets/bgm/bgm_tutorial_first_load_v1_el.mp3', 0.45]
  };
  var bgmBuf = {}, bgmLoad = {}, bgmLayers = [], bgmLoopTimer = null, bgmActive = false, bgmWanted = false;
  var BGM_XF = 2.5;   // ループのつなぎ目を、2.5秒かけて重ねる(終わりと始まりをクロスフェード)
  function bgmLoadFile(scene, ok, ng) {
    if (bgmBuf[scene]) return ok();
    if (bgmLoad[scene]) return bgmLoad[scene].push([ok, ng]);
    bgmLoad[scene] = [[ok, ng]];
    var fin = function (good) { var q = bgmLoad[scene]; delete bgmLoad[scene]; q.forEach(function (c) { c[good ? 0 : 1](); }); };
    try {
      fetch(BGM_FILES[scene][0]).then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(function (ab) {
        var done = function (buf) { bgmBuf[scene] = buf; fin(true); };
        var pr = AC.decodeAudioData(ab, done, function () { fin(false); }); if (pr && pr.catch) pr.catch(function () { fin(false); });
      }).catch(function () { fin(false); });
    } catch (e) { fin(false); }
  }
  function bgmLayerStop(L, sec) {
    try { var t = AC.currentTime; L.g.gain.cancelScheduledValues(t); L.g.gain.setValueAtTime(Math.max(0.0001, L.g.gain.value), t); L.g.gain.linearRampToValueAtTime(0.0001, t + sec); L.s.stop(t + sec + 0.05); } catch (e) { }
  }
  function bgmFileStop(sec) {
    if (bgmLoopTimer) { clearTimeout(bgmLoopTimer); bgmLoopTimer = null; }
    bgmLayers.forEach(function (L) { bgmLayerStop(L, sec == null ? 0.6 : sec); }); bgmLayers = [];
  }
  function bgmFileStart(scene, first) {
    var a = AC, buf = bgmBuf[scene]; if (!a || !buf || bgmScene !== scene || !on) return;
    var t = a.currentTime, s = a.createBufferSource(); s.buffer = buf;
    var g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + (first ? 1.5 : BGM_XF));
    var end = t + buf.duration;
    g.gain.setValueAtTime(1, end - BGM_XF); g.gain.linearRampToValueAtTime(0.0001, end);
    s.connect(g); g.connect(bgmBus); s.start(t); s.stop(end + 0.05);
    var L = { s: s, g: g }; bgmLayers.push(L);
    s.onended = function () { bgmLayers = bgmLayers.filter(function (x) { return x !== L; }); };
    bgmLoopTimer = setTimeout(function () { bgmFileStart(scene, false); }, Math.max(1000, (buf.duration - BGM_XF) * 1000));
  }
  function bgmStopAll() {
    bgmFileStop(0.4); if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; } bgmActive = false;
    if (bgmBus && AC) { bgmBus.gain.cancelScheduledValues(AC.currentTime); bgmBus.gain.setTargetAtTime(0.0001, AC.currentTime, 0.2); }
  }
  function bgmSet(scene) {
    if (scene === bgmScene) return;
    bgmScene = SCENES[scene] ? scene : 'off';
    bgmStep = 0;
    bgmStopAll();
    if (bgmScene === 'off') return;
    var a = ready();
    if (!a) return;   // 音がまだ有効でない時は、有効になった後の次の bgm() 呼び出しで鳴り出す(bgmScene は覚えておく)
    if (!bgmBus) { bgmBus = a.createGain(); bgmBus.gain.value = 0.0001; bgmBus.connect(musicOut); }
    var sc = bgmScene, synthGo = function () {
      if (bgmScene !== sc || !on) return;
      bgmBus.gain.cancelScheduledValues(AC.currentTime); bgmBus.gain.setTargetAtTime(0.22 * SCENES[sc].vol, AC.currentTime, 0.4);
      bgmNext = 0; if (!bgmTimer) bgmTimer = setInterval(bgmTick, 120);
    };
    bgmActive = true;
    if (BGM_FILES[sc]) {
      bgmLoadFile(sc, function () {
        if (bgmScene !== sc || !on) return;
        bgmBus.gain.cancelScheduledValues(AC.currentTime); bgmBus.gain.setTargetAtTime(BGM_FILES[sc][1], AC.currentTime, 0.2);
        bgmFileStart(sc, true);
      }, synthGo);   // 読めなかったら、合成BGM
    } else synthGo();
  }
  // プレイの場面を、URL の # から選び直す: #mode=tutorial → チュートリアル曲、#diff=easy/hard → 難易度の曲(modes.js が書く)
  function bgmVariant(scene) {
    if (scene !== 'play') return scene;
    var h = location.hash || '';
    if (/mode=tutorial/.test(h)) return 'tutorial';
    var d = /diff=(easy|hard)/.exec(h);
    return d ? 'play_' + d[1] : 'play';
  }
  // 音がオフ→オンに戻った時・画面を触って音が有効になった時に、BGMを(まだなら)鳴らし直す
  function bgmEnsure() {
    if (!on || bgmActive) return;
    if (bgmScene !== 'off') { var s0 = bgmScene; bgmScene = 'off'; bgmSet(s0); }
    else if (!bgmWanted) window.SFX.bgm(/title/i.test(location.pathname) ? 'title' : 'play', true);   // 呼び出しが無くても、画面ごとに自動で(title.html=タイトル曲 / それ以外=ゲーム曲)
  }

  // ---- ElevenLabs で作った効果音ファイル(assets/sfx/)。読み込めた音だけ、ファイルで鳴らす。読めない時は、従来の合成音のまま ----
  var SAMPLE_FILES = {
    crashLight: 'sfx_impact_crash_light', crashHeavy: 'sfx_impact_crash_heavy', scrape: 'sfx_impact_scrape_zuri_a', rampMove: 'sfx_floor_ramp_rattle_b',
    hyd: 'sfx_floor_hyd_hiss_b', clank: 'sfx_floor_floor_stop_clank', drive: 'sfx_drive_car_engine_idle_soft',
    truckIn: 'sfx_trailer_truck_arrive_airbrake', truckOut: 'sfx_trailer_truck_depart', ramp: 'sfx_floor_ramp_clank',
    ratchet: 'sfx_lashing_wire_ratchet', chock: 'sfx_floor_chock_set', click: 'sfx_ui_ui_click', ok: 'sfx_ui_ok_chime',
    engKei: 'sfx_car_kei_idle', engSmall: 'sfx_car_small_idle', engMid: 'sfx_car_mid_idle', engBig: 'sfx_car_big_idle',
    engKeiTruck: 'sfx_truck_kei_truck_idle', engTruck: 'sfx_truck_big_idle',   // 車種別のエンジン(アイドリングのループ)・トレーラーのエンジン
    truckArrive: 'sfx_trailer_arrive_decel', parkHiss: 'sfx_trailer_air_vent_b', chassisRattle: 'sfx_trailer_metal_heavy_b', chassisBoom: 'sfx_trailer_metal_heavy_a',   // 到着(エンジンは回ったまま・減速)・止まった時のパーキングのエア抜け「プシュー」
    bump: 'sfx_drive_bump_pothole', ptoStart: 'sfx_floor_pto_start',
    switchPress: 'sfx_ui_switch_press', wireTension: 'sfx_lashing_wire_tension', carDoor: 'sfx_car_car_door', carBrake: 'sfx_drive_brake_lever',   // スイッチ・荷締めワイヤーが張る音・車のドア・パーキングブレーキ(2026-10-19)   // 「できない」ブザー・輪止め/穴の「ガタン」・PTO(油圧ポンプ)の始動(2026-10-19)
    truckStart: 'sfx_truck_engine_start', truckStop: 'sfx_truck_engine_stop'   // エンジン始動・アイドリングストップ(エンジンを止める)
  };
  var samples = {}, samplesLoading = false;
  function loadSamples() {
    if (samplesLoading || !AC) return; samplesLoading = true;
    Object.keys(SAMPLE_FILES).forEach(function (k) {
      try {
        fetch('assets/sfx/' + SAMPLE_FILES[k] + '.mp3').then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(function (ab) {
          var done = function (buf) { samples[k] = buf; };
          var pr = AC.decodeAudioData(ab, done, function () { }); if (pr && pr.catch) pr.catch(function () { });   // 古いSafariはコールバック式
        }).catch(function () { });
      } catch (e) { }
    });
  }
  // ファイルの音を1回鳴らす。鳴らせたら true(ファイルがまだ・無い時は false → 呼び出し側が合成音にする)
  function playSample(name, vol, rate, offset, maxSec, lp) {
    var a = ready(), b = samples[name]; if (!a || !b) return false;
    var s = a.createBufferSource(); s.buffer = b; s.playbackRate.value = rate || 1;
    var g = a.createGain(), t = a.currentTime; g.gain.value = vol == null ? 1 : vol;
    if (lp) { var fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; s.connect(fl); fl.connect(g); } else s.connect(g);
    g.connect(sfxOut);
    var off = Math.min(offset || 0, Math.max(0, b.duration - 0.05));
    s.start(t, off);
    if (maxSec) { g.gain.setValueAtTime(g.gain.value, t + Math.max(0, maxSec - 0.25)); g.gain.linearRampToValueAtTime(0.0001, t + maxSec); s.stop(t + maxSec + 0.02); }
    return true;
  }
  // 鳴らし続ける音(ファイルをループ再生)。loop() に渡す作り方。rate は setFreq で変える
  // 鳴らし続けるファイル(エンジン)。読み込んだ音の大きさをそろえ(音源ごとの差を直す)、lp を付けると高音を切る。
  // freq0〜freq1 は、速さ(loop の freq)から再生速度(エンジンの回転)に変える範囲。省略すると、回転は変えない
  function makeSampleLoop(name, freq0, freq1, lp, hp) {
    return function (a) {
      var buf = samples[name], d = buf.getChannelData(0), e = 0;
      for (var i = 0; i < d.length; i += 4) e += d[i] * d[i];
      var norm = Math.max(0.5, Math.min(3, 0.07 / Math.sqrt(e / (d.length / 4) + 1e-9)));   // 0.07 を基準の大きさにする
      var s = a.createBufferSource(); s.buffer = buf; s.loop = true;
      var gn = a.createGain(); gn.gain.value = norm;
      var g = a.createGain(); g.gain.value = 0.0001;
      if (lp) { var fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; s.connect(fl); fl.connect(gn); } else s.connect(gn);
      if (hp) { var fh = a.createBiquadFilter(); fh.type = 'highpass'; fh.frequency.value = hp; s.disconnect(); s.connect(fh); fh.connect(lp ? fl : gn); }   // 高い帯域(シュー)だけ取り出す
      gn.connect(g); g.connect(sfxOut);
      s.start(0, Math.random() * Math.max(0.1, buf.duration - 0.2));
      return { gain: g, last: 0, setFreq: freq1 ? function (f, now) { s.playbackRate.setTargetAtTime(0.85 + 0.55 * Math.max(0, Math.min(1, (f - freq0) / (freq1 - freq0))), now, 0.15); } : null, stop: function () { s.stop(); } };
    };
  }

  var lastScrape = 0, lastWarn = 0, lastClick = 0;
  window.SFX = {
    get enabled() { return on; },
    set enabled(v) { on = !!v; try { localStorage.setItem('sfx', on ? 'on' : 'off'); } catch (e) { } if (on) { ready(); setTimeout(bgmEnsure, 100); } else { bgmStopAll(); Object.keys(loops).forEach(function (k) { try { loops[k].stop(); } catch (e) { } delete loops[k]; }); } updateBtn(); },
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
    // BGM の切り替え。scene = 'title' | 'play' | 'result' | 'off'。音がまだ有効でない時に呼んでも、場面は覚えておく
    bgm: function (scene, auto) {
      scene = bgmVariant(scene);
      if (!auto) bgmWanted = true;   // 開発側のファイルから呼ばれた場合は、自動の切り替えをやめて、そちらに任せる
      if (scene === bgmScene && (bgmActive || scene === 'off')) return;
      if (scene === bgmScene) bgmScene = 'off';   // 覚えただけで鳴っていなかった場合は、鳴らし直す
      bgmSet(scene);
    },
    // 道板・扇動板・スライド板が動く「ゴトッ」と金属の擦れ
    ramp: function () { var a = ready(); if (!a) return; var t = a.currentTime; tone(a, t, 0.18, 'sine', 110, 55, 0.3); noise(a, t, 0.22, 'bandpass', 1400, 1.2, 0.12, 700); tone(a, t + 0.2, 0.1, 'triangle', 300, 220, 0.08); },
    // ワイヤー荷締め機(ガチャ)の「カチカチ」(1回につき1回)
    ratchet: function () { var a = ready(); if (!a) return; var t = a.currentTime; tone(a, t, 0.03, 'square', 1800, 1200, 0.07); tone(a, t + 0.045, 0.03, 'square', 1500, 1000, 0.06); noise(a, t, 0.02, 'highpass', 4000, 1, 0.1); },
    // エアブレーキ(連結・解除)の「プシュッ」
    airBrake: function () { var a = ready(); if (!a) return; var t = a.currentTime; noise(a, t, 0.5, 'highpass', 3200, 0.8, 0.22, 1400); tone(a, t, 0.08, 'sine', 100, 55, 0.2); },
    // エンジン始動: セルが回って、かかる
    engineStart: function () {
      var a = ready(); if (!a) return; var t = a.currentTime;
      tone(a, t, 0.7, 'sawtooth', 30, 34, 0.05); noise(a, t, 0.7, 'lowpass', 300, 1, 0.18, 260);
      tone(a, t + 0.7, 1.0, 'sawtooth', 40, 62, 0.07); noise(a, t + 0.7, 1.0, 'lowpass', 420, 0.8, 0.2, 200);
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

  // ファイルが読み込めていれば、ファイルで鳴らす。無ければ従来の合成音(synth)
  (function () {
    var S = window.SFX, synth = {};
    ['impact', 'scrape', 'hyd', 'drive', 'truckIn', 'truckOut', 'click', 'clank', 'dock', 'ok', 'ramp', 'ratchet', 'warn', 'bump', 'engineStart', 'airBrake'].forEach(function (k) { synth[k] = S[k]; });
    // ぶつかった: 軽い/重い2つを重さで選び、重さで音量・高さを少し変える。重い時は軽い方も重ねて厚くする
    S.impact = function (sev, kind) {
      sev = Math.max(0, Math.min(1, sev || 0)); var R = Math.random();
      if (samples.crashLight && samples.crashHeavy) {
        if (sev < 0.4) playSample('crashLight', 0.45 + 0.9 * sev, 0.92 + 0.16 * R);
        else { playSample('crashHeavy', 0.55 + 0.6 * sev, 1.05 - 0.15 * sev + 0.06 * R); if (sev > 0.75) playSample('crashLight', 0.4, 0.8); }
        return;
      }
      synth.impact(sev, kind);
    };
    S.scrape = function () {
      if (!samples.scrape) return synth.scrape();
      var now = performance.now(); if (now - lastScrape < 160) return; lastScrape = now;
      playSample('scrape', 0.7, 0.8 + 0.2 * Math.random(), 0.1 + 1.3 * Math.random(), 0.4, 1600);   // ズリズリ(低め)。長い音の途中から短く切って、高い音はカット
    };
    // 油圧(フロアの上げ下げ)の音: 低いシリンダーの音に、高い「シュー」(エア感)を重ねる(2026-10-21)
    S.hyd = function () { if (samples.hyd) { loop('hyd', makeSampleLoop('hyd'), 0.3, 0); loop('hydAir', makeSampleLoop('hyd', 0, 0, 0, 1800), 0.3, 0); } else synth.hyd(); };
    // トレーラー入り: 最後のエアブレーキが、止まる瞬間に合うよう、ファイルの後ろ側を使う(アニメ 約2.4秒)
    // トレーラーの状態: エンジンが回っているか(到着でtrue、アイドリングストップでfalse、出る時に始動)
    var truckRunning = false;
    // 入ってくる: 減速して止まる。止まった瞬間に、パーキングのエア抜け「プシュー」。エンジンは回ったまま(アイドリング)
    // 入場は読み込み直後に始まる。その時、①画面に触るまで音が出せない(スマホ)②効果音のファイルがまだ読み終わっていない。
    // → 音は保留して、音が有効になり、ファイルが読めたら鳴らす(15秒まで待つ。ファイルは3秒待っても読めなければ、そのまま鳴らす)
    var pendingIn = null;
    S.truckIn = function (sec) { pendingIn = { sec: sec, t: performance.now() }; tryPendingIn(); };
    function tryPendingIn() {
      if (!pendingIn) return;
      var age = performance.now() - pendingIn.t;
      if (age > 15000) { pendingIn = null; return; }   // 15秒以上たったら、場面に合わないので鳴らさない
      var a = ready();   // 有効でなければ null(ready() は resume も試す)
      if (!a) { setTimeout(tryPendingIn, 150); return; }
      if (!(samples.truckArrive && samples.parkHiss) && age < 3000) { setTimeout(tryPendingIn, 150); return; }
      var p = pendingIn; pendingIn = null; playTruckIn(p.sec);
    }
    function playTruckIn(sec) {
      if (!samples.truckArrive) {   // 新しい音が無い時は、前の到着の音(エアブレーキ入り)
        if (!samples.truckIn) return synth.truckIn(sec);
        playSample('truckIn', 0.9, 1, Math.max(0, samples.truckIn.duration - sec), sec + 0.3);
      } else {
        playSample('truckArrive', 0.6, 1, 0, sec + 0.2);
        playSample('chassisRattle', 0.5, 1, 0, sec + 0.2);   // 轍道(段差)を越えて、台車がガッシャン(金属が重なる)
        playSample('chassisBoom', 0.3, 0.9, 0, sec + 0.2);   // 下の低い響きを重ねて、重さを出す
        setTimeout(function () { playSample('parkHiss', 0.8, 1, 0, 1.6); }, Math.max(0, sec - 0.1) * 1000);   // 短く切って、プシューを聞こえやすく(ファイルは3秒)
      }
      truckRunning = true;
      if (samples.engTruck) holdLoop('truckIdle', makeSampleLoop('engTruck', 0, 0, 1400), 0.18);
    }
    // アイドリングストップ: エンジンを止める(止まって荷積み中などに、呼ぶ)。アイドリングの音を止めて、停止の音を鳴らす
    S.truckStop = function () {
      if (!truckRunning) return;
      truckRunning = false; releaseLoop('truckIdle');
      playSample('truckStop', 0.6);
    };
    // 走り去る: エンジンが止まっていたら、始動の音からつなぐ。そのあと、出だしのエア抜けからアニメの長さまで
    S.truckOut = function (sec) {
      releaseLoop('truckIdle');
      var delay = 0;
      if (!truckRunning && samples.truckStart) { playSample('truckStart', 0.6, 1, 0, 1.6); delay = 1.2; }
      truckRunning = false;
      setTimeout(function () {
        playSample('parkHiss', 0.8, 1.1, 0, 1.2);   // 出る直前に、パーキングのエアを抜く「プシュー」(入場と同じ音を、短く高めに)
        if (!playSample('truckOut', 0.6, 1, 0, sec - delay)) synth.truckOut(sec);
      }, delay * 1000);
    };
    S.click = function () { var now = performance.now(); if (now - lastClick < 40) return; if (!playSample('click', 0.6, 1)) synth.click(); else lastClick = now; };
    // 止まった時の「ガチッ」(棚・セットピン・フロアに当たった)。同じ着地で何回も鳴らないよう、1.2秒は鳴らさない(2026-10-20)
    var lastClank = 0;
    S.clank = function () { var now = performance.now(); if (now - lastClank < 1200) return; lastClank = now; if (!playSample('clank', 0.8, 0.95 + 0.1 * Math.random())) synth.clank(); };
    S.dock = function () { if (!playSample('chock', 0.8, 1)) synth.dock(); };
    S.ok = function () { if (!playSample('ok', 0.6, 1)) synth.ok(); };
    // できない(低いブザー)は、鳴らさない(2026-10-21 ユーザー指示)。限界・ピンに当たった時は、ガコン(clank)で知らせる。呼び出し側はそのまま
    S.warn = function () { };
    S.bump = function () { if (!playSample('bump', 0.7, 1)) synth.bump(); };   // 輪止め・穴を乗り越えた「ガタン」
    S.engineStart = function () { if (!playSample('ptoStart', 0.6, 1)) synth.engineStart(); };   // エンジン・PTO を入れた(油圧ポンプが立ち上がる)
    S.airBrake = function () { if (!playSample('parkHiss', 0.6, 1, 0, 1.2)) synth.airBrake(); };
    S.switchPress = function () { if (!playSample('switchPress', 0.6, 1)) S.click(); };   // スイッチを入れる・切る(ファイルが無い時は、カチッ)
    S.wireTension = function () { playSample('wireTension', 0.6, 1); };   // 荷締めワイヤーが張る(ワイヤーを締めきった時)
    S.carDoor = function () { playSample('carDoor', 0.6, 1); };   // 車のドアを閉める音
    S.carBrake = function () { playSample('carBrake', 0.6, 1); };   // パーキングブレーキを操作する音   // 連結・解除のエア抜け(今は呼び出し無し。入場・退場の「プシュー」と同じ音で代用)
    S.ramp = function () { if (!playSample('ramp', 0.7, 0.95 + 0.1 * Math.random())) synth.ramp(); };
    // 道板・扇動板を動かしている間の「ガラガラ」(出す時もしまう時も。動いている間、毎フレーム呼ぶ。呼ばれなくなると消える)
    S.rampMove = function () { if (samples.rampMove) loop('rampMove', makeSampleLoop('rampMove'), 0.15, 0); else { var now = performance.now(); if (now - (S._lastRamp || 0) > 350) { S._lastRamp = now; synth.ramp(); } } };
    S.bgmState = function () { return { scene: bgmScene, active: bgmActive, layers: bgmLayers.length, files: Object.keys(bgmBuf) }; };   // 確認用
    S.volState = function () { return { vol: vol, se: sfxOut && sfxOut.gain.value, bgm: musicOut && musicOut.gain.value, on: on }; };   // 確認用
    // 今の車の種類(車種のまとまり)。car_library.js の id の頭で決める。車が無い時は、中くらいの音
    function carSound() {
      var c = window.GAME_STATE && window.GAME_STATE.car; if (!c || !c.libId) return samples.engMid ? 'engMid' : null;
      var id = c.libId;
      if (/^truck-/.test(id)) return 'engKeiTruck';                       // 軽トラック
      if (/^kei/.test(id) || (c.entry && c.entry.legalClass === 'kei')) return 'engKei';   // 軽自動車・箱バン・軽クーペ
      if (/^(compact|hatch)-/.test(id)) return 'engSmall';                 // コンパクト・ハッチバック
      if (/^(suv|minivan)-/.test(id)) return 'engBig';                     // SUV・ミニバン
      return 'engMid';                                                     // セダン・ワゴン・スポーツ
    }
    // 走っている車のエンジン(車種ごと)。車種の音が無ければ、汎用のエンジン音。それも無ければ合成音
    S.drive = function (speed) {
      var key = carSound();
      if (!key || !samples[key]) key = samples.drive ? 'drive' : null;   // 車種の音が無ければ、汎用のエンジン音(sfx_drive_car_engine_idle_soft)
      if (!key) return synth.drive(speed);
      if (!(speed > 8)) return; var k = Math.min(1, speed / 600);
      loop('drive_' + key, makeSampleLoop(key, 36, 66, 1800), 0.12 + 0.2 * k, 36 + 30 * k);   // 速いほど少し大きく・回転を上げる。うるさくしない
    };
    // 鳴らし続ける音を、呼ばれている間は止めない(呼び出し側が release で止めるまで)
    function holdLoop(name, make, vol) {
      var a = ready(); if (!a) return;
      var L = loops[name]; if (!L) { L = loops[name] = make(a); L.gain.gain.setValueAtTime(0.0001, a.currentTime); }
      L.last = Infinity; L.gain.gain.setTargetAtTime(vol, a.currentTime, 0.3);
    }
    function releaseLoop(name) { if (loops[name]) loops[name].last = 0; }   // 次の見回りで、ゆっくり消える

    S.loopNames = function () { return Object.keys(loops).filter(function (k) { return loops[k].last === Infinity || performance.now() - loops[k].last < 300; }); };   // 確認用: いま鳴っている音
    S.carSoundNow = carSound;   // 確認用
    S.loadedSamples = function () { return Object.keys(samples); };   // 確認用: 読み込めたファイル
    S.ratchet = function () { var now = performance.now(); if (now - (S._lastRat || 0) < 60) return; S._lastRat = now; if (!playSample('ratchet', 0.55, 0.95 + 0.1 * Math.random(), 0, 0.5)) synth.ratchet(); };
  })();

  // 音量を、いま出ている音に反映する(BGM は musicOut、SE は sfxOut)
  function applyVol() {
    var t = AC ? AC.currentTime : 0;
    if (sfxOut) sfxOut.gain.setTargetAtTime(vol.se / 100, t, 0.02);
    if (musicOut) musicOut.gain.setTargetAtTime(vol.bgm / 100, t, 0.02);
  }
  function saveVol(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { } }

  // ---- 配車担当の声(ElevenLabs。assets/voice/dispatch_manifest.json の「画面の文字 → 音声ファイル」で鳴らす)----
  // 配車の文字(#dispatchText)が出た時に、対応する声を1回鳴らす。dispatch.js は触らない。声が無い文は、何も鳴らさない
  var voiceMap = null, voiceBuf = {}, voiceSrc = null, voiceLast = '';
  function voiceMapLoad(cb) {
    if (voiceMap) return cb(voiceMap);
    fetch('assets/voice/dispatch_manifest.json').then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (m) { voiceMap = m; cb(m); }).catch(function () { voiceMap = {}; cb(voiceMap); });
  }
  function speakDispatch(text) {
    if (!on || !AC || AC.state !== 'running') return;
    voiceMapLoad(function (m) {
      var file = m[text]; if (!file) return;
      var play = function (buf) {
        if (voiceSrc) { try { voiceSrc.stop(); } catch (e) { } }
        var s = AC.createBufferSource(); s.buffer = buf; s.connect(sfxOut); s.start(); voiceSrc = s;
      };
      if (voiceBuf[file]) return play(voiceBuf[file]);
      var a = AC;
      fetch(file).then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(function (ab) {
        a.decodeAudioData(ab, function (buf) { voiceBuf[file] = buf; play(buf); }, function () { });
      }).catch(function () { });
    });
  }
  setInterval(function () {
    var say = document.getElementById('dispatchSay'), el = document.getElementById('dispatchText');
    if (!say || !el) return;
    if (say.style.display !== 'flex') {   // 閉じたら、声は止めて、次に同じ文が出た時に鳴るように
      voiceLast = '';
      if (voiceSrc) { try { voiceSrc.stop(); } catch (e) { } voiceSrc = null; }
      return;
    }
    var t = el.textContent.replace(/^「/, '').replace(/」$/, '');
    if (t && t !== voiceLast) { voiceLast = t; speakDispatch(t); }
  }, 150);

  // 画面上の「音設定」ボタン(モードバーの右端)。押すと、BGM・SE の音量とON/OFFのポップアップが出る
  var btn = null, panel = null, rngBgm = null, rngSe = null, outBgm = null, outSe = null, togBtn = null;
  var STYLE = '#sfxPanel{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}' +
    '#sfxPanel[hidden]{display:none}' +
    '#sfxPanel .sfx-box{width:min(340px,100%);background:#16202c;color:#dfe8f2;border:2px solid #4b6078;border-radius:10px;padding:18px 18px 16px;font-size:15px;box-sizing:border-box}' +
    '#sfxPanel h2{margin:0 0 14px;font-size:17px;text-align:center;font-weight:bold}' +
    '#sfxPanel .sfx-row{margin:12px 0}' +
    '#sfxPanel .sfx-label{display:flex;justify-content:space-between;margin-bottom:6px}' +
    '#sfxPanel .sfx-label b{color:#7dfcd0;font-weight:bold}' +
    '#sfxPanel input[type=range]{width:100%;height:32px;margin:0;accent-color:#7dfcd0}' +
    '#sfxPanel .sfx-btn{display:block;width:100%;min-height:42px;margin-top:10px;font-size:15px;border-radius:8px;border:2px solid #4b6078;background:#243446;color:#dfe8f2;cursor:pointer}' +
    '#sfxPanel .sfx-btn.on{background:#1f5a48;border-color:#7dfcd0;color:#fff}' +
    '#btnSfx.sfx-fab{position:fixed;top:max(8px,env(safe-area-inset-top));right:max(8px,env(safe-area-inset-right));z-index:50;min-height:36px;padding:0 12px;font-size:13px;border-radius:8px;border:2px solid #4b6078;background:rgba(22,32,44,.85);color:#dfe8f2;cursor:pointer}';
  function updateBtn() {
    if (btn) btn.textContent = on ? '音設定' : '音:OFF';
    if (togBtn) { togBtn.textContent = on ? '音:ON(タップでOFF)' : '音:OFF(タップでON)'; togBtn.className = on ? 'sfx-btn on' : 'sfx-btn'; }
  }
  function openPanel() {
    if (!panel) return;
    rngBgm.value = vol.bgm; rngSe.value = vol.se; outBgm.textContent = vol.bgm + '%'; outSe.textContent = vol.se + '%';
    updateBtn(); panel.hidden = false;
  }
  function closePanel() { if (panel) panel.hidden = true; }
  function buildPanel() {
    var st = document.createElement('style'); st.textContent = STYLE; document.head.appendChild(st);
    panel = document.createElement('div'); panel.id = 'sfxPanel'; panel.hidden = true;
    panel.innerHTML = '<div class="sfx-box" role="dialog" aria-label="音の設定">' +
      '<h2>音の設定</h2>' +
      '<div class="sfx-row"><div class="sfx-label"><span>BGM（音楽）</span><b id="sfxBgmOut"></b></div><input type="range" id="sfxBgm" min="0" max="100" step="1"></div>' +
      '<div class="sfx-row"><div class="sfx-label"><span>SE（効果音）</span><b id="sfxSeOut"></b></div><input type="range" id="sfxSe" min="0" max="100" step="1"></div>' +
      '<button type="button" class="sfx-btn" id="sfxTog"></button>' +
      '<button type="button" class="sfx-btn" id="sfxClose">閉じる</button>' +
      '</div>';
    document.body.appendChild(panel);
    rngBgm = panel.querySelector('#sfxBgm'); rngSe = panel.querySelector('#sfxSe');
    outBgm = panel.querySelector('#sfxBgmOut'); outSe = panel.querySelector('#sfxSeOut');
    togBtn = panel.querySelector('#sfxTog');
    // 画面の操作(ゲームのタップ)を、ポップアップの中で止める。音の有効化だけは通す
    panel.addEventListener('pointerdown', function (e) { unlock(); e.stopPropagation(); });
    panel.addEventListener('click', function (e) { e.stopPropagation(); if (e.target === panel) closePanel(); });
    rngBgm.addEventListener('input', function () { vol.bgm = +rngBgm.value; outBgm.textContent = vol.bgm + '%'; applyVol(); });
    rngBgm.addEventListener('change', function () { saveVol('volBgm', vol.bgm); });
    rngSe.addEventListener('input', function () { vol.se = +rngSe.value; outSe.textContent = vol.se + '%'; applyVol(); });
    rngSe.addEventListener('change', function () { saveVol('volSe', vol.se); window.SFX.click(); });   // 離した時に、今の音量で1回鳴らす
    togBtn.addEventListener('click', function () { window.SFX.enabled = !on; });
    panel.querySelector('#sfxClose').addEventListener('click', closePanel);
  }
  function addBtn() {
    if (btn) return;
    // ゲーム画面は、モードバーの右端に置く。モードバーが無いページ(タイトル)は、右上に浮かせて置く
    var bar = document.getElementById('modeBar'), floating = !bar;
    if (floating) { if (!document.body) return; bar = document.body; }
    buildPanel();
    btn = document.createElement('button');
    btn.id = 'btnSfx'; btn.type = 'button'; btn.title = '音の設定(BGM・効果音の音量)';
    if (floating) btn.className = 'sfx-fab';
    btn.addEventListener('click', function (e) { e.stopPropagation(); unlock(); openPanel(); });
    updateBtn();
    bar.appendChild(btn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addBtn); else addBtn();
})();
