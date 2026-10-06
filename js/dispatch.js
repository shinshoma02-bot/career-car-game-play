// 配車担当への連絡(積めない荷物。SPEC第16章)。
// ・ときどき、どう並べても積めない荷物(6番に載せられる車が1台も無い)が出題される(game.js の drawImpossibleDeck)。
// ・上部の「配車に連絡」ボタン →「連絡しますか? はい/いいえ」→ 結果をセリフで表示する。
//   積めない荷物 → 「悪い、荷物変えるわ」系のセリフ+早いほど高いボーナス → 荷物を変更。
//   積める荷物   → 「積めるわい!」系のセリフ+減点 → 荷物はそのまま(そのターンは、もう連絡できない)。
//   気づかないまま制限時間(SCORE.dispatchLimitSec)を過ぎた → 「気づけよ!」系のセリフ+そのターンの積込み点が0点 → 荷物を変更。
// スコアの計算は modes.js(GAME_MODE.dispatchResult)。ここは画面とセリフだけ。
(function () {
  var state = window.GAME_STATE;
  var $ = function (id) { return document.getElementById(id); };
  var btn = $('btnDispatch');
  if (!btn || !state) return;

  // ---- セリフ(似た言い方を何種類か。表示は ランダム に1つ選ぶ。直す時はここだけ) ----
  var LINES = {
    // 積めない荷物に気づいて連絡した。気づくのが早い/ふつう/遅いで言い方を分ける(tier: fast < 1/3 / mid / slow > 2/3 の経過)
    found: {
      fast: [
        '早いな、助かる。悪い、荷物変えるわ。',
        'おっ、もう気づいたか。すまん、荷物変えるわ。',
        'さすがだな。こっちのミスだ、荷物変えるわ。'
      ],
      mid: [
        '悪い、荷物変えるわ。',
        'あー、その組み合わせは無理だったな。別の荷物に替えるわ。',
        'すまん、積めない荷物を回してた。替えるから待っててくれ。'
      ],
      slow: [
        'やっと気づいたか…。悪い、荷物変えるわ。',
        '遅いぞ、もっと早く言ってくれ。まあ悪かった、荷物変えるわ。',
        'ずいぶん悩んだな。すまん、積めない荷物だった。変えるわ。'
      ]
    },
    // 積める荷物なのに「積めない」と連絡した
    wrong: [
      'もっとちゃんと考えろ!積めるわい!',
      '何言ってんだ、それは積める荷物だ。よく見て考えろ!',
      'ちゃんと確認したのか?積めるって。つべこべ言わずに積め!',
      '積めない荷物なんか回すか。もう一回、頭使って並べ方を考えろ!'
    ],
    // 積めない荷物なのに、気づけないまま制限時間が過ぎた
    missed: [
      '悪い、積めない荷物だった。でも気づけよ!',
      'すまん、荷物のミスだ。…けど、いつまで悩んでるんだ。気づけよ!',
      '積めない荷物を回した、悪かった。だが、自分でも気づいてくれ。',
      'こっちのミスで積めない荷物だった。だがな、早めに連絡くれ!'
    ]
  };
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  // ---- 画面(確認・結果の2つのオーバーレイ) ----
  function make(id, html) {
    var el = document.createElement('div');
    el.id = id; el.className = 'overlay'; el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  }
  var ask = make('dispatchAsk',
    '<div class="card">' +
    '<h2>配車担当に連絡</h2>' +
    '<p>この荷物は積めないと判断して、連絡しますか?</p>' +
    '<p class="dispatchNote">積める荷物なのに連絡すると減点です。</p>' +
    '<button class="modeBtn" id="btnDispatchYes" type="button">はい(連絡する)</button>' +
    '<button class="modeBtn" id="btnDispatchNo" type="button">いいえ(戻る)</button>' +
    '</div>');
  var say = make('dispatchSay',
    '<div class="card">' +
    '<div class="dispatchWho">配車担当</div>' +
    '<div class="dispatchSpeech" id="dispatchText"></div>' +
    '<div class="dispatchScore" id="dispatchScore"></div>' +
    '<button class="modeBtn" id="btnDispatchOk" type="button">OK</button>' +
    '</div>');
  var afterOk = null;
  function show(el) { el.style.display = 'flex'; }
  function hide(el) { el.style.display = 'none'; }
  function openSay(text, scoreText, okLabel, then) {
    hide(ask);
    $('dispatchText').textContent = '「' + text + '」';
    $('dispatchScore').textContent = scoreText || '';
    $('btnDispatchOk').textContent = okLabel;
    afterOk = then; show(say);
  }
  $('btnDispatchOk').addEventListener('click', function () {
    hide(say);
    var f = afterOk; afterOk = null;
    if (f) f();
  });

  function tierOf(frac) { return frac >= 2 / 3 ? 'fast' : (frac >= 1 / 3 ? 'mid' : 'slow'); }   // frac=残り時間の割合(1=出題の直後)
  function signed(n) { return (n >= 0 ? '+' : '') + n; }

  // ---- 連絡する(「はい」を押した) ----
  function contact() {
    var gm = window.GAME_MODE;
    if (!gm || !gm.mode || gm.ended) { hide(ask); return; }
    if (state.dispatchDone) { hide(ask); return; }
    if (state.deckImpossible) {
      var r = gm.dispatchResult('found');
      state.dispatchDone = true;
      openSay(pick(LINES.found[tierOf(r.frac)]), '早期発見ボーナス ' + signed(r.bonus) + '点(' + Math.round(r.sec) + '秒)', '荷物を変える', function () { state.changeCargo(); });
    } else {
      var w = gm.dispatchResult('false');
      state.dispatchDone = true;   // 間違えて連絡した荷物には、もう連絡できない(やりとりは終わり)
      openSay(pick(LINES.wrong), '連絡ミス ' + signed(-w.penalty) + '点', '作業に戻る', null);
    }
  }
  // 積めない荷物に気づかないまま制限時間を過ぎた(modes.js の tick から呼ばれる)
  function onTimeout() {
    var gm = window.GAME_MODE;
    if (!gm || gm.ended || state.dispatchDone) return;
    state.dispatchDone = true;
    gm.dispatchResult('timeout');
    openSay(pick(LINES.missed), 'このターンで稼いだ点は0点になりました', '荷物を変える', function () { state.changeCargo(); });
  }

  btn.addEventListener('click', function () {
    if (btn.disabled) return;
    show(ask);
  });
  $('btnDispatchYes').addEventListener('click', contact);
  $('btnDispatchNo').addEventListener('click', function () { hide(ask); });

  // ボタンは、モード開始後で、荷物が届いていて、そのターンにまだ連絡していない間だけ押せる
  setInterval(function () {
    var gm = window.GAME_MODE;
    var ok = !!(gm && gm.mode && !gm.ended && state.deck && state.deck.length && !state.dispatchDone);
    btn.disabled = !ok;
    btn.classList.toggle('na', !ok);
  }, 200);

  window.DISPATCH = { LINES: LINES, onTimeout: onTimeout, contact: contact };   // (確認用にも公開)
})();
