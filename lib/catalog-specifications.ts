type Item = Record<string, any>;

export type CatalogSpecificationKey = 'kind' | 'size' | 'pieces' | 'packCount' | 'capacity' | 'color';
export type CatalogSpecificationFilters = Partial<Record<CatalogSpecificationKey, string>>;
export type CatalogSpecificationFacet = {
  key: CatalogSpecificationKey;
  label: string;
  options: Array<{value: string; label: string; count: number}>;
};

const fields: Array<{key: CatalogSpecificationKey; label: string}> = [
  {key: 'kind', label: '種類'},
  {key: 'size', label: 'サイズ'},
  {key: 'pieces', label: '1袋・1個の枚数'},
  {key: 'packCount', label: '入り数'},
  {key: 'capacity', label: '内容量'},
  {key: 'color', label: '色'},
];
const clean = (value: unknown) => typeof value === 'string' ? value.normalize('NFKC').replace(/\s+/g, ' ').trim() : '';
const positiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;
const numberLabel = (value: string | number) => Number(value).toLocaleString('ja-JP', {maximumFractionDigits: 2, useGrouping: false});

function diaperKind(product: Item, name: string) {
  // Accessories such as an おむつ用ごみ箱 have no diaper type or sheet count.
  if (/手口(?:ふき|拭き)/.test(name)) return '手口ふき';
  if (/おしり(?:ふき|拭き|ナップ)/.test(name)) return 'おしりふき';
  if (/パッド/.test(name)) return 'パッド';
  const stated = clean(product.diaperType);
  if (/テープ/.test(stated)) return 'テープ';
  if (/パンツ/.test(stated)) return 'パンツ';
  if (/テープ/.test(name)) return 'テープ';
  if (/パンツ/.test(name)) return 'パンツ';
  return '';
}

function diaperSize(product: Item, name: string, kind: string) {
  const stated = clean(product.size);
  if (stated) return stated;
  if (kind !== 'パンツ' && kind !== 'テープ') return '';
  if (/スーパービッグ/.test(name)) return 'スーパービッグ';
  if (/(?:ビッグ|BIG)(?:サイズ)?より大きい|ビッグ大/i.test(name)) return 'ビッグより大きい';
  if (/ビッグ|BIG/i.test(name)) return 'ビッグ';
  if (/新生児/.test(name)) return '新生児';
  return name.match(/(?:パンツ|テープ)\s*(S|M|L)(?=サイズ|たっち|はいはい|\s|\d|$)/i)?.[1].toUpperCase()
    || name.match(/(?:^|\s|[〔\[【])(S|M|L)(?=サイズ|\s|\d|$)/i)?.[1].toUpperCase()
    || '';
}

function sheetPackaging(product: Item, name: string, kind: string): {pieces?: number; packs?: number} {
  const texts = [name, clean(product.capacity), clean(product.unit), clean(product.packageLabel)];
  // A name such as 80枚×8個 describes each pack; the unit may only say 640枚.
  for (const text of texts) {
    const multiple = text.match(/(\d+)\s*枚(?:入)?\s*[×x✕]\s*(\d+)/i)
      || text.match(/(\d+)\s*枚\s*(\d+)\s*P\b/i);
    if (multiple) return {pieces: Number(multiple[1]), packs: Number(multiple[2])};
  }
  const pieces = Number(texts.map(text => text.match(/(\d+)\s*枚/)).find(Boolean)?.[1]);
  if (!positiveInteger(pieces)) return {};
  const explicitPack = texts.map(text => text.match(/(?:^|[【\[\s・])(?:×)?\s*(\d+)\s*(?:個|袋|パック)(?:入|パック|】|\]|\s|$)/)).find(Boolean);
  if (explicitPack && positiveInteger(Number(explicitPack[1]))) return {pieces, packs: Number(explicitPack[1])};
  const singleP = texts.map(text => text.match(/\d+\s*枚\s*(\d+)\s*P(?:\b|$)/i)).find(Boolean);
  if (singleP) return {pieces, packs: Number(singleP[1])};

  // Offer metadata is useful only when it describes this catalog's exact sale unit.
  // A case offer for 4×46 sheets cannot change a catalog item of 46 sheets to 4 packs.
  const total = Number(clean(product.unit).match(/^(\d+)\s*枚$/)?.[1]);
  const packaging = (Array.isArray(product.offers) ? product.offers : []).filter((offer: Item) =>
    !offer.derivedOffer && positiveInteger(total) && offer.quantity === total
    && positiveInteger(offer.packs) && positiveInteger(offer.piecesPerPack)
    && offer.packs * offer.piecesPerPack === total);
  const knownPackages = [...new Set(packaging.map((offer: Item) => `${offer.piecesPerPack}|${offer.packs}`))];
  if (knownPackages.length === 1) {
    const [perPack, packs] = String(knownPackages[0]).split('|').map(Number);
    return {pieces: perPack, packs};
  }
  const simpleDiaper = ['テープ', 'パンツ'].includes(kind)
    && !/まとめ買い|ケース|セット|パック|\d+\s*(?:個|袋)|[×x✕]/i.test(name);
  return {pieces, ...(simpleDiaper ? {packs: 1} : {})};
}

function capacity(product: Item) {
  // Use the catalog's content fields, never ages, target weights, or usage doses.
  for (const text of [clean(product.capacity), clean(product.unit)]) {
    const match = text.match(/^(\d+(?:\.\d+)?)\s*(ml|g)(?=$|[\s／/・×x(])/i);
    if (match && Number(match[1]) > 0) return numberLabel(match[1]) + match[2].toLowerCase();
  }
  return '';
}

/** Product-selection facts only. These values never combine SKUs or alter price quantities. */
export function catalogSpecifications(product: Item): CatalogSpecificationFilters {
  const result: CatalogSpecificationFilters = {};
  const name = clean(product.name);
  const statedSize = clean(product.size), color = clean(product.color);
  if (statedSize) result.size = statedSize;
  if (color) result.color = color;
  if (String(product.category || '').includes('おむつ')) {
    const kind = diaperKind(product, name), size = diaperSize(product, name, kind);
    if (kind) result.kind = kind;
    if (size) result.size = size;
    const packaging = sheetPackaging(product, name, kind);
    if (positiveInteger(packaging.pieces)) result.pieces = `${packaging.pieces}枚`;
    if (positiveInteger(packaging.packs)) result.packCount = `${packaging.packs}個`;
  }
  if (product.category === 'ミルク') {
    result.kind = product.formulation === 'liquid' || /液体|らくらくミルク/.test(name)
      ? '液体ミルク' : product.formulation === 'solid' || /キューブ/.test(name) ? 'キューブ' : '粉ミルク';
  }
  const content = capacity(product);
  if (content) result.capacity = content;
  return result;
}

function matches(values: CatalogSpecificationFilters, filters: CatalogSpecificationFilters, except?: CatalogSpecificationKey) {
  return fields.every(({key}) => key === except || !filters[key] || values[key] === filters[key]);
}

export function matchesCatalogSpecifications(product: Item, filters: CatalogSpecificationFilters = {}) {
  return matches(catalogSpecifications(product), filters);
}

const sizeOrder = ['新生児', 'S', 'M', 'L', 'ビッグ', 'ビッグより大きい', 'スーパービッグ'];
const kindOrder = ['テープ', 'パンツ', 'おしりふき', '手口ふき', 'パッド', '粉ミルク', '液体ミルク', 'キューブ'];
const natural = new Intl.Collator('ja-JP', {numeric: true});
function compareValues(key: CatalogSpecificationKey, a: string, b: string) {
  const order = key === 'size' ? sizeOrder : key === 'kind' ? kindOrder : [];
  const ai = order.indexOf(a), bi = order.indexOf(b);
  if (ai >= 0 || bi >= 0) return (ai >= 0 ? ai : order.length) - (bi >= 0 ? bi : order.length) || natural.compare(a, b);
  return natural.compare(a, b);
}

/** Each facet keeps every known value, counting products matching the OTHER selections. */
export function getCatalogSpecificationFacets(products: Item[], filters: CatalogSpecificationFilters = {}): CatalogSpecificationFacet[] {
  const specifications = products.map(catalogSpecifications);
  return fields.flatMap(({key, label}) => {
    const values = [...new Set(specifications.map(value => value[key]).filter((value): value is string => !!value))];
    if (!values.length) return [];
    return [{key, label, options: values.sort((a, b) => compareValues(key, a, b)).map(value => ({
      value, label: value,
      count: specifications.filter(specification => specification[key] === value && matches(specification, filters, key)).length,
    }))}];
  });
}
