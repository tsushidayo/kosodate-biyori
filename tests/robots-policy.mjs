import test from 'node:test';
import assert from 'node:assert/strict';
import {robotsAllows} from '../scripts/robots-policy.mjs';
test('marketplace wildcards block private actions without blocking public listing pages',()=>{
 const policy='User-agent: *\nDisallow: /item/*/edit\nDisallow: /item/*/question\nDisallow: /*?*sort=\nDisallow: /search/\nAllow: /search/$';
 assert.equal(robotsAllows(policy,'/item/z123456789'),true);
 assert.equal(robotsAllows(policy,'/item/z123456789/edit'),false);
 assert.equal(robotsAllows(policy,'/item/z123456789/question'),false);
 assert.equal(robotsAllows(policy,'/item/z123456789?sort=price'),false);
 assert.equal(robotsAllows(policy,'/search/'),true);
 assert.equal(robotsAllows(policy,'/search/anything'),false);
});
test('groups, matching precedence and encoded paths retain explicit access restrictions',()=>{
 const policy='Disallow: /ignored\nUser-agent: *\nDisallow: /\nUser-agent: other\nUser-agent: KosodateBiyori\nAllow: /public/\nDisallow: /public/private\nUser-agent: KOSODATEBIYORI\nAllow: /same\nDisallow: /same\nDisallow: /encoded/%62az';
 assert.equal(robotsAllows(policy,'/public/item'),true);
 assert.equal(robotsAllows(policy,'/public/private'),false);
 assert.equal(robotsAllows(policy,'/same'),true);
 assert.equal(robotsAllows(policy,'/encoded/baz'),false);
 assert.equal(robotsAllows(policy,'/public/item','UnknownBot'),false);
 assert.equal(robotsAllows('User-agent: *\nDisallow: /','/item/'),false);
});
