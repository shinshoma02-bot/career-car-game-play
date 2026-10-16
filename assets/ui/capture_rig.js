// R27: ゲームの画面(#stage の canvas)を、背景だけ「真っ黒」「真っ白」に差し替えて2回書き出す(make_rig_from_game.py が透過PNGにする)。
// 使い方(リポジトリの一番上で): python3 .claude/nocache_server.py 8080 &  →  node assets/ui/capture_rig.js <出力フォルダ>
// 状態: シミュレーションの開始直後(棚はすべて走行位置・車は積まない)、昼のヤード、UI(印・枠)は非表示。
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const OUT = process.argv[2] || '.';
// 2520×724 の単色PNG(背景の差し替え用)を作る
function png(r, g, b, a) {
  const W = 2520, H = 724, row = Buffer.alloc(1 + W * 4);
  for (let x = 0; x < W; x++) row.set([r, g, b, a], 1 + x * 4);
  const raw = Buffer.concat(Array(H).fill(row));
  const crc = (buf) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xffffffff; for (const v of buf) c = t[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const BG = { bk: png(0, 0, 0, 255), wh: png(255, 255, 255, 255) }, CLEAR = png(0, 0, 0, 0);
  for (const col of ['bk', 'wh']) {
    const p = await b.newPage({ viewport: { width: 2520, height: 724 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route(/yard_bg[^/?]*\.(png|webp)/, r => r.fulfill({ body: BG[col], contentType: 'image/png' }));
    await p.route(/yard_ground[^/?]*\.(png|webp)/, r => r.fulfill({ body: CLEAR, contentType: 'image/png' }));
    await p.goto('http://localhost:8080/index.html#mode=sim&yard=day', { waitUntil: 'load' });
    await p.waitForTimeout(5000);
    await p.evaluate(() => { window.UI_HIDDEN = true; });
    await p.waitForTimeout(1500);
    const data = await p.evaluate(() => document.getElementById('stage').toDataURL('image/png'));
    fs.writeFileSync(path.join(OUT, 'cap_' + col + '.png'), Buffer.from(data.split(',')[1], 'base64'));
    console.log(col, errs.length ? errs : 'ok');
    await p.close();
  }
  await b.close();
})();
