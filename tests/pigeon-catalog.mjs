import test from 'node:test';
import assert from 'node:assert/strict';
import {mergePigeonCatalog,refreshImportedPigeonProducts} from '../scripts/import-pigeon-catalog.mjs';
import fs from 'node:fs';
const now='2026-10-25T12:00:00Z';
const variant=(id,patch={})=>({id,title:'Default Title',available:true,price:'2970',sku:'SKU-'+id,...patch});
const product=(id,title,patch={})=>({id,title,handle:String(id),tags:[],variants:[variant(id)],images:[],...patch});
const base={products:[{id:'original',name:'ベビーミルクローション120g',brand:'ピジョン',category:'おふろ・スキンケア',unit:'120g',offers:[{id:'prior',price:900,source:'https://example.org/item'}]}],categories:['おふろ・スキンケア'],coverage:{}};
test('official catalog prices keep the exact selected variant and unknown postage stays unknown',()=>{
 const doc={products:[product(1,'母乳実感 哺乳びん 160ml',{tags:['月齢:3カ月頃～'],variants:[variant(10,{available:false,price:'100'}),variant(11,{title:'160ml',price:'2970'})]}),product(2,'ベビーソープ90g',{tags:['送料無料'],variants:[variant(20,{price:'660'})]})]};
 const {data,report}=mergePigeonCatalog(base,[doc],{limit:10,now});const bottle=data.products.find(p=>p.id==='pigeon-1-11'),soap=data.products.find(p=>p.id==='pigeon-2-20');
 assert.equal(report.addedProducts,2);assert.equal(bottle.offers[0].price,2970);assert.equal(bottle.offers[0].shipping,null);assert.equal(bottle.minAgeMonths,3);assert.equal(bottle.offers[0].source,'https://shop.pigeon.co.jp/products/1?variant=11');assert.equal(soap.offers[0].shipping,0);assert.equal(bottle.offers[0].manufacturerSku,'SKU-11');
});
test('existing products and custom bottles never get silently conflated; one representative variant is added',()=>{
 const doc={products:[product(3,'ベビーミルクローション 120g (ベーシック)'),product(4,'My母乳実感哺乳びん プラスチック 240ml',{variants:[variant(40,{title:'デザインA'}),variant(41,{title:'デザインB'})]}),product(5,'定期便 ベビーソープ',{tags:['送料無料']}),product(6,'売り切れ ベビーソープ',{variants:[variant(60,{available:false})]})]};
 const before=structuredClone(base);const {data,report}=mergePigeonCatalog(base,[doc],{limit:10,now});assert.deepEqual(base,before);assert.deepEqual(data.products[0],base.products[0]);assert.equal(report.addedProducts,1);assert.equal(data.products.filter(p=>p.id.startsWith('pigeon-4')).length,1);assert.ok(data.products.find(p=>p.name.startsWith('My母乳実感')));assert.equal(mergePigeonCatalog(data,[doc],{limit:10,now}).data.products.length,data.products.length);
});
test('the expanded catalog uses real product pages and keeps market condition and stock explicit',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../data/shop.json',import.meta.url),'utf8'));assert.ok(data.products.length>=200);assert.equal(new Set(data.products.map(p=>p.id)).size,data.products.length);const added=data.products.filter(p=>p.id.startsWith('pigeon-')&&p.manufacturerSku&&p.source?.startsWith('https://shop.pigeon.co.jp/products/'));assert.equal(added.length,180);assert.ok(added.some(p=>p.offers[0].shipping===null));assert.ok(added.some(p=>p.offers[0].shipping===0));for(const p of added){assert.ok(p.source.startsWith('https://shop.pigeon.co.jp/products/'));assert.ok(p.manufacturerSku);assert.ok(p.offers[0].price>0);assert.equal(p.offers.length,1);assert.equal(p.offers[0].purchaseChannel,'online');}
 const market=data.products.flatMap(p=>p.offers).filter(o=>o.purchaseChannel==='marketplace');assert.ok(market.length>=9);for(const o of market){assert.ok(/^https:\/\/jp\.mercari\.com\/item\/m\d+$/.test(o.source));assert.equal(o.shipping,0);assert.equal(o.quantity,1);assert.equal(o.conditionClass,'used');assert.ok(o.itemCondition);assert.equal(o.status,'掲載あり');}
});

test('repeat research refreshes the exact imported variant and removes sold-out offers from current results',()=>{
 const d=mergePigeonCatalog(base,[{products:[product(7,'ベビーソープ90g',{tags:['送料無料'],variants:[variant(70,{price:'600'})]})]}],{now}).data;
 const before=structuredClone(d.products[0]);const count=refreshImportedPigeonProducts(d,[{products:[product(7,'ベビーソープ90g',{tags:[],variants:[variant(70,{price:'650',available:false})]})]}],'2026-10-26T12:00:00Z');
 assert.equal(count,1);assert.deepEqual(d.products[0],before);const imported=d.products.find(p=>p.id==='pigeon-7-70');assert.equal(imported.offers[0].price,650);assert.equal(imported.offers[0].shipping,null);assert.equal(imported.offers[0].status,'在庫なし');assert.equal(imported.offers[0].checkedAt,'2026-10-26T12:00:00Z');
});
