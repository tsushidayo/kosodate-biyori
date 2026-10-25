import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {editorialTopics,editorialSearchText} from '../lib/editorial-quality.ts';

test('saved practical articles remain findable by their family topic',()=>{
 const examples=[
  [{title:'予防接種の予定を確認できる、保護者向け一覧'},'お世話・食事'],
  [{title:'学校に行きたくない気持ちを、どう受け止める？'},'教育・遊び'],
  [{title:'「片づけなさい」が続くときの声かけを見直す'},'教育・遊び'],
  [{title:'赤ちゃんがいる部屋の暖房の選び方'},'グッズ'],
  [{title:'七五三の髪、家で試せる4つのアレンジ'},'おでかけ'],
  [{title:'こども誰でも通園制度の利用案内'},'保育・制度'],
  [{title:'家族で行く海の展示',contentType:'outing'},'おでかけ'],
 ];
 for(const [item,topic]of examples)assert.ok(editorialTopics(item).includes(topic),item.title);
 assert.equal(editorialTopics({title:'横浜市の保育園の申請',prefecture:'神奈川県'}).includes('おでかけ'),false);
});

test('outing searches include public region, facility name and practical details',()=>{
 const item={title:'海の生き物を親子で見る',prefecture:'沖縄県',municipality:'本部町',facilityName:'沖縄美ら海水族館',practicalPoints:['ジンベエザメやマンタを観察'],sourceName:'海洋博公園 公式案内',labels:['親子旅']};
 const text=editorialSearchText(item);
 for(const term of ['沖縄県','本部町','沖縄美ら海水族館','ジンベエザメ','海洋博公園','親子旅'])assert.ok(text.includes(term),term);
 assert.equal(editorialSearchText({...item,children:[{birthDate:'private-value'}]}).includes('private-value'),false);
});

test('reviewed diary exclusions cannot reappear in bundled columns',()=>{
 const editorial=JSON.parse(fs.readFileSync(new URL('../data/editorial.json',import.meta.url)));
 const exclusions=JSON.parse(fs.readFileSync(new URL('../data/editorial-exclusions.json',import.meta.url)));
 const ids=new Set(exclusions.columnIds);
 assert.deepEqual(editorial.columns.filter(item=>ids.has(item.id)).map(item=>item.id),[]);
});
