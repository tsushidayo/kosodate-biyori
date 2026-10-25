/** Public research queue. No search result is treated as a price. */
import fs from 'node:fs/promises';
import {retailerComparisons} from '../lib/retailer-links.ts';
const [input='data/shop.json',output]=process.argv.slice(2),shop=JSON.parse(await fs.readFile(input,'utf8'));
const products=shop.products.map(product=>{const rows=retailerComparisons(product).filter(row=>row.channel==='online');return{productId:product.id,name:product.name,brand:product.brand,jan:product.jan||null,unit:product.unit,confirmedRetailers:rows.filter(row=>row.offer).length,missing:rows.filter(row=>!row.offer).map(({id,name,url,status,checkedAt})=>({retailerId:id,name,url,status,checkedAt}))};}).sort((a,b)=>a.confirmedRetailers-b.confirmedRetailers||String(a.productId).localeCompare(String(b.productId)));
const result={checkedAt:new Date().toISOString(),productCount:products.length,retailersPerProduct:18,policy:'個別商品ページで同一JAN・型番・色・容量を照合。価格が不明な販売先を推測額や0円で埋めない。',products};
if(output)await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({products:products.length,retailersPerProduct:18,confirmedQuotes:products.reduce((sum,p)=>sum+p.confirmedRetailers,0),missingQuotes:products.reduce((sum,p)=>sum+p.missing.length,0),...(output?{output}:{nextProducts:products.slice(0,10)})}));
