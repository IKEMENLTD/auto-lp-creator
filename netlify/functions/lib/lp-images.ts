/**
 * LP生成 - 画像ライブラリ・画像選択
 */

import type { FlatData } from "./lp-types";

// ============================================================
// Unsplash画像
// ============================================================

export interface LpImage {
  url: string;
  alt: string;
}

export const unsplashUrl = (id: string, w = 800, h = 600): string =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80`;

// 全カテゴリ間で重複なし。各カテゴリ20枚以上を確保。
export const PHOTO_LIBRARY: Record<string, string[]> = {
  business: [
    "1497366216548-37526070297c", // オフィスビル夜景
    "1553877522-43269d4ea984",   // チームミーティング
    "1600880292203-757bb62b4baf", // ビジネスマン握手
    "1521737711867-e3b97375f902", // ノートPC作業
    "1556761175-b413da4baf72",   // コワーキングスペース
    "1560472355-536de3962603",   // ホワイトボード会議
    "1552664730-d307ca884978",   // オフィス風景
    "1531973576160-7125cd663d86", // プレゼンテーション
    "1522071820081-009f0129c71c", // ビジネス街
    "1507679799987-c73779587ccf", // スーツ男性
    "1454165804606-c3d57bc86b40", // カフェ打ち合わせ
    "1519452635265-7b1fbfd1e4e0", // 女性ビジネスパーソン
    "1557804506-669a67965ba0",   // チームワーク
    "1542744094-3a31f272c490",   // デスク上のPC
    "1568992687947-868a62a9f521", // 会議室
    "1573497019940-1c28c88b4f3e", // ビジネス資料
    "1606857521015-7f9fcf423740", // リモートワーク
    "1522202176988-66273c2fd55f", // オフィスインテリア
    "1517245386807-bb43f82c33c4", // ブレインストーミング
    "1551434678-e076c223a692",   // スタートアップ
  ],
  tech: [
    "1518770660439-4636190af475", // サーバールーム
    "1531297484001-80022131f5a1", // コーディング画面
    "1504384308090-c894fdcc538d", // ネットワーク
    "1519389950473-47ba0277781c", // テクノロジー抽象
    "1550751827-4bd374c3f58b",   // AI回路基板
    "1461749280684-dccba630e2f6", // プログラミング
    "1526374965328-7f61d4dc18c5", // スマートフォン
    "1488590528505-98d2b5aba04b", // ノートPCコード
    "1451187580459-43490279c0fa", // 地球ネットワーク
    "1498050108023-c5249f4df085", // コード画面
    "1504639725590-34d0984388bd", // マルチモニター
    "1555949963-ff9fe0c870eb",   // データセンター
    "1535223289827-42f1e9919769", // ロボティクス
    "1558494949-ef010cbdcc31",   // ダッシュボード
    "1550439062-609e1531270e",   // クラウド概念
    "1544197150-b99a580bb7a8",   // テックチーム
    "1581091877018-dac6a371d50f", // VRヘッドセット
    "1563986768609-322da13575f2", // ワイヤフレーム
    "1537432376149-f756cbefbe46", // デバイス群
    "1580894894513-541e068a3e2b", // サイバーセキュリティ
  ],
  medical: [
    "1576091160550-2173dba999ef", // 病院廊下
    "1579684385127-1ef15d508118", // 医師
    "1551076805-e1869033e561",   // 医療器具
    "1538108149393-fbbd81895907", // 聴診器
    "1559757175-5700dde675bc",   // 医療チーム
    "1530497610245-94d3c16cda28", // ラボ
    "1519494026892-80bbd2d6fd0d", // 介護
    "1516549655169-df83a0774514", // 薬
    "1526256262350-7da7584cf5eb", // 手術室
    "1631815588090-d4bfec5b1ccb", // オンライン診療
    "1666214280557-f1b5022eb634", // 電子カルテ
    "1584820927498-cfe5211fd8bf", // 看護師
    "1587854692152-cbe660dbde88", // DNA研究
    "1532938911079-1b06ac7ceec7", // 健康診断
    "1581595220975-4f0e5e8b8b8e", // リハビリ
    "1571772996211-2f02974c3c3d", // 医療テクノロジー
    "1546198632-9ef6368bef12",   // 福祉施設
    "1583912086096-8c60d75a53f9", // 処方箋
    "1527613426441-4da17471b66d", // 歯科
    "1559839734-2b71ea197ec2",   // 医療相談
  ],
  food: [
    "1517248135467-4c7edcad34c4", // レストラン内装
    "1414235077428-338989a2e8c0", // 料理盛り付け
    "1552566626-52f8b828add9",   // カフェ
    "1559339352-11d035aa65de",   // 食材
    "1466978913421-dad2ebd01d17", // パン
    "1504674900247-0877df9cc836", // サラダ
    "1498837167922-ddd27525d352", // フルーツ
    "1476224203421-9ac39bcb3327", // 料理
    "1543353071-087092ec169a",   // シェフ
    "1565299624946-b28f40a0ae38", // 和食
    "1555396273-367ea4eb4db5",   // コーヒー
    "1567620905732-2d1ec7ab7445", // デザート
    "1540189549336-e6e99c3679fe", // ワイン
    "1571091718767-18b5b1457add", // キッチン
    "1583394838336-d831a2f563ab", // テイクアウト
    "1546069901-ba9599a7e63c",   // バー
    "1588166524941-3bf61a9c41db", // 寿司
    "1559847844-5315695dadae",   // ピザ
    "1495474472287-4d71bcdd2085", // ベーカリー
    "1514933651103-005eec06c04b", // ダイニング
  ],
  education: [
    "1524178232363-1fb2b075b655", // 大学キャンパス
    "1427504494785-3a9ca7044f45", // 図書館
    "1523050854058-8df90110c9f1", // 講義
    "1509062522246-3755977927d7", // 教室
    "1503676260728-1c00da094a0b", // 勉強
    "1497633762265-9d179a990aa6", // 学生
    "1513258496099-48168024aec0", // ワークショップ
    "1580582932707-520aed937b7b", // オンライン学習
    "1588072432836-e10032774350", // セミナー
    "1577896851231-d472b2ffd2a3", // 子供の教育
    "1503676260728-1c00da094a0b", // ノートと本
    "1546410531-bb4caa6b3dc3", // プログラミング教育
    "1571260899304-425eee4c7efc", // グループ学習
    "1562774053-701939374585",   // 研究室
    "1516321318423-f06f85e504b3", // スクール
    "1544717305166-b407cc8b7b2d", // タブレット学習
    "1481627834876-b7833e8f5570", // 先生と生徒
    "1522661067900-ab829854a57f", // 卒業式
    "1596496050827-8299e0220de1", // eラーニング
    "1577563908411-5077b6dc7624", // 実験
  ],
  construction: [
    "1504307651254-35680f356dfd", // 建設現場
    "1541888946425-d81bb19240f5", // クレーン
    "1487958449943-2429e8be8625", // 設計図
    "1504297050568-910d24c426d3", // 重機
    "1541971875076-8f970d573be6", // 建物外観
    "1508450859948-4e04fabaa4d7", // 工事現場
    "1503387762-592deb58ef4e",   // マンション
    "1590725121839-892b458a74fe", // 内装工事
    "1599707367812-2f5ed5c1a8b8", // 戸建て住宅
    "1565008447742-97f6f38c985c", // ビル群
    "1585858229735-cd08d47bfa87", // 不動産
    "1560518883-ce09059eeffa",   // リノベーション
    "1558618666-fcd25c85f7e7",   // 建築設計
    "1582268611958-863e5e2de1e4", // 橋梁
    "1617360547745-c4b3e2449b8a", // 施工管理
    "1576091160399-112ba8d25d1d", // 安全装備
    "1533779183510-8f55a55f15c1", // オフィスビル
    "1522708323590-d24dbb6b0267", // インテリア
    "1560185007-c5ca9d2c014d",   // 測量
    "1486718448742-163732cd1544", // 街並み
  ],
  finance: [
    "1460925895917-afdab827c52f", // 株価チャート
    "1554224155-6726b3ff858f",   // 金融街
    "1526304640581-d334cdbbf45e", // コイン
    "1559526324-4b87b5e36e44",   // 電卓
    "1551288049-bebda4e38f71",   // グラフ
    "1563986768494-4dee2763ff3f", // 銀行
    "1579532537598-27783a695e58", // クレジットカード
    "1611974789855-9c2a0a7236a3", // フィンテック
    "1554260570-9140fd3b7614",   // 会計
    "1553729459-afe8f2e2d3b5",   // 投資
    "1518186233392-c232efbf2373", // 保険
    "1444653614773-995cb1ef9efa", // お金
    "1565514020179-026b92b84bb6", // 貯金
    "1591696205602-2f950c417cb9", // 不動産投資
    "1590283603385-17ffb3a7f29f", // 仮想通貨
    "1586473219010-2ffc57b0d282", // 決済
    "1556742049-0cfed4f6a45d",   // ファイナンシャル
    "1579621970563-9ae87a5df53c", // 税務
    "1543286386-713bdd548da4",   // 資産運用
    "1567427018141-0584cfcbf1b8", // コンサルティング
  ],
  beauty: [
    "1560066984-138dadb4c035",   // スパ
    "1522337360788-8b13dee7a37e", // スキンケア
    "1516975080664-ed2fc6a32937", // メイクアップ
    "1570172619644-dfd03ed5d881", // ヘアサロン
    "1487412912498-0447578fcca8", // 美容院
    "1519699047748-de8e457a634e", // マッサージ
    "1540555700478-4be289fbec6f", // 化粧品
    "1515377905703-c4788e51af15", // ネイル
    "1596755389378-c31d21fd1273", // エステ
    "1570554886111-e80fcca6a029", // フェイシャル
    "1507003211169-0a1dd7228f2d", // モデル
    "1487412720507-e7ab37603c6f", // ヨガ
    "1544161515-4ab6ce6db874",   // ウェルネス
    "1583416750470-965b2707b355", // ボディケア
    "1598440947619-2c35fc9aa908", // ヘアケア
    "1571781926291-c477ebfd024b", // アロマ
    "1556228578-8c89e6adf883",   // コスメ
    "1552693673-1bf958298935",   // リラクゼーション
    "1600334089648-b0d9d3028eb2", // 美容クリニック
    "1562322140-8baeececf3df",   // パーソナルケア
  ],
  manufacturing: [
    "1565043589221-4e5bfe5a2a3f", // 工場ライン
    "1581091226825-a6a2a5aee158", // ロボットアーム
    "1504917595217-d4dc5ebe6122", // 製造プロセス
    "1533417479674-390fca4b5f73", // 品質管理
    "1513828583688-c52600a27c4d", // 倉庫
    "1537462715879-360eeb61a0ad", // 物流
    "1567789884554-0b844b597180", // CNC加工
    "1558618666-fcd25c85f7e7",   // 精密機器
    "1586528116311-ad8dd3c8310d", // 3Dプリンタ
    "1563203369-49e1b389f2b3",   // 溶接
    "1542621334-a254cf47733d",   // 検品
    "1580901368919-7738efb0f902", // フォークリフト
    "1611117775350-ac3950990985", // IoTセンサー
    "1551836022-4c4c79ecde51",   // 食品製造
    "1581092160562-40aa08e78837", // 自動車
    "1619641805986-120be6da7e73", // 半導体
    "1570037779813-0889ec638a87", // 木工
    "1551434678-e076c223a692",   // 印刷
    "1589792923962-537704632910", // 電子基板
    "1548345680-f5475ea5b5ed",   // 物流センター
  ],
};

// ============================================================
// 画像選択（ランダム + 業種関連性）
// ============================================================

/** Fisher-Yatesシャッフル（シード付き疑似乱数） */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function selectImages(d: FlatData): LpImage[] {
  const industry = d.industry.toLowerCase();

  let category = "business";
  if (industry.includes("医") || industry.includes("健康") || industry.includes("福祉")) category = "medical";
  else if (industry.includes("it") || industry.includes("テック") || industry.includes("開発") || industry.includes("システム")) category = "tech";
  else if (industry.includes("飲食") || industry.includes("食") || industry.includes("レストラン")) category = "food";
  else if (industry.includes("教育") || industry.includes("学") || industry.includes("スクール")) category = "education";
  else if (industry.includes("建") || industry.includes("不動産") || industry.includes("建築")) category = "construction";
  else if (industry.includes("金融") || industry.includes("保険") || industry.includes("銀行")) category = "finance";
  else if (industry.includes("美容") || industry.includes("サロン") || industry.includes("エステ")) category = "beauty";
  else if (industry.includes("製造") || industry.includes("工場") || industry.includes("メーカー")) category = "manufacturing";

  // メインカテゴリ → サブカテゴリ → その他の順でプール構築
  const subCategory = category === "business" ? "tech" : "business";
  const allCategories = [category, subCategory, ...Object.keys(PHOTO_LIBRARY).filter(k => k !== category && k !== subCategory)];

  const usedIds = new Set<string>();
  const uniqueIds: string[] = [];
  for (const cat of allCategories) {
    for (const id of (PHOTO_LIBRARY[cat] || [])) {
      if (!usedIds.has(id)) {
        usedIds.add(id);
        uniqueIds.push(id);
      }
    }
  }

  // 会社名ハッシュ + タイムスタンプでシード生成（毎回異なる選択）
  let hash = 0;
  for (let i = 0; i < d.company_name.length; i++) {
    hash = ((hash << 5) - hash + d.company_name.charCodeAt(i)) | 0;
  }
  const timeSeed = Math.floor(Date.now() / 1000);
  const seed = Math.abs(hash ^ timeSeed);

  // メインカテゴリの画像をシャッフル（関連性の高い画像を優先的に使用）
  const mainPool = PHOTO_LIBRARY[category] || [];
  const subPool = PHOTO_LIBRARY[subCategory] || [];
  const shuffledMain = seededShuffle(mainPool, seed);
  const shuffledSub = seededShuffle(subPool, seed + 1);

  // メインから17枚取り、足りなければサブ→その他から補充
  const otherPool = uniqueIds.filter(id => !mainPool.includes(id) && !subPool.includes(id));
  const shuffledOther = seededShuffle(otherPool, seed + 2);
  const finalPool = [...shuffledMain, ...shuffledSub, ...shuffledOther];

  // 重複除去しつつ17枚取得
  const picked: string[] = [];
  const pickedSet = new Set<string>();
  for (const id of finalPool) {
    if (!pickedSet.has(id)) {
      pickedSet.add(id);
      picked.push(id);
      if (picked.length >= 17) break;
    }
  }

  const labels = [
    "ヒーロー画像", "サービス1", "サービス2", "サービス3",
    "理由1", "理由2", "理由3",
    "活用1", "活用2", "活用3",
    "機能1", "機能2", "機能3",
    "事例1", "事例2", "事例3",
    "コラム",
  ];

  return labels.map((label, i) => {
    const isHero = i === 0;
    const isThumb = i === 16;
    const w = isHero ? 1920 : isThumb ? 200 : 800;
    const h = isHero ? 1080 : isThumb ? 200 : 600;
    const id = picked[i] || picked[0]!;
    return { url: unsplashUrl(id, w, h), alt: `${i === 0 ? d.company_name : d.service_name} ${label}` };
  });
}
