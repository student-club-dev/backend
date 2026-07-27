import { AttributeSpec } from '../../catalog/domain/entities/attribute-spec.entity';
import { AttributeFieldType } from '../../catalog/domain/enums/attribute-field-type.enum';
import { RawAttributeCount } from '../domain/facets.model';
import { shapeAttributeFacets } from './attribute-facet.shaper';

function spec(key: string, kind: AttributeFieldType, businessType = 'PLAYSTATION'): AttributeSpec {
  return { businessType, key, label: key, kind, required: false, suffix: null, options: null };
}

describe('shapeAttributeFacets', () => {
  it('drops keys the catalog does not declare, including the reserved ones', () => {
    const raw: RawAttributeCount[] = [
      { key: 'hallType', value: 'VIP', count: 3 },
      { key: '_regular', value: '1', count: 9 },
      { key: '_phone', value: '+998901234567', count: 4 },
      { key: 'ghost', value: 'x', count: 7 },
    ];

    const shaped = shapeAttributeFacets(raw, [spec('hallType', AttributeFieldType.SELECT)]);

    expect(shaped.map((a) => a.key)).toEqual(['hallType']);
  });

  it('splits comma-joined TAGS values and sums their counts', () => {
    const raw: RawAttributeCount[] = [
      { key: 'games', value: 'CS2,Dota 2', count: 2 },
      { key: 'games', value: 'CS2', count: 5 },
    ];

    const [games] = shapeAttributeFacets(raw, [spec('games', AttributeFieldType.TAGS)]);

    expect(games.values).toEqual([
      { value: 'CS2', count: 7 },
      { value: 'Dota 2', count: 2 },
    ]);
  });

  it('reports NUMBER attributes as a range, not a value list', () => {
    const raw: RawAttributeCount[] = [
      { key: 'portionGrams', value: '450', count: 2 },
      { key: 'portionGrams', value: '150', count: 1 },
      { key: 'portionGrams', value: '800', count: 3 },
    ];

    const [portion] = shapeAttributeFacets(raw, [spec('portionGrams', AttributeFieldType.NUMBER)]);

    expect(portion.range).toEqual({ min: 150, max: 800 });
    expect(portion.values).toBeUndefined();
  });

  it('ignores non-numeric values when computing a NUMBER range', () => {
    const raw: RawAttributeCount[] = [
      { key: 'portionGrams', value: '450', count: 2 },
      { key: 'portionGrams', value: 'katta', count: 1 },
    ];

    const [portion] = shapeAttributeFacets(raw, [spec('portionGrams', AttributeFieldType.NUMBER)]);

    expect(portion.range).toEqual({ min: 450, max: 450 });
  });

  it('exposes no values for TEXT — it is only searchable with CONTAINS', () => {
    const raw: RawAttributeCount[] = [{ key: 'brand', value: 'Zara', count: 4 }];

    const [brand] = shapeAttributeFacets(raw, [spec('brand', AttributeFieldType.TEXT)]);

    expect(brand.values).toBeUndefined();
    expect(brand.range).toBeUndefined();
    expect(brand.operators).toEqual(['EQ', 'NEQ', 'CONTAINS', 'EXISTS']);
  });

  it('lists the operators the server allows for each kind (Q6)', () => {
    const raw: RawAttributeCount[] = [{ key: 'isHalal', value: 'true', count: 1 }];

    const [halal] = shapeAttributeFacets(raw, [spec('isHalal', AttributeFieldType.BOOLEAN)]);

    expect(halal.operators).toEqual(['EQ', 'EXISTS']);
  });

  it('only reports values that actually occur, sorted by count', () => {
    const raw: RawAttributeCount[] = [
      { key: 'spicyLevel', value: 'Yengil', count: 4 },
      { key: 'spicyLevel', value: "Yo'q", count: 9 },
    ];

    const [spicy] = shapeAttributeFacets(raw, [spec('spicyLevel', AttributeFieldType.SELECT)]);

    // The catalog declares four levels; only the two present in the data come back (§9).
    expect(spicy.values).toEqual([
      { value: "Yo'q", count: 9 },
      { value: 'Yengil', count: 4 },
    ]);
  });

  it('merges the same key across several business types into one entry', () => {
    const raw: RawAttributeCount[] = [{ key: 'isHalal', value: 'true', count: 6 }];
    const specs = [
      spec('isHalal', AttributeFieldType.BOOLEAN, 'NATIONAL_FOOD'),
      spec('isHalal', AttributeFieldType.BOOLEAN, 'FAST_FOOD'),
    ];

    const shaped = shapeAttributeFacets(raw, specs);

    expect(shaped).toHaveLength(1);
    expect(shaped[0].appliesToTypes).toEqual(['NATIONAL_FOOD', 'FAST_FOOD']);
  });

  it('keeps a declared attribute with no data, so the client can still show it as empty', () => {
    const shaped = shapeAttributeFacets([], [spec('hasWifi', AttributeFieldType.BOOLEAN)]);

    expect(shaped).toHaveLength(1);
    expect(shaped[0].values).toBeUndefined();
  });
});
