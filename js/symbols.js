// 記号の辞書(2026-10-25 ユーザー指示)。記号ごとに「画面の表記」「読み上げの言葉」「読み方(ひらがな)」を1か所で決める。
// 画面の文字・セリフは、記号を直接書かず、ここのキーで取り出す(例: SYMBOLS.screen('UP') → '▲')。
// 追加・変更は、この表だけを直す。文の中の記号は、「{UP}」のように書いて SYMBOLS.fill() で置き換えられる。
(function () {
  'use strict';
  var TABLE = {
    UP:        { screen: '▲', label: '▲ボタン',   speech: '上矢印ボタン',   yomi: 'うえやじるしぼたん' },
    DOWN:      { screen: '▼', label: '▼ボタン',   speech: '下矢印ボタン',   yomi: 'したやじるしぼたん' },
    LEFT:      { screen: '◀', label: '◀ボタン',   speech: '左矢印ボタン',   yomi: 'ひだりやじるしぼたん' },
    RIGHT:     { screen: '▶', label: '▶ボタン',   speech: '右矢印ボタン',   yomi: 'みぎやじるしぼたん' },
    FWD:       { screen: '◀(前進)', label: '◀(前進)ボタン', speech: '前進ボタン', yomi: 'ぜんしんぼたん' },
    BACK:      { screen: '▶(後退)', label: '▶(後退)ボタン', speech: '後退ボタン', yomi: 'こうたいぼたん' }
  };

  // 画面に出す表記
  function screen(key) { return TABLE[key] ? TABLE[key].screen : ''; }
  // 画面のボタン名(「▲ボタン」)
  function label(key) { return TABLE[key] ? TABLE[key].label : ''; }
  // 読み上げる言葉(「上矢印ボタン」)
  function speech(key) { return TABLE[key] ? TABLE[key].speech : ''; }
  // 読み方(ひらがな。読み間違いを防ぐ用)
  function yomi(key) { return TABLE[key] ? TABLE[key].yomi : ''; }
  // 文の中の {KEY} を置き換える。「{KEY}ボタン」は、読み上げでは「上矢印ボタン」(ボタンを二重にしない)
  function fill(text, mode) {
    var pick = mode === 'speech' ? speech : (mode === 'yomi' ? yomi : screen);
    return String(text).replace(/\{([A-Z_]+)\}(ボタン)?/g, function (all, key, btn) {
      if (!TABLE[key]) return all;
      if (mode === 'speech') return speech(key);
      if (mode === 'yomi') return yomi(key);
      return pick(key) + (btn || '');
    });
  }

  // HTML の文字(本文・title・aria-label)の {KEY} を、読み込み後に画面用の表記へ直す
  function applyDom(root) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var nodes = [], n;
    while ((n = walker.nextNode())) if (/\{[A-Z_]+\}/.test(n.nodeValue)) nodes.push(n);
    nodes.forEach(function (t) { t.nodeValue = fill(t.nodeValue, 'screen'); });
    root.querySelectorAll('[title],[aria-label]').forEach(function (el) {
      ['title', 'aria-label'].forEach(function (a) {
        var v = el.getAttribute(a);
        if (v && /\{[A-Z_]+\}/.test(v)) el.setAttribute(a, fill(v, 'screen'));
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { applyDom(document.body); });
  else applyDom(document.body);

  window.SYMBOLS = { applyDom: applyDom, KEY: Object.freeze(Object.keys(TABLE).reduce(function (o, k) { o[k] = k; return o; }, {})), screen: screen, label: label, speech: speech, yomi: yomi, fill: fill, TABLE: TABLE };
})();
