import {normalizeOffer,purchaseKind} from './price-comparison.ts';
type Product=Record<string,any>;
const RETAILERS=[
 {id:'amazon',name:'Amazon',hosts:['amazon.co.jp'],url:(q:string)=>'https://www.amazon.co.jp/s?k='+encodeURIComponent(q)},
 {id:'rakuten',name:'楽天市場',hosts:['rakuten.co.jp'],url:(q:string)=>'https://search.rakuten.co.jp/search/mall/'+encodeURIComponent(q)+'/'},
 {id:'yahoo',name:'Yahoo!ショッピング',hosts:['store.shopping.yahoo.co.jp'],url:(q:string)=>'https://shopping.yahoo.co.jp/search?p='+encodeURIComponent(q)},
 {id:'yodobashi',name:'ヨドバシ.com',hosts:['yodobashi.com'],url:(q:string)=>'https://www.yodobashi.com/?word='+encodeURIComponent(q)},
 {id:'akachan',name:'アカチャンホンポ',hosts:['shop.akachan.jp'],url:(q:string)=>'https://shop.akachan.jp/shop/goods/search.aspx?keyword='+encodeURIComponent(q)},
 {id:'nishimatsuya',name:'西松屋オンライン',hosts:['24028-net.jp'],url:(q:string)=>'https://www.24028-net.jp/search/?keyword='+encodeURIComponent(q)},
 {id:'babiesrus',name:'トイザらス・ベビーザらス',hosts:['babiesrus.co.jp','toysrus.co.jp'],home:'https://www.babiesrus.co.jp/ja-jp/'},
 {id:'biccamera',name:'ビックカメラ.com',hosts:['biccamera.com'],home:'https://www.biccamera.com/'},
 {id:'lohaco',name:'LOHACO',hosts:['lohaco.yahoo.co.jp','lohaco.jp'],home:'https://lohaco.yahoo.co.jp/'},
 {id:'sundrug',name:'サンドラッグ公式通販',hosts:['sundrug-online.com'],home:'https://sundrug-online.com/'},
 {id:'matsukiyo',name:'マツキヨココカラ',hosts:['matsukiyococokara-online.com'],home:'https://www.matsukiyococokara-online.com/'},
 {id:'welcia',name:'ウエルシアドットコム',hosts:['e-welcia.com'],home:'https://www.e-welcia.com/'},
 {id:'aeon',name:'イオンスタイルオンライン',hosts:['aeonretail.com'],home:'https://aeonretail.com/'},
 {id:'create-sd',name:'クリエイトSD',hosts:['netshop.create-sd.co.jp'],home:'https://netshop.create-sd.co.jp/'},
 {id:'seims',name:'セイムス公式',hosts:['seims.co.jp'],home:'https://www.seims.co.jp/shop/'},
 {id:'tsuruha',name:'ツルハ公式通販',hosts:['shop.tsuruha.co.jp'],home:'https://shop.tsuruha.co.jp/'},
 {id:'mrmax',name:'ミスターマックス',hosts:['mrmax.jp'],home:'https://mrmax.jp/'},
 {id:'aupay',name:'au PAY マーケット',hosts:['wowma.jp'],home:'https://wowma.jp/'},
];
function belongs(source:unknown,hosts:string[]){try{const u=new URL(String(source));return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&hosts.some(host=>u.hostname===host||u.hostname.endsWith('.'+host));}catch{return false;}}
function productPage(offer:Product){try{const u=new URL(offer.source);return offer.verified===true&&purchaseKind(offer)==='online'&&u.pathname.split('/').filter(Boolean).length>=2&&!/search|^\/s\/?$|^\/kw\//i.test(u.pathname)&&!['k','keyword','query','q'].some(key=>u.searchParams.has(key));}catch{return false;}}
export function retailerLinks(product:Product){
 const jan=String(product.jan||product.gtin||'').replace(/[^0-9]/g,'');
 const query=/^\d{8,14}$/.test(jan)?jan:[product.brand,product.name].filter(Boolean).join(' ');
 return RETAILERS.map(retailer=>{
  const direct=(Array.isArray(product.offers)?product.offers:[]).find((offer:Product)=>belongs(offer.source,retailer.hosts)&&productPage(offer));
  return{id:retailer.id,name:retailer.name,url:direct?.source||('url' in retailer&&retailer.url?retailer.url(query):retailer.home),kind:direct?'product':('url' in retailer?'search':'home'),query};
 });
}
/** Keep every major retailer visible; missing quotes never become invented zeroes or prices. */
export function retailerComparisons(product:Product,options:{includeConditional?:boolean;now?:number}={}){
 const links=retailerLinks(product),now=options.now??Date.now();
 return RETAILERS.map((retailer,index)=>{
  const matched=(Array.isArray(product.offers)?product.offers:[]).filter((offer:Product)=>belongs(offer.source,retailer.hosts)&&purchaseKind(offer)==='online').map((offer:Product)=>normalizeOffer(product,offer,now)).filter((offer:Product)=>options.includeConditional||!offer.conditional);
  const ranked=matched.filter((offer:Product)=>offer.eligible).sort((a:Product,b:Product)=>a.unitCost-b.unitCost||a.total-b.total);
  const priceOnly=matched.filter((offer:Product)=>offer.shipping==null&&normalizeOffer(product,{...offer,shipping:0},now).eligible).sort((a:Product,b:Product)=>a.price-b.price);
  const stockUnknown=matched.filter((offer:Product)=>offer.priceVerified===true&&offer.stockVerified===false&&productPage(offer)&&normalizeOffer(product,{...offer,available:true,shipping:0,eligible:1,status:''},now).eligible).sort((a:Product,b:Product)=>a.price-b.price);
  const offer=ranked[0]||priceOnly[0]||stockUnknown[0]||null;
  const research=(product.retailerResearch||[]).filter((r:Product)=>r.retailerId===retailer.id).sort((a:Product,b:Product)=>String(b.checkedAt).localeCompare(String(a.checkedAt)))[0];
  const sold=matched.length>0&&matched.every((entry:Product)=>entry.available===false||/売り切れ|在庫なし|入荷待ち/.test(entry.ineligibleReason));
  const status=offer?(offer.eligible?'価格確認済み':offer.stockVerified===false?(offer.shipping==null?'送料・在庫未確認':'在庫未確認'):'送料未確認'):sold?'在庫切れ':research?.status==='not-carried'?'取扱なしを確認':research?.status==='unavailable'?'確認した商品は在庫切れ':research?.status==='fetch-unavailable'?'取得できず':research?.status==='no-matching-product'?'同じ商品を確認できず':matched.length?'価格の再確認が必要':'価格未確認';
  return {...links[index],url:offer?.source||links[index].url,kind:offer?'product':links[index].kind,offer,status,checkedAt:offer?.checkedAt||research?.checkedAt||null};
 });
}
