import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {catalogSpecifications, matchesCatalogSpecifications, getCatalogSpecificationFacets} from '../lib/catalog-specifications.ts';

const products = JSON.parse(fs.readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8')).products;
const product = id => {const result = products.find(item => item.id === id); assert.ok(result, id); return result;};

test('catalog sheet filters distinguish per-pack contents from the total or an offer sale unit', () => {
  assert.deepEqual(catalogSpecifications(product('wipes-su-640')), {kind: 'おしりふき', pieces: '80枚', packCount: '8個'});
  assert.deepEqual(catalogSpecifications(product('pigeon-1034283-43835591000285')), {kind: 'おしりふき', pieces: '50枚', packCount: '2個'});
  const doubleDiaper = catalogSpecifications(product('akahon-230939000'));
  assert.equal(doubleDiaper.pieces, '58枚'); assert.equal(doubleDiaper.packCount, '2個');
  const singleWithCaseQuote = catalogSpecifications(product('merries-premium-m46'));
  assert.equal(singleWithCaseQuote.pieces, '46枚'); assert.equal(singleWithCaseQuote.packCount, '1個');
  assert.equal(catalogSpecifications({name: 'おしりふき', category: 'おむつ・おしりふき', unit: '1個', offers: [{quantity: 640}]}).pieces, undefined);
});

test('diaper choices support both older names and explicit manufacturer facts without turning accessories into diapers', () => {
  assert.deepEqual(catalogSpecifications(product('merries-premium-m46')), {kind: 'パンツ', size: 'M', pieces: '46枚', packCount: '1個'});
  assert.equal(catalogSpecifications(product('merries-premium-tape-nb60')).size, '新生児');
  const current = catalogSpecifications(product('uc-4903111243921'));
  assert.equal(current.kind, 'テープ'); assert.equal(current.size, '新生児'); assert.equal(current.pieces, '30枚');
  assert.equal(current.capacity, undefined, 'newborn target weight is not the product content');
  assert.equal(catalogSpecifications(product('uc-4903111160273')).kind, '手口ふき');
  assert.equal(catalogSpecifications(product('pigeon-1046483-46896852107485')).size, undefined);
});

test('milk forms and content amounts stay distinct while other categories use stated sizes, colors and content', () => {
  assert.deepEqual(catalogSpecifications(product('haihai-810')), {kind: '粉ミルク', capacity: '810g'});
  assert.deepEqual(catalogSpecifications(product('v11-4902705130678')), {kind: '液体ミルク', capacity: '240ml'});
  assert.deepEqual(catalogSpecifications(product('v11-4902705129535')), {kind: 'キューブ', capacity: '108g'});
  assert.deepEqual(catalogSpecifications({category: '衣類・寝具', name: '肌着2枚組 生後3か月', size: '５０〜６０cm', color: 'ホワイト', unit: '1組'}), {size: '50〜60cm', color: 'ホワイト'});
  assert.equal(catalogSpecifications(product('saraya-25493')).capacity, '600ml');
  assert.equal(catalogSpecifications({category: '健康・衛生', name: '体重5000gまで 1回10ml使用', unit: '1個'}).capacity, undefined);
});

test('catalog facets count other selections while retaining zero-count alternatives and unknown facts cannot match', () => {
  const catalog = [
    {name: 'パンツM 46枚', category: 'おむつ・おしりふき', unit: '46枚'},
    {name: 'パンツL 44枚', category: 'おむつ・おしりふき', unit: '44枚'},
    {name: 'テープM 48枚', category: 'おむつ・おしりふき', unit: '48枚'},
    {name: 'おしりふき80枚×8個', category: 'おむつ・おしりふき', unit: '640枚'},
    {name: 'その他', category: 'おむつ・おしりふき', unit: '1点'},
  ];
  const filters = {kind: 'パンツ', size: 'M'};
  assert.deepEqual(catalog.filter(item => matchesCatalogSpecifications(item, filters)).map(item => item.name), ['パンツM 46枚']);
  const facets = getCatalogSpecificationFacets(catalog, filters);
  assert.deepEqual(facets.map(facet => facet.key), ['kind', 'size', 'pieces', 'packCount']);
  assert.deepEqual(facets.find(facet => facet.key === 'size').options.map(option => [option.value, option.count]), [['M', 1], ['L', 1]]);
  assert.equal(facets.find(facet => facet.key === 'kind').options.find(option => option.value === 'テープ').count, 1);
  assert.equal(facets.find(facet => facet.key === 'pieces').options.find(option => option.value === '80枚').count, 0);
  assert.equal(facets.find(facet => facet.key === 'pieces').options.find(option => option.value === '46枚').count, 1);
  assert.equal(matchesCatalogSpecifications(catalog[4], {size: 'M'}), false);
  assert.deepEqual(getCatalogSpecificationFacets([{name: '内容が未記載', unit: '1点'}]), []);
});
