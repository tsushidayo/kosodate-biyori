/** Prices are normalized only within one product/SKU. No currency or points conversion. */
export type PriceRecord = Record<string, any>;
export type NormalizedOffer = PriceRecord & {
  total: number | null;
  unitCost: number | null;
  unitLabel: string;
  perPack: number | null;
  perPackLabel: string;
  quantityLabel: string;
  bonusGrams: number;
  conditional: boolean;
  eligible: boolean;
  ineligibleReason: string;
  isStore: boolean;
};
export type ComparisonOptions = {
  mode?: string;
  includeConditional?: boolean;
  includeUsed?: boolean;
  sort?: "unit" | "total";
  now?: number;
};
const TWO_DAYS = 48 * 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;
const finiteNonnegative = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
const finitePositive = (n: unknown): n is number => finiteNonnegative(n) && n > 0;
function safeSource(source: unknown) {
  if (typeof source !== "string") return false;
  try {
    const u = new URL(source);
    const searchPage = /(?:^|\/)search(?:\/|$)|^\/s\/?$|^\/kw(?:\/|$)/i.test(u.pathname) || ['k','keyword','query','q'].some(key=>u.searchParams.has(key));
    return !searchPage && u.protocol === "https:" && !u.username && !u.password && !u.port && u.hostname.includes(".") && !/^(localhost|.*\.local|[\d.]+)$/i.test(u.hostname);
  } catch { return false; }
}
function amount(n: number) { return n.toLocaleString("ja-JP", { maximumFractionDigits: 2 }); }
export function purchaseKind(offer: PriceRecord):'online'|'store'|'pickup'|'marketplace' {
  if(offer.purchaseChannel==='marketplace'||offer.marketplace===true||/メルカリ|ラクマ|フリマ/.test(String(offer.store||'')))return 'marketplace';
  if(offer.purchaseChannel==='in-store'||offer.mode==='店頭')return 'store';
  if(offer.purchaseChannel==='pickup'||/店舗受取|店頭受取/.test(String(offer.mode||'')))return 'pickup';
  return 'online';
}
export function matchesPurchaseMode(offer:PriceRecord,mode='すべて'){
 const kind=purchaseKind(offer);if(mode==='すべて')return true;
 if(['店舗','店頭','店頭購入'].includes(mode))return kind==='store';
 if(mode==='店舗受取')return kind==='pickup';if(mode==='フリマ')return kind==='marketplace';
 return kind==='online';
}
function isStore(offer:PriceRecord){return ['store','pickup'].includes(purchaseKind(offer));}
export function normalizeOffer(product: PriceRecord, offer: PriceRecord, now = Date.now()): NormalizedOffer {
  const milk = product.category === "ミルク";
  const nominalGrams = Number(String(product.unit || product.name || "").match(/(\d+(?:\.\d+)?)\s*g/i)?.[1]) || null;
  const quantity = offer.quantity;
  const grams = offer.totalGrams;
  const massUnit = finitePositive(grams);
  const unitLabel = massUnit ? "100g" : String(offer.unitLabel || "個");
  const total = finiteNonnegative(offer.price) && finiteNonnegative(offer.shipping) ? offer.price + offer.shipping : null;
  const unitCost = total !== null && (massUnit || finitePositive(quantity)) ? total / (massUnit ? grams / 100 : quantity) : null;
  const perPack = total !== null && finitePositive(quantity) ? (milk && nominalGrams && unitCost !== null ? unitCost * nominalGrams / 100 : total / quantity) : null;
  const perPackLabel = milk && nominalGrams ? `${amount(nominalGrams)}g換算` : `1${unitLabel === "100g" ? "個" : unitLabel}あたり`;
  let quantityLabel = finitePositive(quantity) ? `${amount(quantity)}${unitLabel === "100g" ? "個" : unitLabel}` : "数量未確認";
  let bonusGrams = 0;
  if (milk && nominalGrams && finitePositive(quantity)) {
    quantityLabel = `${amount(nominalGrams)}g × ${amount(quantity)}缶`;
    if (massUnit && grams > nominalGrams * quantity) {
      bonusGrams = grams - nominalGrams * quantity;
      quantityLabel += ` ＋ ${amount(bonusGrams)}g`;
    }
  } else if (finitePositive(offer.packs) && finitePositive(offer.piecesPerPack)) {
    quantityLabel = `${amount(offer.piecesPerPack)}${unitLabel} × ${amount(offer.packs)}パック`;
  } else if (massUnit) {
    quantityLabel = `${amount(grams)}g`;
    if (finitePositive(quantity) && quantity > 1) quantityLabel += `・${amount(quantity)}個`;
  }
  const conditional = offer.conditional === true || /定期便|定期購入|クーポン/.test(String(offer.mode ?? "")) || Number(offer.couponYen) > 0 || Number(offer.discountRate) > 0;
  const checked = typeof offer.checkedAt === "string" ? Date.parse(offer.checkedAt) : NaN;
  let ineligibleReason = "";
  if (!finiteNonnegative(offer.price)) ineligibleReason = "価格未確認";
  else if (!finiteNonnegative(offer.shipping)) ineligibleReason = "送料未確認";
  else if (!finitePositive(quantity) || !Number.isInteger(quantity)) ineligibleReason = "数量未確認";
  else if ((milk || offer.unitLabel === "100g") && !massUnit) ineligibleReason = "容量未確認";
  else if (offer.available===null && (offer.stockVerified===false||offer.availabilityVerified===false)) ineligibleReason = "在庫未確認";
  else if (offer.available===false) ineligibleReason = "売り切れ";
  else if (/売り切れ|売切|在庫なし|入荷待ち|価格表示に差|価格不明|未確認|店舗未指定|要確認|要再確認/.test(String(offer.status ?? ""))) ineligibleReason = String(offer.status);
  else if (offer.verified !== true || offer.eligible === 0) ineligibleReason = "価格の確認待ち";
  else if (!safeSource(offer.source)) ineligibleReason = "販売ページ未確認";
  else if (!Number.isFinite(checked)) ineligibleReason = "確認日なし";
  else if (now - checked > TWO_DAYS) ineligibleReason = "確認から48時間以上";
  else if (checked - now > ONE_DAY) ineligibleReason = "確認日を要確認";
  return {
    ...offer, total, unitCost, unitLabel, perPack, perPackLabel, quantityLabel,
    bonusGrams, conditional, eligible: !ineligibleReason, ineligibleReason,
    isStore: isStore(offer), purchaseKind:purchaseKind(offer),
  };
}
export function compareOffers(product: PriceRecord, options: ComparisonOptions = {}) {
  const { mode = "すべて", includeConditional = false, sort = "unit", now = Date.now(), includeUsed = mode === "フリマ" } = options;
  return (Array.isArray(product.offers) ? product.offers : [])
    .map((o: PriceRecord) => normalizeOffer(product, o, now))
    .filter((o: ReturnType<typeof normalizeOffer>) => o.eligible && (includeConditional || !o.conditional) && (includeUsed || (o.conditionClass!=="used"&&!/中古|使用済|傷や汚れ/.test(String(o.itemCondition||"")))) &&
      matchesPurchaseMode(o,mode))
    .sort((a: ReturnType<typeof normalizeOffer>, b: ReturnType<typeof normalizeOffer>) =>
      (sort === "total" ? a.total! - b.total! : a.unitCost! - b.unitCost!) || a.total! - b.total! || String(a.store).localeCompare(String(b.store), "ja"));
}
