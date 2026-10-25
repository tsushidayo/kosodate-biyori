import test from 'node:test';import assert from 'node:assert/strict';
import {catalogMatches,productFacts,diverseCatalog} from '../lib/product-catalog.ts';
import {programScope,municipalityProgramCounts,programMatchesQuery} from '../lib/support-coverage.ts';
test('catalog searches names, normalized model codes and useful facts with multiple terms',()=>{
 const product={name:'かきかた鉛筆',brand:'三菱鉛筆',model:'K56532B',jan:'4902778351550',features:['三角軸の12本セット'],unit:'12本',offers:[{store:'ミルクショップ',source:'https://example.org/diaper'}]};
 assert.equal(catalogMatches(product,'三菱　Ｋ５６５３２Ｂ'),true);assert.equal(catalogMatches(product,'三角軸 12本'),true);assert.equal(catalogMatches(product,'4902778351550'),true);assert.equal(catalogMatches(product,'ミルク'),false);
 const imported={name:'哺乳びん',brand:'ピジョン',manufacturerSku:'1026763',ean:'4902508024488',color:'ミント',material:'耐熱ガラス',specification:{付属品:'乳首M付き'}};
 assert.equal(catalogMatches(imported,'1026763'),true);assert.equal(catalogMatches(imported,'4902508024488'),true);assert.equal(catalogMatches(imported,'ミント 耐熱ガラス'),true);assert.equal(catalogMatches(imported,'乳首M付き'),true);
 assert.ok(productFacts(imported).some(fact=>fact.label==='商品番号'&&fact.value==='1026763'));assert.ok(productFacts(imported).some(fact=>fact.label==='色'&&fact.value==='ミント'));assert.ok(productFacts(imported).some(fact=>fact.label==='JAN'&&fact.value==='4902508024488'));
 assert.equal(productFacts({name:'玩具',unit:'1セット'}).some(f=>f.label==='対象'),false);
 const initial=diverseCatalog([{id:'milk1',category:'ミルク'},{id:'milk2',category:'ミルク'},{id:'toy1',category:'玩具'},{id:'school1',category:'学用品'}]);assert.deepEqual(initial.slice(0,3).map(p=>p.category),['ミルク','玩具','学用品']);
});
test('municipal coverage counts individual schemes without counting national or prefectural indexes',()=>{
 const programs=[{prefecture:'全国',scope:'national',title:'児童手当'},{prefecture:'北海道',scope:'prefecture',area:'北海道',title:'パスポート'},{prefecture:'北海道',municipality:'美瑛町',title:'産後ケア'},{prefecture:'北海道',municipality:'北海道美瑛町',coveredMunicipalities:['美瑛町','東川町'],title:'病児保育'}];
 const counts=municipalityProgramCounts(programs);assert.equal(counts.size,2);assert.equal(counts.get('北海道|美瑛町'),2);assert.equal(counts.get('北海道|東川町'),1);
 assert.equal(programScope(programs[1]).municipality,'');assert.equal(programScope(programs[0]).national,true);
});

test('support search finds application details and notes without matching internal IDs or source URLs',()=>{
 const scheme={id:'internal-helper-only',title:'産後ケア',prefecture:'北海道',municipality:'東川町',preparation:['母子健康手帳'],steps:[{title:'利用券を申請',body:'窓口で予約します。'}],notes:['自己負担は１，０００円'],deadlineNote:'出産後６か月まで',additionalSources:[{name:'産後ケアの利用案内',url:'https://source-url-only.example.org'}]};
 assert.equal(programMatchesQuery(scheme,'母子健康手帳 利用券'),true);
 assert.equal(programMatchesQuery(scheme,'1,000円 ６か月'),true);
 assert.equal(programMatchesQuery(scheme,'利用案内'),true);
 assert.equal(programMatchesQuery(scheme,'internal-helper-only'),false);
 assert.equal(programMatchesQuery(scheme,'source-url-only'),false);
 assert.equal(programMatchesQuery(scheme,'母子健康手帳 給食'),false);
});

test('medical support ending at an age-year boundary uses registered birthdays instead of a broad month cap',async()=>{
 const {getFamilyChildren,ageTargetStatus}=await import('../lib/age-personalization.ts');
 const scheme={minAgeMonths:0,schoolYearEndAge:18};
 const children=date=>getFamilyChildren({children:[{id:'child-1',birthDate:date}]},'2026-10-25T00:00:00Z');
 assert.equal(ageTargetStatus(scheme,children('2008-04-01')),'not-matching');
 assert.equal(ageTargetStatus(scheme,children('2008-04-02')),'matching');
 assert.equal(ageTargetStatus(scheme,[{id:'manual',birthDate:'',months:216,label:'18歳',ordinal:1}]),'unknown');
 assert.equal(ageTargetStatus(scheme,[{id:'manual',birthDate:'',months:204,label:'17歳',ordinal:1}]),'matching');
});
