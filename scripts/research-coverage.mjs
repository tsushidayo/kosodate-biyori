/** Public catalog and municipal research coverage, without private family settings. */
import fs from 'node:fs/promises';
import {municipalityProgramCounts,programScope} from '../lib/support-coverage.ts';
import {retailerComparisons} from '../lib/retailer-links.ts';
const [inputDirectory='data',outputPath]=process.argv.slice(2);
const [care,shop,registry]=await Promise.all([fs.readFile(inputDirectory+'/care.json','utf8').then(JSON.parse),fs.readFile(inputDirectory+'/shop.json','utf8').then(JSON.parse),fs.readFile('data/municipalities.json','utf8').then(JSON.parse)]);
const municipalities=registry.municipalities||registry,counts=municipalityProgramCounts(care.programs);
const countBy=(items,key)=>Object.fromEntries([...items.reduce((map,item)=>map.set(item[key]||'未分類',(map.get(item[key]||'未分類')||0)+1),new Map())].sort((a,b)=>b[1]-a[1]));
const prefectures=[...new Set(municipalities.map(m=>m.prefecture))].map(prefecture=>{const cities=municipalities.filter(m=>m.prefecture===prefecture);return{prefecture,municipalityCount:cities.length,municipalitiesWithPrograms:cities.filter(m=>counts.has(prefecture+'|'+m.name)).length,programs:care.programs.filter(p=>programScope(p).prefecture===prefecture).length};}).sort((a,b)=>a.municipalitiesWithPrograms-b.municipalitiesWithPrograms||a.programs-b.programs);
const rank=new Map(prefectures.map((p,i)=>[p.prefecture,i]));
const pendingMunicipalities=municipalities.filter(m=>!counts.has(m.prefecture+'|'+m.name)).sort((a,b)=>rank.get(a.prefecture)-rank.get(b.prefecture)||a.code.localeCompare(b.code)).map(({code,prefecture,name,officialUrl})=>({code,prefecture,name,officialUrl}));
const pendingRetailers=shop.products.map(product=>({id:product.id,name:product.name,brand:product.brand,jan:product.jan||null,unconfirmed:retailerComparisons(product).filter(row=>row.channel==='online'&&!row.offer).map(row=>({retailerId:row.id,name:row.name,url:row.url,status:row.status}))})).sort((a,b)=>b.unconfirmed.length-a.unconfirmed.length);
const report={checkedAt:new Date().toISOString(),counts:{products:shop.products.length,brands:new Set(shop.products.map(p=>p.brand)).size,programs:care.programs.length,municipalitiesWithPrograms:counts.size,indexedMunicipalities:municipalities.length,pendingMunicipalities:pendingMunicipalities.length},productBrands:countBy(shop.products,'brand'),productCategories:countBy(shop.products,'category'),supportCategories:countBy(care.programs,'category'),prefectures,pendingMunicipalities,pendingRetailers};
if(outputPath)await fs.writeFile(outputPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report.counts,...(outputPath?{output:outputPath}:{prefectures})}));
