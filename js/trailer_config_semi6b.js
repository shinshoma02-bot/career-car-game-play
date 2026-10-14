// トレーラー semi-6b(6台積み・宙段なし・台車1軸)のゲーム設定。index.html が #trailer=semi-6b の時だけ読む(semi-6 は js/trailer_config.js)。
// 素材と座標の元は assets/semi-6b/parts.json と make_semi6b.py。ここの値を変えたら trailer_config_semi6b.json も同じにする(node で JSON.stringify して出力できる)。
// 座標はどれもステージ座標(2520×724、1m=114px、地面 y=577)。フロア上のスロットの tireX・deckY は「走行時の姿勢のステージ座標」(フロアが動くと js/floor_mech_6b.js の onFloor で変換される)。
window.TRAILER_CONFIG = {
  "id": "semi-6b",
  "name": "6台積みセミトレーラー(semi-6b・宙段なし・台車1軸)",
  "stage": { "w": 2520, "h": 724 },
  "yard": { "bg": "assets/common/yard/yard_bg.png", "ground": "assets/common/yard/yard_ground.png", "frameBack": "assets/semi-6b/frame_back_clear.png", "v": 2 },
  "pxPerMeter": 114,

  "newArt": {
    "v": 2,
    "note": "assets/semi-6b/ の素材。画像を差し替えたら v を上げる。parts のキーは images[キー] になる(main.js の読み込みがそのまま使う)",
    "frameBack": "assets/semi-6b/frame_back.png", "frameFront": "assets/semi-6b/frame_front.png",
    "parts": {
      "tractor": "assets/semi-6b/tractor.png", "fender": "assets/semi-6b/fender.png",
      "floor_f1": "assets/semi-6b/parts/floor_f1.png", "floor_f2": "assets/semi-6b/parts/floor_f2.png",
      "link_f2_black": "assets/semi-6b/parts/link_f2_black.png", "link_f2_green": "assets/semi-6b/parts/link_f2_green.png",
      "cyl_f2_barrel": "assets/semi-6b/parts/cyl_f2_barrel.png", "cyl_f2_rod": "assets/semi-6b/parts/cyl_f2_rod.png",
      "cyl_f1_barrel": "assets/semi-6b/parts/cyl_f1_barrel.png", "cyl_f1_rod": "assets/semi-6b/parts/cyl_f1_rod.png",
      "slope_f4": "assets/semi-6b/parts/slope_f4.png", "ramp_base": "assets/semi-6b/parts/ramp_base.png", "ramp_ext": "assets/semi-6b/parts/ramp_ext.png",
      "slider": "assets/semi-6b/parts/slider.png",
      "wheel_front": "assets/semi-6b/wheel_front.png", "wheel_drive": "assets/semi-6b/wheel_drive.png", "wheel_trailer": "assets/semi-6b/wheel_trailer.png", "rear_post": "assets/semi-6b/parts/rear_post.png",
      "chock_wedge": "assets/common/chocks/chock_wedge.png", "chock_wedge_flat": "assets/common/chocks/chock_wedge_flat.png", "chock_plate": "assets/common/chocks/chock_plate.png"
    },
    "chockInfo": { "chock_wedge": { "pivot": [1, 17] }, "chock_wedge_flat": { "pivot": [1, 11] }, "chock_plate": { "pivot": [3, 26] } },
    "chockArt": { "1": "chock_wedge_flat", "2": "chock_wedge_flat", "3": "chock_wedge_flat", "4": "chock_wedge_flat", "5": "chock_wedge", "6": "chock_wedge" }
  },

  // スロット(車の止まる位置)。フロア番号は semi-6 と同じ。1番=1番フロア(上段・前)、2・3番=2番フロア(上段・後ろの1枚に2台)、4番=ヘッドの上の下段(固定)、5番=下段(固定)、6番=台車の山〜尻尾(固定)。
  // tireX/deckY = 前(左)タイヤの接地点。floor を持つスロットは、そのフロアの走行時の姿勢の座標。rot = 床の傾き(度。時計回りが正=後ろ下がり)
  "slots": {
    "1": { "tireX": 506,  "deckY": 284, "rot": -2.1, "floor": "F1", "hit": [405, 100, 520, 150], "stopKind": "stopper", "chockRange": { "rear": 60, "divisions": 10, "step": 6 }, "note": "1番フロアは前が高く後ろへ6.7度下がる(走行時 front(402,234)→rear(860,288))" },
    "2": { "tireX": 1040, "deckY": 283,   "rot": 0,    "floor": "F2", "hit": [940, 130, 520, 165], "stopKind": "hole", "chockRange": { "rear": 60, "divisions": 10, "step": 6 } },
    "3": { "tireX": 1600, "deckY": 283,   "rot": 0,    "floor": "F2", "hit": [1500, 130, 520, 165], "stopKind": "hole", "chockRange": { "rear": 60, "divisions": 10, "step": 6 } },
    "4": { "tireX": 505,  "deckY": 443.7, "rot": 0,    "floor": null, "hit": [405, 288, 500, 160], "stopKind": "stopper", "chockRange": { "rear": 60, "divisions": 10, "step": 6 }, "note": "ヘッドの上の下段(y426=地上1.32m)。上の1番フロアの下に入る" },
    "5": { "tireX": 1130, "deckY": 501.5,   "rot": 0,    "floor": null, "hit": [1030, 330, 520, 175], "stopKind": "none", "chockRequired": true, "chockRange": { "front": 44, "rear": 44, "divisions": 22, "step": 4 }, "note": "下段(y500=地上0.68m)。タイヤの基準はスロープの後端(x1120)より後ろ" },
    "6": { "tireX": 1606, "deckY": 470,   "rot": 0,  "floor": null, "hit": [1645, 330, 420, 175], "stopKind": "none", "chockRequired": true, "chockRange": { "front": 20, "rear": 40, "divisions": 15, "step": 4 }, "maxLenM": 4.1, "restrictedNote": "6番は台車の山〜尻尾で長さ約3.1m。全長4.1m以下の車だけ積めます。", "note": "台車の山(平ら y465)の上に前タイヤ、後ろは尻尾の下がり坂(約7.5度)" }
  },
  "chock": {
    "sizeCm": 8,
    "note": "各slotのchockRangeはtireXを基準位置(オフセット0)とするcm単位の可動範囲(semi-6 と同じ考え方)"
  },

  // 道板(尻尾の先。2段の伸縮式 全長380px=3.3m)。top=根元の上面(ヒンジ)・bottom=先が地面に着く点(約10.2度)
  "ramp": { "top": [2100, 492], "bottom": [2470, 577], "groundY": 577, "startX": 2605 },

  // 得点: 積んだ高さの制限。semi-6 は 4.1m だが、このトレーラーは柱の灯火が地上3.9mで、積んだ高さはほとんど4.1mを超える(D30)。
  // 写真 p08(上段の車の屋根 約4.05〜4.2m)と、走行時の1番の床の高さ(slot1 で地上約2.9m)から、緩めに決めた暫定値(要調整。SPEC 第16章 2026-10-07)
  "score": { "heightLimitM": 4.9 },

  "drive": { "speed": 800, "accel": 1500, "brakeDist": 220, "settle": 0.9, "iconRefLen": 4.955 },

  // semi-6b の機構(js/floor_mech_6b.js と main.js の drawTrailer6b が読む)。値の出どころは assets/semi-6b/parts.json と make_semi6b.py の compose()
  "t6b": {
    "f1": {
      "img": "floor_f1", "pivot": [4.8, 8.8], "front": [512.8, 290.8], "rear": [848.0, 272.2], "thick": 22, "postX": 544,
      "loadRaise": 18, "maxRaise": 60, "connectMaxRaise": 9, "connectTol": 25, "rate": 40,
      "note": "1番(D40 の新しい絵): 前が低く後ろが高い(-3.18度)。前後とも同じだけ真上へ動く(走行時0・積み込み時18px・最大60px)。2番とつながるのは、後端 y(272.2-上げ量) と 2番のヒンジ y283 の差が connectTol(25px)以内",
      "under": [[-1, 21], [24, 24], [49, 23], [74, 23], [99, 22], [124, 22], [149, 22], [174, 22], [199, 24], [224, 25], [249, 27], [274, 28], [299, 29], [324, 30]]
    },
    "f2": {
      "img": "floor_f2", "pivot": [2.6, 13.0], "hinge": [1012.6, 283.0], "len": 1015,
      "minDeg": -4, "maxDeg": 11, "loadDeg": 10.5, "rate": 5, "connectDeg": 9.5,
      "note": "2番(2番・3番の車が載る1枚。D40 の新しい絵): 前端のヒンジで傾く。deg 正=後ろ下がり(積み込み時10.5度で後端が尻尾に着く)。負=後ろ上げ(下段の背の高い車が潜る時)。connectDeg 以上で道板・尻尾とつながる",
      "under": [[-1, 46], [49, 41], [99, 41], [149, 40], [199, 39], [249, 37], [299, 39], [349, 36], [399, 36], [449, 36], [499, 37], [549, 37], [599, 37], [649, 42], [699, 31], [749, 28], [799, 36], [849, 25], [899, 23], [949, 21]]
    },
    "linkBlack": { "img": "link_f2_black", "top": [650.7, 30.3], "deck": [1482.0, 499.5], "w": 20 },
    "linkGreen": { "img": "link_f2_green", "top": [572.3, 40.1], "deck": [1420.3, 480.9], "w": 25 },
    "cylF2": { "base": [1640, 494], "baseFromGreen": [58.8, 2.9], "onGreen": 0.67, "w": 13, "barrelLen": 72, "rodLen": 92 },
    "cylF1": { "base": [545, 443.7], "w": 14, "barrelLen": 120, "rodLen": 120 },
    "slope": { "img": "slope_f4", "hinge": [1120, 504], "len": 250, "pad": 3, "topY": 443.7, "sec": 0.9, "note": "4番へのスロープ(5番の前)。後端のヒンジで前端を4番の床(y426)まで上げる(約18度)。単独のボタンで動く" },
    "ramp": { "hinge": [2100, 492], "len": 380, "sec": 205, "thick": 22, "slideSec": 1.15 },
    "tail": { "deck": [[1523, 470], [1790, 466], [2100, 492]], "note": "6番(台車の山〜尻尾)の床の線" },
    "lower": { "f1Over": ["4"], "f2Over": ["5", "6"], "note": "下段の車が上のフロアの下面に当たらないか調べる組み合わせ" },
    "wheels": { "trailer": { "center": [1731.9, 527.7], "r": 56.4 }, "front": [217.5, 524.3], "drive": [657.6, 522.8] },
    "rearPost": { "pivot": [121.7, -1.4], "at": [1988.7, 302.6], "maxDeg": 1 }
  }
};
