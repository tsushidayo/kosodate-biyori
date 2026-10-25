import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";
import { deriveEditorialTags } from "../lib/editorial-tags.ts";
import { refreshSocialCuration } from "../lib/social-curation.ts";
import { refreshGithubCollections } from "../lib/github-collections.ts";

// Exercise the exact server module and SQL, replacing only the Cloudflare binding and bundled JSON imports.
const sqlite=new DatabaseSync(":memory:");
sqlite.exec(await fs.readFile(new URL("../drizzle/0000_mature_marvel_boy.sql",import.meta.url),"utf8"));
const binding={prepare(sql){return{values:[],bind(...values){this.values=values;return this;},async first(){return sqlite.prepare(sql).get(...this.values)??null;},async all(){return{results:sqlite.prepare(sql).all(...this.values)};},async run(){const r=sqlite.prepare(sql).run(...this.values);return{meta:{changes:Number(r.changes)}};}};},async batch(statements){sqlite.exec("BEGIN");try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec("COMMIT");return out;}catch(e){sqlite.exec("ROLLBACK");throw e;}}};
globalThis.__PARENTING_TEST_ENV={DB:binding};
globalThis.__PARENTING_TEST_HELPERS={deriveEditorialTags,refreshSocialCuration,refreshGithubCollections};
globalThis.__PARENTING_TEST_EXCLUSIONS=JSON.parse(await fs.readFile(new URL("../data/editorial-exclusions.json",import.meta.url),"utf8"));
let source=await fs.readFile(new URL("../lib/parenting-store.ts",import.meta.url),"utf8");
source=source.replace(/^import .*;\n/gm,"");
source="const env=globalThis.__PARENTING_TEST_ENV;const editorialExclusionsSeed=globalThis.__PARENTING_TEST_EXCLUSIONS;const {deriveEditorialTags,refreshSocialCuration,refreshGithubCollections}=globalThis.__PARENTING_TEST_HELPERS;const careSeed={stages:[],guides:[],programs:[]},shopSeed={products:[],chains:[]},editorialSeed={news:[],columns:[],topics:[],instagram:[],shorts:[]},feedsSeed=[],socialCurationSeed={schemaVersion:1,checkedAt:'2026-10-25',reviews:[],additionalPosts:[],shorts:[]};\n"+source;
const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const store=await import("data:text/javascript;base64,"+Buffer.from(output).toString("base64"));
const care={stages:[],guides:[],programs:[]};

test("profile requests require the Sites user identity, not an email or service token",()=>{
  assert.throws(()=>store.userId(new Request("https://example.chatgpt.site/api/profile",{headers:{"oai-authenticated-user-email":"parent@example.com","OAI-Sites-Authorization":"Bearer service"}})),e=>e.status===401);
  assert.equal(store.userId(new Request("https://example.chatgpt.site",{headers:{"oai-authenticated-user-id":"site-user-1"}})),"site-user-1");
  assert.throws(()=>store.checkOrigin(new Request("https://example.chatgpt.site/api/update",{headers:{origin:"https://another.example"}})),e=>e.status===403);
});
test("source URLs reject executable schemes, credentials and local networks",()=>{
  for(const url of["javascript:alert(1)","file:///etc/passwd","http://127.0.0.1/","http://169.254.169.254/","http://[::1]/","https://localhost/","https://x.internal/","https://name:secret@example.org/"])assert.equal(store.safeWebUrl(url),false,url);
  assert.equal(store.safeWebUrl("https://www.cfa.go.jp/policies/"),true);
  assert.throws(()=>store.validateContent("care",{...care,guides:[{url:"javascript:alert(1)"}]}),e=>e.status===400);
});
test("records reject incomplete or unsupported snapshots and unverified price provenance",()=>{
  assert.throws(()=>store.validateContent("unknown",care),e=>e.status===400);
  assert.throws(()=>store.validateContent("care",{stages:[]}),e=>e.status===400);
  assert.throws(()=>store.validateContent("shop",{products:[{id:"x",name:"test",offers:[{price:-1}]}],chains:[]}),e=>e.status===400);
  assert.throws(()=>store.validateContent("shop",{products:[{id:"x",name:"test",offers:[{price:100,verified:true,source:"https://example.org"}]}],chains:[]}),e=>e.status===400);
  assert.equal(store.validateContent("care",care),"care");
  assert.throws(()=>store.validateProfile({birthDate:"2026-02-31"}),e=>e.status===400);
});
test("snapshot CAS and profile CAS prevent a stale writer overwriting newer content",async()=>{
  await store.writeContent([{section:"care",payload:care,expectedRevision:0}]);
  await store.writeContent([{section:"care",payload:{...care,stages:[{id:"first"}]},expectedRevision:1}]);
  await assert.rejects(store.writeContent([{section:"care",payload:care,expectedRevision:1}]),e=>e.status===409);
  const current=await store.content();assert.equal(current.care.stages[0].id,"first");assert.equal(current.meta.sections.care.revision,2);
  const one=await store.saveProfile("parent-one",{birthDate:"2026-01-21",bookmarks:["a"]},0);assert.equal(one.revision,1);
  await store.saveProfile("parent-one",{birthDate:"2026-01-21",bookmarks:["b"]},1);
  await assert.rejects(store.saveProfile("parent-one",{bookmarks:["lost"]},1),e=>e.status===409);
  assert.deepEqual((await store.readProfile("parent-one")).profile.bookmarks,["b"]);
  assert.deepEqual((await store.readProfile("parent-two")).profile.bookmarks,[]);
});
test("RSS/Atom parsing keeps source dates, filters unsafe links and rejects XML entity declarations",()=>{
  const rss='<rss><channel><item><title>子育て &amp; 食事</title><link>https://example.org/article?a=1&amp;b=2</link><pubDate>Sat, 24 Oct 2026 01:00:00 GMT</pubDate><description><![CDATA[<p>食事の案内です。</p>]]></description></item><item><title>bad</title><link>javascript:alert(1)</link></item></channel></rss>';
  const items=store.parseFeed(rss,{name:"test",url:"https://example.org/rss"});assert.equal(items.length,1);assert.equal(items[0].title,"子育て & 食事");assert.equal(items[0].url,"https://example.org/article?a=1&b=2");assert.equal(items[0].publishedAt,"2026-10-24T01:00:00.000Z");assert.equal(items[0].summary,"食事の案内です。");
  const atom='<feed><entry><title>育児</title><link rel="alternate" href="https://example.org/atom"/><updated>2026-10-25T00:00:00Z</updated></entry></feed>';
  assert.equal(store.parseFeed(atom,{url:"https://example.org/feed"})[0].url,"https://example.org/atom");
  assert.throws(()=>store.parseFeed('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]><rss/>',{}),e=>e.status===400);
});
test("feed section and source keywords keep columns distinct from news and reject unrelated notices",()=>{
  const column={section:"columns",kind:"体験談",includeKeywords:["娘","家族"],excludeKeywords:["婚活"]};
  assert.equal(store.feedSection(column),"columns");
  assert.equal(store.feedSection({section:"news",kind:"解説"}),"news");
  assert.equal(store.relevantFeedItem({title:"娘とはじめての遠足",summary:""},column),true);
  assert.equal(store.relevantFeedItem({title:"娘と婚活の相談",summary:""},column),false);
  assert.equal(store.relevantFeedItem({title:"新しいパソコンを購入しました",summary:""},column),false);
  const mext={section:"news",filterRequired:true,includeKeywords:["小学校","給食"]};
  assert.equal(store.relevantFeedItem({title:"小学校での給食費支援について"},mext),true);
  assert.equal(store.relevantFeedItem({title:"小学校システムの調達に関する入札公告"},mext),false);
  assert.equal(store.relevantFeedItem({title:"大学の研究会について"},mext),false);
  assert.equal(store.relevantFeedItem({title:"子ども・子育て支援分科会の開催について"},{section:"news",filterRequired:false}),false);
  assert.equal(store.relevantFeedItem({title:"子育て支援給付の対象拡大と申請受付を開始"},{section:"news",filterRequired:false}),true);
  assert.equal(store.relevantFeedItem({title:"仮面ライダーの新しい付録つき絵本を発売"},{section:"columns",filterRequired:false}),false);
  assert.equal(store.relevantFeedItem({title:"【PR】親子向け新発売商品"},{section:"columns",filterRequired:false}),false);
  assert.equal(store.relevantFeedItem({title:"今日の日記"},{section:"columns",filterRequired:false}),true);
  const item=store.parseFeed('<rss><item><title>娘とはじめての遠足</title><link>https://example.org/column</link></item></rss>',column)[0];
  assert.equal(item.section,"columns");assert.equal(item.kind,"体験談");assert.equal(item.readingLabel,"配信の見出し");
});
test("refresh persists only reviewed X, separate videos, tags and 500 articles per section",async()=>{
  const id="1987654321098765432";
  const oldFetch=globalThis.fetch,requests=[];
  await store.writeContent([{section:"editorial",payload:{news:Array.from({length:510},(_,i)=>({id:"n-"+i,title:"小学校の給食費補助",summary:"手続きの案内",url:"https://example.org/news/"+i,publishedAt:"2026-10-23"})),columns:Array.from({length:505},(_,i)=>({id:"c-"+i,title:"子どもの生活",url:"https://example.org/columns/"+i,publishedAt:"2026-10-23"})),topics:[],shorts:[]}}]);
  globalThis.fetch=async(url,options)=>{
    requests.push({url,options});
    if(url.endsWith("collections/index.json"))return Response.json({schemaVersion:1,updatedAt:"2026-10-25T00:00:00Z",files:["collections/2026-10-25/posts.json"]});
    if(url.endsWith("collections/2026-10-25/posts.json"))return Response.json({collectedAt:"2026-10-25T00:00:00Z",posts:[{id,handle:"family",name:"家族の情報",genre:"食事",time:"2026-10-24T00:00:00Z",likes:20,views:500,text:"給食とアレルギーの確認ポイント",url:"https://x.com/family/status/"+id},{id:"1987654321098765433",handle:"family",name:"家族の情報",genre:"育児",time:"2026-10-24T00:00:00Z",likes:900,views:99999,text:"未審査の投稿",url:"https://x.com/family/status/1987654321098765433"}]});
    if(url.endsWith("data/social-curation.json"))return Response.json({schemaVersion:1,checkedAt:"2026-10-25",reviews:[{id,status:"approved",reason:"家庭で使える情報",tags:["食事・栄養","健康・安全"]}],additionalPosts:[],instagramPosts:[{id:"instagram-PARENT_123",url:"https://www.instagram.com/p/PARENT_123/",title:"親子で絵本を読む",sourceName:"育児の投稿者",parentingRelevant:true,tags:["絵本"],publishedAt:"2026-10-24"}],shorts:[{platform:"YouTube",videoId:"abcDEF12_-3",url:"https://www.youtube.com/shorts/abcDEF12_-3",title:"親子で絵本を読む",sourceName:"公式案内",parentingUseful:true,tags:["健康・安全"],publishedAt:null}]});
    throw new Error("Unexpected endpoint "+url);
  };
  try{
    const result=await store.refreshFeeds();assert.equal(result.persisted,true);assert.deepEqual(result.total,{news:500,columns:500,topics:1,instagram:1,shorts:1});
    assert.equal(result.curation.ok,true);assert.equal(result.curation.reviewedX,1);assert.equal(result.curation.shorts,1);assert.equal(result.curation.instagramCount,1);assert.equal(result.curation.instagram,1);
    const current=await store.content();assert.equal(current.editorial.topics[0].parentingUseful,true);assert.equal(current.editorial.shorts[0].publishedAt,null);assert.equal(current.editorial.instagram[0].verificationStatus,"unverified");assert.equal(current.editorial.instagram[0].id,"instagram-PARENT_123");
    assert.deepEqual(current.editorial.news[0].tags,["食事・栄養","園・学校","仕事・制度"]);assert.equal(requests.length,3);
    for(const request of requests){assert.equal(request.options.body,undefined);assert.equal(request.options.redirect,"manual");}
  }finally{globalThis.fetch=oldFetch;}
});
test("saved feed registrations are used up to 24 and prune only disallowed RSS records",async()=>{
  const feeds=Array.from({length:25},(_,i)=>({url:"https://feed.example.org/"+i,name:"registered "+i,section:"columns",filterRequired:true,includeKeywords:["育児"],excludeKeywords:["広告企画"]}));
  const columns=[{id:"old-rss",title:"育児の広告企画",url:"https://example.org/excluded",ingestion:"rss",feedUrl:feeds[0].url},{id:"manual",title:"育児の広告企画を見分ける",url:"https://example.org/manual"}];
  await store.writeContent([{section:"feeds",payload:{feeds}},{section:"editorial",payload:{news:[],columns,topics:[],shorts:[]}}]);
  const original=globalThis.fetch,seen=[];
  globalThis.fetch=async url=>{seen.push(url);if(url.startsWith("https://feed.example.org/"))return new Response("<rss/>");if(url.endsWith("collections/index.json"))return Response.json({schemaVersion:1,updatedAt:"2026-10-25T00:00:00Z",files:[]});if(url.endsWith("data/social-curation.json"))return Response.json({schemaVersion:1,checkedAt:"2026-10-25",reviews:[],additionalPosts:[],shorts:[]});throw new Error("Unexpected endpoint");};
  try{const result=await store.refreshFeeds();assert.equal(result.results.length,24);assert.equal(seen.length,26);assert.equal(seen.includes(feeds[24].url),false);assert.deepEqual((await store.content()).editorial.columns.map(i=>i.id),["manual"]);}finally{globalThis.fetch=original;}
});

const largeEditorial={news:[],columns:[],topics:Array.from({length:1000},(_,i)=>({id:'x-'+i,title:'子育ての投稿 '+i,url:'https://x.com/family/status/'+(1987654321098000000n+BigInt(i)),summary:'親子の子育て😀'.repeat(100),parentingRelevant:true})),instagram:Array.from({length:1000},(_,i)=>({id:'instagram-POST_'+i,title:'親子の投稿 '+i,url:'https://www.instagram.com/p/POST_'+i+'/',summary:'赤ちゃんの成長🌱'.repeat(100),parentingRelevant:true})),shorts:[]};
test('large editorial snapshots round-trip 1,000 X and 1,000 Instagram records through bounded UTF-8 chunks',async()=>{
 const size=Buffer.byteLength(JSON.stringify(largeEditorial));assert.ok(size>2_000_000);assert.ok(size<8_000_000);
 const before=await store.content();await store.writeContent([{section:'editorial',payload:largeEditorial,expectedRevision:before.meta.sections.editorial.revision}]);
 const pointer=sqlite.prepare("SELECT payload,revision FROM content_snapshots WHERE section='editorial'").get(),marker=JSON.parse(pointer.payload).__chunkedSnapshot;
 assert.ok(marker.id);assert.ok(marker.parts>1);assert.ok(marker.parts<=40);assert.ok(Buffer.byteLength(pointer.payload)<500);
 const chunks=sqlite.prepare('SELECT part,payload,length(CAST(payload AS BLOB)) AS bytes FROM content_snapshot_chunks WHERE id=? ORDER BY part').all(marker.id);
 assert.equal(chunks.length,marker.parts);assert.ok(chunks.every((c,i)=>c.part===i&&c.bytes<=750_000));
 for(const c of chunks){const last=c.payload.charCodeAt(c.payload.length-1),first=c.payload.charCodeAt(0);assert.equal(last>=0xd800&&last<=0xdbff,false);assert.equal(first>=0xdc00&&first<=0xdfff,false);}
 const loaded=await store.content();assert.deepEqual(loaded.editorial,largeEditorial);assert.equal(loaded.meta.storageAvailable,true);assert.equal(loaded.meta.sections.editorial.origin,'database');assert.equal(loaded.editorial.__chunkedSnapshot,undefined);assert.equal(loaded.editorial.children,undefined);assert.equal(loaded.editorial.residence,undefined);
 await assert.rejects(store.writeContent([{section:'editorial',payload:{...largeEditorial,news:[{id:'stale-writer'}]},expectedRevision:pointer.revision-1}]),e=>e.status===409);
 assert.deepEqual((await store.content()).editorial,largeEditorial);
});
test('missing snapshot chunks never return a partial collection and remain recoverable by revision',async()=>{
 const row=sqlite.prepare("SELECT payload,revision FROM content_snapshots WHERE section='editorial'").get(),marker=JSON.parse(row.payload).__chunkedSnapshot;
 sqlite.prepare('DELETE FROM content_snapshot_chunks WHERE id=? AND part=?').run(marker.id,1);
 const result=await store.content();assert.deepEqual(result.editorial.topics,[]);assert.deepEqual(result.editorial.instagram,[]);assert.equal(result.meta.storageAvailable,false);assert.equal(result.meta.sections.editorial.origin,'bundled');assert.equal(result.meta.sections.editorial.error,'snapshot_unavailable');assert.equal(result.meta.sections.editorial.revision,row.revision);
 const small={news:[],columns:[],topics:[],instagram:[],shorts:[]};await store.writeContent([{section:'editorial',payload:small,expectedRevision:row.revision}]);
 assert.equal(JSON.parse(sqlite.prepare("SELECT payload FROM content_snapshots WHERE section='editorial'").get().payload).__chunkedSnapshot,undefined);assert.equal((await store.content()).meta.storageAvailable,true);
});
test('large snapshot pointer and parts share one transaction and roll back together',async()=>{
 const before=await store.content(),prepare=binding.prepare;
 binding.prepare=function(sql){const statement=prepare(sql);if(sql.startsWith('INSERT INTO content_snapshot_chunks')){const run=statement.run;statement.run=async function(){if(this.values[1]===1)throw new Error('simulated chunk write failure');return run.call(this);};}return statement;};
 try{await assert.rejects(store.writeContent([{section:'editorial',payload:largeEditorial,expectedRevision:before.meta.sections.editorial.revision}]),/simulated chunk write failure/);}finally{binding.prepare=prepare;}
 const after=await store.content();assert.deepEqual(after.editorial,before.editorial);assert.equal(after.meta.sections.editorial.revision,before.meta.sections.editorial.revision);assert.equal(after.meta.storageAvailable,true);
});
test('snapshot limits reject reserved storage markers and oversized content while accepting editorial-sized requests',async()=>{
 const editorial={news:[],columns:[],topics:[]};
 for(const payload of [{...editorial,__chunkedSnapshot:{id:'user-supplied',parts:1}},{...editorial,topics:[{__chunkedSnapshot:{}}]}])assert.throws(()=>store.validateContent('editorial',payload),e=>e.status===400);
 const oversized={...editorial,topics:Array.from({length:2000},()=>({summary:'あ'.repeat(1400)}))};assert.throws(()=>store.validateContent('editorial',oversized),e=>e.status===413);
 assert.throws(()=>store.validateContent('care',{...care,guides:Array.from({length:1000},()=>({summary:'あ'.repeat(600)}))}),e=>e.status===413);
 const request=new Request('https://example.chatgpt.site/api/update',{method:'POST',body:JSON.stringify({section:'editorial',payload:largeEditorial})});assert.equal((await store.readJson(request)).payload.topics.length,1000);
 await assert.rejects(store.readJson(new Request('https://example.chatgpt.site/api/update',{method:'POST',headers:{'content-length':'8000001'},body:'{}'})),e=>e.status===413);
});
