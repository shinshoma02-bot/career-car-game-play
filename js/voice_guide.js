// ボイスガイド(2026-10-22 ユーザー指示)。チュートリアル・イージーの解説の声と、危ない時の声を鳴らす。
// 声の選択は、音設定の欄から(今は「先輩風」だけ)。声のファイルが無い時は、何も鳴らさない(画面の文字だけ)。
// 声のファイル: assets/voice/guide/<声の名前>/<id>.mp3(id は下の表。作り方は SOUND_MEMO.md の S2・S3)
(function () {
  'use strict';
  var TABLE = [
 {
  "id": "tut_01",
  "title": "道板を出す",
  "line": "まず道板を出そう。後ろの坂が車の通り道になるぞ。"
 },
 {
  "id": "tut_02",
  "title": "後ろ側のスイッチを開く",
  "line": "ここからは後ろのスイッチを使う。"
 },
 {
  "id": "tut_03",
  "title": "3番 後: ピンを抜く",
  "line": "セットピンを抜いて、後ろのフロアを動かせるようにする。"
 },
 {
  "id": "tut_04",
  "title": "3番 後: 一番下まで下げる",
  "line": "▼を押し続けて、後ろのフロアを下げよう。"
 },
 {
  "id": "tut_05",
  "title": "前側のスイッチを開く",
  "line": "ここは前側のスイッチだ。"
 },
 {
  "id": "tut_06",
  "title": "スライド板を格納",
  "line": "1番と2番の間のスライド板をしまっておこう。"
 },
 {
  "id": "tut_07",
  "title": "1番 前: 上げてピンで固定",
  "line": "1番の前を上げてピンで止めよう。"
 },
 {
  "id": "tut_08",
  "title": "1番 後・2番 前も同じ手順",
  "line": "1番の後ろと2番の前も、同じように上げて止める。"
 },
 {
  "id": "tut_09",
  "title": "3番 前(継ぎ目)も上げる",
  "line": "3番の前も上げよう。"
 },
 {
  "id": "tut_10",
  "title": "3番 後: 走行位置の高さまで上げる",
  "line": "3番の後ろを、走る時の高さまで戻そう。"
 },
 {
  "id": "tut_11",
  "title": "下段へ: 5番をスロープにする",
  "line": "ここから下の段の4番に積むぞ。まず5番をスロープにする。"
 },
 {
  "id": "tut_12",
  "title": "2番 前の ▼ を長押し",
  "line": "2番の前を、▼で長押ししよう。"
 },
 {
  "id": "tut_13",
  "title": "2番 前を ▲ で戻す",
  "line": "5番がスロープに乗ったら、2番の前を▲で戻す。"
 },
 {
  "id": "tut_14",
  "title": "4番扇動板を搬出",
  "line": "4番と5番の間に、扇動板を出そう。"
 },
 {
  "id": "tut_15",
  "title": "4番扇動板を格納",
  "line": "4番に積めたら、扇動板をしまおう。"
 },
 {
  "id": "tut_16",
  "title": "5番を持ち上げ直す",
  "line": "5番を一度持ち上げ直す。"
 },
 {
  "id": "tut_17",
  "title": "赤いレバーを上げる",
  "line": "赤いレバーを上げて、金具を外そう。"
 },
 {
  "id": "tut_18",
  "title": "5番を下げて平らにする",
  "line": "5番を下げて、平らに戻そう。"
 },
 {
  "id": "tut_19",
  "title": "ピンが元に戻る",
  "line": "レバーは自動で元に戻る。ピンが戻ったら、次へ進もう。"
 },
 {
  "id": "tut_20",
  "title": "中段フロア(7台目)とは",
  "line": "中段フロアは、7台目を積むための短い床だ。"
 },
 {
  "id": "tut_21",
  "title": "2番 前・3番 前・3番 後を、中段フロアに当たらない高さにする",
  "line": "中段フロアにぶつからない高さまで、上のフロアを上げよう。"
 },
 {
  "id": "tut_22",
  "title": "中段フロアの固定ピンを合わせる",
  "line": "中段フロアの固定ピンを合わせよう。"
 },
 {
  "id": "tut_23",
  "title": "中段フロアをスロープにする",
  "line": "中段フロアの前を、上げてスロープにしよう。"
 },
 {
  "id": "tut_24",
  "title": "中段フロアを上げて固定ピンで止める",
  "line": "7台目を載せたら、中段フロアを上げてピンで止めよう。"
 },
 {
  "id": "tut_25",
  "title": "サイクル完了の条件",
  "line": "7台とも積んで、全部固定できたら完了だ。"
 },
 {
  "id": "tut_26",
  "title": "スライド車軸を縮める",
  "line": "伸ばした車軸を縮めて、元に戻そう。"
 },
 {
  "id": "tut_27",
  "title": "道板をしまう",
  "line": "最後に、道板をしまおう。"
 },
 {
  "id": "tut_28",
  "title": "イージー・ノーマル・ハードの違い",
  "line": "難易度が上がると、案内が少なくなっていく。"
 },
 {
  "id": "tut_29",
  "title": "配車への連絡と得点",
  "line": "積めない荷物が来たら、配車に連絡して変えよう。"
 },
 {
  "id": "tut_30",
  "title": "トレーラーとフロア番号",
  "line": "上の絵が、車を積むトレーラーだ。番号は、積む場所の番号だ。"
 },
 {
  "id": "tut_31",
  "title": "操作盤",
  "line": "真ん中の操作盤で、フロアを動かす。"
 },
 {
  "id": "tut_32",
  "title": "車カード",
  "line": "一番下が、車の一覧だ。"
 },
 {
  "id": "tut_33",
  "title": "5番: 輪止めの位置を合わせる",
  "line": "5番の輪止めを、合わせよう。"
 },
 {
  "id": "tut_34",
  "title": "ジャッキ・タイヤ操作盤を開く",
  "line": "タイヤの操作盤を開こう。"
 },
 {
  "id": "tut_35",
  "title": "ジャッキでタイヤを浮かせる",
  "line": "ジャッキで、タイヤを浮かせよう。"
 },
 {
  "id": "tut_36",
  "title": "車軸のロックを解除する",
  "line": "車軸のロックを外そう。"
 },
 {
  "id": "tut_37",
  "title": "スライド車軸を伸ばす(伸)",
  "line": "「伸」を押して、タイヤを外に張り出そう。"
 },
 {
  "id": "tut_38",
  "title": "ジャッキを戻す",
  "line": "ジャッキを下げて、脚を縮めよう。"
 },
 {
  "id": "tut_39",
  "title": "なぜ台車の車軸を伸ばすのか",
  "line": "タイヤを外に出さないとほとんどの車が積めない"
 }
];
  var BY_TITLE = {}; TABLE.forEach(function (o) { BY_TITLE[o.title] = o; });
  var DANGER = { near: ["危ない！", "危ない！ 止まれ！"], hit: ["おっとっと！", "うわっ！", "やばい、ぶつけた！"] };   // 声のファイル: danger_near_1..2, danger_hit_1..3
  var VOICES = [{ id: "senpai", name: "落ち着いた先輩風" }, { id: "zundamon", name: "ずんだもん" }];
  // 声の選び方(2026-10-22 ユーザー指示): 声を変えるのはメイン画面(タイトル)だけ。ゲーム中は、選んである声を見るだけ。ボイスのオンオフは、どの画面でもできる
  var ON_MAIN = /title\.html$/.test(location.pathname) || /\/$/.test(location.pathname);
  var voice = "senpai", on = true;
  try { voice = localStorage.getItem("guideVoice") || "senpai"; on = localStorage.getItem("guideVoiceOn") !== "0"; } catch (e) { }
  var cur = null, lastTitle = null;
  function voiceName() { var v = VOICES.filter(function (x) { return x.id === voice; })[0]; return v ? v.name : voice; }
  function enabledGuide() { var gs = window.GAME_STATE, gm = window.GAME_MODE; return !!((gm && gm.tutorial) || (gs && gs.difficulty === "easy")); }   // 解説の声は、チュートリアルとイージーだけ
  function play(file) {
    if (!on) return;   // ボイスOFF: 声は鳴らさない(画面の文字だけ)
    try {
      if (cur) { cur.pause(); cur = null; }
      var a = new Audio("assets/voice/guide/" + voice + "/" + file + ".mp3");
      a.volume = 0.9;
      a.onerror = function () { };   // 声のファイルが無い時は、何もしない
      a.play().catch(function () { });
      cur = a;
    } catch (e) { }
  }
  // チュートリアルのステップが変わった時(tutorial.js から呼ぶ)
  function step(title) {
    if (title === lastTitle) return; lastTitle = title;
    if (!enabledGuide()) return;
    var o = BY_TITLE[title]; if (o) play(o.id);
  }
  // 危ない動作(衝突): 大きいほど「おっとっと」。小さい時は「危ない！」。ノーマル・ハードでも鳴らす(驚いた声は、1人前の設定でも出す)。ボイスOFFの時は鳴らさない
  var lastDanger = 0;
  // 種類(2026-10-23 ユーザー指示): near = 当たる寸前の「危ない！」(予告。まだ未実装)/ slow = ゆっくり当たった「おっとっと」/ crash = 勢いよくぶつかった後の別のセリフ
  var FILES = { near: ["danger_near_1", "danger_near_2"], slow: ["danger_hit_1", "danger_hit_2", "danger_hit_3"], crash: ["danger_crash_1", "danger_crash_2", "danger_crash_3"] };
  function danger(kind) {
    if (!on || !FILES[kind]) return;
    var now = performance.now(); if (now - lastDanger < 1500) return; lastDanger = now;
    var list = FILES[kind];
    play(list[Math.floor(Math.random() * list.length)]);
  }
  // 音設定の画面に、声の行を足す(sound.js の画面を変えずに、ここで差し込む)
  function row(label, body) {
    var r = document.createElement("div"); r.className = "sfx-row guideRow";
    r.innerHTML = '<div class="sfx-label"><span>' + label + '</span></div>';
    r.appendChild(body);
    return r;
  }
  function addRows() {
    var box = document.querySelector("#sfxPanel .sfx-box"), tog = document.getElementById("sfxTog");
    if (!box || !tog || document.getElementById("guideVoiceRow")) return;
    var rows = [];
    // 声の選択: メイン画面だけ変えられる。ゲーム中は、今の声を見るだけ
    var pick;
    if (ON_MAIN) {
      pick = document.createElement("select"); pick.id = "guideVoice";
      pick.style.cssText = "width:100%;min-height:36px;font-size:15px;background:#243446;color:#dfe8f2;border:2px solid #4b6078;border-radius:8px";
      VOICES.forEach(function (v) { var op = document.createElement("option"); op.value = v.id; op.textContent = v.name; pick.appendChild(op); });
      pick.value = voice;
      pick.addEventListener("change", function (e) { voice = e.target.value; try { localStorage.setItem("guideVoice", voice); } catch (x) { } });
    } else {
      pick = document.createElement("div"); pick.id = "guideVoice";
      pick.style.cssText = "font-size:15px;color:#dfe8f2;padding:6px 0";
      pick.textContent = voiceName() + '(声は、タイトル画面で変えられます)';
    }
    var r1 = row("教えてくれる声", pick);
    rows.push(r1);
    var credit = document.createElement("div"); credit.id = "guideVoiceCredit"; credit.style.cssText = "margin-top:6px;font-size:12px;color:#9fb0c2;text-align:left";
    credit.textContent = "ずんだもんの声: VOICEVOX:ずんだもん";   // クレジット表記(VOICEVOX・ずんだもん音源の規約。音の担当が決めた文)
    r1.appendChild(credit);
    // ボイスのオンオフ: どの画面でも変えられる
    var tg = document.createElement("button"); tg.type = "button"; tg.id = "guideVoiceTog"; tg.className = "sfx-btn";
    function paint() { tg.textContent = on ? "ボイス:ON(タップでOFF)" : "ボイス:OFF(タップでON)"; tg.className = on ? "sfx-btn on" : "sfx-btn"; }
    tg.addEventListener("click", function () { on = !on; try { localStorage.setItem("guideVoiceOn", on ? "1" : "0"); } catch (x) { } paint(); if (!on && cur) { cur.pause(); cur = null; } });
    paint();
    rows.push(row("ボイス", tg));
    rows.forEach(function (r) { box.insertBefore(r, tog); });
    if (rows.length) rows[0].id = "guideVoiceRow";
  }
  var iv = setInterval(function () { if (document.querySelector("#sfxPanel .sfx-box")) { addRows(); clearInterval(iv); } }, 300);
  window.VOICE_GUIDE = { step: step, danger: danger, play: play, voices: VOICES, table: TABLE, onMain: ON_MAIN };
})();
