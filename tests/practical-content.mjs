import test from 'node:test';
import assert from 'node:assert/strict';
import {isPracticalEditorial,editorialTopics,practicalVideoPriority} from '../lib/editorial-quality.ts';
import {deriveEditorialTags} from '../lib/editorial-tags.ts';
import {splitSocialMedia} from '../lib/social-curation.ts';
import {retailerLinks,retailerComparisons} from '../lib/retailer-links.ts';
import {normalizeOffer} from '../lib/price-comparison.ts';
import {parseMarketplaceListing,refreshMarketplaces,marketplaceUrl} from '../scripts/marketplace-refresh.mjs';

test('parenting words alone do not admit diaries, meetings or research announcements',()=>{
 for(const title of ['育児日記10/25','子育て支援分科会の開催を案内','子どもの発達と薬の関連を研究','離乳食の準備や後片付け、親の負担を調査','こどもまんなかニュース','地震後の電気火災を防ぐ'])assert.equal(isPracticalEditorial({title}),false,title);
 for(const title of ['離乳食の冷凍と解凍の方法','子どもの保育園申請に必要な書類','小学生の家庭学習を続ける工夫','抱っこひもの使い方を親子で確認'])assert.equal(isPracticalEditorial({title}),true,title);
 assert.ok(editorialTopics({title:'横浜市の保育園の申請',prefecture:'神奈川県'}).includes('保育・制度'));
 assert.equal(editorialTopics({title:'横浜市の保育園の申請',prefecture:'神奈川県'}).includes('おでかけ'),false);
 assert.equal(deriveEditorialTags({title:'保育施設の利用申請と見学',tags:['お出かけ']}).includes('お出かけ'),false);
 assert.ok(practicalVideoPriority({title:'離乳食の作り方'})>practicalVideoPriority({title:'出産あるある'}));
});
test('Instagram feeds stay separate while every recognized short video shares one shelf',()=>{
 const post={platform:'Instagram',id:'instagram-FEED_1234',url:'https://www.instagram.com/p/FEED_1234/',title:'子どもの絵本の選び方',sourceName:'保護者の投稿',parentingRelevant:true,isVideo:false,postFormat:'carousel'};
 const video={...post,id:'instagram-VIDEO_123',url:'https://www.instagram.com/p/VIDEO_123/',isVideo:true,durationSeconds:null,postFormat:'video'};
 const result=splitSocialMedia([post,video,video],[]);
 assert.equal(result.instagram.length,1);assert.equal(result.shorts.length,1);assert.equal(result.shorts[0].platform,'Instagram');assert.equal(result.shorts[0].durationSeconds,null);
 assert.equal(splitSocialMedia([{...video,durationSeconds:3600}],[]).shorts.length,0);
 assert.equal(splitSocialMedia([{...post,isVideo:undefined,postFormat:undefined}],[]).instagram.length,0);
 assert.equal(splitSocialMedia([{...video,title:'子どもの防災対策'}],[]).shorts.length,0);
});
test('every product offers the same retailer paths without pretending a search URL is a quoted price',()=>{
 const result=retailerLinks({name:'母乳実感160ml',brand:'ピジョン',jan:'4902508024488',offers:[{verified:true,source:'https://www.amazon.co.jp/s?k=anything'}]});
 assert.equal(result.length,18);assert.ok(result.slice(0,6).every(r=>r.kind==='search'));assert.ok(result.slice(0,6).every(r=>r.url.includes('4902508024488')));
 const direct=retailerLinks({name:'同じ商品',offers:[{verified:true,source:'https://www.amazon.co.jp/dp/B123456789'}]});
 assert.equal(direct[0].kind,'product');assert.equal('price' in direct[0],false);
 const quoted={price:1000,shipping:0,quantity:1,available:true,verified:true,checkedAt:new Date().toISOString()};
 assert.equal(normalizeOffer({name:'同じ商品'},{...quoted,source:'https://wowma.jp/kw/baby'}).eligible,false);
 assert.equal(normalizeOffer({name:'同じ商品'},{...quoted,source:'https://www.amazon.co.jp/s?k=baby'}).eligible,false);
 const all=retailerComparisons({name:'同じ商品',offers:[{...quoted,source:'https://www.amazon.co.jp/dp/B123456789',store:'Amazon'},{...quoted,source:'https://shop.akachan.jp/shop/g/g1234/',store:'アカチャンホンポ',shipping:null}]});
 assert.equal(all.filter(row=>row.channel==='online').length,18);assert.equal(all.filter(row=>row.channel==='store').length,1);assert.equal(all[0].offer.price,1000);assert.equal(all[4].status,'送料未確認');assert.equal(all[4].offer.total,null);assert.equal(all[5].offer,null);assert.equal(all[5].status,'価格未確認');
 const stale=retailerComparisons({name:'同じ商品',offers:[{...quoted,source:'https://www.amazon.co.jp/dp/B123456789',store:'Amazon',checkedAt:'2020-01-01'}]});assert.equal(stale[0].offer,null);
});
const offer={id:'market-1',source:'https://jp.mercari.com/item/m12345678901',listingTitle:'ベビービョルン ブリス サンドベージュ',price:9000,shipping:0,verified:true,checkedAt:'2026-10-24'};
const html=(patch={})=>'<script type="application/ld+json">'+JSON.stringify({'@type':'Product',name:offer.listingTitle,url:offer.source,offers:{'@type':'Offer',price:6500,priceCurrency:'JPY',availability:'https://schema.org/InStock',shippingDetails:{shippingRate:{value:0}},...patch}})+'</script><main>送料込み</main>';
test('listing refresh distinguishes current price, sold, mismatch and unavailable verification',async()=>{
 assert.equal(marketplaceUrl('https://jp.mercari.com.evil.test/item/m12345678901'),null);
 assert.equal(parseMarketplaceListing(html(),offer).price,6500);
 assert.equal(parseMarketplaceListing(html({availability:'https://schema.org/OutOfStock'}),offer).available,false);
 assert.throws(()=>parseMarketplaceListing(html().replace(offer.listingTitle,'別の商品'),offer));
 const input={products:[{id:'one',offers:[offer]}]};
 const refreshed=await refreshMarketplaces(input,{now:'2026-10-25T10:00:00Z',fetchImpl:async url=>String(url).endsWith('/robots.txt')?new Response('User-agent: *\nDisallow:'):new Response(html())});
 assert.equal(refreshed.products[0].offers[0].price,6500);assert.equal(input.products[0].offers[0].price,9000);
 const failed=await refreshMarketplaces(input,{now:'2026-10-25T10:00:00Z',fetchImpl:async()=>new Response('',{status:403})});
 assert.equal(failed.products[0].offers[0].checkedAt,'2026-10-24');assert.equal(failed.products[0].offers[0].verified,false);
 const denied=await refreshMarketplaces(input,{fetchImpl:async()=>new Response('User-agent: *\nDisallow: /item/')});assert.equal(denied.marketplaceRefresh.failed,1);
});
test('Rakuma current-item sold ribbon overrides stale InStock data without reading related-item sales',()=>{
 const rakuma={...offer,source:'https://item.fril.jp/0346a946f8ffa48cc6c6f93e4f26cb3a'};
 const body=html().replace(offer.source,rakuma.source);
 const current='<section><div id="item-slider"><div class="photo-box__soldout_ribbon">SOLD OUT</div></div></section>';
 assert.equal(parseMarketplaceListing(body+current,rakuma).available,false);
 assert.equal(parseMarketplaceListing(body+'<section id="recommendations">SOLD OUT</section>',rakuma).available,true);
});
