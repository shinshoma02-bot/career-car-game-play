// メイン画面の『ガイド』(2026-10-28 ユーザー要望): キャリアカー用語集・モードごとの遊び方・得点と減点・クレジット。
// タイトル画面(title.html)の『ガイド』ボタンから開く全画面のパネル。文章は下の GUIDE_DATA にまとめてある(直す時はここだけ)。
// 数字(得点・減点・時間・高さ制限)は js/modes.js の SCORE・EXT・DIFF_MULT と同じ。そちらを変えたら、この表の文も直す。
(function () {
  var GUIDE_DATA = {
    // ---- 遊び方 ----
    play: [
      { h: 'ゲームの目的', p: [
        'セミトレーラー型のキャリアカー(車を運ぶトラック)に、決まった台数の車を、安全に・低く・早く積み込みます。積み込む場所は、上の段の1〜3番、下の段の4〜6番、7台の荷物の時は宙段フロア(7番)です。',
        '荷物(積む車の組み合わせ)は毎回かわります。車の高さ・長さ・幅によって、入れる場所が決まります。' ] },
      { h: '1台を積む流れ', p: [
        '① 道板(車が乗る坂)を出す。',
        '② 車の一覧から車をタップして呼ぶ。向き(前向き/バック)は、車の下のボタンで選べます。',
        '③ 右下の◀(前進)を押している間、車が進みます。離すとゆっくり止まります。輪止めか落とし穴に前輪が当たって止まると「OK」が出ます。通り過ぎたら▶(後退)で戻れます。',
        '④ OKの車を、指で約0.5秒長押しして固定します(ちょっと触れただけでは固定されません)。',
        '⑤ ノーマル・ハードでは、荷締機でワイヤーを張る(緊締)ところまでが1台分です。' ] },
      { h: 'サイクルの完了', p: [
        '全部の車を積んで固定したら、上のフロアをセットピンで固定、5番フロアを平らに、タイヤ(スライド車軸)を走行状態に戻し、4番扇動板と道板をしまうと「サイクル完了」です。スコアアタックでは自動で次の荷物、シミュレーションでは「出発」ボタンで次の荷物になります。' ] },
      { h: 'スコアアタック', p: [
        '制限時間の中で、どれだけスコアを伸ばせるかの勝負です。最初の持ち時間は、イージー5分・ノーマル/ハード4分20秒。サイクルを完了するたびに時間が延びます(延びる量は、イージー3分30秒・ノーマル/ハード3分から始まって、1回ごとに15秒ずつ減り、最低1分30秒)。そのサイクルのミス1回につき、延長が10秒減ります(最低30秒は延びます)。',
        '時間が0になるか、「荷役を終え出発」を押すと終わります。結果は、スコアで競います。' ] },
      { h: 'リアルモード', p: [
        'ミスした時点で終わりです。重いミスは1回で終了、軽いミスは3回で終了。何がいけなかったかが結果に出ます。1サイクル(1荷物)を、ノーミスで積み切れるかに挑戦します。' ] },
      { h: 'チュートリアル', p: [
        '操作とルールを、順番に覚えるモードです。7台の決まった荷物を、案内に従って最後まで積みます。「飛ばす(自動でやる)」を押すと、その手順を先輩が代わりにやってくれます。得点や時間はありません。' ] },
      { h: 'シミュレーション', p: [
        '時間制限も終了もなく、自由に動かせる練習用です。ミスは減点されますが(×1)、ゲームは終わりません。トレーラーの種類も選べます。' ] },
      { h: '難易度', table: [
        ['', 'イージー', 'ノーマル', 'ハード'],
        ['ヒント・解説', 'あり', 'なし', 'なし(状態表示も出ない)'],
        ['危ない操作', '警告して車を止める', '止めずにミスとして記録', '止めずにミスとして記録'],
        ['エンジン・PTO・昇降メインスイッチ', '操作不要', '操作が必要', '操作が必要'],
        ['荷締機での緊締', '不要', '必要', '必要'],
        ['得点の倍率', '×1', '×1.5', '×2'] ] },
      { h: '操作のコツ', p: [
        '・トレーラーの光る枠(スイッチ)をタップすると、手元の操作盤が出て、スイッチのあたりに画面が寄ります。もう1回タップすると、元の位置に戻って操作盤も閉じます。',
        '・前側のスイッチ(1番・2番)を開くと、扇動板・スライド板のボタンも出ます。',
        '・画面右上の「設定」で、音と言語を切り替えられます。' ] }
    ],
    // ---- 得点・減点 ----
    score: [
      { h: '得点', table: [
        ['項目', '点数'],
        ['1台を積み込む(OKが出る)', '+100'],
        ['積めない荷物に早く気づいて「配車に連絡」', '+50〜+300(早いほど多い。その間は直線で減る)'] ] },
      { h: '減点', table: [
        ['項目', '点数'],
        ['軽いミス(手順の不備)', '−30(1回)'],
        ['重いミス(安全上の重大なミス)', '−80(1回)'],
        ['荷姿の高さが制限を超えた', '−1000点/m(10cmで−100点)'],
        ['積めるのに「積めない」と配車に連絡した', '−150'] ] },
      { p: [ '得点・減点は、難易度の倍率(イージー×1・ノーマル×1.5・ハード×2)を掛けます。シミュレーションは×1です。同じ理由のミスは、車1台につき1回だけ数えます。' ] },
      { h: '軽いミスの例', list: [
        '道板を出していないのに車を呼んだ',
        '輪止め(落とし穴)に当たっていないのに、フロアを動かした',
        'すでに車がある場所に積もうとした',
        'その場所には積めない車種(幅1.755mを超える車を6番へ、など)',
        '台車のタイヤに、車の横が擦れた' ] },
      { h: '重いミスの例', list: [
        '駐車中の車・フレーム・輪止めにぶつかった、乗り越えた、脱輪した',
        'セットピンを刺さずに、フロアの下へ車が入った',
        'フロアが車の屋根・車体の下に当たった',
        '車が乗りかけの時に、宙段フロアを動かした',
        'スライド車軸を伸ばさずに、軽自動車以外が6番の横を通った',
        '道板が、待機中の車に当たった',
        '出発する時に、道板を出したままだった・道板の上に車がいた' ] },
      { h: '荷姿の高さ', p: [
        '積んだ状態で、地面から一番高い所の高さです。画面の上の「荷姿の高さ」に出ます。高さ制限は約4.1mです(宙段フロアを使う7台の荷物は、宙段フロアのために2・3番を高く上げるので、その分ゆるくなります)。',
        'その荷物をいちばん低く積めた高さ+5cmまでは、減点されません。車の組み合わせで高くなってしまう分は、減点しません。減点されるのは、並べ方やフロアの上げすぎで、避けられた高さだけです。積み終わったら、上のフロアは当たらない範囲でできるだけ低く下げて、セットピンで固定しましょう。' ] },
      { h: '配車への連絡', p: [
        '時々、組み合わせ的にどうやっても積めない荷物が来ます。そのときは「配車に連絡」で伝えます。出題から90秒以内で、早いほどボーナスです(ノーマル・ハードは倍率が掛かります)。積めるのに連絡すると減点です。気づかずに90秒を過ぎると、その荷物の積み込み点は0点になります。' ] }
    ],
    // ---- 用語集(五十音順ではなく、場所・道具・操作の順) ----
    terms: [
      { cat: 'トレーラーの場所', items: [
        ['キャリアカー', '車を運ぶ専用のトラック。このゲームでは、運転席(ヘッド)にセミトレーラー型の荷台をつないだものです。「積載車」とも呼びます。'],
        ['1番・2番・3番', '荷台の上の段の積み位置です。奥(運転席側)から順に1番・2番・3番。上の段は、車が後ろから前へ進むので、奥の1番から埋めます。'],
        ['4番・5番・6番', '荷台の下の段の積み位置です。一番前が4番、真ん中が5番、後ろが6番。'],
        ['宙段(ちゅうだん)フロア・7番', '5番と6番の間にある、持ち上がる短いフロア。7台目の車を載せる場所で、普段は下の床にたたまれています。「中段」と呼ぶこともありますが、このゲームでは宙段で統一しています。'],
        ['フロア', '車を載せる床。1番フロア・2番フロア・3番フロアは、前後の端がそれぞれ油圧で上下します。'],
        ['3番 前(継ぎ目)', '2番フロアと3番フロアのつなぎ目。3番 前を上げると、シーソーのように3番 後が下がります。'],
        ['道板(みちいた)', 'トレーラーの後ろから、車が乗り込むための坂。積み込む前に出し、走る前にしまいます。ラダーとも言います。'],
        ['ヘッド', '運転席のある、牽引する側の車両(トラクター)。'] ] },
      { cat: '板・つなぎの部品', items: [
        ['扇動板(せんどうばん)', 'フロア同士のすき間をつなぐ、橋のような板。2番扇動板(2番フロアの前端)と、4番扇動板(5番と4番の間)があります。'],
        ['2番扇動板', '2番フロアの前端にある、外側へ開く板。開いていると、1番への道が切れたり、2番の車に当たったりするので、積む時は閉じます。'],
        ['4番扇動板', '5番フロアが持ち上がった時に、4番へつなぐ板。「搬出」で出し、「格納」でしまいます。'],
        ['スライド板', '1番と2番の間のすき間を埋める板。上げた1番フロアの後ろに付いているので、2番に積む前にしまいます。'],
        ['5番スロープ', '5番フロアを、2番 前のシリンダーの余力で持ち上げて作る坂。4番へ上がるときに使います。ストッパー(引っかけ金具)が掛かって止まります。'],
        ['赤いレバー', '5番を平らに戻す時に、ストッパーを外すレバー。'] ] },
      { cat: 'ピン・スイッチ・動力', items: [
        ['セットピン', '柱の穴に差す、フロアを受ける棒。フロアを上げたら、少し下の穴に差して固定します。穴の番号が大きいほど高い位置です。フロアが載っている間は抜けません(少し上げてから抜く)。'],
        ['固定ピン(赤い板)', '宙段フロアを持ち上げた時に、フロアの下面が当たって止まる、フレーム側の棒。差す穴の位置で、止まる高さが決まります。'],
        ['昇降スイッチ(ペンダントスイッチ)', '手に持つ、上下ボタン(▲▼)のスイッチ。押している間だけフロアが上下します。トレーラー上の光る枠をタップすると、手元の操作盤に出ます。'],
        ['油圧シリンダー', '油の圧力でフロアを持ち上げる筒。ポンプの動力(PTO)で動きます。'],
        ['PTO(ピーティーオー)', 'エンジンの力を、油圧ポンプなどへ取り出す装置。ノーマル・ハードでは、エンジンを始動して、PTOをONにする必要があります。'],
        ['昇降メインスイッチ', 'フロアの昇降を許可するスイッチ。ONにしないと、フロアは動きません(ノーマル・ハード)。'],
        ['リミットスイッチ', '動きが限界まで来ると、自動で止める装置。'],
        ['シーソー', '3番の前と後ろが、片方が上がるともう片方が下がる関係。'] ] },
      { cat: '台車・タイヤ', items: [
        ['スライド車軸', '台車(後ろの車軸)のタイヤを、横へ伸び縮みさせられる仕組み。伸ばさないと、6番の横を通れるのは軽自動車(幅1.48m以下)だけです。'],
        ['ジャッキ', 'トレーラーの後ろを持ち上げる脚。タイヤを浮かせると、スライド車軸が動かせます。▲で伸びる、▼で縮みます。'],
        ['ロック(右押・右引・左押・左引)', 'スライド車軸が走行中に動かないようにする留め具。「引」で解除、「押」でロックです。'],
        ['エアサス', '空気のばねの懸架(サスペンション)。タイヤが地面につくと、台車の車高が少し下がります。'] ] },
      { cat: '止める・固定する', items: [
        ['輪止め(わどめ)', 'タイヤを止めるくさび。1〜4番は元からあるタイヤ止めの手前に置けます(任意)。5・6番は床の穴にはめて置きます(必須)。置く位置で、車が止まる位置が変わります。'],
        ['タイヤストッパ', '1番と4番の先端に元からある、タイヤを止める金具。'],
        ['落とし穴・落し蓋', '2・3番の床にある、タイヤを落として止める穴と、そのふた。蓋を開けると、タイヤが穴に落ちて止まれます。蓋が閉じたままで輪止めも無いと、車は止まれません。'],
        ['緊締(きんてい)・荷締機', '車のタイヤの前後にワイヤーのフックを掛け、荷締機(ワイヤーを張る道具)のハンドルを回して、車が動かないよう固定すること。走行中や、フロアを動かす時に必要です。'],
        ['固縛(こばく)', '荷物を、ワイヤーやベルトでしっかり縛って固定すること。緊締と同じ意味で使います。'],
        ['長押し固定', 'このゲームでは、OKの出た車を約0.5秒長押しして、固定扱いにします。'] ] },
      { cat: '積み込み', items: [
        ['前進・バック', '車を前へ進めるのが前進、後ろ向きで進めるのがバック。向き(前向き/後ろ向き)は車ごとに選べ、後ろ向きの車は、◀で進むとお尻から進みます。'],
        ['荷姿(にすがた)', '積み込んだ状態の見た目・大きさ。特に、地面から一番高い所の高さを指します。'],
        ['高さ制限', '道路を走るために決められた高さの上限。このゲームの基準は約4.1mです。'],
        ['全幅', '車の横幅。6番には、幅1.755m以下(軽自動車・5ナンバー・ステップワゴンクラスまで)の車しか積めません。'],
        ['軽自動車', '小さい規格の車(幅1.48m以下)。スライド車軸を伸ばさなくても、6番の横を通れます。'],
        ['屋根(ルーフ)', '車の一番高い所。下の段に入れる車は、屋根が高いと、上のフロアに当たります。'],
        ['ボンネット', '車の前の、エンジンを覆う部分。5番の車は、宙段フロアが持ち上がる時に前端の下に入るので、ボンネットが低く、短い車が向きます。'],
        ['着座・OK', '車が輪止めや落とし穴に前輪が当たって止まり、積み位置に収まった状態。画面に「OK」と出ます。'] ] },
      { cat: '仕事・ゲームの言葉', items: [
        ['陸送', '車を、車両運搬車(キャリアカー)などで運ぶ仕事。'],
        ['サイクル', '1荷物(6〜7台)を積み切って、出発できる状態にするまでの1回分。'],
        ['配車', '車や荷物の割り当てを決める担当(係)。このゲームでは、積めない荷物を連絡する相手です。'],
        ['荷役(にやく)', '荷物を積む・降ろす作業。'] ] }
    ],
    // ---- クレジット ----
    credits: [
      { h: 'ゲーム', p: [ '僕らは陸送屋(仮)', 'キャリアカー積み込みゲーム。現役のキャリアカードライバーの監修・企画で制作しています。' ] },
      { h: '制作', p: [ 'プログラム・仕様・画像素材の加工・音の組み込み: AI(Claude / Anthropic)の支援で制作' ] },
      { h: 'トレーラーグラフィック 参考車両提供', list: [ 'キヌキヌ さん' ] },
      { h: '音', list: [
        'ガイドの声: VOICEVOX:ずんだもん',
        '効果音・配車の声・BGM: ElevenLabs(AI音声・効果音・音楽生成)で作成' ] },
      { h: '画像', list: [
        '車・トレーラー・背景の絵: AI による画像生成・拡大(Real-ESRGAN)・加工で作成した素材' ] },
      { h: 'フォント', list: [ 'Mochiy Pop One / Noto Sans JP(Google Fonts)' ] },
      { p: [ '※このクレジットは、ゲームの更新に合わせて見直します。' ] }
    ]
  };

  var TABS = [['news', 'お知らせ'], ['status', '対応状況'], ['play', '遊び方'], ['score', '得点・減点'], ['terms', '用語集'], ['credits', 'クレジット'], ['contact', '問い合わせ']];
  var css = [
    '#guideOv { position: fixed; inset: 0; z-index: 50; display: none; align-items: center; justify-content: center; background: rgba(6, 10, 12, .78); padding: max(8px, env(safe-area-inset-top)) 8px max(8px, env(safe-area-inset-bottom)); }',
    '#guideOv.open { display: flex; }',
    '#guideBox { width: min(820px, 100%); max-height: 100%; display: flex; flex-direction: column; background: rgba(14, 22, 24, .97); border: 1px solid var(--line, rgba(255,255,255,.14)); border-radius: 14px; color: var(--ink, #eef3f1); font-family: "Noto Sans JP", system-ui, sans-serif; overflow: hidden; }',
    '#guideHead, #guideTabs { flex: none; }',
    '#guideHead { display: flex; align-items: center; gap: 8px; padding: 10px 12px 6px; }',
    '#guideHead h2 { margin: 0; flex: 1; font-size: 18px; }',
    '#guideClose { all: unset; box-sizing: border-box; cursor: pointer; width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; font-size: 20px; background: rgba(255,255,255,.08); }',
    '#guideClose:focus-visible, .guideTab:focus-visible { outline: 2px solid var(--accent, #33b891); }',
    '#guideTabs { display: flex; gap: 6px; padding: 0 12px 8px; overflow-x: auto; }',
    '.guideTab { all: unset; box-sizing: border-box; cursor: pointer; flex: none; padding: 7px 9px; border-radius: 999px; font-size: 13px; font-weight: 700; background: rgba(255,255,255,.08); color: var(--ink-dim, #a9b7b2); }',
    '.guideTab.on { background: var(--accent-deep, #1f8a6b); color: #fff; }',
    '#guideBody { flex: 1; overflow-y: auto; padding: 4px 14px 16px; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; line-height: 1.7; font-size: 14px; }',
    '#guideBody h3 { margin: 16px 0 6px; font-size: 16px; color: #8fe0c4; border-left: 4px solid var(--accent, #33b891); padding-left: 8px; }',
    '#guideBody h4 { margin: 14px 0 4px; font-size: 14px; color: #ffd98a; }',
    '#guideBody p { margin: 4px 0; }',
    '#guideBody ul { margin: 4px 0; padding-left: 1.3em; }',
    '#guideBody table { border-collapse: collapse; width: 100%; margin: 6px 0; font-size: 13px; }',
    '#guideBody th, #guideBody td { border: 1px solid rgba(255,255,255,.16); padding: 5px 7px; text-align: left; vertical-align: top; }',
    '#guideBody th { background: rgba(255,255,255,.08); }',
    '#guideBody td:first-child { font-weight: 700; }',
    '#guideBody td:last-child:not(:first-child) { min-width: 6.5em; }',
    '#guideBody dl { margin: 4px 0; }',
    '#guideBody dt { margin-top: 8px; font-weight: 700; color: #fff3cf; }',
    '#guideBody dd { margin: 1px 0 0 0; color: #d6e2de; }',
    '#guideFind { box-sizing: border-box; width: 100%; margin: 8px 0 4px; padding: 9px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.06); color: inherit; font-size: 16px; }',
    '#guideForm { position: relative; display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }',
    '.guideLbl { display: flex; flex-direction: column; gap: 4px; font-weight: 700; color: #fff3cf; }',
    '#guideForm select, #guideForm textarea { box-sizing: border-box; width: 100%; padding: 9px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.06); color: inherit; font: inherit; font-size: 16px; font-weight: 400; }',
    '#guideForm select option { color: #111; }',
    '#guideForm textarea { resize: vertical; min-height: 120px; }',
    '.guidePv { display: flex; align-items: center; gap: 10px; }',
    '.guidePv img { max-width: 120px; max-height: 120px; border-radius: 8px; border: 1px solid rgba(255,255,255,.2); }',
    '.guidePvDel { all: unset; cursor: pointer; padding: 7px 12px; border-radius: 8px; background: rgba(255,255,255,.1); font-size: 13px; }',
    '#guideFile { font-size: 14px; font-weight: 400; }',
    '.guideCnt { text-align: right; font-size: 12px; color: var(--ink-dim, #a9b7b2); margin-top: -4px; }',
    '.guideChk { font-size: 13px; line-height: 1.5; }',
    '.guideEnv { font-size: 12px; color: var(--ink-dim, #a9b7b2); word-break: break-all; }',
    '#guideSend { all: unset; box-sizing: border-box; cursor: pointer; text-align: center; padding: 11px; border-radius: 10px; font-weight: 700; background: var(--accent-deep, #1f8a6b); color: #fff; }',
    '#guideSend:disabled { opacity: .45; cursor: default; }',
    '.guideMsg.ok { color: #8fe0c4; } .guideMsg.bad, .guideWarn { color: #ffb4a8; }',
    '.guideNote { font-size: 12px; color: var(--ink-dim, #a9b7b2); }',
    '.guideLink { display: block; text-decoration: none; margin: 10px 0 2px; padding: 12px 14px; border-radius: 10px; background: var(--accent-deep, #1f8a6b); color: #fff; }',
    '.guideLink b { display: block; font-size: 15px; } .guideLink span { font-size: 12px; opacity: .9; }',
    '.guideNews { margin: 8px 0; padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); }',
    '.guideNews b { display: block; color: #fff3cf; margin: 2px 0; } .guideNews p { color: #d6e2de; font-size: 13px; }',
    '.guideDate { font-size: 12px; color: var(--ink-dim, #a9b7b2); }',
    '.guideHead2 { display: flex; align-items: center; gap: 8px; }',
    '.guideStat { font-size: 12px; font-weight: 700; padding: 2px 9px; border-radius: 999px; color: #10181a; }',
    '.guideStat.s0 { background: #ff9d8a; } .guideStat.s1 { background: #ffd34d; } .guideStat.s2 { background: #7fe0b6; }',
    '.guideCnt2 { font-weight: 700; color: #fff3cf; }',
    '#guideNone { color: var(--ink-dim, #a9b7b2); margin: 12px 0; }'
  ].join('\n');

  function el(tag, text, cls) { var e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
  function table(rows) {
    var t = document.createElement('table');
    rows.forEach(function (r, i) {
      var tr = document.createElement('tr');
      r.forEach(function (c) { tr.appendChild(el(i === 0 ? 'th' : 'td', c)); });
      t.appendChild(tr);
    });
    return t;
  }
  function section(body, s) {
    if (s.h) body.appendChild(el('h3', s.h));
    (s.p || []).forEach(function (t) { body.appendChild(el('p', t)); });
    if (s.list) { var ul = document.createElement('ul'); s.list.forEach(function (t) { ul.appendChild(el('li', t)); }); body.appendChild(ul); }
    if (s.table) body.appendChild(table(s.table));
  }
  function renderTerms(body, q) {
    var n = 0;
    q = (q || '').trim().toLowerCase();
    GUIDE_DATA.terms.forEach(function (g) {
      var items = g.items.filter(function (it) { return !q || (it[0] + ' ' + it[1]).toLowerCase().indexOf(q) >= 0; });
      if (!items.length) return;
      body.appendChild(el('h3', g.cat));
      var dl = document.createElement('dl');
      items.forEach(function (it) { dl.appendChild(el('dt', it[0])); dl.appendChild(el('dd', it[1])); n++; });
      body.appendChild(dl);
    });
    if (!n) body.appendChild(el('p', '見つかりませんでした。別の言葉で探してみてください。', null)).id = 'guideNone';
  }

  // ---- お知らせ・対応状況(中身は js/news_data.js)----
  function nd() { return window.NEWS_DATA || { notices: [], issues: [] }; }
  function newestNoticeDate() { return (nd().notices || []).reduce(function (m, n) { return n.date > m ? n.date : m; }, ''); }
  function markNewsSeen() { try { localStorage.setItem('newsSeen', newestNoticeDate()); } catch (e) {} }
  function newsUnread() { var seen = ''; try { seen = localStorage.getItem('newsSeen') || ''; } catch (e) {} return newestNoticeDate() > seen; }
  function renderNews(body) {
    var d = nd();
    if (d.site && d.site.url) {
      var a = document.createElement('a'); a.className = 'guideLink'; a.href = d.site.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.appendChild(el('b', '公開HPを開く')); a.appendChild(el('span', d.site.label || d.site.url)); body.appendChild(a);
    }
    body.appendChild(el('h3', 'お知らせ'));
    (d.notices || []).forEach(function (n) {
      var box = el('div', '', 'guideNews'); box.appendChild(el('div', n.date, 'guideDate')); box.appendChild(el('b', n.title)); box.appendChild(el('p', n.body)); body.appendChild(box);
    });
    if (!(d.notices || []).length) body.appendChild(el('p', 'いまのところ、お知らせはありません。'));
    markNewsSeen();
    var b = document.getElementById('guideBtn'); if (b) b.classList.remove('hasNew');
  }
  function renderStatus(body) {
    var d = nd(), order = { '未対応': 0, '調査中': 1, '対応済み': 2 };
    body.appendChild(el('h3', 'いただいた不具合・ご意見への対応'));
    body.appendChild(el('p', '問い合わせに届いた内容や、見つかった不具合の、対応の状況です。新しいものを上に並べています。'));
    var counts = { '未対応': 0, '調査中': 0, '対応済み': 0 };
    (d.issues || []).forEach(function (i) { if (counts[i.status] !== undefined) counts[i.status]++; });
    body.appendChild(el('p', '未対応 ' + counts['未対応'] + ' ・ 調査中 ' + counts['調査中'] + ' ・ 対応済み ' + counts['対応済み'], 'guideCnt2'));
    (d.issues || []).slice().sort(function (a, b) { return (order[a.status] - order[b.status]) || (a.date < b.date ? 1 : -1); }).forEach(function (i) {
      var box = el('div', '', 'guideNews'), head = el('div', '', 'guideHead2');
      head.appendChild(el('span', i.status, 'guideStat s' + (order[i.status] === undefined ? 0 : order[i.status])));
      head.appendChild(el('span', i.date + (i.build ? '(ビルド' + i.build + ')' : ''), 'guideDate'));
      box.appendChild(head); box.appendChild(el('b', i.title)); if (i.note) box.appendChild(el('p', i.note)); body.appendChild(box);
    });
    if (!(d.issues || []).length) body.appendChild(el('p', 'いまのところ、載せる項目はありません。'));
  }

  // ---- 問い合わせ(匿名)----
  // 名前・メール・ログインは聞かない。送るのは、種類・本文と、(チェックを外せる)ビルド番号・端末の種類・画面の大きさだけ。送り先は js/feedback_config.js
  var CATS = ['不具合', 'ご意見・要望', '用語・説明の間違い', 'その他'], MAXLEN = 1000, WAIT_MS = 30000;
  function envInfo() {
    var tag = document.getElementById('buildTag'), b = tag ? tag.textContent.replace('ビルド', '').trim() : '?';
    var ua = navigator.userAgent, os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '不明';
    var br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : '不明';
    var lang = ''; try { lang = localStorage.getItem('lang') || ''; } catch (e) {}
    return 'ビルド ' + b + ' / ' + os + ' ' + br + ' / 画面 ' + window.innerWidth + '×' + window.innerHeight + ' / 言語 ' + (lang || 'ja');
  }
  // 画像(スクリーンショット)の添付: Google フォームは、ログインなしでは画像ファイルを受け取れない(匿名のままにできない)ので、画像を小さく縮めて文字(data URL)にして、『環境情報』の欄の後ろに付ける。
  //  1回の送信に入る大きさの上限が約3万文字なので、縮めた画像は1.8万文字以内の1枚だけ。届いた画像は、スプレッドシートの『data:image/jpeg;base64,…』のセルを、ブラウザのアドレス欄に貼ると見られる
  var IMG_MAX_CHARS = 18000;
  function shrinkImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var out = null;
        for (var side = 720; side >= 240 && !out; side -= 80) {
          var sc = Math.min(1, side / Math.max(img.width, img.height)), cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(img.width * sc)); cv.height = Math.max(1, Math.round(img.height * sc));
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          for (var q = 0.6; q >= 0.3 && !out; q -= 0.1) { var d = cv.toDataURL('image/jpeg', q); if (d.length <= IMG_MAX_CHARS) out = d; }
        }
        out ? resolve(out) : reject(new Error('too big'));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }
  function contactForm(body) {
    var cfg = window.FEEDBACK_CONFIG || {}, ready = !!(cfg.action && cfg.fields && cfg.fields.message), canImg = !!(ready && cfg.fields.info);
    body.appendChild(el('h3', 'ご意見・不具合の連絡'));
    body.appendChild(el('p', 'ゲームへのご意見・要望、不具合(動かない・おかしい)、用語や説明の間違いを、匿名で送れます。名前・メールアドレス・ログインは必要ありません。'));
    if (!ready) body.appendChild(el('p', 'ただいま準備中です。もう少しお待ちください。', 'guideWarn'));
    var form = document.createElement('form'); form.id = 'guideForm'; form.setAttribute('novalidate', '');
    var l1 = el('label', '種類', 'guideLbl'); var sel = document.createElement('select'); sel.id = 'guideCat';
    CATS.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); }); l1.appendChild(sel);
    var l2 = el('label', '内容(' + MAXLEN + '文字まで)', 'guideLbl'); var ta = document.createElement('textarea'); ta.id = 'guideMsg'; ta.maxLength = MAXLEN; ta.rows = 6;
    ta.placeholder = '例: 3番の車を固定したのに「OK」が消えた。どのモード・どの手順の時か、わかる範囲で書いてください。'; l2.appendChild(ta);
    var cnt = el('div', '0 / ' + MAXLEN, 'guideCnt'); ta.addEventListener('input', function () { cnt.textContent = ta.value.length + ' / ' + MAXLEN; });
    var imgData = null;
    var lImg = el('label', '画像(スクリーンショットなど。1枚まで・任意)', 'guideLbl'); var fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.id = 'guideFile'; lImg.appendChild(fi);
    var pv = document.createElement('div'); pv.className = 'guidePv'; pv.style.display = 'none';
    var pvImg = document.createElement('img'); pvImg.alt = '添付する画像'; var pvDel = el('button', '画像を外す'); pvDel.type = 'button'; pvDel.className = 'guidePvDel'; pv.appendChild(pvImg); pv.appendChild(pvDel);
    if (!canImg) { lImg.style.display = 'none'; }
    var imgNote = el('div', '画像は、小さく縮めてから送ります(細かい文字は読めなくなります)。名前・住所など、個人がわかるものが写っていないか確認してください。', 'guideEnv');
    function clearImg() { imgData = null; fi.value = ''; pv.style.display = 'none'; pvImg.removeAttribute('src'); }
    pvDel.addEventListener('click', clearImg);
    fi.addEventListener('change', function () {
      var f = fi.files && fi.files[0]; if (!f) { clearImg(); return; }
      shrinkImage(f).then(function (d) { imgData = d; pvImg.src = d; pv.style.display = ''; msg.textContent = '画像を付けました(' + Math.round(d.length / 100) / 10 + 'k文字に縮小)。'; msg.className = 'guideMsg ok'; })
        .catch(function () { clearImg(); msg.textContent = 'この画像は縮めて付けられませんでした。別の画像を選ぶか、画像なしで送ってください。'; msg.className = 'guideMsg bad'; });
    });
    var l3 = document.createElement('label'); l3.className = 'guideChk'; var ck = document.createElement('input'); ck.type = 'checkbox'; ck.checked = true; ck.id = 'guideInfo';
    l3.appendChild(ck); l3.appendChild(document.createTextNode(' 調査のため、ビルド番号・端末の種類・画面の大きさも一緒に送る'));
    var shown = el('div', '送る内容: ' + envInfo(), 'guideEnv');
    var hp = document.createElement('input'); hp.type = 'text'; hp.tabIndex = -1; hp.autocomplete = 'off'; hp.setAttribute('aria-hidden', 'true'); hp.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0';   // いたずら送信よけ(人は入れない欄)
    var btn = el('button', '送信する'); btn.type = 'submit'; btn.id = 'guideSend'; btn.disabled = !ready;
    var msg = el('div', '', 'guideMsg'); msg.setAttribute('role', 'status');
    [l1, l2, cnt, lImg, pv, imgNote, l3, shown, hp, btn, msg].forEach(function (n) { form.appendChild(n); });
    body.appendChild(form);
    body.appendChild(el('p', 'いただいた内容は、ゲームの改善のためだけに使います。返信はできません(匿名のため)。個人情報(名前・住所・電話番号など)は書かないでください。', 'guideNote'));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!ready) return;
      var text = ta.value.trim(), last = 0; try { last = +localStorage.getItem('guideSentAt') || 0; } catch (er) {}
      function say(t, bad) { msg.textContent = t; msg.className = 'guideMsg' + (bad ? ' bad' : ' ok'); }
      if (hp.value) { say('送信しました。ありがとうございます。'); return; }   // 自動投稿は、送ったふりをして捨てる
      if (text.length < 5) { say('内容をもう少し詳しく書いてください(5文字以上)。', true); return; }
      if (Date.now() - last < WAIT_MS) { say('続けて送るには、少し待ってください(30秒ほど)。', true); return; }
      var data = new FormData();   // multipart: 画像の文字が長くても、URL形式のように膨らまない
      if (cfg.fields.category) data.append(cfg.fields.category, sel.value);
      data.append(cfg.fields.message, text.slice(0, MAXLEN));
      var info = (ck.checked ? envInfo() : '') + (imgData && cfg.fields.info ? (ck.checked ? '\n' : '') + '[画像] ' + imgData : '');
      if (info && cfg.fields.info) data.append(cfg.fields.info, info);
      btn.disabled = true; say('送信中…');
      // Google フォームは、ほかのサイトからの送信の返事を読ませない(no-cors)。送れたかどうかは、通信が成功したかで判断する
      fetch(cfg.action, { method: 'POST', mode: 'no-cors', body: data, credentials: 'omit', referrerPolicy: 'no-referrer' }).then(function () {
        try { localStorage.setItem('guideSentAt', String(Date.now())); } catch (er) {}
        ta.value = ''; clearImg(); cnt.textContent = '0 / ' + MAXLEN; say('送信しました。ありがとうございます!');
        setTimeout(function () { btn.disabled = false; }, WAIT_MS);
      }).catch(function () { btn.disabled = false; say('送信できませんでした。通信の状態を確認して、もう一度お試しください。', true); });
    });
  }

  var ov = null, body = null, current = 'news';
  function show(tab) {
    current = tab;
    Array.prototype.forEach.call(document.querySelectorAll('.guideTab'), function (b) { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false'); });
    body.innerHTML = '';
    body.scrollTop = 0;
    if (tab === 'terms') {
      var f = document.createElement('input'); f.id = 'guideFind'; f.type = 'search'; f.placeholder = '用語をさがす(例: ピン・輪止め・道板)'; f.setAttribute('aria-label', '用語をさがす');
      var list = document.createElement('div');
      f.addEventListener('input', function () { list.innerHTML = ''; renderTerms(list, f.value); });
      body.appendChild(f); body.appendChild(list); renderTerms(list, '');
    } else if (tab === 'contact') contactForm(body);
    else if (tab === 'news') renderNews(body);
    else if (tab === 'status') renderStatus(body);
    else GUIDE_DATA[tab].forEach(function (s) { section(body, s); });
  }
  function build() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    ov = document.createElement('div'); ov.id = 'guideOv'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'ガイド');
    var box = document.createElement('div'); box.id = 'guideBox';
    var head = document.createElement('div'); head.id = 'guideHead';
    head.appendChild(el('h2', 'ガイド'));
    var close = el('button', '✕'); close.id = 'guideClose'; close.type = 'button'; close.setAttribute('aria-label', '閉じる'); close.addEventListener('click', closeGuide);
    head.appendChild(close);
    var tabs = document.createElement('div'); tabs.id = 'guideTabs'; tabs.setAttribute('role', 'tablist');
    TABS.forEach(function (t) {
      var b = el('button', t[1], 'guideTab'); b.type = 'button'; b.dataset.tab = t[0]; b.setAttribute('role', 'tab');
      b.addEventListener('click', function () { show(t[0]); });
      tabs.appendChild(b);
    });
    body = document.createElement('div'); body.id = 'guideBody';
    box.appendChild(head); box.appendChild(tabs); box.appendChild(body); ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeGuide(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ov.classList.contains('open')) closeGuide(); });
    document.body.appendChild(ov);
  }
  function openGuide(tab) { if (!ov) build(); show(tab || (newsUnread() ? 'news' : current)); ov.classList.add('open'); document.getElementById('guideClose').focus(); }
  function closeGuide() { if (ov) ov.classList.remove('open'); }
  window.GUIDE = { open: openGuide, close: closeGuide, data: GUIDE_DATA, newsUnread: newsUnread };
  // 未読のお知らせがあれば、メイン画面の『ガイド』ボタンに『NEW』の目印を付ける
  var gb = document.getElementById('guideBtn'); if (gb && newsUnread()) gb.classList.add('hasNew');
})();
