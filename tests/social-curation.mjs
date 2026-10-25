import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveEditorialTags} from '../lib/editorial-tags.ts';
import {applySocialCuration, isRelevantParentingVideo, instagramPostIdentity, normalizeCuratedInstagramPost, normalizeCuratedVideo, normalizeCuratedXPost, refreshSocialCuration, validateSocialCuration} from '../lib/social-curation.ts';
import {mergeGithubTopics} from '../lib/github-collections.ts';

const status = '1987654321098765432';
const raw = {id: 'github-x-' + status, title: '保育園の給食と食物アレルギーの相談先', summary: '園と家庭で確認するポイント', url: 'https://x.com/kosodate/status/' + status, handle: 'kosodate', sourceName: 'X / @kosodate', platform: 'X', publishedAt: '2026-10-23T01:00:00.000Z', collectedAt: '2026-10-24T01:00:00.000Z', recordedMetrics: {likes: 20, views: 100}, ingestion: 'github-collection'};
const doc = (patch = {}) => validateSocialCuration({schemaVersion: 1, checkedAt: '2026-10-25', reviews: [], additionalPosts: [], shorts: [], ...patch});
const review = {id: status, status: 'approved', reason: '家庭で確認できる実用的な相談案内', tags: ['食事・栄養', '園・学校'], ageGroups: ['3〜5歳']};
const video = {platform: 'YouTube', videoId: 'abcDEF12_-3', url: 'https://www.youtube.com/shorts/abcDEF12_-3', title: '抱っこひもの安全チェック', sourceName: '公的な子育て窓口', tags: ['健康・安全', '暮らし'], parentingUseful: true, publishedAt: null};

test('article topics are multiple plain-text labels, never eligibility or treatment conclusions', () => {
  const item = {title: '保育園の給食費補助とアレルギーの相談', summary: '申請方法を園に確認します。', tags: ['手続き']};
  assert.deepEqual(deriveEditorialTags(item), ['手続き', '食事・栄養', '健康・安全', '園・学校', '仕事・制度', '家族・心']);
  assert.deepEqual(deriveEditorialTags({title: '<img alt="給食"><script>子ども医療アレルギー</script>記事'}), []);
  assert.equal(Object.hasOwn(item, 'ageGroups'), false);
  assert.deepEqual(deriveEditorialTags({title: '0歳向けの一般情報'}), []);
});
test('an observed parenting caption remains eligible after normalization without borrowing generic tags', () => {
  const item={url:'https://www.instagram.com/p/ABC_def1234/', title:'レンジで簡単な献立', sourceName:'料理の投稿', isVideo:true, parentingRelevant:true, captionExcerpt:'子どもの月齢に合わせて調節してください。', tags:['離乳食']};
  const normalized=normalizeCuratedInstagramPost(item);
  assert.equal(normalized.captionExcerpt,item.captionExcerpt);
  assert.ok(normalizeCuratedInstagramPost(normalized));
  assert.equal(normalizeCuratedInstagramPost({...item,captionExcerpt:'おいしい献立です。'}),null);
  for(const word of ['お子さん','３歳児','先輩ママ','息子','三男','子連れ'])assert.equal(isRelevantParentingVideo({title:word+'の成長記録'}),true);
});
test('unreviewed and explicitly rejected X posts are never published', () => {
  assert.deepEqual(applySocialCuration(doc(), [raw], []).topics, []);
  const approved = applySocialCuration(doc({reviews: [review]}), [raw], []).topics;
  assert.equal(approved.length, 1); assert.equal(approved[0].parentingUseful, true);
  assert.deepEqual(applySocialCuration(doc({reviews: [{...review, status: 'rejected'}]}), [raw], approved).topics, []);
});
test('a fresh collection replaces reactions and preserves review, topic and explicit age metadata', () => {
  const previous = applySocialCuration(doc({reviews: [review]}), [raw], []).topics;
  const incoming = {...raw, collectedAt: '2026-10-25T02:00:00.000Z', recordedMetrics: {likes: 900, views: 5000}};
  const merged = mergeGithubTopics(previous, [incoming]).topics;
  assert.equal(merged[0].parentingUseful, undefined, 'the collection itself has no authority to approve');
  const result = applySocialCuration(doc(), merged, previous).topics;
  assert.equal(result.length, 1); assert.equal(result[0].recordedMetrics.likes, 900);
  assert.equal(result[0].reviewStatus, 'approved'); assert.deepEqual(result[0].tags, review.tags); assert.deepEqual(result[0].ageGroups, ['3〜5歳']);
  assert.equal(result[0].reviewReason, review.reason);
});
test('additional X posts need explicit usefulness and exact canonical identity', () => {
  assert.equal(normalizeCuratedXPost(raw), null);
  assert.equal(normalizeCuratedXPost({...raw, parentingUseful: true, url: 'https://x.com.evil.test/kosodate/status/' + status}), null);
  assert.equal(normalizeCuratedXPost({...raw, parentingUseful: true, id: 'github-x-1987654321098765433'}), null);
  assert.equal(normalizeCuratedXPost({...raw, parentingUseful: true, handle: 'someone_else'}), null);
  const long = normalizeCuratedXPost({...raw, parentingUseful: true, summary: 'あ'.repeat(6000), text: 'private full copy', children: [{birthDate: '2026-01-01'}]});
  assert.equal(long.summary.length, 180); assert.equal(long.text, undefined); assert.equal(long.children, undefined);
  assert.equal(applySocialCuration(doc({additionalPosts: [{...raw, parentingUseful: true}]}), [], []).topics.length, 1);
});
test('short video URLs reject unsafe hosts, credentials, mismatches and non-video paths', () => {
  assert.equal(normalizeCuratedVideo(video).publishedAt, null);
  const format = normalizeCuratedVideo({...video, videoFormat: 'short-video', durationSeconds: 85, publishedAt: '2025-04-01'});
  assert.equal(format.videoFormat, 'short-video'); assert.equal(format.durationSeconds, 85); assert.equal(format.publishedAt, '2025-04-01');
  assert.equal(format.url, 'https://www.youtube.com/watch?v=' + video.videoId);
  assert.equal(normalizeCuratedVideo({...video, thumbnailUrl: 'https://evil.test/tracker', usefulnessReason: '家庭で確認できる'}).thumbnailUrl, 'https://i.ytimg.com/vi/' + video.videoId + '/hqdefault.jpg');
  assert.equal(normalizeCuratedVideo({...video, usefulnessReason: '家庭で確認できる'}).reviewReason, '家庭で確認できる');
  for (const patch of [
    {url: 'javascript:alert(1)'}, {url: 'https://www.youtube.com.evil.test/shorts/abcDEF12_-3'},
    {url: 'https://name:password@www.youtube.com/shorts/abcDEF12_-3'},
    {videoId: 'otherDEF_-3'}, {url: 'https://www.youtube.com/embed/abcDEF12_-3'},
    {parentingUseful: undefined}, {sourceName: ''}, {platform: 'Instagram'},
    {url: 'https://www.youtube.com/shorts/abcDEF12_-3/extra'},
  ]) assert.equal(normalizeCuratedVideo({...video, ...patch}), null, JSON.stringify(patch));
  const ig = {...video, platform: 'Instagram', videoId: 'ABC_def1234', url: 'https://www.instagram.com/reel/ABC_def1234/'};
  const tt = {...video, platform: 'TikTok', videoId: '7456789012345678901', url: 'https://www.tiktok.com/@official/video/7456789012345678901'};
  assert.equal(normalizeCuratedVideo(ig).platform, 'Instagram'); assert.equal(normalizeCuratedVideo(tt).platform, 'TikTok');
  assert.equal(normalizeCuratedVideo({...tt, url: 'https://vm.tiktok.com/unsafe'}), null);
});
test('curation refresh uses one fixed endpoint and a failed request retains previously reviewed videos', async () => {
  const approved = applySocialCuration(doc({reviews: [review]}), [raw], []).topics;
  let request;
  const result = await refreshSocialCuration({previousTopics: approved, incomingTopics: [raw], previousShorts: [video], fallback: doc()}, async (url, options) => {request = {url, options}; return new Response('down', {status: 503});});
  assert.equal(request.url, 'https://raw.githubusercontent.com/tsushidayo/kosodate-biyori/main/data/social-curation.json');
  assert.equal(request.options.redirect, 'manual'); assert.equal(request.options.signal.aborted, false);
  assert.equal(result.ok, false); assert.equal(result.source, 'bundled'); assert.equal(result.topics.length, 1); assert.equal(result.shorts.length, 1); assert.equal(result.shorts[0].publishedAt, null);
});
test('valid remote curation controls video removal; redirects and oversized responses use bundle fallback', async () => {
  const input = {previousTopics: [], incomingTopics: [], previousShorts: [video], fallback: doc({shorts: [video]})};
  const success = await refreshSocialCuration(input, async () => Response.json(doc()));
  assert.equal(success.ok, true); assert.deepEqual(success.shorts, []);
  for (const response of [new Response('', {status: 302, headers: {location: 'https://other.test'}}), new Response('{}', {headers: {'content-length': '5000001'}}), new Response('x'.repeat(5_000_001))]) {
    const fallback = await refreshSocialCuration(input, async () => response);
    assert.equal(fallback.ok, false); assert.equal(fallback.shorts.length, 1);
  }
});

test('videos exclude disaster and accident topics and require explicit parenting language',()=>{
  for(const title of ['携帯トイレの使い方','親子の地震対策','子どもの感電事故を防ぐ','赤ちゃんの誤嚥・窒息','ローリングストックと備蓄','子どもの転落を防ぐ','親子で津波に備える','赤ちゃんの誤飲対策','便利な掃除の方法']){
    assert.equal(isRelevantParentingVideo({title}),false,title);
    assert.equal(normalizeCuratedVideo({...video,title,tags:[]}),null,title);
  }
  assert.equal(isRelevantParentingVideo({title:'生後7か月の離乳食'}),true);
  assert.equal(isRelevantParentingVideo({title:'親子で楽しむ絵本の時間'}),true);
  assert.equal(isRelevantParentingVideo({title:'子育てのお出かけ情報',tags:['事故予防']}),false);
});

const instagram = {id:'instagram-PARENT_123',shortcode:'PARENT_123',platform:'Instagram',url:'https://www.instagram.com/p/PARENT_123/?utm_source=embed',title:'親子の絵本の時間',summary:'読み聞かせを楽しむ投稿',sourceName:'子育ての投稿者',handle:'parent.account',parentingRelevant:true,publishedAt:'2026-10-23',tags:['絵本','親子遊び']};
test('Instagram post identities allow only recognized native permalinks',()=>{
 assert.deepEqual(instagramPostIdentity(instagram.url),{shortcode:'PARENT_123',kind:'p',url:'https://www.instagram.com/p/PARENT_123/'});
 assert.equal(instagramPostIdentity('https://www.instagram.com/reels/PARENT_123/').kind,'reel');
 for(const url of ['https://instagram.com.evil.test/p/PARENT_123/','https://name:password@instagram.com/p/PARENT_123/','javascript:alert(1)','https://instagram.com/parent.account/','https://instagram.com/p/PARENT_123/extra'])assert.equal(instagramPostIdentity(url),null,url);
});
test('Instagram normalizes only explicit relatedness, excerpts and public metadata, always unverified',()=>{
 const normalized=normalizeCuratedInstagramPost({...instagram,title:'あ'.repeat(200),summary:'い'.repeat(500),caption:'do not copy the full caption',residence:{prefecture:'private'},children:[{birthDate:'2027-01-01'}],verificationStatus:'verified'});
 assert.equal(normalized.title.length,80);assert.equal(normalized.summary.length,180);assert.equal(normalized.verificationStatus,'unverified');
 assert.equal(normalized.url,'https://www.instagram.com/p/PARENT_123/');assert.equal(normalized.parentingRelevant,true);assert.equal(normalized.isVideo,false);
 assert.equal(normalizeCuratedInstagramPost({...instagram,thumbnailUrl:'https://ignewsimg.s3.ap-northeast-1.wasabisys.com/PARENT_123'}).thumbnailUrl,'https://ignewsimg.s3.ap-northeast-1.wasabisys.com/PARENT_123');
 assert.equal(normalizeCuratedInstagramPost({...instagram,thumbnailUrl:'https://evil.test/tracker'}).thumbnailUrl,undefined);
 assert.equal(normalized.caption,undefined);assert.equal(normalized.children,undefined);assert.equal(normalized.residence,undefined);assert.deepEqual(normalized.tags,['絵本','親子遊び']);
 for(const patch of [{parentingRelevant:false},{id:'instagram-OTHER_123'},{shortcode:'OTHER_123'},{videoId:'OTHER_123'},{sourceName:''},{handle:'bad/handle'}])assert.equal(normalizeCuratedInstagramPost({...instagram,...patch}),null,JSON.stringify(patch));
 const x=normalizeCuratedXPost({...raw,parentingRelevant:true,verificationStatus:'verified'});assert.equal(x.parentingRelevant,true);assert.equal(x.verificationStatus,'unverified');
});
test('Instagram video posts and reels retain format uncertainty and share the exclusion gate',()=>{
 const image=normalizeCuratedInstagramPost({...instagram,title:'親子の地震対策',isVideo:false});assert.ok(image,'the rule excludes videos, not unrelated image posts');
 const post={...instagram,isVideo:true,videoId:instagram.shortcode,videoFormat:'instagram-video'};
 const normalized=normalizeCuratedVideo(post);assert.equal(normalized.platform,'Instagram');assert.equal(normalized.url,'https://www.instagram.com/p/PARENT_123/');assert.equal(normalized.durationSeconds,null);assert.equal(normalized.embedVerified,false);
 assert.equal(normalizeCuratedVideo({...post,isVideo:false}),null,'a photo permalink is not video proof');
 const reel={...instagram,url:'https://www.instagram.com/reel/PARENT_123/'};
 assert.equal(normalizeCuratedInstagramPost(reel).isVideo,true);assert.equal(normalizeCuratedInstagramPost({...reel,durationSeconds:55}).durationSeconds,55);
 for(const title of ['親子の地震対策','子どもの事故予防','便利な掃除だけ']){
  assert.equal(normalizeCuratedInstagramPost({...post,title,summary:'',tags:[]}),null,title);
  assert.equal(normalizeCuratedVideo({...post,title,summary:'',tags:[]}),null,title);
 }
 assert.equal(isRelevantParentingVideo({title:'便利な掃除',tags:['子育て']}),false,'a generic tag cannot authorize a video');
});
test('Instagram failure preserves previous posts, while a successful remote collection controls removal',async()=>{
 const previous=normalizeCuratedInstagramPost(instagram);
 const input={previousTopics:[],incomingTopics:[],previousShorts:[],previousInstagram:[previous],fallback:doc()};
 const failed=await refreshSocialCuration(input,async()=>new Response('unavailable',{status:503}));
 assert.equal(failed.instagramCount,1);assert.equal(failed.instagram[0].id,instagram.id);assert.equal(failed.instagram[0].verificationStatus,'unverified');
 const success=await refreshSocialCuration(input,async()=>Response.json(doc()));assert.equal(success.ok,true);assert.deepEqual(success.instagram,[]);assert.equal(success.instagramCount,0);
 const duplicate=applySocialCuration(doc({instagramPosts:[instagram,instagram]}),[],[]);assert.equal(duplicate.instagram.length,1);
});
test('social collections support thousands of posts and bounded five-megabyte fetches',async()=>{
 const posts=Array.from({length:3200},(_,i)=>({...instagram,id:'instagram-POST_'+i,shortcode:'POST_'+i,url:'https://www.instagram.com/p/POST_'+i+'/'}));
 const document=doc({instagramPosts:posts});const result=applySocialCuration(document,[],[]);assert.equal(result.instagram.length,3000);
 assert.throws(()=>doc({instagramPosts:Array(5001).fill(instagram)}));assert.throws(()=>doc({additionalPosts:Array(5001).fill(raw)}));assert.throws(()=>doc({shorts:Array(5001).fill(video)}));
 const large={...doc({instagramPosts:[instagram]}),sourceNotes:'x'.repeat(1_100_000)};
 const fetched=await refreshSocialCuration({previousTopics:[],incomingTopics:[],previousShorts:[],fallback:doc()},async()=>Response.json(large));assert.equal(fetched.ok,true);assert.equal(fetched.instagramCount,1);
});
