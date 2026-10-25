/** Scheduled shared-data maintenance. Accept the Site origin/token via stdin only. */
import fs from 'node:fs/promises';
import readline from 'node:readline';
import {refreshMarketplaces} from './marketplace-refresh.mjs';
let input;for await(const line of readline.createInterface({input:process.stdin})){try{input=JSON.parse(line);}catch{throw Error('Invalid input JSON');}break;}process.stdin.destroy();
const origin=new URL(input.url);
if(origin.protocol!=='https:'||!origin.hostname.endsWith('.chatgpt.site')||origin.username||origin.password||origin.port)throw Error('Use the published Sites HTTPS origin.');
if(typeof input.token!=='string'||!input.token)throw Error('A Site service token is required.');
const headers={'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+input.token};
async function call(path,body){const response=await fetch(new URL(path,origin.origin),{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(45000)});let result;try{result=await response.json();}catch{throw Error(path+' returned HTTP '+response.status);}if(!response.ok){const error=Error(path+' HTTP '+response.status+' '+String(result.error||''));error.status=response.status;throw error;}return result;}
const before=await call('/api/content');if(!before.meta.storageAvailable)throw Error('Shared storage is unavailable.');
const researched=await refreshMarketplaces(before.shop,{maxRequests:Math.min(60,Math.max(1,Number(input.marketplaceLimit)||60))});
const changes=new Map(researched.products.flatMap(product=>product.offers||[]).filter(offer=>offer.lastAttemptAt===researched.marketplaceRefresh.attemptedAt).map(offer=>[offer.id,offer]));
let saved=false;
for(let attempt=0;attempt<3;attempt++){
 const current=attempt?await call('/api/content'):before;
 const shop={...current.shop,products:current.shop.products.map(product=>({...product,offers:(product.offers||[]).map(offer=>{const next=changes.get(offer.id);return next&&(Date.parse(offer.lastAttemptAt||'')||0)<=(Date.parse(next.lastAttemptAt||'')||0)?next:offer;})})),marketplaceRefresh:researched.marketplaceRefresh};
 try{await call('/api/update',{updates:[{section:'shop',payload:shop,expectedRevision:current.meta.sections.shop.revision}]});saved=true;break;}catch(error){if(error.status!==409||attempt===2)throw error;}
}
const refreshed=input.refreshFeeds===false?null:await call('/api/refresh',{});
const content=await call('/api/content');if(!content.meta.storageAvailable)throw Error('Final shared snapshot is unavailable.');
if(input.outputDirectory){await fs.mkdir(input.outputDirectory,{recursive:true});for(const section of ['care','shop','editorial','feeds'])await fs.writeFile(input.outputDirectory+'/'+section+'.json',JSON.stringify(content[section],null,2)+'\n');}
console.log(JSON.stringify({saved,marketplace:researched.marketplaceRefresh,feeds:refreshed?{persisted:refreshed.persisted,results:refreshed.results,curation:refreshed.curation,github:refreshed.github}:null,counts:{products:content.shop.products.length,news:content.editorial.news.length,columns:content.editorial.columns.length,instagram:content.editorial.instagram?.length||0,shorts:content.editorial.shorts?.length||0},storageAvailable:content.meta.storageAvailable}));
