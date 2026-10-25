/** Add real products from Pigeon's public storefront product feed.
 * Uses one representative sellable variant per product, never invented offers.
 * Unknown postage remains null and cannot enter cheapest-price rankings.
 * Usage: node scripts/import-pigeon-catalog.mjs input.json output.json --limit=180 [--snapshots=/absolute/directory]
 */
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const BASE='https://shop.pigeon.co.jp';
const normalized=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/\(ベーシック\)|乳首[mssl]+付き|乳首ss付き|[\s・（）()「」]/gi,'').replace(/哺乳びん/g,'').replace(/耐熱ガラス/g,'ガラス');
const text=value=>String(value??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
export function catalogCategory(title){
 if(/ベビーフード|離乳|おやつ|ぷちキッズごはん|パックごはん|うらごし|スムージー|げんまい|パンケーキ|ふりかけ|粉末.*鉄|だし|すなっく|クラッカー|蒸しパン|ベビー麦茶|ほうじ茶|やさい茶|元気アップ|ピュアウォーター|ミネラルアクア|すっきりアクア|グルト|くだもの|ウォーター|野菜.*100|りんご100/.test(title))return '離乳食・おやつ';
 if(/妊婦|マタニティ|妊娠|骨盤|産後|着圧|ソックス|ショーツ|ブラジャー|ガードル|ひきしめジェル|さく乳|母乳パッド|キュアニプル|乳首キズ|リペアニプル|母乳フリーザー|初乳採取/.test(title))return 'マタニティ・産後';
 if(/おしり|おむつ|とれっぴ|トイレ|ステール|ソフライナー/.test(title))return 'おむつ・おしりふき';
 if(/洗たく|洗濯|柔軟剤|漂白剤/.test(title))return '洗濯・お手入れ';
 if(/ソープ|石けん|沐浴|シャンプー|コンディショナー|スキンケア|ローション|クリーム|ワセリン|パウダー|UV|オイル|乳液|虫よけ|ベビーバリア|アクアミスト|ひんやり全身シート|アウトドアミスト/.test(title))return 'おふろ・スキンケア';
 if(/ベビーカー|Bingle|Runfee|epa|ランフィ|ビングル|Wuggy|ウギー|FELICE|レインカバー|カップホルダー|おでかけサポート|ランバークッション/.test(title))return 'おでかけ';
 if(/歯|フロス|綿棒|熱ひえ|鼻|つめ|爪|除菌|マスク|ピンセット|ヘアー|清浄|手・くち|体温|タブレット|バリカン|くすりのみ|マウスウォッシュ|みがき|吸入器/.test(title))return '健康・衛生';
 if(/哺乳|母乳実感|乳首|授乳|調乳|乳頭|ロングフィーダー|ミルク|マグ|magmag|ストロー|コップ|食具|スプーン|フォーク|食器|食べる|調理|はし|おしゃぶり|歯がため|にぎる.*かむ|ナイロンブラシ/.test(title))return '授乳・食事';
 if(/シーツ|寝具|枕|まくら|おやすみ|パジャマ|ブランケット/.test(title))return '衣類・寝具';
 return '育児用品';
}
function ageMetadata(tags,source,checkedAt){
 const months=[];let prenatal=false;
 for(const raw of tags){const tag=String(raw).normalize('NFKC');if(!tag.startsWith('月齢:'))continue;
  if(/マタニティ|妊娠|産前/.test(tag))prenatal=true;
  let match=tag.match(/月齢:(\d+)才(?:\s*(\d+)[ヵカかケ]月)?/);if(match){months.push(Number(match[1])*12+Number(match[2]||0));continue;}
  match=tag.match(/月齢:(\d+)[ヵカかケ]月/);if(match)months.push(Number(match[1]));
 }
 if(!months.length&&!prenatal)return{};
 const result={ageSource:source,ageBasis:'manufacturer-catalog-tags',ageCheckedAt:checkedAt.slice(0,10),ageNote:'メーカーの商品タグに記載された月齢をもとにした目安です。実際の使用対象・サイズは商品ページをご確認ください。'};
 if(months.length){const min=Math.min(...months);if(prenatal)result.ageRanges=[{minMonth:-1,maxMonth:-1},{minMonth:min}];else result.minAgeMonths=min;}
 else result.ageGroups=['妊娠中'];return result;
}
function selectedVariant(product){return (product.variants??[]).find(v=>v.available===true&&Number(v.price)>0);}
function skipProduct(product){return /定期|初回|e-Gift|アウトレット|完売|入荷|旧モデル|BASIS|インナーシート|フロントガード|ハンドルカバー|肩ベルトカバー|股ベルトカバー|ベビーキャップシート|リバーシブルシート|着脱シート|共通.*(?:カゴ|ヘッドピロー|クッション)|\s幌|DHA|サプリ|母乳パワー|ギフトラッピング|カゴ|ヒップクッション|ヘッドピロー/.test(product.title??'');}
function size(title,variant){const clean=String(title).normalize('NFKC');const measures=[...clean.matchAll(/\d+(?:\.\d+)?\s*(?:ml|mL|g|L|枚|粒|包|本|袋|個|cm)/g)].map(m=>m[0]);return measures.length?measures.slice(0,3).join('・'):variant.title&&variant.title!=='Default Title'?'1点／'+variant.title:'1点';}
function existingProduct(products,name,variant){
 const n=normalized(name);const exact=products.find(p=>normalized(p.name)===n);if(exact)return exact;

 return undefined;
}
export function refreshImportedPigeonProducts(data,documents,now){
 const variants=new Map();documents.forEach((doc,index)=>{for(const product of doc.products??[])for(const variant of product.variants??[])variants.set(String(variant.id),{product,variant,page:index+1})});let refreshed=0;
 for(const product of data.products??[])for(const offer of product.offers??[]){
  if(!String(offer.id).startsWith('pigeon-official-')||!offer.manufacturerVariantId)continue;
  const record=variants.get(String(offer.manufacturerVariantId));offer.lastAttemptAt=now;
  if(!record){offer.verified=false;offer.status='要再確認';offer.refreshError='代表の取得ページに同じバリエーションがありません';continue;}
  const amount=Number(record.variant.price);if(!Number.isFinite(amount)||amount<=0){offer.verified=false;offer.status='要再確認';continue;}
  offer.previousPrice=offer.price;offer.price=amount;offer.basePrice=amount;offer.shipping=(record.product.tags??[]).some(t=>['送料無料','送料無料:無料','free-shipping'].includes(t))?0:null;
  offer.checkedAt=now;offer.status=record.variant.available===true?'掲載あり':'在庫なし';offer.verified=true;offer.priceSource=BASE+'/collections/all/products.json?limit=250'+(record.page>1?'&page='+record.page:'');delete offer.refreshError;refreshed++;
 }
 return refreshed;
}
export function mergePigeonCatalog(input,documents,{limit=180,now=new Date().toISOString()}={}){
 const data=structuredClone(input),added=[],updatedExisting=[],baseIds=new Set(data.products.map(p=>p.id));const refreshedOffers=refreshImportedPigeonProducts(data,documents,now);const seenProducts=new Set();const groups=new Map();
 const rawProducts=documents.flatMap((doc,index)=>(doc.products??[]).map(p=>({...p,_catalogPage:index+1})));
 for(const product of rawProducts){if(seenProducts.has(product.id)||skipProduct(product))continue;seenProducts.add(product.id);const variant=selectedVariant(product);if(!variant)continue;const cat=catalogCategory(product.title);if(!groups.has(cat))groups.set(cat,[]);groups.get(cat).push({product,variant});}
 // Single sales units and ordinary products appear before bulk packs; balance categories.
 for(const list of groups.values())list.sort((a,b)=>Number(/【.*(?:個|枚|袋|本|セット)|セット割|セット/.test(a.product.title))-Number(/【.*(?:個|枚|袋|本|セット)|セット割|セット/.test(b.product.title)));
 const ordered=[];for(let index=0;[...groups.values()].some(list=>list[index]);index++)for(const list of groups.values())if(list[index])ordered.push(list[index]);
 for(const {product,variant}of ordered){
  const variantTitle=variant.title==='Default Title'?'':text(variant.title);const cleanTitle=text(product.title).replace(/^【[^】]*ポイント[^】]*】/,'').trim();const productName=cleanTitle+(variantTitle&&!text(product.title).includes(variantTitle)?'／'+variantTitle:'');
  const existing=existingProduct(data.products,productName,variant);const id='pigeon-'+product.handle+'-'+variant.id;if(baseIds.has(id))continue;
  const source=BASE+'/products/'+encodeURIComponent(product.handle)+'?variant='+variant.id;const price=Number(variant.price);const isFree=(product.tags??[]).some(t=>['送料無料','送料無料:無料','free-shipping'].includes(t));const pack=/セット|【[^】]*(?:個|本|枚|袋)/.test(product.title);
  const offer={id:'pigeon-official-'+variant.id,store:'ピジョン公式オンラインショップ',mode:'配送',purchaseChannel:'online',price,basePrice:price,shipping:isFree?0:null,quantity:1,unitLabel:pack?'セット':'個',source,shippingSource:source,checkedAt:now,verified:true,status:'掲載あり',condition:isFree?'商品に送料無料の表示があります。配送先や注文条件による扱いは販売元でご確認ください。':'税込の販売価格を確認。送料は購入画面で確認するため、送料込みの順位には含めません。',region:'日本国内・配送先の条件は販売元で確認',verificationType:'公式公開商品データ',priceSource:BASE+'/collections/all/products.json?limit=250'+(product._catalogPage>1?'&page='+product._catalogPage:''),manufacturerSku:variant.sku||product.handle,manufacturerVariantId:String(variant.id),itemCondition:'新品',conditionClass:'new',refreshEligible:false,live:false};
  if(existing){updatedExisting.push(existing.id);continue;}
  if(added.length>=limit)continue;
  const image=variant.featured_image?.src||product.images?.[0]?.src;
  const record={id,name:productName,brand:'ピジョン',category:catalogCategory(product.title),unit:size(product.title,variant),manufacturerSku:variant.sku||product.handle,source,sourceName:'ピジョン公式オンラインショップ',checkedAt:now,summary:'メーカー公式ショップで販売されている育児用品です。サイズ・内容量・使用対象は掲載元で確認できます。',searchTerms:[product.title,variantTitle,variant.sku||product.handle,'ピジョン',catalogCategory(product.title)].filter(Boolean),...(image?{imageUrl:image}:{}),...ageMetadata(product.tags??[],source,now),offers:[offer]};
  if(new TextEncoder().encode(JSON.stringify(data)).length+new TextEncoder().encode(JSON.stringify(record)).length>1_350_000)continue;
  data.products.push(record);baseIds.add(id);added.push(record.id);
 }
 data.categories=[...new Set([...(data.categories??[]),...data.products.map(p=>p.category)])];data.asOf=now;data.updatedAt=now;
 data.coverage={...data.coverage,productCount:data.products.length,catalogExpansion:{checkedAt:now,addedProducts:added.length,skippedExistingProducts:[...new Set(updatedExisting)].length,source:'https://shop.pigeon.co.jp/collections/all',sourceFeedPages:documents.length,representativeVariantPerProduct:true,unknownPostageExcludedFromRanking:true}};
 return {data,report:{addedProducts:added.length,refreshedOffers,skippedExisting:[...new Set(updatedExisting)],totalProducts:data.products.length,newCategories:[...new Set(added.map(id=>data.products.find(p=>p.id===id).category))],freeShippingProducts:added.filter(id=>data.products.find(p=>p.id===id).offers[0].shipping===0).length,postageUnknownProducts:added.filter(id=>data.products.find(p=>p.id===id).offers[0].shipping===null).length}};
}
async function fetchDocument(page){const url=BASE+'/collections/all/products.json?limit=250'+(page>1?'&page='+page:'');const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'KosodateBiyori/1.0 (public product reader)','Accept':'application/json'}});if(!response.ok)throw Error('Public product feed HTTP '+response.status);const raw=await response.text();if(new TextEncoder().encode(raw).length>8_000_000)throw Error('Product feed too large');const doc=JSON.parse(raw);if(!Array.isArray(doc.products))throw Error('Invalid product feed');return doc;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [,,source,destination,...args]=process.argv;if(!source||!destination)throw Error('Usage: node import-pigeon-catalog.mjs input.json output.json --limit=180 [--snapshots=/absolute/directory]');const limit=Number(args.find(a=>a.startsWith('--limit='))?.slice(8)||180),snapshots=args.find(a=>a.startsWith('--snapshots='))?.slice(12);const docs=snapshots?await Promise.all(['pigeon-all-products.json','pigeon-all-products-2.json','pigeon-all-products-3.json'].map(f=>fs.readFile(snapshots+'/'+f,'utf8').then(JSON.parse))):await Promise.all([1,2,3].map(fetchDocument));const result=mergePigeonCatalog(JSON.parse(await fs.readFile(source,'utf8')),docs,{limit});await fs.writeFile(destination,JSON.stringify(result.data,null,2)+'\n');console.log(JSON.stringify(result.report));}
