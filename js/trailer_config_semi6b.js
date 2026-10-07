// トレーラー semi-6b(6台積み・宙段なし・台車1軸)のゲーム設定。index.html が #trailer=semi-6b の時だけ読む(semi-6 は js/trailer_config.js)。
// 素材と座標の元は assets/semi-6b/parts.json と make_semi6b.py。ここの値を変えたら trailer_config_semi6b.json も同じにする(node で JSON.stringify して出力できる)。
// 座標はどれもステージ座標(2520×724、1m=114px、地面 y=577)。フロア上のスロットの tireX・deckY は「走行時の姿勢のステージ座標」(フロアが動くと js/floor_mech_6b.js の onFloor で変換される)。
window.TRAILER_CONFIG = {
  "id": "semi-6b",
  "name": "6台積みセミトレーラー(semi-6b・宙段なし・台車1軸)",
  "stage": { "w": 2520, "h": 724 },
  "pxPerMeter": 114,

  "newArt": {
    "v": 1,
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
      "wheel_front": "assets/semi-6/wheel_front.png", "wheel_drive": "assets/semi-6/wheel_drive.png",
      "chock_wedge": "assets/common/chocks/chock_wedge.png", "chock_wedge_flat": "assets/common/chocks/chock_wedge_flat.png", "chock_plate": "assets/common/chocks/chock_plate.png"
    },
    "chockInfo": { "chock_wedge": { "pivot": [1, 17] }, "chock_wedge_flat": { "pivot": [1, 11] }, "chock_plate": { "pivot": [3, 26] } },
    "chockArt": { "1": "chock_wedge_flat", "2": "chock_wedge_flat", "3": "chock_wedge_flat", "4": "chock_wedge_flat", "5": "chock_wedge", "6": "chock_wedge" }
  },

  // スロット(車の止まる位置)。フロア番号は semi-6 と同じ。1番=1番フロア(上段・前)、2・3番=2番フロア(上段・後ろの1枚に2台)、4番=ヘッドの上の下段(固定)、5番=下段(固定)、6番=台車の山〜尻尾(固定)。
  // tireX/deckY = 前(左)タイヤの接地点。floor を持つスロットは、そのフロアの走行時の姿勢の座標。rot = 床の傾き(度。時計回りが正=後ろ下がり)
  "slots": {
    "1": { "tireX": 505,  "deckY": 246.1, "rot": 6.72, "floor": "F1", "hit": [405, 100, 520, 150], "stopKind": "stopper", "chockRange": { "rear": 60, "divisions": 10, "step": 6 }, "note": "1番フロアは前が高く後ろへ6.7度下がる(走行時 front(402,234)→rear(860,288))" },
    "2": { "tireX": 1040, "deckY": 293,   "rot": 0,    "floor": "F2", "hit": [940, 130, 520, 165], "stopKind": "hole", "chockRange": { "rear": 60, "divisions": 10, "step": 6 } },
    "3": { "tireX": 1600, "deckY": 293,   "rot": 0,    "floor": "F2", "hit": [1500, 130, 520, 165], "stopKind": "hole", "chockRange": { "rear": 60, "divisions": 10, "step": 6 } },
    "4": { "tireX": 505,  "deckY": 426,   "rot": 0,    "floor": null, "hit": [405, 270, 500, 160], "stopKind": "stopper", "chockRange": { "rear": 60, "divisions": 10, "step": 6 }, "note": "ヘッドの上の下段(y426=地上1.32m)。上の1番フロアの下に入る" },
    "5": { "tireX": 1130, "deckY": 500,   "rot": 0,    "floor": null, "hit": [1030, 330, 520, 175], "stopKind": "none", "chockRequired": true, "chockRange": { "front": 44, "rear": 44, "divisions": 22, "step": 4 }, "note": "下段(y500=地上0.68m)。タイヤの基準はスロープの後端(x1120)より後ろ" },
    "6": { "tireX": 1730, "deckY": 465,   "rot": 6.5,  "floor": null, "hit": [1645, 330, 420, 175], "stopKind": "none", "chockRequired": true, "chockRange": { "front": 20, "rear": 40, "divisions": 15, "step": 4 }, "maxLenM": 4.1, "restrictedNote": "6番は台車の山〜尻尾で長さ約3.1m。全長4.1m以下の車だけ積めます。", "note": "台車の山(平ら y465)の上に前タイヤ、後ろは尻尾の下がり坂(約7.5度)" }
  },
  "chock": {
    "sizeCm": 8,
    "note": "各slotのchockRangeはtireXを基準位置(オフセット0)とするcm単位の可動範囲(semi-6 と同じ考え方)"
  },

  // 道板(尻尾の先。2段の伸縮式 全長380px=3.3m)。top=根元の上面(ヒンジ)・bottom=先が地面に着く点(約10.2度)
  "ramp": { "top": [2036, 510], "bottom": [2410, 577], "groundY": 577, "startX": 2605 },

  // 得点: 積んだ高さの制限。semi-6 は 4.1m だが、このトレーラーは柱の灯火が地上3.9mで、積んだ高さはほとんど4.1mを超える(D30)。
  // 写真 p08(上段の車の屋根 約4.05〜4.2m)と、走行時の1番の床の高さ(slot1 で地上約2.9m)から、緩めに決めた暫定値(要調整。SPEC 第16章 2026-10-07)
  "score": { "heightLimitM": 4.9 },

  "drive": { "speed": 800, "accel": 1500, "brakeDist": 220, "settle": 0.9, "iconRefLen": 4.955 },

  // semi-6b の機構(js/floor_mech_6b.js と main.js の drawTrailer6b が読む)。値の出どころは assets/semi-6b/parts.json と make_semi6b.py の compose()
  "t6b": {
    "f1": {
      "img": "floor_f1", "pivot": [4, 4], "front": [402, 234], "rear": [860, 288], "thick": 28, "postX": 544,
      "loadRaise": 18, "maxRaise": 60, "connectMaxRaise": 9, "rate": 40,
      "note": "1番: 前後とも同じだけ真上へ動く(走行時0・積み込み時18px・最大60px。積んだ写真 p08 の後ろ 3.07m=約+60px)。2番とつながるのは上げ量 connectMaxRaise 以下(後端 y288-上げ量 と 2番のヒンジ y293 の差14px以内)",
      "under": [[0, 4], [96, 14], [196, 28], [296, 27], [396, 27], [461, 29]]
    },
    "f2": {
      "img": "floor_f2", "pivot": [4, 4], "hinge": [971, 293], "len": 1050,
      "minDeg": -4, "maxDeg": 11, "loadDeg": 10.5, "rate": 5, "connectDeg": 9.5,
      "note": "2番(2番・3番の車が載る1枚): 前端のヒンジで傾く。deg 正=後ろ下がり(積み込み時10.5度で後端が尻尾に着く)。負=後ろ上げ(下段の背の高い車が潜る時)。connectDeg 以上で道板・尻尾とつながる",
      "under": [[0, 31], [96, 36], [296, 36], [596, 36], [646, 29], [796, 22], [996, 13], [1050, 9]]
    },
    "linkBlack": { "img": "link_f2_black", "top": [665, 38], "deck": [1420, 497], "w": 17 },
    "linkGreen": { "img": "link_f2_green", "top": [765, 31], "deck": [1520, 490], "w": 15 },
    "cylF2": { "base": [1640, 494], "onGreen": 0.45, "w": 13, "barrelLen": 72, "rodLen": 70 },
    "cylF1": { "base": [545, 426], "w": 14, "barrelLen": 120, "rodLen": 120 },
    "slope": { "img": "slope_f4", "hinge": [1120, 505], "len": 250, "pad": 3, "topY": 426, "sec": 0.9, "note": "4番へのスロープ(5番の前)。後端のヒンジで前端を4番の床(y426)まで上げる(約18度)。単独のボタンで動く" },
    "ramp": { "hinge": [2036, 510], "len": 380, "sec": 205, "thick": 22, "slideSec": 1.15 },
    "tail": { "deck": [[1689, 465], [1776, 465], [2040, 501]], "note": "6番(台車の山〜尻尾)の床の線" },
    "lower": { "f1Over": ["4"], "f2Over": ["5", "6"], "note": "下段の車が上のフロアの下面に当たらないか調べる組み合わせ" },
    "wheels": { "trailer": { "center": [1733, 541], "r": 47 }, "front": [218, 528], "drive": [656, 528] }
  }
};
