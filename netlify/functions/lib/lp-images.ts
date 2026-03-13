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

export const PHOTO_LIBRARY: Record<string, string[]> = {
  business: [
    "1497366216548-37526070297c",
    "1553877522-43269d4ea984",
    "1600880292203-757bb62b4baf",
    "1521737711867-e3b97375f902",
    "1542744173-8e7e91415657",
    "1556761175-b413da4baf72",
    "1560472355-536de3962603",
    "1552664730-d307ca884978",
    "1531973576160-7125cd663d86",
    "1522071820081-009f0129c71c",
    "1507679799987-c73779587ccf",
    "1454165804606-c3d57bc86b40",
    "1573164713988-8665fc963095",
    "1519452635265-7b1fbfd1e4e0",
    "1486406146926-c627a92ad1ab",
  ],
  tech: [
    "1518770660439-4636190af475",
    "1531297484001-80022131f5a1",
    "1504384308090-c894fdcc538d",
    "1519389950473-47ba0277781c",
    "1573164713988-8665fc963095",
    "1550751827-4bd374c3f58b",
    "1461749280684-dccba630e2f6",
    "1526374965328-7f61d4dc18c5",
    "1488590528505-98d2b5aba04b",
    "1451187580459-43490279c0fa",
    "1498050108023-c5249f4df085",
    "1504639725590-34d0984388bd",
    "1555949963-ff9fe0c870eb",
    "1542744173-8e7e91415657",
    "1497366216548-37526070297c",
  ],
  medical: [
    "1576091160550-2173dba999ef",
    "1579684385127-1ef15d508118",
    "1551076805-e1869033e561",
    "1538108149393-fbbd81895907",
    "1559757175-5700dde675bc",
    "1530497610245-94d3c16cda28",
    "1519494026892-80bbd2d6fd0d",
    "1516549655169-df83a0774514",
    "1526256262350-7da7584cf5eb",
    "1576091160550-2173dba999ef",
    "1579684385127-1ef15d508118",
    "1551076805-e1869033e561",
    "1538108149393-fbbd81895907",
    "1559757175-5700dde675bc",
    "1530497610245-94d3c16cda28",
  ],
  food: [
    "1517248135467-4c7edcad34c4",
    "1414235077428-338989a2e8c0",
    "1552566626-52f8b828add9",
    "1559339352-11d035aa65de",
    "1466978913421-dad2ebd01d17",
    "1504674900247-0877df9cc836",
    "1498837167922-ddd27525d352",
    "1476224203421-9ac39bcb3327",
    "1543353071-087092ec169a",
    "1565299624946-b28f40a0ae38",
    "1517248135467-4c7edcad34c4",
    "1414235077428-338989a2e8c0",
    "1552566626-52f8b828add9",
    "1559339352-11d035aa65de",
    "1466978913421-dad2ebd01d17",
  ],
  education: [
    "1524178232363-1fb2b075b655",
    "1427504494785-3a9ca7044f45",
    "1523050854058-8df90110c9f1",
    "1509062522246-3755977927d7",
    "1503676260728-1c00da094a0b",
    "1497633762265-9d179a990aa6",
    "1522202176988-66273c2fd55f",
    "1513258496099-48168024aec0",
    "1524178232363-1fb2b075b655",
    "1427504494785-3a9ca7044f45",
    "1523050854058-8df90110c9f1",
    "1509062522246-3755977927d7",
    "1503676260728-1c00da094a0b",
    "1497633762265-9d179a990aa6",
    "1522202176988-66273c2fd55f",
  ],
  construction: [
    "1504307651254-35680f356dfd",
    "1541888946425-d81bb19240f5",
    "1486406146926-c627a92ad1ab",
    "1487958449943-2429e8be8625",
    "1504297050568-910d24c426d3",
    "1541971875076-8f970d573be6",
    "1508450859948-4e04fabaa4d7",
    "1504307651254-35680f356dfd",
    "1541888946425-d81bb19240f5",
    "1486406146926-c627a92ad1ab",
    "1487958449943-2429e8be8625",
    "1504297050568-910d24c426d3",
    "1541971875076-8f970d573be6",
    "1508450859948-4e04fabaa4d7",
    "1504307651254-35680f356dfd",
  ],
  finance: [
    "1460925895917-afdab827c52f",
    "1554224155-6726b3ff858f",
    "1526304640581-d334cdbbf45e",
    "1559526324-4b87b5e36e44",
    "1551288049-bebda4e38f71",
    "1460925895917-afdab827c52f",
    "1554224155-6726b3ff858f",
    "1526304640581-d334cdbbf45e",
    "1559526324-4b87b5e36e44",
    "1551288049-bebda4e38f71",
    "1460925895917-afdab827c52f",
    "1554224155-6726b3ff858f",
    "1526304640581-d334cdbbf45e",
    "1559526324-4b87b5e36e44",
    "1551288049-bebda4e38f71",
  ],
  beauty: [
    "1560066984-138dadb4c035",
    "1522337360788-8b13dee7a37e",
    "1516975080664-ed2fc6a32937",
    "1570172619644-dfd03ed5d881",
    "1487412912498-0447578fcca8",
    "1519699047748-de8e457a634e",
    "1540555700478-4be289fbec6f",
    "1515377905703-c4788e51af15",
    "1560066984-138dadb4c035",
    "1522337360788-8b13dee7a37e",
    "1516975080664-ed2fc6a32937",
    "1570172619644-dfd03ed5d881",
    "1487412912498-0447578fcca8",
    "1519699047748-de8e457a634e",
    "1540555700478-4be289fbec6f",
  ],
  manufacturing: [
    "1565043589221-4e5bfe5a2a3f",
    "1581091226825-a6a2a5aee158",
    "1504917595217-d4dc5ebe6122",
    "1533417479674-390fca4b5f73",
    "1513828583688-c52600a27c4d",
    "1537462715879-360eeb61a0ad",
    "1581091226825-a6a2a5aee158",
    "1504917595217-d4dc5ebe6122",
    "1565043589221-4e5bfe5a2a3f",
    "1533417479674-390fca4b5f73",
    "1513828583688-c52600a27c4d",
    "1537462715879-360eeb61a0ad",
    "1581091226825-a6a2a5aee158",
    "1504917595217-d4dc5ebe6122",
    "1565043589221-4e5bfe5a2a3f",
  ],
};

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

  const photos = PHOTO_LIBRARY[category] || PHOTO_LIBRARY["business"]!;
  // サブカテゴリ: メインと異なるカテゴリから追加画像を補充
  const subCategory = category === "business" ? "tech" : "business";
  const subPhotos = PHOTO_LIBRARY[subCategory]!;

  let hash = 0;
  for (let i = 0; i < d.company_name.length; i++) {
    hash = ((hash << 5) - hash + d.company_name.charCodeAt(i)) | 0;
  }
  const offset = Math.abs(hash) % photos.length;
  const subOffset = Math.abs(hash) % subPhotos.length;

  const p = (i: number) => photos[(offset + i) % photos.length]!;
  const sub = (i: number) => subPhotos[(subOffset + i) % subPhotos.length]!;

  return [
    // 0: Hero
    { url: unsplashUrl(p(0), 1920, 1080), alt: `${d.company_name} ヒーロー画像` },
    // 1-3: Features
    { url: unsplashUrl(p(1), 800, 600), alt: `${d.service_name} サービス1` },
    { url: unsplashUrl(p(2), 800, 600), alt: `${d.service_name} サービス2` },
    { url: unsplashUrl(p(3), 800, 600), alt: `${d.service_name} サービス3` },
    // 4-6: Reasons
    { url: unsplashUrl(p(4), 800, 600), alt: `${d.service_name} 理由1` },
    { url: unsplashUrl(p(5), 800, 600), alt: `${d.service_name} 理由2` },
    { url: unsplashUrl(p(6), 800, 600), alt: `${d.service_name} 理由3` },
    // 7-9: Use Cases (サブカテゴリから取得して被り回避)
    { url: unsplashUrl(sub(0), 800, 600), alt: `${d.service_name} 活用1` },
    { url: unsplashUrl(sub(1), 800, 600), alt: `${d.service_name} 活用2` },
    { url: unsplashUrl(sub(2), 800, 600), alt: `${d.service_name} 活用3` },
    // 10-12: Functions (サブカテゴリの別オフセット)
    { url: unsplashUrl(sub(5), 800, 600), alt: `${d.service_name} 機能1` },
    { url: unsplashUrl(sub(6), 800, 600), alt: `${d.service_name} 機能2` },
    { url: unsplashUrl(sub(7), 800, 600), alt: `${d.service_name} 機能3` },
    // 13-15: Cases
    { url: unsplashUrl(p(7), 800, 600), alt: `${d.service_name} 事例1` },
    { url: unsplashUrl(p(8), 800, 600), alt: `${d.service_name} 事例2` },
    { url: unsplashUrl(p(9), 800, 600), alt: `${d.service_name} 事例3` },
    // 16: Columns
    { url: unsplashUrl(p(10), 200, 200), alt: `${d.service_name} コラム` },
  ];
}
