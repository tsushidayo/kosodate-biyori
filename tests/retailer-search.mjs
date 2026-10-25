import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const priceModule=moduleUrl(fs.readFileSync(new URL('../lib/price-comparison.ts',import.meta.url),'utf8'));
const {normalizeOffer}=await import(priceModule);
const {retailerLinks,retailerComparisons}=await import(moduleUrl(fs.readFileSync(new URL('../lib/retailer-links.ts',import.meta.url),'utf8').replace("'./price-comparison.ts'",JSON.stringify(priceModule))));
const now=Date.parse('2026-10-25T12:00:00Z');

test('all 18 retailer paths use the selected JAN instead of an unrelated home page',()=>{
 const product={name:'母乳実感160ml',brand:'ピジョン',jan:'4902508024488',offers:[]};
 const rows=retailerLinks(product);
 assert.equal(rows.length,18);assert.equal(new Set(rows.map(row=>row.id)).size,18);
 for(const row of rows){assert.equal(row.kind,'search');assert.ok(row.url.includes(product.jan),row.id);}
 const missing=retailerComparisons(product,{now});
 assert.ok(missing.filter(row=>row.channel==='online').every(row=>row.offer===null&&row.status==='価格未確認'));
});

test('name searches encode brand and product as a single query without creating prices',()=>{
 const query='ピジョン 母乳実感 & 160ml',product={name:'母乳実感 & 160ml',brand:'ピジョン',offers:[]};
 const rows=retailerLinks(product),parameters={amazon:'k',yahoo:'p',yodobashi:'word',akachan:'keyword',nishimatsuya:'keyword',babiesrus:'q',biccamera:'q',lohaco:'p',sundrug:'q',matsukiyo:'search_keyword',welcia:'q',aeon:'gspsk','create-sd':'keyword',seims:'keyword',tsuruha:'q',mrmax:'text'};
 for(const row of rows){
  const url=new URL(row.url);assert.equal(row.query,query);
  if(row.id==='create-sd'){assert.equal(row.kind,'home');assert.equal(url.href,'https://netshop.create-sd.co.jp/');continue;}
  assert.equal(row.kind,'search');
  if(parameters[row.id])assert.equal(url.searchParams.get(parameters[row.id]),query,row.id);
  else assert.ok(decodeURIComponent(url.pathname).includes(query),row.id);
 }
});

test('a registered product page remains the purchase link and search pages never count as quotes',()=>{
 const quote={id:'offer',price:200,shipping:0,quantity:1,checkedAt:'2026-10-25T12:00:00Z',verified:true,available:true,mode:'配送'};
 const direct={name:'同じ商品',offers:[{...quote,store:'ビックカメラ.com',source:'https://www.biccamera.com/bc/item/12345/'}]};
 assert.equal(retailerLinks(direct).find(row=>row.id==='biccamera').kind,'product');
 assert.equal(retailerComparisons(direct,{now}).find(row=>row.id==='biccamera').offer.price,200);
 const searches=retailerLinks({name:'同じ商品',brand:'メーカー',jan:'4902508024488',offers:[]});
 const searchOffers={name:'同じ商品',offers:searches.map(row=>({...quote,id:row.id,store:row.name,source:row.url}))};
 assert.ok(retailerComparisons(searchOffers,{now}).every(row=>row.offer===null));
 assert.ok(searchOffers.offers.every(offer=>normalizeOffer(searchOffers,offer,now).eligible===false));
 assert.equal(searchOffers.offers.length,18);
});

test('Tsuruha numeric html product pages keep a verified price visible while stock remains unconfirmed',()=>{
 const source='https://shop.tsuruha.co.jp/10016508.html';
 const product={name:'同じ商品',offers:[{id:'tsuruha',store:'ツルハ公式通販',source,price:580,shipping:null,quantity:1,checkedAt:'2026-10-25T12:00:00Z',verified:true,priceVerified:true,available:null,stockVerified:false}]};
 const link=retailerLinks(product).find(row=>row.id==='tsuruha');assert.equal(link.kind,'product');assert.equal(link.url,source);
 const row=retailerComparisons(product,{now}).find(row=>row.id==='tsuruha');
 assert.equal(row.offer.price,580);assert.equal(row.offer.eligible,false);assert.equal(row.status,'送料・在庫未確認');
});

test('Sugi is an additional physical-store row and never becomes a nineteenth online quote',()=>{
 const product={name:'ミルク',brand:'メーカー',jan:'4902508024488',unit:'1個',offers:[]};
 const links=retailerLinks(product);assert.equal(links.length,18);assert.ok(links.every(row=>row.channel==='online'));
 const rows=retailerComparisons(product,{now}),online=rows.filter(row=>row.channel==='online'),stores=rows.filter(row=>row.channel==='store');
 assert.equal(rows.length,19);assert.equal(online.length,18);assert.equal(stores.length,1);
 const sugi=stores[0];assert.equal(sugi.id,'sugi-store');assert.equal(sugi.name,'スギ薬局・スギドラッグ');assert.equal(sugi.kind,'store');assert.equal(sugi.url,'https://www.sugi-net.jp/stores');assert.equal(sugi.manualInput,true);assert.equal(sugi.offer,null);assert.equal(sugi.checkedAt,null);assert.equal(sugi.status,'定価・通常価格から試算');
 assert.equal(rows.filter(row=>row.offer).length,0);
});
