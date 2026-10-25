import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {deriveEditorialTags} from '../lib/editorial-tags.ts';
import {refreshSocialCuration} from '../lib/social-curation.ts';
import {refreshGithubCollections} from '../lib/github-collections.ts';
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const load=source=>import('data:text/javascript;base64,'+Buffer.from(compile(source)).toString('base64'));
const age=await load(await fs.readFile(new URL('../lib/age-personalization.ts',import.meta.url),'utf8'));
const now=new Date('2026-10-25T00:00:00Z');
const child=(id,birthDate)=>({id,birthDate});
const family={children:[child('child-1','2026-04-25'),child('child-2','2020-01-21')],personalize:true};

test('completed months follow the Tokyo calendar, including midnight and month-end anniversaries',()=>{
  const p={children:[child('child-1','2025-10-25')]};
  assert.equal(age.getFamilyChildren(p,'2026-10-24T14:59:59Z')[0].months,11);
  assert.equal(age.getFamilyChildren(p,'2026-10-24T15:00:00Z')[0].months,12);
  assert.equal(age.completedMonths('2026-01-31','2026-02-27T15:00:00Z'),1);
  assert.equal(age.completedMonths('2024-02-29','2025-02-27T15:00:00Z'),12);
  assert.equal(age.completedMonths('2026-04-25','2026-10-23T15:00:00Z'),5);
});
test('five-child slots and legacy profiles keep stable ordinals without mutating private settings',()=>{
  const p={children:[child('child-3','2024-10-25'),child('child-5','2020-01-21')]};
  const before=structuredClone(p);const children=age.getFamilyChildren(p,now);
  assert.deepEqual(children.map(c=>[c.id,c.ordinal,c.months,c.label]),[['child-3',3,24,'2歳'],['child-5',5,81,'6歳9か月']]);
  assert.deepEqual(p,before);
  assert.equal(age.getFamilyChildren({childDate:'2026-01-21'},now)[0].id,'child-1');
  assert.equal(age.getFamilyChildren({children:[],childDate:'2026-01-21'},now).length,0);
  const migrated=age.normalizeFamilyProfile({childDate:'2026-01-21'});
  assert.equal(migrated.personalize,false);assert.equal(migrated.children[0].birthDate,'2026-01-21');
});
test('a current pregnancy can accompany siblings, while past or invalid due dates do not add a child',()=>{
  const children=age.getFamilyChildren({...family,dueDate:'2027-01-21'},now);
  assert.equal(children.length,3);assert.equal(children[2].id,'pregnancy');assert.equal(children[2].months,-1);
  assert.equal(age.getFamilyChildren({...family,dueDate:'2026-02-31'},now).length,2);
  assert.equal(age.getFamilyChildren({...family,dueDate:'2026-01-21'},now).length,2);
  assert.equal(age.getFamilyChildren({children:[1,2,3,4,5].map(n=>child('child-'+n,'2024-01-01')),dueDate:'2027-01-01'},now).length,5);
});
test('sibling matching uses union of explicit targets and respects exact month limits',()=>{
  const children=age.getFamilyChildren(family,now);
  assert.equal(age.ageTargetStatus({minAgeMonths:6,maxAgeMonths:35},children),'matching');
  assert.equal(age.ageTargetStatus({minAgeMonths:7,maxAgeMonths:35},children),'not-matching');
  assert.equal(age.ageTargetStatus({ageGroups:['小学生']},children),'matching');
  assert.equal(age.ageTargetStatus({ageGroups:['1〜2歳']},children),'not-matching');
  assert.equal(age.ageTargetStatus({ageGroups:['0歳'],minAgeMonths:7},children),'not-matching');
  assert.equal(age.ageTargetStatus({ageRanges:[{minMonth:0,maxMonth:5},{minMonth:72,maxMonth:100}]},children),'matching');
  assert.equal(age.ageTargetStatus({ageGroups:['全年齢']},children),'matching');
});
test('unknown targets stay identifiable and are never guessed from titles or notes',()=>{
  const children=age.getFamilyChildren(family,now);
  assert.equal(age.ageTargetStatus({title:'生後6か月の離乳食',ageNote:'0歳におすすめ'},children),'unknown');
  assert.equal(age.ageTargetStatus({minAgeMonths:10,maxAgeMonths:5},children),'unknown');
  assert.equal(age.ageTargetStatus({ageGroups:['とても小さい子']},children),'unknown');
  assert.equal(age.matchesFamilyAge({},children),true);assert.equal(age.matchesFamilyAge({},children,false),false);
});
test('the default always shows all ages; registered dates activate filters only after explicit opt-in',()=>{
  const items=[{id:'infant',ageGroups:['0歳']},{id:'toddler',ageGroups:['1〜2歳']},{id:'school',ageGroups:['小学生']},{id:'general'}];
  assert.equal(age.personalizeItems(items,{},now),items);
  assert.equal(age.personalizeItems(items,{children:family.children},now),items);
  assert.deepEqual(age.personalizeItems(items,family,now).map(i=>i.id),['infant','school','general']);
  assert.deepEqual(age.personalizeItems(items,family,now,false).map(i=>i.id),['infant','school']);
  assert.equal(age.personalizeItems(items,{personalize:true,children:[]},now),items);
  assert.equal(age.personalizationEnabled(family,now),true);
});

test('school-year eligibility follows the April 1 birthday boundary',()=>{
  const early=age.getFamilyChildren({children:[child('child-1','2016-04-01')]},now);
  const late=age.getFamilyChildren({children:[child('child-1','2016-04-02')]},now);
  assert.equal(early[0].schoolGrade,5);assert.equal(late[0].schoolGrade,4);
  assert.equal(age.schoolGradeForBirthday('2016-04-01','2026-03-31T00:00:00Z'),4);
  const lessons={ageGroups:['小学生','中学生以上'],minSchoolGrade:5,maxSchoolGrade:9};
  assert.equal(age.ageTargetStatus(lessons,early),'matching');
  assert.equal(age.ageTargetStatus(lessons,late),'not-matching');
  assert.equal(age.ageTargetStatus(lessons,[{id:'age-only',birthDate:'',months:125,label:'',ordinal:1}]),'unknown');
});

// Exercise actual private storage and its validation without loading a Cloudflare runtime.
const sqlite=new DatabaseSync(':memory:');sqlite.exec(await fs.readFile(new URL('../drizzle/0000_mature_marvel_boy.sql',import.meta.url),'utf8'));
const binding={prepare(sql){return{values:[],bind(...values){this.values=values;return this},async first(){return sqlite.prepare(sql).get(...this.values)??null},async all(){return{results:sqlite.prepare(sql).all(...this.values)}},async run(){return{meta:{changes:Number(sqlite.prepare(sql).run(...this.values).changes)}}}}},async batch(statements){const out=[];for(const s of statements)out.push(await s.run());return out}};
globalThis.__AGE_TEST_ENV={DB:binding};
globalThis.__AGE_TEST_HELPERS={deriveEditorialTags,refreshSocialCuration,refreshGithubCollections};
let storeSource=(await fs.readFile(new URL('../lib/parenting-store.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
storeSource='const env=globalThis.__AGE_TEST_ENV;const {deriveEditorialTags,refreshSocialCuration,refreshGithubCollections}=globalThis.__AGE_TEST_HELPERS;const careSeed={stages:[],guides:[],programs:[]},shopSeed={products:[],chains:[]},editorialSeed={news:[],columns:[],topics:[],shorts:[]},feedsSeed=[],socialCurationSeed={schemaVersion:1,checkedAt:"2026-10-25",reviews:[],additionalPosts:[],shorts:[]};\n'+storeSource;
const store=await load(storeSource);
test('profile validation rejects future, duplicate, invalid dates and more than five children',()=>{
  const valid={children:[child('child-1','2024-02-29'),child('child-2','')],personalize:true,activeChildId:'child-1'};
  assert.equal(store.validateProfile(valid),valid);
  const bad=[
    {children:[child('child-1','9999-01-01')]},
    {children:[child('child-1','2026-02-31')]},
    {children:[child('child-1','2026-01-01'),child('child-1','2024-01-01')]},
    {children:[1,2,3,4,5,6].map(n=>child('child-'+n,'2024-01-01'))},
    {children:{id:'child-1',birthDate:'2024-01-01'}},
    {children:[child('child-1',null)]},
    {childDate:'9999-01-01'},
    {personalize:'true'},
    {activeChildId:'<script>'}
  ];for(const p of bad)assert.throws(()=>store.validateProfile(p),e=>e.status===400,JSON.stringify(p));
});
test('birthdays are stored per signed-in user and never appear in shared content',async()=>{
  await store.saveProfile('parent-a',family,0);
  const saved=await store.readProfile('parent-a');assert.deepEqual(saved.profile.children,family.children);
  const other=await store.readProfile('parent-b');assert.deepEqual(other.profile.children,[]);assert.equal(other.profile.personalize,false);
  const shared=await store.content();const text=JSON.stringify(shared);
  for(const birthday of family.children.map(c=>c.birthDate))assert.equal(text.includes(birthday),false);
  assert.equal('children' in shared,false);assert.equal('profile' in shared,false);
});
