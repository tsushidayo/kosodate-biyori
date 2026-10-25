import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ageTargetStatus,getFamilyChildren} from '../lib/age-personalization.ts';
import {programMatchesQuery} from '../lib/support-coverage.ts';

const programs=JSON.parse(fs.readFileSync(new URL('../data/care.json',import.meta.url),'utf8')).programs;
const scheme=id=>{const p=programs.find(p=>p.id===id);assert.ok(p,`scheme ${id} exists`);return p;};
const family=birthDate=>getFamilyChildren({children:[{id:'child-1',birthDate}]},'2026-10-25T00:00:00Z');
const manual=(months,schoolGrade)=>[{id:'manual',birthDate:'',months,label:'',ordinal:1,...(schoolGrade===undefined?{}:{schoolGrade})}];

test('all published string-form application steps are searchable',()=>{
 const withStringSteps=programs.filter(p=>p.steps?.some(step=>typeof step==='string'));
 assert.ok(withStringSteps.length>0);
 for(const p of withStringSteps)for(const step of p.steps.filter(step=>typeof step==='string'))assert.equal(programMatchesQuery(p,step),true,`${p.id}: ${step}`);
 const mixed={steps:['受診記録の控えを提出する',{title:'認定通知の受取り',body:'事前面談を予約する'}]};
 assert.equal(programMatchesQuery(mixed,'受診記録 事前面談'),true);
});

test('published 18-year-end schemes distinguish the April birthday boundary',()=>{
 for(const id of ['national-child-benefit','sapporo-medical','yokohama-medical','fukuoka-medical','local-osaka-child-medical','local-akashi-medical','local-wakayama-medical','kanto-kawasaki-medical','kanto-kawaguchi-medical','kanto-urayasu-medical','kanto-tsukuba-medical']){
  assert.equal(ageTargetStatus(scheme(id),family('2008-04-01')),'not-matching',id);
  assert.equal(ageTargetStatus(scheme(id),family('2008-04-02')),'matching',id);
  assert.equal(ageTargetStatus(scheme(id),manual(216)),'unknown',id);
 }
});

test('sick-child care respects minimum months and school grade',()=>{
 const moriyama=scheme('local-moriyama-sick-care');
 assert.equal(ageTargetStatus(moriyama,manual(5,0)),'not-matching');
 assert.equal(ageTargetStatus(moriyama,manual(6,0)),'matching');
 const mibu=scheme('east-v11-mibu-sick-child');
 assert.equal(ageTargetStatus(mibu,family('2018-01-01')),'matching');
 assert.equal(ageTargetStatus(mibu,family('2017-01-01')),'not-matching');
 assert.equal(ageTargetStatus(scheme('local-kashihara-sick-care'),family('2014-04-01')),'not-matching');
 assert.equal(ageTargetStatus(scheme('local-kashihara-sick-care'),family('2014-04-02')),'matching');
});

test('explicit school-grade eligibility handles a 12-year-old junior-high child and a declared prenatal route',()=>{
 const junior={ageGroups:['中学生以上'],minSchoolGrade:7,maxSchoolGrade:9};
 const children=family('2014-04-01');
 assert.equal(children[0].months,150);assert.equal(children[0].schoolGrade,7);
 assert.equal(ageTargetStatus(junior,children),'matching');
 assert.equal(ageTargetStatus(junior,manual(150)),'unknown');
 assert.equal(ageTargetStatus(junior,manual(5)),'not-matching');
 assert.equal(ageTargetStatus(scheme('kanto-saitama-homehelp'),family('2027-05-20')),'matching');
});
