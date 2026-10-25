import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const source=await fs.readFile(new URL('../lib/github-collections.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {normalizeGithubPost,validateCollectionManifest,mergeGithubTopics,refreshGithubCollections}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const collectedAt='2026-10-25T04:41:00.000Z';
const sample={id:'2114153553954807901',handle:'parent_test',name:'子育ての記録',genre:'育児',time:'2026-10-25T00:34:20Z',likes:850,views:153102,text:'赤ちゃんとの暮らしについて。'.repeat(15),url:'https://x.com/parent_test/status/2114153553954807901?s=46'};
const manifest={schemaVersion:1,updatedAt:collectedAt,files:['collections/2026-10-25/kosodate-134100.json']};
const json=v=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json'}});
test('post normalization preserves recorded metrics and source dates, excerpts only, and validates IDs',()=>{
 const p=normalizeGithubPost(sample,collectedAt);assert.equal(p.id,'github-x-'+sample.id);assert.equal(p.url,sample.url.split('?')[0]);assert.equal(p.collectedAt,collectedAt);assert.equal(p.recordedMetrics.views,153102);assert.equal(p.publishedAt,'2026-10-25T00:34:20.000Z');assert.equal(Array.from(p.title).length,51);assert.equal(Array.from(p.summary).length,111);assert.equal(p.text,undefined);
 for(const bad of[{url:'https://evil.example/status/'+sample.id},{url:'https://x.com/other/status/'+sample.id},{url:'https://x.com/parent_test/status/2114153553954807902'},{url:'http://x.com/parent_test/status/'+sample.id},{likes:-1},{views:'153102'},{likes:Infinity},{time:'2026-02-31T00:00:00Z'},{time:'2027-10-25T00:00:00Z'},{text:''},{handle:'bad/handle'}])assert.equal(normalizeGithubPost({...sample,...bad},collectedAt),null,JSON.stringify(bad));
 assert.ok(normalizeGithubPost({...sample,url:sample.url.replace('x.com','twitter.com')},collectedAt));
});
test('manifest permits only unique project collection paths and at most 20 files',()=>{
 assert.deepEqual(validateCollectionManifest(manifest),manifest.files);
 for(const files of[['../data.json'],['https://evil.example/a.json'],['collections/2026-10-25/../secret.json'],['collections/2026-10-25/file.json?x=1'],Array(21).fill('collections/2026-10-25/a.json'),[...manifest.files,...manifest.files]])assert.throws(()=>validateCollectionManifest({...manifest,files}));
 assert.throws(()=>validateCollectionManifest({...manifest,schemaVersion:2}));
});
test('merge replaces older metrics by ID or X status URL and retains unrelated existing topics',()=>{
 const fresh=normalizeGithubPost(sample,collectedAt);const old={...fresh,collectedAt:'2026-10-24T04:00:00Z',recordedMetrics:{likes:100,views:10000}};const sameUrl={...old,id:'different-id',url:fresh.url.replace('x.com','twitter.com')+'?s=46'};const unrelated={id:'manual',url:'https://example.org/one',title:'既存の話題'};
 const merged=mergeGithubTopics([old,sameUrl,unrelated],[fresh]);assert.equal(merged.topics.length,2);assert.equal(merged.topics[0].recordedMetrics.likes,850);assert.ok(merged.topics.includes(unrelated));assert.equal(merged.added,0);
 const older={...fresh,collectedAt:'2026-10-23T04:00:00Z'};assert.equal(mergeGithubTopics([fresh],[older]).topics[0],fresh);
 assert.equal(mergeGithubTopics([unrelated],[fresh]).added,1);
});
test('fetch imports the fixed manifest and rolls back all topics when one collection fails',async()=>{
 const old=[{id:'manual',url:'https://example.org/old',title:'維持する記事'}];const calls=[];
 const success=await refreshGithubCollections(old,async(url,options)=>{calls.push([url,options]);return url.endsWith('index.json')?json(manifest):json({collectedAt,posts:[sample]});});
 assert.equal(success.ok,true);assert.equal(success.files,1);assert.equal(success.added,1);assert.equal(success.topics.length,2);assert.equal(calls[0][0],'https://raw.githubusercontent.com/tsushidayo/kosodate-biyori/main/collections/index.json');assert.equal(calls[0][1].redirect,'manual');assert.ok(calls[0][1].signal);
 const two={...manifest,files:[...manifest.files,'collections/2026-10-25/bad.json']};
 const fail=await refreshGithubCollections(old,async url=>url.endsWith('index.json')?json(two):url.endsWith('bad.json')?new Response('missing',{status:404}):json({collectedAt,posts:[sample]}));
 assert.equal(fail.ok,false);assert.equal(fail.added,0);assert.equal(fail.topics,old);assert.match(fail.error,/404/);
 const oversize=await refreshGithubCollections(old,async url=>url.endsWith('index.json')?json(manifest):new Response('a'.repeat(600001)));
 assert.equal(oversize.ok,false);assert.equal(oversize.topics,old);assert.match(oversize.error,/size limit/);
 const noFetch=await refreshGithubCollections(old,async()=>{throw new Error('network unavailable');});assert.equal(noFetch.ok,false);assert.equal(noFetch.topics,old);
});
