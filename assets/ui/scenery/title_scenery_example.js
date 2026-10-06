// メイン画面の時間帯と天気を、開くたびにランダムに決める例(DEV_HANDOFF_MEMO.md D28)。
// title.html の <body> の中、.scene の後で読む。.scene に t-<時間帯> と、雨なら w-rain を付けるだけ。
(function () {
  var scene = document.getElementById('scene'); if (!scene) return;
  // 出やすさ: 夕焼け3・昼3・夜2・朝日2。雨は4回に1回くらい
  var times = ['dusk', 'dusk', 'dusk', 'day', 'day', 'day', 'night', 'night', 'sunrise', 'sunrise'];
  scene.classList.add('t-' + times[Math.floor(Math.random() * times.length)]);
  if (Math.random() < 0.25) scene.classList.add('w-rain');
})();
