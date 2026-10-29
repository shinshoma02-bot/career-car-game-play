// 機構の操作ポップ(2026-10-21 ユーザー指示): 道板・扇動板・スライド板を、タップした近くのボタンで操作する。
// 使い方: MECH_POP.show(画面のx, 画面のy, 題名, [{ label: 関数(今の文字), run: 関数, keep: 押しても開いたままか }])
// ・ボタンを押すと、run を実行する(keep が false なら閉じる)。ポップの外をタップすると閉じる。
// ・開いている間は、文字(「出す/しまう」など)を今の状態に合わせて書き直す。
(function () {
  var box = null, items = [], timer = null;

  function ensure() {
    if (box) return box;
    box = document.createElement('div');
    box.id = 'mechPop';
    box.style.display = 'none';
    document.body.appendChild(box);
    // ポップの外を押したら閉じる(押す前の pointerdown で判定する。ボタンを押した時は閉じない)
    document.addEventListener('pointerdown', function (e) {
      if (box.style.display !== 'none' && !box.contains(e.target)) hide();
    }, true);
    return box;
  }

  function render() {
    box.querySelectorAll('.mechPopBtn').forEach(function (b) { b.remove(); });   // 題名(.mechPopTitle)は残す
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mechPopBtn' + (it.on && it.on() ? ' on' : '');
      if (it.icon) { var im = document.createElement('img'); im.src = 'assets/common/ui/' + it.icon + '.png'; im.alt = ''; b.appendChild(im); }
      var sp = document.createElement('span'); sp.className = 'mechPopLabel'; sp.textContent = it.label(); b.appendChild(sp);
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        it.run();
        if (!it.keep) hide(); else refresh();
      });
      box.appendChild(b);
    });
  }

  // 文字と「on」の色を、今の状態に合わせて書き直す(ボタンを作り直すと、押した瞬間の感触が悪いので、文字だけ変える)
  function refresh() {
    if (!box || box.style.display === 'none') return;
    var btns = box.querySelectorAll('.mechPopBtn');
    items.forEach(function (it, i) {
      if (!btns[i]) return;
      var lab = btns[i].querySelector('.mechPopLabel'); if (lab) lab.textContent = it.label(); else btns[i].textContent = it.label();
      btns[i].classList.toggle('on', !!(it.on && it.on()));
    });
  }

  function place(cx, cy) {
    var w = box.offsetWidth || 180, h = box.offsetHeight || 90;
    var left = Math.min(Math.max(8, cx + 12), window.innerWidth - w - 8);
    var top = Math.min(Math.max(8, cy - h / 2), window.innerHeight - h - 8);
    box.style.left = left + 'px';
    box.style.top = top + 'px';
  }

  function show(cx, cy, title, list, icon) {
    ensure();
    items = list;
    box.innerHTML = '';
    var t = document.createElement('div');
    t.className = 'mechPopTitle';
    if (icon) { var ti = document.createElement('img'); ti.src = 'assets/common/ui/' + icon + '.png'; ti.alt = ''; t.appendChild(ti); }
    var tt = document.createElement('span'); tt.textContent = title; t.appendChild(tt);
    box.appendChild(t);
    render();
    box.style.display = '';
    place(cx, cy);
    clearInterval(timer);
    timer = setInterval(refresh, 250);   // ほかの操作(道板の動きなど)で状態が変わっても、文字を合わせる
  }

  function hide() {
    if (box) box.style.display = 'none';
    clearInterval(timer);
    timer = null;
  }

  window.MECH_POP = {
    show: show,
    hide: hide,
    get open() { return !!box && box.style.display !== 'none'; }
  };
})();
