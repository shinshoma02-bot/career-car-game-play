// 言語切り替え(日本語 / English)。2026-10-27 ユーザー指示。
// ・元の文は日本語のまま(コードや HTML に書いてある日本語が「正」)。英語は js/i18n_en.js の辞書で『日本語の文 → 英語の文』に置き換える
//   → 日本語の文を直した時は、辞書に無いので日本語のまま表示される(壊れない)。直した文の英訳は、辞書の左側(日本語)を新しい文に合わせて直す
// ・画面の文字(テキスト・title/aria-label/placeholder 属性)は、DOM を監視して自動で置き換える。JS から文を作る所は、辞書の完全一致 + 数字を含む文の型(I18N_EN_PATTERNS)で対応する
// ・辞書に無い日本語は I18N.missing に溜まる(確認: .claude/tools/i18n_scan.js が一覧を出す = 翻訳を依頼する時の元になる)
// ・言語は localStorage の 'lang' に保存(ja / en)。URL に #lang=en を付けても切り替わる(確認用)
(function () {
  'use strict';
  var KEY = 'lang', lang = 'ja';
  try { lang = localStorage.getItem(KEY) || ''; } catch (e) { }
  var mh = /[#&]lang=(ja|en)(&|$)/.exec(location.hash || '');
  if (mh) lang = mh[1];
  if (lang !== 'en' && lang !== 'ja') lang = 'ja';
  var JA = /[぀-ヿ㐀-鿿ｦ-ﾟ]/;
  var missing = {}, listeners = [];
  var origText = typeof WeakMap === 'function' ? new WeakMap() : null, origAttr = typeof WeakMap === 'function' ? new WeakMap() : null;
  var ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];

  var seg = false;
  function dict() { return window.I18N_EN || {}; }
  // 日本語の文 → 英語。辞書に無ければそのまま返す(第2引数が true なら、無い時は null)
  function translate(ja, strict) {
    if (lang !== 'en' || typeof ja !== 'string' || !JA.test(ja)) return ja;
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(ja), core = m[2], d = dict();
    var hit = Object.prototype.hasOwnProperty.call(d, core) ? d[core] : null;
    if (hit === null) {
      var pats = window.I18N_EN_PATTERNS || [];
      for (var i = 0; i < pats.length && hit === null; i++) {
        var r = pats[i][0].exec(core);
        if (r) hit = typeof pats[i][1] === 'function' ? pats[i][1](r, translate) : core.replace(pats[i][0], pats[i][1]);
      }
    }
    if ((hit === null || hit === undefined) && /[。！？!?]./.test(core) && !seg) {   // 文がつながっている時は、1文ずつ訳す(訳せた文だけ英語にして、残りは日本語のまま)
      var parts = core.match(/[^。！？!?]+[。！？!?]*|[。！？!?]+/g) || [], got = 0, outp = parts.map(function (x) { seg = true; var r = translate(x, true); seg = false; if (r === null) { if (JA.test(x)) missing[x.trim()] = (missing[x.trim()] || 0) + 1; return x; } got++; return r; });
      if (got) hit = outp.join(' ');
    }
    if (hit === null || hit === undefined) { if (!seg) missing[core] = (missing[core] || 0) + 1; return strict ? null : ja; }
    return m[1] + hit + m[3];
  }

  // ---- DOM の自動置き換え ----
  function applyText(node) {
    if (!origText) return;
    var rec = origText.get(node), cur = node.data;
    if (rec && rec.en !== null && cur === rec.en) { if (lang === 'ja') { node.data = rec.ja; rec.en = null; } return; }   // 自分で置いた英語
    if (!JA.test(cur)) { if (rec) origText.delete(node); return; }
    rec = { ja: cur, en: null }; origText.set(node, rec);
    if (lang === 'en') { var en = translate(cur); if (en !== cur) { rec.en = en; node.data = en; } }
  }
  function applyAttrs(el) {
    if (!origAttr || el.nodeType !== 1) return;
    var map = origAttr.get(el) || {};
    ATTRS.forEach(function (a) {
      if (!el.hasAttribute(a)) { delete map[a]; return; }
      var cur = el.getAttribute(a), rec = map[a];
      if (rec && rec.en !== null && cur === rec.en) { if (lang === 'ja') { el.setAttribute(a, rec.ja); rec.en = null; } return; }
      if (!JA.test(cur)) { delete map[a]; return; }
      rec = map[a] = { ja: cur, en: null };
      if (lang === 'en') { var en = translate(cur); if (en !== cur) { rec.en = en; el.setAttribute(a, en); } }
    });
    origAttr.set(el, map);
  }
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 };
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { applyText(root); return; }
    if (root.nodeType !== 1 || SKIP[root.tagName]) return;
    applyAttrs(root);
    for (var c = root.firstChild; c; c = c.nextSibling) walk(c);
  }
  var obs = null;
  function start() {
    if (obs || !window.MutationObserver || !document.documentElement) return;
    obs = new MutationObserver(function (list) {
      if (lang !== 'en') return;   // 日本語の間は何もしない(元の文のまま。英語から戻す時は setLang の walk で戻す)
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === 'characterData') applyText(m.target);
        else if (m.type === 'attributes') applyAttrs(m.target);
        else for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    if (lang === 'en') walk(document.documentElement);
  }
  function setLang(l) {
    if (l !== 'en' && l !== 'ja') return;
    lang = l;
    try { localStorage.setItem(KEY, l); } catch (e) { }
    document.documentElement.lang = l;
    walk(document.documentElement);
    listeners.forEach(function (f) { try { f(l); } catch (e) { } });
  }
  document.documentElement.lang = lang;
  window.I18N = {
    get lang() { return lang; },
    set: setLang,
    t: translate,                       // JS から文を出す所で使う: I18N.t('日本語の文')
    onChange: function (f) { listeners.push(f); },
    missing: missing,                   // 辞書に無かった日本語の文 → 出た回数
    refresh: function () { walk(document.documentElement); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
