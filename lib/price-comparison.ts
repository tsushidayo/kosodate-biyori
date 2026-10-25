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
  groupKey?: string;
};
export type OfferComparisonGroup = {
  key: string;
  label: string;
  quantity: number;
  totalGrams: number | null;
  unitLabel: string;
  offerCount: number;
  retailerCount: number;
  isBase: boolean;
  hasExtras: boolean;
};
const TWO_DAYS = 48 * 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;
export const AMAZON_DELIVERY_SOURCE='https://www.amazon.co.jp/gp/help/customer/display.html?nodeId=201911210';
export const AMAZON_PRIME_SOURCE='https://www.amazon.co.jp/gp/help/customer/display.html?nodeId=G6LDPN7YJHYKH2J6';
/** Amazon-dispatched ordinary delivery. Marketplace seller shipping is separate. */
export function amazonDeliveryFees(subtotal:number){return {prime:0,nonPrimeMin:subtotal>=3500?0:460,nonPrimeMax:subtotal>=3500?0:500,freeFrom:3500};}
const finiteNonnegative = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
const finitePositive = (n: unknown): n is number => finiteNonnegative(n) && n > 0;
export function isProductPurchaseSource(source: unknown) {
  if (typeof source !== "string") return false;
  try {
    const u = new URL(source);
    const searchPage = /(?:^|\/)(?:catalog)?search(?:\/|$)|^\/s\/?$|^\/kw(?:\/|$)/i.test(u.pathname) || ['k','keyword','query','q','word','search_keyword','gspsk','text'].some(key=>u.searchParams.has(key));
    // A price shown on a category is not tied to a purchasable item. Keep known
    // product pages whose legitimate path includes "category" (e.g. a numeric .html SKU).
    const categoryPage=/^\/shop\/c(?:\/|$)|\/(?:collections|categories)(?:\/|$)|\/ProductList\.aspx$/i.test(u.pathname)||
      /\/(?:category)(?:\/|$)/i.test(u.pathname)&&!/^\/(?:category)\/[^/]+\/\d+\.html?$/i.test(u.pathname)||
      u.hostname==='item.rakuten.co.jp'&&/^\/[^/]+\/c(?:\/|$)/i.test(u.pathname)||
      u.hostname==='itoyokado-netsuper.jp'&&/^\/[a-f0-9-]{36}\/[^/]+\/?$/i.test(u.pathname)||
      u.hostname==='hula-la.com'&&/^\/milk\//i.test(u.pathname);
    return !searchPage && !categoryPage && u.pathname!=='/' && u.protocol === "https:" && !u.username && !u.password && !u.port && u.hostname.includes(".") && !/^(localhost|.*\.local|[\d.]+)$/i.test(u.hostname);
  } catch { return false; }
}
function amount(n: number) { return n.toLocaleString("ja-JP", { maximumFractionDigits: 2 }); }
const RETAILER_IDENTITIES = [
  {key:'amazon',name:'Amazon',hosts:['amazon.co.jp']},
  {key:'rakuten',name:'楽天市場',hosts:['rakuten.co.jp']},
  {key:'yahoo',name:'Yahoo!ショッピング',hosts:['store.shopping.yahoo.co.jp']},
  {key:'yodobashi',name:'ヨドバシ.com',hosts:['yodobashi.com']},
  {key:'akachan',name:'アカチャンホンポ',hosts:['shop.akachan.jp']},
  {key:'nishimatsuya',name:'西松屋オンライン',hosts:['24028-net.jp']},
  {key:'babiesrus',name:'トイザらス・ベビーザらス',hosts:['toysrus.co.jp','babiesrus.co.jp']},
  {key:'biccamera',name:'ビックカメラ.com',hosts:['biccamera.com']},
  {key:'lohaco',name:'LOHACO',hosts:['lohaco.yahoo.co.jp','lohaco.jp']},
  {key:'sundrug',name:'サンドラッグ公式通販',hosts:['sundrug-online.com']},
  {key:'matsukiyo',name:'マツキヨココカラ',hosts:['matsukiyococokara-online.com']},
  {key:'welcia',name:'ウエルシアドットコム',hosts:['e-welcia.com']},
  {key:'aeon',name:'イオンスタイルオンライン',hosts:['aeonretail.com']},
  {key:'create-sd',name:'クリエイトSD',hosts:['netshop.create-sd.co.jp']},
  {key:'seims',name:'セイムス公式',hosts:['seims.co.jp']},
  {key:'tsuruha',name:'ツルハ公式通販',hosts:['shop.tsuruha.co.jp']},
  {key:'mrmax',name:'ミスターマックス',hosts:['mrmax.jp']},
  {key:'aupay',name:'au PAY マーケット',hosts:['wowma.jp']},
];
function retailerIdentity(offer:PriceRecord){
  let host='';try{host=new URL(String(offer.source)).hostname.toLowerCase().replace(/^www\./,'');}catch{}
  const retailer=RETAILER_IDENTITIES.find(entry=>entry.hosts.some(domain=>host===domain||host.endsWith('.'+domain)));
  return retailer||{key:host||String(offer.store||offer.id||'unknown'),name:String(offer.store||host||'販売店')};
}
/** A marketplace seller and that seller's own web shop remain different purchase destinations. */
export function canonicalRetailerKey(offer:PriceRecord){return retailerIdentity(offer).key;}
function sellerName(offer:PriceRecord,retailerKey:string){
  if(offer.seller)return offer.seller;
  const store=String(offer.store||'');
  if(retailerKey==='yahoo')return /^(?:Yahoo!?(?:ショッピング)?)$/i.test(store)?null:store.replace(/^Yahoo!?(?:ショッピング)?[・\s\-]+/i,'').replace(/公式Yahoo!?店$/i,'公式店').replace(/Yahoo!?店$/i,'').trim()||null;
  if(retailerKey==='rakuten')return /^(?:楽天|楽天市場)$/.test(store)?null:store.replace(/^楽天(?:市場)?[・\s\-]+/,'').replace(/[・\s]+楽天(?:市場)?$/,'').trim()||null;
  return null;
}
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
  const nominalGrams = Number([product.unit,product.name].filter(Boolean).join(' ').match(/(\d+(?:\.\d+)?)\s*g/i)?.[1]) || null;
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
    quantityLabel = `${amount(nominalGrams)}g × ${amount(quantity)}${product.packUnit||'缶'}`;
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
  else if (offer.currency && offer.currency !== 'JPY') ineligibleReason = "通貨の確認待ち";
  else if (!finiteNonnegative(offer.shipping)) ineligibleReason = "送料未確認";
  else if (!finitePositive(quantity) || !Number.isInteger(quantity)) ineligibleReason = "数量未確認";
  else if (finitePositive(offer.packs) && finitePositive(offer.piecesPerPack) && offer.packs * offer.piecesPerPack !== quantity) ineligibleReason = "枚数・個数が不一致";
  else if ((milk&&product.formulation!=='liquid' || offer.unitLabel === "100g") && !massUnit) ineligibleReason = "容量未確認";
  else if (offer.available===false) ineligibleReason = "売り切れ";
  else if (offer.available!==true && !/^(?:在庫あり|在庫残少|購入可能|お取り寄せ注文)$/.test(String(offer.status||'')) || offer.available!==true && (offer.stockVerified===false||offer.availabilityVerified===false)) ineligibleReason = "在庫未確認";
  else if (/売り切れ|売切|在庫なし|入荷待ち|価格表示に差|価格不明|未確認|店舗未指定|要確認|要再確認/.test(String(offer.status ?? ""))) ineligibleReason = String(offer.status);
  else if (offer.verified !== true || offer.eligible === 0) ineligibleReason = "価格の確認待ち";
  else if (!isProductPurchaseSource(offer.source)) ineligibleReason = "販売ページ未確認";
  else if (!Number.isFinite(checked)) ineligibleReason = "確認日なし";
  else if (now - checked > TWO_DAYS) ineligibleReason = "確認から48時間以上";
  else if (checked - now > ONE_DAY) ineligibleReason = "確認日を要確認";
  else if (offer.validThrough && Number.isFinite(Date.parse(offer.validThrough)) && Date.parse(offer.validThrough) < now) ineligibleReason = "割引・価格の期限切れ";
  return {
    ...offer, total, unitCost, unitLabel, perPack, perPackLabel, quantityLabel,
    bonusGrams, conditional, eligible: !ineligibleReason, ineligibleReason,
    isStore: isStore(offer), purchaseKind:purchaseKind(offer),
    retailerKey:canonicalRetailerKey(offer),retailerName:retailerIdentity(offer).name,
    seller:sellerName(offer,canonicalRetailerKey(offer)),
  };
}

function comparisonUnit(product:PriceRecord,offer:PriceRecord){
  return finitePositive(offer.totalGrams)?'100g':String(offer.unitLabel||product.unitType||'個');
}
function variationKey(product:PriceRecord,offer:PriceRecord){
  return ['model','color','size'].map(field=>String(offer[field]??product[field]??'').normalize('NFKC').trim().toLowerCase()).concat(usedOffer(offer)?'used':String(offer.conditionClass||'new')).join('|');
}
function usedOffer(offer:PriceRecord){return offer.conditionClass==='used'||/中古|使用済|傷や汚れ/.test(String(offer.itemCondition||''));}
/** A retailer's bonus is a different purchase from the plain item, even when
 * the main item's weight and count are identical. Required product parts stay intact. */
export function offerHasExtras(offer:PriceRecord){
 if(offer.hasExtras===true||offer.comparisonKind==='bonus')return true;
 const text=[offer.bundleLabel,offer.purchaseLabel,offer.sourceEvidence?.selectedProductTitle,offer.listingTitle].filter(Boolean).join(' ').normalize('NFKC');
 return /おまけ|オマケ|ノベルティ|特典|プレゼント|(?:おしりふき|哺乳びん洗いスポンジ|哺乳瓶洗いスポンジ)付(?:き)?/.test(text);
}
function bonusKey(offer:PriceRecord){return offerHasExtras(offer)?String(offer.bundleKey||offer.source||offer.id||'bonus'):'';}

/** Derive repeated purchases only from a confirmed ordinary sale unit and an
 * explicitly checked order shipping rule. Never reuse a bundle's price as a unit price. */
export function comparisonCandidates(product:PriceRecord, now=Date.now()):PriceRecord[]{
 const originals:Array<PriceRecord>=Array.isArray(product.offers)?product.offers:[];
 const targets=new Map<string,PriceRecord>();
 for(const offer of originals){const key=offerComparisonGroupKey(product,offer);if(key)targets.set(key,offer);}
 const derived:PriceRecord[]=[];
 for(const source of originals){
  const offer=normalizeOffer(product,source,now),rule=source.shippingRule;
  if(!offer.eligible||offer.conditional||purchaseKind(offer)!=='online'||usedOffer(offer)||offerHasExtras(source)||source.derivedOffer||!rule||rule.verified!==true||!isProductPurchaseSource(rule.source))continue;
  const ruleDate=Date.parse(rule.checkedAt||'');if(!Number.isFinite(ruleDate)||now-ruleDate>TWO_DAYS||ruleDate-now>ONE_DAY)continue;
  if(!['flat','threshold'].includes(rule.kind)||!finiteNonnegative(rule.fee)||rule.kind==='threshold'&&!finitePositive(rule.freeFrom))continue;
  // A formula based on another page's sale unit must not be multiplied again.
  if((source.purchaseUnits||1)!==1||source.priceCalculation&&typeof source.priceCalculation==='object')continue;
  for(const [targetKey,target] of targets){
   const multiple=target.quantity/source.quantity;
   if(!Number.isInteger(multiple)||multiple<=1||multiple>100||source.maxPurchaseQuantity&&multiple>source.maxPurchaseQuantity)continue;
   if(comparisonUnit(product,source)!==comparisonUnit(product,target)||variationKey(product,source)!==variationKey(product,target))continue;
   if(finitePositive(source.totalGrams)!==finitePositive(target.totalGrams)||finitePositive(source.totalGrams)&&Math.abs(source.totalGrams*multiple-target.totalGrams)>1e-7)continue;
   const price=Math.round(source.price*multiple*100)/100;
   const shipping=rule.kind==='threshold'&&price>=rule.freeFrom?0:rule.fee;
   const candidate={...source,id:String(source.id||source.source)+'-buy-'+multiple,price,shipping,quantity:target.quantity,totalGrams:target.totalGrams,packs:source.packs?source.packs*multiple:undefined,purchaseUnits:multiple,derivedOffer:true,sourceOfferId:source.id,priceCalculation:{unitPrice:source.price,purchaseUnits:multiple,calculatedPrice:price},condition:`単品を${multiple}点購入。${rule.description||'確認済みの送料条件を適用。'} 注文できる残数は販売店で確認してください。`,shippingSource:rule.source};
   if(offerComparisonGroupKey(product,candidate)===targetKey)derived.push(candidate);
  }
 }
 return [...originals,...derived];
}
/** Unknown amounts never join a confirmed purchase amount. Missing pack metadata alone is not a mismatch. */
export function offerComparisonGroupKey(product:PriceRecord,offer:PriceRecord):string|null{
  if(!finitePositive(offer.quantity)||!Number.isInteger(offer.quantity))return null;
  const massRequired=product.category==='ミルク'&&product.formulation!=='liquid'||offer.unitLabel==='100g';
  if(massRequired&&!finitePositive(offer.totalGrams))return null;
  return JSON.stringify([comparisonUnit(product,offer),offer.quantity,finitePositive(offer.totalGrams)?offer.totalGrams:null,variationKey(product,offer),bonusKey(offer)]);
}
function baseComparisonOffer(product:PriceRecord,offers:PriceRecord[]):PriceRecord{
  const representative=offers.find(offer=>finitePositive(offer.quantity))||{};
  const unit=String(product.unitType||representative.unitLabel||'個');
  const text=String(product.unit||'').normalize('NFKC');
  const powder=product.category==='ミルク'&&product.formulation!=='liquid';
  const unitPattern=['枚','本','個','点','セット','組','包','袋','冊','台'].includes(unit)?new RegExp('(\\d+(?:\\.\\d+)?)\\s*'+unit):null;
  const stated=unitPattern?Number(text.match(unitPattern)?.[1]):null;
  const knownQuantities=[...new Set(offers.map(offer=>offer.quantity).filter(quantity=>finitePositive(quantity)&&Number.isInteger(quantity)))];
  let quantity=finitePositive(stated)&&Number.isInteger(stated)?stated:1;
  // Imported catalog records may count one entire SKU instead of its inner items.
  // Preserve that confirmed sale unit rather than multiplying contents such as 2 x 100 wipes.
  if(quantity>1&&!knownQuantities.includes(quantity)&&knownQuantities.includes(1))quantity=1;
  // When the product has no explicit count, use the documented smallest sale unit;
  // explicit single-can or single-pack amounts remain first even if only bulk quotes exist.
  const explicitSingle=/[／/]\s*1(?:商品|パック|本|個|缶|袋|セット|点)(?:$|[／/])/.test(text);
  if(!powder&&!explicitSingle&&!finitePositive(stated)&&knownQuantities.length&&!knownQuantities.includes(1))quantity=Math.min(...knownQuantities);
  if(finitePositive(product.singlePurchaseQuantity)&&Number.isInteger(product.singlePurchaseQuantity))quantity=product.singlePurchaseQuantity;
  const sameAmount=offers.filter(offer=>offer.quantity===quantity);
  const knownGrams=[...new Set(sameAmount.map(offer=>offer.totalGrams).filter(finitePositive))];
  const grams=powder?Number(text.match(/(\d+(?:\.\d+)?)\s*g/i)?.[1]):knownGrams.length===1?knownGrams[0]:null;
  return {quantity,totalGrams:finitePositive(grams)?grams:null,unitLabel:finitePositive(grams)||powder?'100g':unit,conditionClass:'new'};
}
function groupLabel(product:PriceRecord,offer:PriceRecord){
  const normalized=normalizeOffer(product,offer);
  const variation=['model','color','size'].map(field=>String(offer[field]??product[field]??'').trim()).filter(Boolean);
  if(usedOffer(offer))variation.push('中古');
  const suffix=(variation.length?'・'+variation.join('・'):'')+(offerHasExtras(offer)?'・おまけ付き':'');
  if(product.category==='ミルク'&&product.formulation!=='liquid')return normalized.quantityLabel+suffix;
  const base=baseComparisonOffer(product,[offer]);
  if(comparisonUnit(product,offer)==='枚'&&finitePositive(base.quantity)&&offer.quantity%base.quantity===0){
    const count=offer.quantity/base.quantity,pack=/\d+\s*枚\s*[×x✕]\s*\d+/i.test(String(product.name))?'セット':'パック';
    return `${amount(base.quantity)}枚 × ${amount(count)}${pack}`+suffix;
  }
  return normalized.quantityLabel+suffix;
}
export function offerComparisonGroups(product:PriceRecord,options:ComparisonOptions={}):OfferComparisonGroup[]{
  const {mode='オンライン',includeConditional=false,now=Date.now(),includeUsed=mode==='フリマ'}=options;
  const offers=comparisonCandidates(product,now).filter((offer:PriceRecord)=>matchesPurchaseMode(offer,mode)).map((offer:PriceRecord)=>normalizeOffer(product,offer,now)).filter((offer:PriceRecord)=>(includeConditional||!offer.conditional)&&(includeUsed||!usedOffer(offer)));
  const groups=new Map<string,{group:OfferComparisonGroup;retailers:Set<string>}>();
  const base=baseComparisonOffer(product,offers),baseKey=offerComparisonGroupKey(product,base);
  if(baseKey)groups.set(baseKey,{group:{key:baseKey,label:groupLabel(product,base),quantity:base.quantity,totalGrams:base.totalGrams,unitLabel:comparisonUnit(product,base),offerCount:0,retailerCount:0,isBase:true,hasExtras:false},retailers:new Set()});
  for(const offer of offers){
    const key=offerComparisonGroupKey(product,offer);if(!key)continue;
    const entry=groups.get(key)||{group:{key,label:groupLabel(product,offer),quantity:offer.quantity,totalGrams:finitePositive(offer.totalGrams)?offer.totalGrams:null,unitLabel:comparisonUnit(product,offer),offerCount:0,retailerCount:0,isBase:key===baseKey,hasExtras:offerHasExtras(offer)},retailers:new Set<string>()};
    entry.group.offerCount++;if(offer.eligible)entry.retailers.add(canonicalRetailerKey(offer));entry.group.retailerCount=entry.retailers.size;groups.set(key,entry);
  }
  return [...groups.values()].map(entry=>entry.group).sort((a,b)=>Number(b.isBase)-Number(a.isBase)||a.quantity-b.quantity||(a.totalGrams||0)-(b.totalGrams||0)||a.label.localeCompare(b.label,'ja'));
}
export function compareOffers(product: PriceRecord, options: ComparisonOptions = {}) {
  const { mode = "すべて", includeConditional = false, sort = "unit", now = Date.now(), includeUsed = mode === "フリマ",groupKey } = options;
  const ranked=comparisonCandidates(product,now)
    .map((o: PriceRecord) => normalizeOffer(product, o, now))
    .filter((o: ReturnType<typeof normalizeOffer>) => (!groupKey||offerComparisonGroupKey(product,o)===groupKey)&&o.eligible && (includeConditional || !o.conditional) && (includeUsed || (o.conditionClass!=="used"&&!/中古|使用済|傷や汚れ/.test(String(o.itemCondition||"")))) &&
      matchesPurchaseMode(o,mode))
    .sort((a: ReturnType<typeof normalizeOffer>, b: ReturnType<typeof normalizeOffer>) =>
      (sort === "total" ? a.total! - b.total! : a.unitCost! - b.unitCost!) || a.total! - b.total! || String(a.store).localeCompare(String(b.store), "ja"));
  if(!groupKey)return ranked;
  const selected=new Set<string>();
  return ranked.filter((offer:NormalizedOffer)=>{if(purchaseKind(offer)==='marketplace')return true;const key=purchaseKind(offer)+':'+canonicalRetailerKey(offer);if(selected.has(key))return false;selected.add(key);return true;});
}
export function compareRetailerOffers(product:PriceRecord,options:ComparisonOptions={}){
  const groupKey=options.groupKey||offerComparisonGroups(product,options)[0]?.key;
  return groupKey?compareOffers(product,{...options,sort:options.sort||'total',groupKey}):[];
}

/** A sourced ordinary price for the hypothetical Sugi calculation, never a
 * claim about Sugi's shelf price or a manufacturer list price. */
export function sugiReferencePrice(product:PriceRecord,now=Date.now()){
 const originals=Array.isArray(product.offers)?product.offers:[];
 const base=baseComparisonOffer(product,originals),key=offerComparisonGroupKey(product,base);
 const candidates=originals.map((offer:PriceRecord)=>normalizeOffer(product,offer,now)).filter((offer:NormalizedOffer)=>offerComparisonGroupKey(product,offer)===key&&offer.eligible&&!offer.conditional&&purchaseKind(offer)==='online'&&Number.isSafeInteger(offer.price)&&offer.price>0).sort((a:NormalizedOffer,b:NormalizedOffer)=>a.price-b.price||a.total!-b.total!);
 return candidates[0]?{price:candidates[0].price,quantity:base.quantity,totalGrams:base.totalGrams,unitLabel:comparisonUnit(product,base),source:candidates[0].source,store:candidates[0].retailerName,checkedAt:candidates[0].checkedAt}:null;
}
