import {normalizeOffer,purchaseKind,offerComparisonGroupKey,offerComparisonGroups,isProductPurchaseSource,type ComparisonOptions} from './price-comparison.ts';
type Product=Record<string,any>;
export type RetailerChannel='online'|'store';
export type RetailerLink={
 id:string;name:string;url:string;kind:'product'|'search'|'home'|'store';query:string;channel:RetailerChannel;
};
export type RetailerComparisonRow=RetailerLink&{
 offer:Product|null;status:string;checkedAt:string|null;groupKey?:string;
 otherQuantityGroups:Array<{key:string;label:string;quantity:number;totalGrams:number|null}>;
 hasOtherQuantities:boolean;manualInput:boolean;
};
// Official store finder and FAQ checked on 2026-10-25. This is not an online product search.
const SUGI_STORE_FINDER='https://www.sugi-net.jp/stores';
// Search routes confirmed against each retailer's own form, links, or search page on 2026-10-25.
// These are navigation links, never evidence of a product price or availability.
// Forms/links: https://www.toysrus.co.jp/ja-jp/ , https://www.biccamera.com/bc/main/ ,
// https://lohaco.yahoo.co.jp/ , https://sundrug-online.com/ , https://www.e-welcia.com/ ,
// https://netshop.create-sd.co.jp/ , https://www.seims.co.jp/ , https://shop.tsuruha.co.jp/ , https://mrmax.jp/
// Search pages: https://www.matsukiyococokara-online.com/store/catalogsearch/result?search_keyword=ピジョン ,
// https://aeonretail.com/Form/Product/ProductList.aspx?gspsk=はいはい&psc=1 , https://wowma.jp/kw/おむつ
const RETAILERS=[
 {id:'amazon',name:'Amazon',hosts:['amazon.co.jp'],url:(q:string)=>'https://www.amazon.co.jp/s?k='+encodeURIComponent(q)},
 {id:'rakuten',name:'楽天市場',hosts:['rakuten.co.jp'],url:(q:string)=>'https://search.rakuten.co.jp/search/mall/'+encodeURIComponent(q)+'/'},
 {id:'yahoo',name:'Yahoo!ショッピング',hosts:['store.shopping.yahoo.co.jp'],url:(q:string)=>'https://shopping.yahoo.co.jp/search?p='+encodeURIComponent(q)},
 {id:'yodobashi',name:'ヨドバシ.com',hosts:['yodobashi.com'],url:(q:string)=>'https://www.yodobashi.com/?word='+encodeURIComponent(q)},
 {id:'akachan',name:'アカチャンホンポ',hosts:['shop.akachan.jp'],url:(q:string)=>'https://shop.akachan.jp/shop/goods/search.aspx?keyword='+encodeURIComponent(q)},
 {id:'nishimatsuya',name:'西松屋オンライン',hosts:['24028-net.jp'],url:(q:string)=>'https://www.24028-net.jp/search/?keyword='+encodeURIComponent(q)},
 {id:'babiesrus',name:'トイザらス・ベビーザらス',hosts:['babiesrus.co.jp','toysrus.co.jp'],url:(q:string)=>'https://www.toysrus.co.jp/ja-jp/search/?q='+encodeURIComponent(q)},
 {id:'biccamera',name:'ビックカメラ.com',hosts:['biccamera.com'],url:(q:string)=>'https://www.biccamera.com/bc/category/?q='+encodeURIComponent(q)},
 {id:'lohaco',name:'LOHACO',hosts:['lohaco.yahoo.co.jp','lohaco.jp'],url:(q:string)=>'https://lohaco.yahoo.co.jp/search?p='+encodeURIComponent(q)},
 {id:'sundrug',name:'サンドラッグ公式通販',hosts:['sundrug-online.com'],url:(q:string)=>'https://sundrug-online.com/search?type=product&q='+encodeURIComponent(q)},
 {id:'matsukiyo',name:'マツキヨココカラ',hosts:['matsukiyococokara-online.com'],url:(q:string)=>'https://www.matsukiyococokara-online.com/store/catalogsearch/result?search_keyword='+encodeURIComponent(q)},
 {id:'welcia',name:'ウエルシアドットコム',hosts:['e-welcia.com'],url:(q:string)=>'https://www.e-welcia.com/search?q='+encodeURIComponent(q)},
 {id:'aeon',name:'イオンスタイルオンライン',hosts:['aeonretail.com'],url:(q:string)=>'https://aeonretail.com/Form/Product/ProductList.aspx?gspsk='+encodeURIComponent(q)+'&psc=1'},
 {id:'create-sd',name:'クリエイトSD',hosts:['netshop.create-sd.co.jp'],url:(q:string)=>'https://netshop.create-sd.co.jp/shop/goods/search.aspx?search=x&keyword='+encodeURIComponent(q)},
 {id:'seims',name:'セイムス公式',hosts:['seims.co.jp'],url:(q:string)=>'https://www.seims.co.jp/shop/goods/search.aspx?search=x&keyword='+encodeURIComponent(q)},
 {id:'tsuruha',name:'ツルハ公式通販',hosts:['shop.tsuruha.co.jp'],url:(q:string)=>'https://shop.tsuruha.co.jp/catalogsearch/result/?q='+encodeURIComponent(q)},
 {id:'mrmax',name:'ミスターマックス',hosts:['mrmax.jp'],url:(q:string)=>'https://mrmax.jp/products?text='+encodeURIComponent(q)},
 {id:'aupay',name:'au PAY マーケット',hosts:['wowma.jp'],url:(q:string)=>'https://wowma.jp/kw/'+encodeURIComponent(q)},
];
function belongs(source:unknown,hosts:string[]){try{const u=new URL(String(source));return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&hosts.some(host=>u.hostname===host||u.hostname.endsWith('.'+host));}catch{return false;}}
function searchPage(source:unknown){try{const u=new URL(String(source));return /search|^\/s\/?$|^\/kw\//i.test(u.pathname)||['k','keyword','query','q','word','search_keyword','gspsk','text'].some(key=>u.searchParams.has(key));}catch{return true;}}
function productPage(offer:Product){try{const u=new URL(offer.source),singlePage=u.hostname==='shop.tsuruha.co.jp'&&/^\/\d+\.html$/.test(u.pathname);return offer.verified===true&&purchaseKind(offer)==='online'&&(u.pathname.split('/').filter(Boolean).length>=2||singlePage)&&isProductPurchaseSource(offer.source)&&!searchPage(offer.source);}catch{return false;}}
export function retailerLinks(product:Product,options:{groupKey?:string}={}):RetailerLink[]{
 const jan=String(product.jan||product.gtin||'').replace(/[^0-9]/g,'');
 const query=/^\d{8,14}$/.test(jan)?jan:[product.brand,product.name].filter(Boolean).join(' ');
 return RETAILERS.map((retailer):RetailerLink=>{
  const direct=(Array.isArray(product.offers)?product.offers:[]).find((offer:Product)=>belongs(offer.source,retailer.hosts)&&productPage(offer)&&(!options.groupKey||offerComparisonGroupKey(product,offer)===options.groupKey));
  // Create SD's public search decodes text as Shift_JIS. A JAN is safe, but
  // UTF-8 Japanese queries were confirmed to become mojibake, so retain its home link.
  const querySupported=retailer.id!=='create-sd'||!/[\u0080-\uFFFF]/.test(query);
  return{id:retailer.id,name:retailer.name,url:direct?.source||(querySupported?retailer.url(query):'https://netshop.create-sd.co.jp/'),kind:direct?'product':querySupported?'search':'home',query,channel:'online'};
 });
}
/** Keep every major retailer visible; missing quotes never become invented zeroes or prices. */
export function retailerComparisons(product:Product,options:ComparisonOptions={}):RetailerComparisonRow[]{
 const now=options.now??Date.now(),groups=offerComparisonGroups(product,{...options,mode:'オンライン'}),groupKey=options.groupKey??groups[0]?.key;
 const links=retailerLinks(product,{groupKey});
 const rows=RETAILERS.map((retailer,index):RetailerComparisonRow=>{
  const allMatched=(Array.isArray(product.offers)?product.offers:[]).filter((offer:Product)=>belongs(offer.source,retailer.hosts)&&purchaseKind(offer)==='online'&&isProductPurchaseSource(offer.source)&&!searchPage(offer.source)).map((offer:Product)=>normalizeOffer(product,offer,now)).filter((offer:Product)=>options.includeConditional||!offer.conditional);
  const matched=allMatched.filter((offer:Product)=>groupKey&&offerComparisonGroupKey(product,offer)===groupKey);
  const otherKeys=new Set(allMatched.map((offer:Product)=>offerComparisonGroupKey(product,offer)).filter((key:string|null)=>key&&key!==groupKey));
  const otherQuantityGroups=groups.filter(group=>otherKeys.has(group.key)).map(group=>({key:group.key,label:group.label,quantity:group.quantity,totalGrams:group.totalGrams}));
  const ranked=matched.filter((offer:Product)=>offer.eligible).sort((a:Product,b:Product)=>(options.sort==='unit'?a.unitCost-b.unitCost:a.total-b.total)||a.total-b.total||String(a.seller||'').localeCompare(String(b.seller||''),'ja'));
  const priceOnly=matched.filter((offer:Product)=>offer.shipping==null&&normalizeOffer(product,{...offer,shipping:0},now).eligible).sort((a:Product,b:Product)=>a.price-b.price);
  const stockUnknown=matched.filter((offer:Product)=>offer.priceVerified===true&&offer.stockVerified===false&&productPage(offer)&&normalizeOffer(product,{...offer,available:true,shipping:0,eligible:1,status:''},now).eligible).sort((a:Product,b:Product)=>Number(a.total==null)-Number(b.total==null)||(a.total!=null&&b.total!=null?a.total-b.total:a.price-b.price));
  const offer=ranked[0]||priceOnly[0]||stockUnknown[0]||null;
  const research=(product.retailerResearch||[]).filter((r:Product)=>r.retailerId===retailer.id).sort((a:Product,b:Product)=>String(b.checkedAt).localeCompare(String(a.checkedAt)))[0];
  const sold=matched.length>0&&matched.every((entry:Product)=>entry.available===false||/売り切れ|在庫なし|入荷待ち/.test(entry.ineligibleReason));
  const status=offer?(offer.eligible?'価格確認済み':offer.stockVerified===false?(offer.shipping==null?'送料・在庫未確認':'在庫未確認'):'送料未確認'):sold?'在庫切れ':matched.length?'価格の再確認が必要':otherQuantityGroups.length?'この数量の価格未確認・別セットの掲載あり':research?.status==='not-carried'?'取扱なしを確認':research?.status==='unavailable'?'確認した商品は在庫切れ':research?.status==='fetch-unavailable'?'取得できず':research?.status==='no-matching-product'?'同じ商品を確認できず':'価格未確認';
  return {...links[index],url:offer?.source||links[index].url,kind:offer?'product':links[index].kind,offer,status,checkedAt:offer?.checkedAt||research?.checkedAt||null,groupKey,otherQuantityGroups,hasOtherQuantities:otherQuantityGroups.length>0,manualInput:false};
 });
 return [...rows,{id:'sugi-store',name:'スギ薬局・スギドラッグ',url:SUGI_STORE_FINDER,kind:'store',channel:'store',query:links[0]?.query||'',offer:null,status:'店頭価格は入力して試算',checkedAt:null,groupKey,otherQuantityGroups:[],hasOtherQuantities:false,manualInput:true}];
}
