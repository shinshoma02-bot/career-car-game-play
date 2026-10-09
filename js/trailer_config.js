window.TRAILER_CONFIG = {
  "id": "semi-6",
  "name": "セミトレーラー(6台積み)",
  "stage": { "w": 2520, "h": 724 },
  "yard": { "bg": "assets/common/yard/yard_bg.png", "ground": "assets/common/yard/yard_ground.png", "frameBack": "assets/semi-6/frame_back_clear.png", "tractor": "assets/semi-6/tractor_clear.png", "v": 1 },
  "pxPerMeter": 114,

  "newArt": {
    "v": 121,
    "note": "グラフィック制作チャットの新素材(assets/semi-6/...)。floors=棚(ステージ全面サイズ)",
    "switchScale": 0.27, "switchDir": "assets/common/switches/",
    "switchParts": ["sw_pendant2", "sw_pendant6", "sw_box2", "lamp_panel_lock", "btn_cap_ue_big", "btn_cap_ue_big_pressed", "btn_cap_shita_big", "btn_cap_shita_big_pressed", "btn_sq", "btn_sq_pressed", "btn_cap6_nobi_big", "btn_cap6_chiji_big", "btn_cap6_migi_oshi_big", "btn_cap6_migi_hiki_big", "btn_cap6_hidari_oshi_big", "btn_cap6_hidari_hiki_big", "btn_cap6_nobi_big_pressed", "btn_cap6_chiji_big_pressed", "btn_cap6_migi_oshi_big_pressed", "btn_cap6_migi_hiki_big_pressed", "btn_cap6_hidari_oshi_big_pressed", "btn_cap6_hidari_hiki_big_pressed", "hint_glow", "lamp_green", "lamp_green_off", "lamp_red", "lamp_red_off"],
    "switchGroups": [ { "id": "front", "rect": [922.5, 392, 111, 130] }, { "id": "rear", "rect": [1540, 412, 40, 56] }, { "id": "tire", "rect": [1598, 380, 96, 124] }, { "id": "tire", "rect": [1540, 468, 24, 32] } ],
    "switchLayout": [ { "body": "sw_pendant2", "at": [949.8, 408], "bind": "F1f" }, { "body": "sw_pendant2", "at": [961.4, 408], "bind": "F1r" }, { "body": "sw_pendant2", "at": [1001.5, 440], "bind": "F2f" }, { "body": "sw_box2", "at": [970.5, 495] }, { "body": "sw_pendant2", "at": [1556, 418], "bind": "MID", "scale": 0.21 }, { "body": "sw_pendant2", "at": [1570, 418], "bind": "F3r", "scale": 0.21 }, { "body": "sw_pendant2", "at": [1549, 474], "bind": "jack", "scale": 0.21 }, { "body": "sw_pendant2", "at": [1556, 441], "bind": "F7", "scale": 0.21 }, { "body": "lamp_panel_lock", "at": [1613, 405], "rot": 30, "bind": "lamps" }, { "body": "sw_pendant6", "at": [1620, 445], "rot": 30, "bind": "six" } ],
    "frameBack": "assets/semi-6/frame_back.png", "frameFront": "assets/semi-6/frame_front.png",
    "tail": { "x0": 1976, "x1": 2070, "y0": 410, "y1": 545, "far": { "x0": 1976, "x1": 2016, "y0": 444, "y1": 508 }, "note": "後端の箱は背景画像(frame_back)にだけ描かれていて、前景は途中で切れている。背景から箱の部材だけを切り出して車の手前に重ねる。far=開口部の中(反対側のシャーシ)は車の奥のまま" },
    "parts": { "cyl_barrel": "assets/semi-6/parts/cyl_barrel.png", "cyl_rod": "assets/semi-6/parts/cyl_rod.png", "cyl2_barrel": "assets/semi-6/parts/cyl2_barrel.png", "cyl2_stage1": "assets/semi-6/parts/cyl2_stage1.png", "cyl2_rod": "assets/semi-6/parts/cyl2_rod.png",
      "chock_wedge": "assets/common/chocks/chock_wedge.png", "chock_wedge_flat": "assets/common/chocks/chock_wedge_flat.png", "chock_plate": "assets/common/chocks/chock_plate.png", "tractor": "assets/semi-6/tractor.png", "wheel_alu": "assets/semi-6/wheel_alu.png", "pin": "assets/common/pins/pin.png", "pin_out": "assets/common/pins/pin_out.png", "fender": "assets/semi-6/fender.png",
      "floor_chuudan": "assets/semi-6/parts/floor_chuudan.png", "chuudan_arm_front": "assets/semi-6/parts/chuudan_arm_front.png", "chuudan_post_outer": "assets/semi-6/parts/chuudan_post_outer.png", "chuudan_post_inner": "assets/semi-6/parts/chuudan_post_inner.png", "chuudan_base": "assets/semi-6/parts/chuudan_base.png", "chuudan_base_front": "assets/semi-6/parts/chuudan_base_front.png", "stop_pin": "assets/semi-6/parts/stop_pin.png", "pin_rear": "assets/semi-6/parts/pin_rear.png", "hang_pit_back": "assets/semi-6/parts/hang_pit_back.png", "hang_pit_front": "assets/semi-6/parts/hang_pit_front.png",
      "mid_link": "assets/semi-6/parts/mid_link.png", "mid_slider": "assets/semi-6/parts/mid_slider.png",
      "mid_cyl_barrel": "assets/semi-6/parts/mid_cyl_barrel.png", "mid_cyl_stage1": "assets/semi-6/parts/mid_cyl_stage1.png", "mid_cyl_rod": "assets/semi-6/parts/mid_cyl_rod.png", "mid_pillar_scale": "assets/semi-6/parts/mid_pillar_scale.png", "hole_scale_f7": "assets/semi-6/parts/hole_scale_f7.png", "cyl_barrel_front": "assets/semi-6/parts/cyl_barrel_front.png", "cyl_rod_front": "assets/semi-6/parts/cyl_rod_front.png", "chuudan_stay": "assets/semi-6/parts/chuudan_stay.png", "chuudan_cyl_base": "assets/semi-6/parts/chuudan_cyl_base.png", "chuudan_floor_ear": "assets/semi-6/parts/chuudan_floor_ear.png",
      "sw_mount_front_pair": "assets/semi-6/parts/sw_mount_front_pair.png", "sw_mount_front_f2": "assets/semi-6/parts/sw_mount_front_f2.png", "sw_mount_front_box": "assets/semi-6/parts/sw_mount_front_box.png", "sw_mount_rear_three": "assets/semi-6/parts/sw_mount_rear_three.png", "sw_mount_jack": "assets/semi-6/parts/sw_mount_jack.png", "sw_mount_lamps": "assets/semi-6/parts/sw_mount_lamps.png", "sw_mount_six": "assets/semi-6/parts/sw_mount_six.png" },
    "swMountsOff": [],
    "swMounts": [ { "img": "sw_mount_rear_three", "pivot": [10.62,6], "at": [1556,418], "rot": 0 }, { "img": "sw_mount_front_pair", "pivot": [12.94,7], "at": [949.8,408], "rot": 0 }, { "img": "sw_mount_front_f2", "pivot": [12.94,7], "at": [1001.5,440], "rot": 0 }, { "img": "sw_mount_front_box", "pivot": [12.94,7], "at": [970.5,495], "rot": 0 }, { "img": "sw_mount_jack", "pivot": [10.62,6], "at": [1549,474], "rot": 0 }, { "img": "sw_mount_lamps", "pivot": [12.13,7], "at": [1613,405], "rot": 30 }, { "img": "sw_mount_six", "pivot": [14.29,7], "at": [1620,445], "rot": 30 } ],
    "chockInfo": { "chock_wedge": { "pivot": [1, 17] }, "chock_wedge_flat": { "pivot": [1, 11] }, "chock_plate": { "pivot": [3, 26] } },
    "cylInfo": { "cyl_barrel": { "pivot": [11,12], "tile": [22,97], "tipX": 111 }, "cyl_rod": { "pivot": [4,6], "tile": [11,95], "tipX": 104 }, "cyl2_barrel": { "pivot": [11,12], "tile": [22,57], "tipX": 71 }, "cyl2_stage1": { "pivot": [1,7], "tile": [9,50], "tipX": 61 }, "cyl2_rod": { "pivot": [4,6], "tile": [11,55], "tipX": 64 }, "cyl_barrel_front": { "pivot": [12,13], "tile": [23,97], "tipX": 112 }, "cyl_rod_front": { "pivot": [5,6], "tile": [13,95], "tipX": 105 },
      "chuudan_arm_front": { "pivot": [10,11], "tile": [22,98], "tipX": 110 }, "chuudan_post_outer": { "pivot": [10,11], "tile": [22,104], "tipX": 110 }, "chuudan_post_inner": { "pivot": [8,16], "tile": [32,198], "tipX": 208 },
      "mid_cyl_barrel": { "pivot": [11,12], "tile": [22,95], "tipX": 109 }, "mid_cyl_stage1": { "pivot": [1,7], "tile": [9,91], "tipX": 102 }, "mid_cyl_rod": { "pivot": [4,6], "tile": [11,94], "tipX": 104 } },
    "midLink": { "cylAnchor": [1500.8,518], "sliderPinDy": -6, "linkLen": 44, "linkTopOnF2": [1474.1,340], "minCyl": 102, "barrelLen": 98, "stage1Len": 101, "rodLen": 99, "stage1Max": 91, "stage2Max": 91, "pillarScaleHome": [1507,242], "linkPivot": [7,7], "sliderPivot": [7,11], "note": "3番前(継ぎ目MID)の実車の機構(assets/semi-6/parts/mid_link.json、HANDOFF §7c R5)。シリンダーは柱の左の面に沿って x=1500 に真上へ立ち(根元 y=518=下の梁の上)、上端は柱の側面の金具(mid_slider。ピン=継ぎ目のy-6)に付く。金具は柱の中の部材とつながって棚と一緒に動く。リンク44pxは、金具のピン→2番の棚の下の金具(linkTopOnF2)。シリンダーの長さ=518-金具のピンのy(102〜284)。1段目が伸びきるのはオフセット約+13(ピン約15番)。柱の中の部材は横から見えないので描かない" },
    "chuudan": { "floorPivot": [3,3], "armPinF": [3,3], "armPinR": [312,21], "base": { "pivot": [12,7] }, "baseFront": { "pivot": [15,9] }, "floorEar": { "img": "chuudan_floor_ear", "pivot": [6,4] }, "pivotF": [1334.6,508], "pivotR": [1610,526], "outerLen": 100, "innerStart": 92, "minRear": 100, "cylAnchor": [1394.2,530], "cylOnArmF": 0.9, "stay": { "len": 9, "at": 0.9, "w": 8, "img": "chuudan_stay", "pivot": [7,8], "tipAt": [16,8], "baseImg": "chuudan_cyl_base", "basePivot": [9,6], "refU": 0, "note": "ステー(柱に直角に出る腕。素材 chuudan_stay。読めない時だけ仮の灰色の板)。シリンダーの先=ステーの先。シリンダーの付け根=柱の付け根から、loadU の姿勢で柱と直角の向きに len だけずれた位置(柱と平行四辺形)。cylAnchor は stay が無い時だけ使う" }, "pitBack": [1420,507], "pitFront": [1420,510], "note": "宙段の新素材(assets/semi-6/parts/chuudan.json の値)。前の柱は1本物(長さは取付点間に合わせて伸縮表示)、後ろは長い柱(126px固定)と中から伸びる支柱。柱→宙段フロアの順に描く" },
    "floors": { "F1": "assets/semi-6/stage/floor_f1_stage.png", "F2": "assets/semi-6/stage/floor_f2_stage.png", "F3": "assets/semi-6/stage/floor_f3_stage.png", "F5": "assets/semi-6/stage/floor_f5_stage.png" }
  },

  "assets": {
    "bg": "bg_v2.b64.txt",
    "fg": "fg_v2.b64.txt",
    "wheel": "wheel_v2.b64.txt",
    "tractor": "tractor_v2.b64.txt",
    "floors": { "F1": "f1_v2.b64.txt", "F2": "f2_v2.b64.txt", "F3": "f3_v2.b64.txt", "F5": "f5_v2.b64.txt" }
  },

  "slots": {
    "1": { "tireX": 515.2, "deckY": 294.2, "rot": -1.8, "floor": "F1", "hit": [485, 87, 454.5, 203], "stopKind": "none", "chockRequired": true, "defaultChock": true, "chockRange": { "front": 0, "rear": 180, "divisions": 30, "step": 6 }, "note": "基準の輪止め(tireX)は1番フロアの先端(floors.defs.F1.x0=456。タイヤの中心はそこから24px(約0.2m)後ろ)に置く。前(キャビン側)へは動かせない。後ろ(手前)へ120cm(2026-10-06 ユーザー指示)" },
    "2": { "tireX": 1061, "deckY": 316, "rot": 0,    "floor": "F2", "hit": [957.2, 87, 522.2, 225], "stopKind": "hole", "chockRange": { "rear": 120, "divisions": 20, "step": 6 } },
    "3": { "tireX": 1650, "deckY": 312, "rot": 0,    "floor": "F3", "hit": [1560, 72, 591, 239], "stopKind": "hole", "chockRange": { "rear": 102, "divisions": 17, "step": 6 } },
    "4": { "tireX": 509,  "deckY": 442, "rot": 0,    "floor": null, "hit": [469, 304, 528.9, 138], "stopKind": "stopper", "chockRange": { "rear": 120, "divisions": 20, "step": 6 } },
    "5": { "tireX": 1083.2, "deckY": 510, "rot": 0,    "floor": null, "carrier": "F5", "hit": [1017.5, 326, 546.5, 181], "stopKind": "none", "chockRequired": true, "chockStart": "front", "chockRange": { "front": 44, "rear": 88, "divisions": 33, "step": 4 } },
    "7": { "tireX": 1458.1, "deckY": 510, "rot": 0,    "floor": null, "carrier": "F7", "hit": [1332, 300, 318, 150], "stopKind": "hole", "noChock": true, "instantLid": true, "note": "宙段フロア(7台目)。タイヤ位置は宙段フロアのローカル座標(格納時の平らな姿勢=下段の床の高さy510、前端x1427)。輪止めは無く、タイヤ落としの穴だけ。格納中は下段の窪みにはまっていて穴は関係なく、上げた時には最初から穴が空いている(落し蓋の操作は無い)" },
    "6": { "tireX": 1626, "deckY": 510, "rot": 0,    "floor": null, "hit": [1564, 326, 486, 181], "maxWidthM": 1.755, "maxWidthNoTireM": 1.48, "restrictedNote": "6番は車幅1.75m以下(軽自動車・5ナンバー・ステップワゴンクラスまで)の車のみ。幅の広い車は6番に載せられません", "stopKind": "none", "chockRequired": true, "chockRange": { "front": 72, "rear": 104, "divisions": 22, "step": 8 } }
  },
  "chock": {
    "sizeCm": 8,
    "note": "各slotのchockRangeはtireXを基準位置(オフセット0)とするcm単位の可動範囲。rear/frontは各方向の最大距離、divisionsはその方向の分割数、stepは1分割あたりの距離(cm)。px変換はpxPerMeterを使用。"
  },

  "floors": {
    "pinPitch": 6,
    "mid": [1520, 318],
    "ends": {
      "F1f": { "off": 0, "range": [-12, 120], "travel": 32.3, "hole": 13, "holeMax": 18, "label": "1番の前", "note": "走行位置13番(travel=絵からの下げ量px)。ピン最大18番=棚の上限(赤テープ付近)の1穴下。0番=最下段(ピンなし)" },
      "F1r": { "off": 0, "range": [-66, 120], "travel": 72, "hole": 8, "holeMax": 31, "label": "1番の後ろ", "note": "走行位置8番。ピン最大31番" },
      "F2f": { "off": 0, "range": [-75, 90], "travel": 35, "hole": 9, "holeMax": 18, "pitchUp": 3.654, "freeTop": -23.5, "label": "2番", "note": "走行位置9番。ピン最大18番(2026-10-03: ユーザーの説明と実車の写真)。柱の内側の支柱が短いので、ピン無しで上がるのは、下側の赤い線(穴25番あたり=freeTop)まで。ピンを18番に差して昇降させると、上側の赤い線(穴35番あたり=range上限)まで上がる。1穴=3.654px(上側の赤い線が35番)" },
      "MID": { "off": 0, "range": [-78, 104], "travel": 104, "hole": 0, "holeMax": 28, "noTravelPin": true, "label": "3番の前", "note": "走行位置=一番下(0番・ピンは差さない)。そこから少し上げた位置がピンを差せる下限(1番)、最大28番(=支柱がピン28番の上に来ると、棚は柱の赤テープ付近=上限。宙段を使う時しか一番上までは上げない。2026-10-02: ユーザーの説明で確認)" },
      "F3r": { "off": 0, "range": [-96, 340], "travel": -24, "hole": 10, "holeMax": 33, "post": { "x": 1795, "pitch": 7.4, "pitchDown": 11.29 }, "label": "3番の後ろ", "note": "走行位置10番(ユーザー確認 2026-10-08)。ピン最大33番。ピンは柱(x=1795)で3番フロアを受け、1穴=柱で7.4px。棚の後端の高さは、3番前(MID)の高さで変わる(柱の位置の棚の高さ=MID+(F3r−MID)×0.514 がピンの高さになる時に載る)" },
      "F7": { "off": 0, "range": [-120, 0], "travel": 0, "hole": 0, "holeMax": 19, "noTravelPin": true, "label": "宙段", "note": "宙段フロアの支柱(柱の中)。実際の動きu(0〜2)を ×-60 した仮想の上下量。1穴=u0.1=6px(番号札 hole_scale_f7 と同じ)。ピンは宙段の支柱を受ける" }
    },
    "defs": {
      "F1": { "name": "1番フロア", "frontPt": [515, 298.98], "frontEnd": "F1f", "rearPt": [920.2, 281], "rearEnd": "F1r", "slots": [1], "x0": 491, "x1": 920.2, "bottomAt380": 308, "bottomSlope": -0.03 },
      "F2": { "name": "2番フロア", "frontPt": [953.1, 314], "frontEnd": "F2f", "rearPt": "mid", "rearEnd": "MID", "slots": [2], "x0": 953.1, "x1": 1520, "bottomFlat": 336 },
      "F3": { "name": "3番フロア", "frontPt": "mid", "frontEnd": "MID", "rearPt": [2055, 312], "rearEnd": "F3r", "slots": [3], "x0": 1520, "x1": 2010, "bottomFlat": 334 },
      "F5": { "name": "5番フロア", "frontPt": [1001.5, 510], "frontEnd": "F5f", "rearPt": [1505.2, 510], "rearEnd": "F5r", "slots": [], "x0": 1001.5, "x1": 1505.2, "bottomFlat": 518 }
    },
    "f1DeckYAt625": 288, "f1DeckYSlope": -0.0277, "f1DeckYAt625X": 665
  },

  "hangFloor": {
    "len": 325, "speed": 0.4, "rearPin": { "holes": 6, "pitch": 7, "hole": 1 }, "stopPin": { "hole": 1, "us": [1.86, 1.82, 1.78, 1.75, 1.71, 1.67], "pts": [[1301.4, 427.5], [1306.8, 425.0], [1312.1, 422.5], [1317.4, 419.9], [1322.7, 417.4], [1328, 414.8]], "thick": 16, "note": "フレーム側の固定ピン(赤い板)。pts=ピンの上面の位置[x,y](前→後ろの5段階。斜めの柱に沿って並ぶ)、thick=フロア下面までの厚み。フロア下面がピンに当たる u が loadU になる(0.01刻み)。前から u2.0/1.84/1.76/1.70/1.60。ユーザー指定: 斜めの柱(フロア先端のすぐ後ろ。x1300〜1380)に付ける" }, "tol": 60, "tolLower": 30, "loadU": 1.9, "localX0": 1427, "localY": 510,
    "linkage": {
      "frontLen": 140, "pinSpan": 293, "pinOffset": [16, 18], "pinOffsetF": [0, 0], "pinOffsetR": [309, 18], "theta0": 0, "groundY": 528,
      "theta1": 20.48, "theta2": 121, "lockU": 1, "rearMin": 90, "rearMax": 135, "rearGrowTheta": 180, "tableStep": 0.01,
      "note": "宙段の四節リンク(付け根 pivotF/pivotR は newArt.chuudan から読む。後ろの付け根は下段の5番・6番の床の上)。theta1 は後ろの柱が rearMin になる角度(pivotR を変えたら求め直す: 後ろの取付点が地面上で pivotR.x+rearMin に来る θ)。リンク=車体(pivotF-pivotR)・前の柱(frontLen固定)・フロア(取付点の間 pinSpan)・後ろの柱(伸縮)。pinOffset=フロア上面の前端Fから前の取付点までのずれ。u=0→lockU はθ 0→theta1(後ろの取付点は地面groundYを滑り、後ろの柱が縮む)。lockU(=後ろの柱の可動部が固定される位置)で後ろの柱は縮みきって rearMin。lockU→2 はθ theta1→theta2(後ろの柱は固定長の柱として前の柱に連動、θが rearGrowTheta を超えると rearMax まで再び伸びる)"
    },
    "note": "宙段フロア(5番と6番の間の持ち上がる棚)。u=0格納(下段の床に平ら)→u=1前(5番側)が上がる・後ろは接地のまま前へ滑る(スロープ)→u=2後ろも上がる(実車動画の姿勢)。姿勢は linkage(四節リンク)の計算で決める。全体の長さは一定(約325px)"
  },

  "cylinders": [
    { "id": "f2mid", "floor": "F2", "pin": [1416.4, 322], "anchor": [1491.9, 428], "barrel": 70, "thick": 12, "note": "中央の上下を可能にする補助シリンダー(取付点は実車合わせの新素材値)" },
    { "id": "f3rear", "floor": "F3", "pin": [1750, 334], "anchor": [1590, 525], "barrel": 150, "thick": 12, "note": "3番後ろの昇降" },
    { "id": "midvert", "floor": null, "pin": [1499.9, 326], "anchor": [1499.9, 498], "barrel": 60, "stage1": 60, "two": true, "thick": 12, "note": "中央の継ぎ目(2番後・3番前)の昇降。二段式" }
  ],

  "f1Rig": {
    "cylX0": 681.9, "cylX1": 818.1, "cylY": 301, "cylStrokePerOff": 0.55, "barrelRatio": 0.55,
    "sheave": [915.7, 292], "wireTop": [921.4, 218], "tie": [912.3, 286],
  },

  "floor5": {
    "liftMax": 110, "hookOff": -59, "note": "hookOffはスロープ時に5番の床面が4番の床面と揃う高さ"
  },

  "slidePlate": { "len": 50, "thick": 7, "note": "スライド板: 1番フロア後端(x1=850)から2番側へ出る板(len px≒0.44m=1番と2番の隙間ぶん。2026-10-07 ユーザー指示で半分に)。しまうと1番フロアの下に入る。出ている間は1番へ渡れる(1番↔2番がつながる条件)が、1番を上げた時に2番の長い車に当たる。実車写真(2026-10-07)準拠、数値は仮"},
  "f2Flap": { "len": 70, "note": "2番扇動板: 2番フロア前端(x0から後方へlen px≒0.6m、実車は1m未満)のメッシュ床。ヒンジで外側に開くと、その範囲で4番の車の屋根と干渉しなくなる。開いている間は1番↔2番の道が切れる" },
  "bridgePlate": { "anchor": [936.5, 442], "stowedX": 936.5, "tipX": 1005, "note": "4番フロア後端が支点(ヒンジ)。格納時は下向きに垂れる。搬出時は5番フロアの位置に関わらず、5番をスロープにセットした時の前端の高さ(tipXの位置)まで固定で倒れる" },

  "ramp": { "top": [2053, 518], "bottom": [2366, 577], "groundY": 577, "startX": 2605 },

  "outrigger": {
    "jackX": 1960, "cylTop": 446, "frameBottom": 540, "footStowedY": 545, "ground": 577,
    "jackMax": 44, "jackContact": 32,
    "kingpin": [852.1, 472],
    "wheel": { "cx": 1867, "cy": 525, "r": 59, "fenderR": 72 },
    "tireStowScale": 0.95, "tireOutScale": 1.0, "airSusDrop": 10,
    "note": "ジャッキ: タイヤ後方の台車フレーム内(jackX)にシリンダー(cylTop〜frameBottom)、下の梁から足が出る。足先は格納時footStowedY、jack=jackContactで地面(ground)に接地し、それ以上伸ばすとキングピンを支点にトレーラーが持ち上がる。wheelは台車タイヤの中心・半径(下端=groundで接地。描画はmain.jsのdrawTrailerWheel)。airSusDrop: タイヤ突出+ジャッキ格納で接地すると、エアサスで台車の車高がこの量(px)だけ下がる"
  },

  "pinMarks": { "F1f": [607, 299], "F1r": [906.6, 281], "F2f": [976.5, 314], "MID": [1520, 318], "F3r": [1795, 380] },
  "pinScale": {},

  "drive": {
    "speed": 800, "accel": 1500, "brakeDist": 220, "settle": 0.9,
    "iconRefLen": 4.955
  }
}
;
