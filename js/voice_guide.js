// ボイスガイド(2026-10-22 ユーザー指示)。チュートリアル・イージーの解説の声と、危ない時の声を鳴らす。
// 声の選択は、音設定の欄から(今は「先輩風」だけ)。声のファイルが無い時は、何も鳴らさない(画面の文字だけ)。
// 声のファイル: assets/voice/guide/<声の名前>/<id>.mp3(id は下の表。作り方は SOUND_MEMO.md の S2・S3)
(function () {
  'use strict';
  var TABLE = [
 {
  "id": "tut_01",
  "title": "道板を出す",
  "line": "まず道板を出そう。後ろの坂が、車の乗り口になるぞ。"
 },
 {
  "id": "tut_02",
  "title": "後ろ側のスイッチを開く",
  "line": "ここからは後ろ側のスイッチを使う。"
 },
 {
  "id": "tut_03",
  "title": "3番 後: ピンを抜く",
  "line": "セットピンを抜いて、後ろのフロアを動かせるようにする。"
 },
 {
  "id": "tut_04",
  "title": "3番 後: 道板まで下げる",
  "line": "▼を押し続けて、後ろの端を道板まで下げよう。"
 },
 {
  "id": "tut_05",
  "title": "前側のスイッチを開く",
  "line": "ここは前側のスイッチだ。"
 },
 {
  "id": "tut_06",
  "title": "スライド板を格納",
  "line": "1番と2番の間のスライド板を、しまっておこう。"
 },
 {
  "id": "tut_07",
  "title": "1番 前: 上げてピンで固定",
  "line": "1番の前を上げて、ピンで止めよう。"
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
  "title": "なぜスライド車軸を伸ばすのか",
  "line": "タイヤを外に出すと、車が積みやすくなる。"
 }
];
  var BY_TITLE = {}; TABLE.forEach(function (o) { BY_TITLE[o.title] = o; });
  var DANGER = { near: ["危ない！", "危ない！ 止まれ！"], hit: ["おっとっと！", "うわっ！", "やばい、ぶつけた！"] };   // 声のファイル: danger_near_1..2, danger_hit_1..3
  var VOICES = [{ id: "senpai", name: "落ち着いた先輩風" }, { id: "zundamon", name: "ずんだもん" }];   // ずんだもん: 声のファイルが無い間は、何も鳴らない(画面の文字だけ)
  var voice = "senpai";
  try { voice = localStorage.getItem("guideVoice") || "senpai"; } catch (e) { }
  var cur = null, lastTitle = null;
  function enabledGuide() { var gs = window.GAME_STATE, gm = window.GAME_MODE; return !!((gm && gm.tutorial) || (gs && gs.difficulty === "easy")); }   // 解説の声は、チュートリアルとイージーだけ
  function play(file) {
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
  // 危ない動作(衝突): 大きいほど「おっとっと」。小さい時は「危ない！」。ノーマル・ハードでも鳴らす(1人前でも、驚いた声は出る)
  var lastDanger = 0;
  function danger(kind) {
    var now = performance.now(); if (now - lastDanger < 1500) return; lastDanger = now;
    var n = kind === "hit" ? 3 : 2, k = Math.floor(Math.random() * n) + 1;
    play("danger_" + kind + "_" + k);
  }
  // 音設定の画面に、声の選択を1行足す(sound.js の画面を変えずに、ここで差し込む)
  function addPickerRow() {
    var box = document.querySelector("#sfxPanel .sfx-box"), tog = document.getElementById("sfxTog");
    if (!box || !tog || document.getElementById("guideVoiceRow")) return;
    var row = document.createElement("div"); row.id = "guideVoiceRow"; row.className = "sfx-row";
    row.innerHTML = '<div class="sfx-label"><span>教えてくれる声</span><b></b></div><select id="guideVoice" style="width:100%;min-height:36px;font-size:15px;background:#243446;color:#dfe8f2;border:2px solid #4b6078;border-radius:8px"></select>';
    VOICES.forEach(function (v) { var op = document.createElement("option"); op.value = v.id; op.textContent = v.name; row.querySelector("select").appendChild(op); });
    row.querySelector("select").value = voice;
    row.querySelector("select").addEventListener("change", function (e) { voice = e.target.value; try { localStorage.setItem("guideVoice", voice); } catch (x) { } });
    box.insertBefore(row, tog);
  }
  var iv = setInterval(function () { if (document.querySelector("#sfxPanel .sfx-box")) { addPickerRow(); clearInterval(iv); } }, 300);
  window.VOICE_GUIDE = { step: step, danger: danger, play: play, voices: VOICES, table: TABLE };
})();
