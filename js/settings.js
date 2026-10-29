// 『設定』ボタンと、その画面(音 / 言語)。2026-10-27 ユーザー指示。ゲーム画面(index.html)は上のバー(モードバー)の右端、タイトル画面は右上に置く。
// ・『音』: js/sound.js が作る音の設定画面(BGM・SEの音量とON/OFF)を開く(window.SFX_UI.open())
// ・『言語』: 日本語 / English を選ぶ(js/i18n.js の window.I18N.set)。選んだ言語は保存される
// 画面の文字は日本語で書いておき、英語のときは js/i18n.js が js/i18n_en.js の辞書で置き換える
(function () {
  'use strict';
  var STYLE = '#setPanel{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}' +
    '#setPanel[hidden]{display:none}' +
    '#setPanel .set-box{width:min(340px,100%);background:#16202c;color:#dfe8f2;border:2px solid #4b6078;border-radius:10px;padding:18px 18px 16px;font-size:15px;box-sizing:border-box}' +
    '#setPanel h2{margin:0 0 14px;font-size:17px;text-align:center;font-weight:bold}' +
    '#setPanel .set-btn{display:block;width:100%;min-height:46px;margin-top:10px;font-size:16px;border-radius:8px;border:2px solid #4b6078;background:#243446;color:#dfe8f2;cursor:pointer}' +
    '#setPanel .set-btn.on{background:#1f5a48;border-color:#7dfcd0;color:#fff}' +
    '#setPanel .set-sub{margin:4px 0 0;font-size:12px;color:#9fb0c2;text-align:center}' +
    '#btnSettings.set-fab{position:fixed;top:max(8px,env(safe-area-inset-top));right:max(8px,env(safe-area-inset-right));z-index:50;min-height:36px;padding:0 12px;font-size:13px;border-radius:8px;border:2px solid #4b6078;background:rgba(22,32,44,.85);color:#dfe8f2;cursor:pointer}' +
    '#modeBar #btnSettings{min-height:32px;padding:0 10px;font-size:13px;border-radius:8px;border:2px solid #4b6078;background:rgba(22,32,44,.85);color:#dfe8f2;cursor:pointer}';
  var panel = null, body = null, btn = null;

  function langBtn(code, label) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'set-btn' + (window.I18N && window.I18N.lang === code ? ' on' : ''); b.textContent = label;
    b.addEventListener('click', function () { if (window.I18N) window.I18N.set(code); showMenu(); });
    return b;
  }
  function showMenu() {
    body.innerHTML = '';
    var h = document.createElement('h2'); h.textContent = '設定'; body.appendChild(h);
    var snd = document.createElement('button'); snd.type = 'button'; snd.className = 'set-btn'; snd.textContent = '音';
    snd.addEventListener('click', function () { close(); if (window.SFX_UI) window.SFX_UI.open(); });
    body.appendChild(snd);
    var lg = document.createElement('button'); lg.type = 'button'; lg.className = 'set-btn'; lg.textContent = '言語 / Language';
    lg.addEventListener('click', showLang);
    body.appendChild(lg);
    body.appendChild(closeBtn());
  }
  function showLang() {
    body.innerHTML = '';
    var h = document.createElement('h2'); h.textContent = '言語 / Language'; body.appendChild(h);
    body.appendChild(langBtn('ja', '日本語'));
    body.appendChild(langBtn('en', 'English'));
    var p = document.createElement('p'); p.className = 'set-sub'; p.textContent = '英語は準備中の文があります(未訳の文は日本語のまま表示されます)'; body.appendChild(p);
    var back = document.createElement('button'); back.type = 'button'; back.className = 'set-btn'; back.textContent = '戻る'; back.addEventListener('click', showMenu); body.appendChild(back);
  }
  function closeBtn() {
    var c = document.createElement('button'); c.type = 'button'; c.className = 'set-btn'; c.textContent = '閉じる'; c.addEventListener('click', close); return c;
  }
  function open() { showMenu(); panel.hidden = false; }
  function close() { if (panel) panel.hidden = true; }
  function build() {
    if (panel || !document.body) return;
    var st = document.createElement('style'); st.textContent = STYLE; document.head.appendChild(st);
    panel = document.createElement('div'); panel.id = 'setPanel'; panel.hidden = true;
    panel.innerHTML = '<div class="set-box" role="dialog" aria-label="設定"></div>';
    body = panel.firstChild;
    // 画面の操作(ゲームのタップ)を、設定の中で止める
    panel.addEventListener('pointerdown', function (e) { if (window.SFX_UI) { /* 音の有効化は sound.js 側が最初のタップで行う */ } e.stopPropagation(); });
    panel.addEventListener('click', function (e) { e.stopPropagation(); if (e.target === panel) close(); });
    document.body.appendChild(panel);
    var bar = document.getElementById('modeBar'), floating = !bar;
    btn = document.createElement('button');
    btn.id = 'btnSettings'; btn.type = 'button'; btn.textContent = '設定'; btn.title = '設定(音・言語)';
    if (floating) { btn.className = 'set-fab'; document.body.appendChild(btn); } else bar.appendChild(btn);
    btn.addEventListener('click', function (e) { e.stopPropagation(); open(); });
  }
  window.SETTINGS_UI = { open: function () { build(); open(); }, close: close };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
