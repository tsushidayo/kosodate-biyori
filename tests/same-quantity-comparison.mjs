import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const priceModule=moduleUrl(fs.readFileSync(new URL('../lib/price-comparison.ts',import.meta.url),'utf8'));
const {normalizeOffer,offerComparisonGroups,offerComparisonGroupKey,compareOffers,compareRetailerOffers,amazonDeliveryFees}=await import(priceModule);
const {retailerComparisons}=await import(moduleUrl(fs.readFileSync(new URL('../lib/retailer-links.ts',import.meta.url),'utf8').replace("'./price-comparison.ts'",JSON.stringify(priceModule))));
const checkedAt='2026-08-12T12:00:00Z',now=Date.parse(checkedAt);
const offer=(id,source,patch={})=>({id,source,store:id,price:1000,shipping:0,quantity:1,unitLabel:'個',verified:true,available:true,checkedAt,mode:'配送',...patch});

test('ordinary one-pack comparison stays first even when only a large case has a confirmed quote',()=>{
 const product={id:'diaper',name:'おむつ54枚',unit:'54枚',unitType:'枚',offers:[offer('case','https://sundrug-online.com/products/123',{quantity:216,packs:4,piecesPerPack:54,unitLabel:'枚',price:5980})]};
 const groups=offerComparisonGroups(product,{now});
 assert.equal(groups[0].quantity,54);assert.equal(groups[0].isBase,true);assert.equal(groups[0].offerCount,0);
 assert.equal(compareRetailerOffers(product,{mode:'オンライン',now}).length,0);
 assert.equal(compareOffers(product,{mode:'オンライン',now,groupKey:groups[1].key}).length,1);
 const row=retailerComparisons(product,{now,groupKey:groups[0].key}).find(row=>row.id==='sundrug');
 assert.equal(row.offer,null);assert.equal(row.hasOtherQuantities,true);assert.match(row.status,/この数量/);assert.equal(row.otherQuantityGroups[0].quantity,216);
});

test('same number of pieces matches despite missing pack metadata and bulk orders remain separate',()=>{
 const product={id:'diaper',name:'おむつ54枚',unit:'54枚',unitType:'枚',offers:[
  offer('single','https://sundrug-online.com/products/123',{quantity:54,packs:1,piecesPerPack:54,unitLabel:'枚',price:1680,shipping:600}),
  offer('same','https://www.yodobashi.com/product/123/',{quantity:54,unitLabel:'枚',price:1610}),
  offer('bulk','https://sundrug-online.com/products/123?variant=bulk',{quantity:216,packs:4,piecesPerPack:54,unitLabel:'枚',price:5980}),
 ]};
 const groups=offerComparisonGroups(product,{now}),first=groups[0];assert.equal(groups.length,2);assert.equal(first.offerCount,2);assert.equal(first.retailerCount,2);
 const ranked=compareOffers(product,{now,mode:'オンライン',groupKey:first.key,sort:'unit'});
 assert.deepEqual(ranked.map(row=>row.id),['same','single']);assert.ok(ranked.every(row=>row.quantity===54));
 assert.equal(retailerComparisons(product,{now,groupKey:first.key}).find(row=>row.id==='sundrug').offer.id,'single');
});

test('within each shopping platform only the lowest total is chosen and its seller and URL are retained',()=>{
 const yahooCheap='https://store.shopping.yahoo.co.jp/second/item.html';
 const product={id:'bottle',name:'哺乳瓶',unit:'1本',unitType:'本',offers:[
  offer('Yahoo!・一店目','https://store.shopping.yahoo.co.jp/first/item.html',{price:800,shipping:600,unitLabel:'本'}),
  offer('Yahoo!・二店目',yahooCheap,{price:900,shipping:100,unitLabel:'本'}),
  offer('サンドラッグ公式通販','https://sundrug-online.com/products/item',{price:1000,shipping:0,unitLabel:'本'}),
 ]};
 const groupKey=offerComparisonGroups(product,{now})[0].key;
 const ranked=compareOffers(product,{mode:'オンライン',now,groupKey,sort:'total'});
 assert.equal(ranked.length,2);assert.ok(ranked.every(row=>row.total===1000));
 const yahoo=ranked.find(row=>row.retailerKey==='yahoo');assert.equal(yahoo.source,yahooCheap);assert.equal(yahoo.retailerName,'Yahoo!ショッピング');assert.equal(yahoo.seller,'二店目');
 assert.ok(ranked.some(row=>row.retailerKey==='sundrug'));
 const table=retailerComparisons(product,{now,groupKey,sort:'total'}).find(row=>row.id==='yahoo');assert.equal(table.offer.source,yahooCheap);
});

test('milk cases with a different bonus amount never share the same quantity group',()=>{
 const product={id:'milk',name:'ミルク810g',category:'ミルク',unit:'810g／缶',unitType:'100g',offers:[
  offer('regular','https://sundrug-online.com/products/item',{quantity:6,totalGrams:4860,unitLabel:'100g'}),
  offer('bonus','https://www.24028-net.jp/category/MILK/item.html',{quantity:6,totalGrams:5120,unitLabel:'100g'}),
 ]};
 assert.notEqual(offerComparisonGroupKey(product,product.offers[0]),offerComparisonGroupKey(product,product.offers[1]));
 const groups=offerComparisonGroups(product,{now});assert.equal(groups[0].quantity,1);assert.equal(groups[0].totalGrams,810);assert.ok(groups.some(group=>group.label.includes('260g')));
});

test('a verified single item bought twice competes with a two-item bundle only when saved as that exact order',()=>{
 const product={id:'milk',name:'ミルク810g',category:'ミルク',unit:'810g／缶',unitType:'100g',offers:[
  offer('bundle','https://sundrug-online.com/products/two-pack',{price:4680,quantity:2,totalGrams:1620,unitLabel:'100g'}),
  offer('single-x2','https://sundrug-online.com/products/single',{price:4600,quantity:2,totalGrams:1620,unitLabel:'100g',condition:'単品を2点・1注文で購入'}),
  offer('single','https://sundrug-online.com/products/single',{price:2300,shipping:600,quantity:1,totalGrams:810,unitLabel:'100g'}),
 ]};
 const groupKey=offerComparisonGroups(product,{now}).find(group=>group.quantity===2).key;
 const ranked=compareOffers(product,{now,mode:'オンライン',groupKey,sort:'total'});assert.equal(ranked.length,1);assert.equal(ranked[0].id,'single-x2');assert.equal(ranked[0].total,4600);assert.match(ranked[0].condition,/2点/);
 const row=retailerComparisons(product,{now,groupKey}).find(row=>row.id==='sundrug');assert.equal(row.offer.id,'single-x2');
 const unverified={...product,offers:product.offers.filter(row=>row.id!=='single-x2')};assert.equal(compareOffers(unverified,{now,mode:'オンライン',groupKey})[0].total,4680);
});

test('unknown quantities and unknown delivery charges cannot produce a same-amount cheapest claim',()=>{
 const product={id:'bottle',name:'哺乳瓶',unit:'1本',unitType:'本',offers:[
  offer('unknown-quantity','https://www.yodobashi.com/product/123/',{quantity:null,unitLabel:'本',price:50}),
  offer('unknown-shipping','https://sundrug-online.com/products/123',{shipping:null,unitLabel:'本',price:300}),
  offer('confirmed','https://www.biccamera.com/bc/item/123/',{unitLabel:'本',price:500}),
 ]};
 const groupKey=offerComparisonGroups(product,{now})[0].key;
 assert.equal(offerComparisonGroupKey(product,product.offers[0]),null);
 assert.deepEqual(compareOffers(product,{now,mode:'オンライン',groupKey}).map(row=>row.id),['confirmed']);
 const row=retailerComparisons(product,{now,groupKey}).find(row=>row.id==='sundrug');assert.equal(row.offer.price,300);assert.equal(row.offer.total,null);assert.equal(row.status,'送料未確認');
});

test('explicit color, size, model and used conditions are separate purchase groups',()=>{
 const product={id:'item',name:'育児用品',unit:'1個',unitType:'個',model:'A',color:'白',size:'M',offers:[
  offer('match','https://www.yodobashi.com/product/123/'),
  offer('other-color','https://www.biccamera.com/bc/item/123/',{color:'黒'}),
  offer('other-size','https://sundrug-online.com/products/123',{size:'L'}),
  offer('other-model','https://shop.akachan.jp/shop/g/g123/',{model:'B'}),
  offer('used','https://jp.mercari.com/item/m123',{purchaseChannel:'marketplace',conditionClass:'used',itemCondition:'中古'}),
 ]};
 const groups=offerComparisonGroups(product,{now,mode:'すべて',includeUsed:true});assert.equal(groups.length,5);
 assert.ok(groups[0].label.includes('白'));assert.ok(groups.some(group=>group.label.includes('中古')));
 const selected=compareOffers(product,{now,mode:'オンライン',groupKey:groups[0].key});assert.deepEqual(selected.map(row=>row.id),['match']);
});

test('stock-unconfirmed reference prices use known total charges rather than the lowest product price',()=>{
 const product={id:'item',name:'育児用品',unit:'1個',offers:[
  offer('first','https://store.shopping.yahoo.co.jp/first/item.html',{price:800,shipping:600,available:null,stockVerified:false,priceVerified:true}),
  offer('second','https://store.shopping.yahoo.co.jp/second/item.html',{price:900,shipping:100,available:null,stockVerified:false,priceVerified:true}),
 ]};
 const row=retailerComparisons(product,{now}).find(row=>row.id==='yahoo');assert.equal(row.offer.id,'second');assert.equal(row.offer.total,1000);assert.equal(row.offer.eligible,false);assert.equal(row.status,'在庫未確認');
});

test('platform names do not corrupt the explicit shop name and legacy ungrouped comparisons remain available',()=>{
 const product={name:'ミルク',unit:'820g／缶',category:'ミルク',offers:[offer('楽天24エクスプレス','https://fast-delivery-mart.rakuten.co.jp/item/123/',{quantity:2,totalGrams:1640,unitLabel:'100g'})]};
 const row=normalizeOffer(product,product.offers[0],now);assert.equal(row.retailerName,'楽天市場');assert.equal(row.seller,'楽天24エクスプレス');
 assert.equal(compareOffers(product,{mode:'オンライン',now}).length,1);assert.equal(compareRetailerOffers(product,{mode:'オンライン',now}).length,0);
});

test('the ordinary sale unit respects bottles, inner counts and known non-milk mass without inventing an empty group',()=>{
 const examples=[
  {unit:'300g',unitType:'個',quantity:1,totalGrams:300,unitLabel:'100g'},
  {unit:'160g',unitType:'個',quantity:1,totalGrams:160,unitLabel:'100g'},
  {unit:'12本',unitType:'本',quantity:12,totalGrams:null,unitLabel:'本'},
  {unit:'2個',unitType:'個',quantity:2,totalGrams:null,unitLabel:'個'},
  {unit:'2本',unitType:'本',quantity:2,totalGrams:null,unitLabel:'本'},
  {unit:'2枚×100包／1箱',unitType:'個',quantity:1,totalGrams:null,unitLabel:'個'},
  {unit:'80g×2個／1商品',unitType:'個',quantity:1,totalGrams:null,unitLabel:'個'},
 ];
 for(const example of examples){
  const product={id:'unit-'+example.unit,name:'通常の商品',unit:example.unit,unitType:example.unitType,offers:[offer('ordinary','https://www.yodobashi.com/product/123/',example)]};
  const groups=offerComparisonGroups(product,{now});assert.equal(groups.length,1,example.unit);assert.equal(groups[0].isBase,true);assert.equal(groups[0].quantity,example.quantity);assert.equal(groups[0].retailerCount,1);assert.equal(compareRetailerOffers(product,{now,mode:'オンライン'})[0].id,'ordinary');
 }
});

test('category and search URLs cannot supply a ranked quote or a confirmed retailer price',()=>{
 const urls=[
  'https://shop.akachan.jp/shop/c/cb162/?brand=example',
  'https://netshop.create-sd.co.jp/shop/c/c6002/',
  'https://item.rakuten.co.jp/example/c/0000000680/',
  'https://www.biccamera.com/bc/category/001/170/',
  'https://aeonretail.com/Form/Product/ProductList.aspx?gspscol=100010060010',
  'https://sundrug-online.com/collections/baby',
 ];
 const product={name:'商品',unit:'1個',offers:urls.map((source,index)=>offer('category-'+index,source))};
 const groupKey=offerComparisonGroups(product,{now})[0].key;
 assert.equal(compareOffers(product,{now,mode:'オンライン',groupKey}).length,0);
 assert.ok(retailerComparisons(product,{now,groupKey}).every(row=>row.offer===null));
 assert.ok(product.offers.every(row=>normalizeOffer(product,row,now).ineligibleReason==='販売ページ未確認'));
});

test('individual product paths containing category or c remain usable when they identify an actual SKU',()=>{
 const urls=[
  'https://www.24028-net.jp/category/MILK_POWDER/4987244600110.html',
  'https://joyfulhonda.jp/category/0061/1724391.html',
  'https://www.lec-online.com/c/03babykids/4903320047921',
  'https://www.richell-shop.jp/c/baby/120030',
  'https://ec.ed-inter.co.jp/c/gr1/PLAY/PLAY02/825051',
 ];
 const product={name:'商品',unit:'1個'};
 for(const source of urls)assert.equal(normalizeOffer(product,offer('sku',source),now).eligible,true,source);
});

test('a checked order shipping rule compares single packs against a bulk variant',()=>{
 const source='https://sundrug-online.com/products/diaper';
 const product={name:'おむつ46枚',unit:'46枚',unitType:'枚',offers:[
  offer('single',source,{quantity:46,unitLabel:'枚',price:1580,shipping:600,shippingRule:{kind:'threshold',fee:600,freeFrom:3980,verified:true,source,checkedAt}}),
  offer('bundle',source+'?variant=four',{quantity:184,unitLabel:'枚',price:6520,shipping:0})
 ]};
 const groupKey=offerComparisonGroups(product,{now}).find(g=>g.quantity===184).key;
 const best=compareOffers(product,{mode:'オンライン',now,groupKey})[0];assert.equal(best.total,6320);assert.equal(best.purchaseUnits,4);assert.equal(best.priceCalculation.unitPrice,1580);assert.equal(best.derivedOffer,true);
 assert.equal(retailerComparisons(product,{now,groupKey}).find(r=>r.id==='sundrug').offer.total,6320);
 const unknown=structuredClone(product);delete unknown.offers[0].shippingRule;assert.equal(compareOffers(unknown,{mode:'オンライン',now,groupKey})[0].total,6520);
 const limited=structuredClone(product);limited.offers[0].maxPurchaseQuantity=2;assert.equal(compareOffers(limited,{mode:'オンライン',now,groupKey})[0].total,6520);
});
test('missing stock confirmation and expired coupons cannot win the comparison',()=>{
 const product={name:'商品',unit:'1個',offers:[offer('normal','https://www.yodobashi.com/product/1/',{price:1000}),offer('unknown','https://www.yodobashi.com/product/2/',{price:10,available:null,status:'掲載あり'}),offer('expired','https://sundrug-online.com/products/1',{price:5,conditional:true,validThrough:'2026-08-11T00:00:00Z'})]};
 const groupKey=offerComparisonGroups(product,{now,includeConditional:true})[0].key;
 assert.deepEqual(compareOffers(product,{mode:'オンライン',now,groupKey,includeConditional:true}).map(o=>o.id),['normal']);
});

test('Amazon delivery notes distinguish Prime and the nonmember order threshold',()=>{
 assert.deepEqual(amazonDeliveryFees(2000),{prime:0,nonPrimeMin:460,nonPrimeMax:500,freeFrom:3500});
 assert.deepEqual(amazonDeliveryFees(3499),{prime:0,nonPrimeMin:460,nonPrimeMax:500,freeFrom:3500});
 assert.deepEqual(amazonDeliveryFees(3500),{prime:0,nonPrimeMin:0,nonPrimeMax:0,freeFrom:3500});
});
