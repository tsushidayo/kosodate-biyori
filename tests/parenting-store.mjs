import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

// Exercise the exact server module and SQL, replacing only the Cloudflare binding and bundled JSON imports.
const sqlite=new DatabaseSync(":memory:");
sqlite.exec(await fs.readFile(new URL("../drizzle/0000_mature_marvel_boy.sql",import.meta.url),"utf8"));
const binding={prepare(sql){return{values:[],bind(...values){this.values=values;return this;},async first(){return sqlite.prepare(sql).get(...this.values)??null;},async all(){return{results:sqlite.prepare(sql).all(...this.values)};},async run(){const r=sqlite.prepare(sql).run(...this.values);return{meta:{changes:Number(r.changes)}};}};},async batch(statements){sqlite.exec("BEGIN");try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec("COMMIT");return out;}catch(e){sqlite.exec("ROLLBACK");throw e;}}};
globalThis.__PARENTING_TEST_ENV={DB:binding};
let source=await fs.readFile(new URL("../lib/parenting-store.ts",import.meta.url),"utf8");
source=source.replace(/^import .*;\n/gm,"");
source="const env=globalThis.__PARENTING_TEST_ENV;const careSeed={stages:[],guides:[],programs:[]},shopSeed={products:[],chains:[]},editorialSeed={news:[],columns:[],topics:[]},feedsSeed=[];\n"+source;
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
  assert.equal(store.relevantFeedItem({title:"今日の日記"},{section:"columns",filterRequired:false}),true);
  const item=store.parseFeed('<rss><item><title>娘とはじめての遠足</title><link>https://example.org/column</link></item></rss>',column)[0];
  assert.equal(item.section,"columns");assert.equal(item.kind,"体験談");assert.equal(item.readingLabel,"配信の見出し");
});
