import {compareOffers,offerComparisonGroups,normalizeOffer,offerComparisonGroupKey,isProductPurchaseSource,type ComparisonOptions,type PriceRecord} from '../lib/price-comparison';

/** UI summary only: all prices and ranks come from the same quantity comparison. */
export function selectAmazonComparison(product:PriceRecord,options:ComparisonOptions={}){
 const settings={...options,mode:'オンライン',includeUsed:false};
 const ranked=options.groupKey?compareOffers(product,settings):[];
 const index=ranked.findIndex(offer=>offer.retailerKey==='amazon');
 const alternatives=offerComparisonGroups(product,settings).filter(group=>group.key!==options.groupKey).flatMap(group=>{
  const offer=compareOffers(product,{...settings,groupKey:group.key}).find(item=>item.retailerKey==='amazon');
  return offer?[{key:group.key,label:group.label,offer}]:[];
 });
 const conditionalOptions=options.includeConditional?[]:offerComparisonGroups(product,{...settings,includeConditional:true}).flatMap(group=>{
  const regular=compareOffers(product,{...settings,groupKey:group.key}).find(item=>item.retailerKey==='amazon');
  if(regular)return [];
  const offer=compareOffers(product,{...settings,includeConditional:true,groupKey:group.key}).find(item=>item.retailerKey==='amazon'&&item.conditional);
  return offer?[{key:group.key,label:group.label,offer}]:[];
 });
 const reference=(Array.isArray(product.offers)?product.offers:[]).map((offer:PriceRecord)=>normalizeOffer(product,offer,options.now)).filter((offer:PriceRecord)=>offer.retailerKey==='amazon'&&offerComparisonGroupKey(product,offer)===options.groupKey&&!offer.conditional&&offer.available!==false&&offer.verified===true&&offer.priceVerified!==false&&typeof offer.price==='number'&&Number.isFinite(offer.price)&&isProductPurchaseSource(offer.source)&&Number.isFinite(Date.parse(offer.checkedAt||''))&&(options.now??Date.now())-Date.parse(offer.checkedAt)<48*60*60*1000).sort((a:PriceRecord,b:PriceRecord)=>a.price-b.price)[0]||null;
 const jan=String(product.jan||product.gtin||'').replace(/\D/g,'');
 const query=jan||[product.brand,product.name,'単品'].filter(Boolean).join(' ');
 const sameItem=(Array.isArray(product.offers)?product.offers:[]).find((offer:PriceRecord)=>offerComparisonGroupKey(product,offer)===options.groupKey&&/^https:\/\/(?:www\.)?amazon\.co\.jp\/.*(?:dp|gp\/product)\//.test(String(offer.source)));
 const url=ranked[index]?.source||reference?.source||sameItem?.source||product.amazonSingleSource||'https://www.amazon.co.jp/s?k='+encodeURIComponent(query);
 return {offer:index>=0?ranked[index]:null,rank:index>=0?index+1:null,reference,url,alternatives,conditionalOptions};
}
