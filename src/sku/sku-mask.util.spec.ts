import { normalizeSkuToken, renderSkuMask, DEFAULT_SKU_MASK } from './sku-mask.util';

describe('normalizeSkuToken', () => {
  it('uppercases and takes the first N characters', () => {
    expect(normalizeSkuToken('cables', 2)).toBe('CA');
  });

  it('strips accents and non-alphanumeric characters', () => {
    expect(normalizeSkuToken('Cable GA Ugreen/Essager', 4)).toBe('CABL');
  });

  it('does not pad when the source is shorter than length', () => {
    expect(normalizeSkuToken('A', 4)).toBe('A');
  });
});

describe('renderSkuMask', () => {
  it('reproduces the CAC0117 example from the mask mockup', () => {
    const result = renderSkuMask(DEFAULT_SKU_MASK, {
      root: 'Accesorios',
      category: 'Cables',
      product: 'Cable GA Ugreen/Essager 1M USB A Ligthin',
      seq: 117,
    });
    expect(result.prefix).toBe('CAC');
    expect(result.full).toBe('CAC0117');
  });

  it('includes literal segments verbatim', () => {
    const result = renderSkuMask(
      [
        { type: 'literal', value: '-' },
        { type: 'category', length: 2 },
        { type: 'sequence', digits: 2 },
      ],
      { root: '', category: 'Cables', product: '', seq: 3 },
    );
    expect(result.full).toBe('-CA03');
  });

  it('produces only the prefix when there is no sequence segment', () => {
    const result = renderSkuMask(
      [{ type: 'root', length: 1 }, { type: 'category', length: 2 }],
      { root: 'Accesorios', category: 'Cables', product: '', seq: 1 },
    );
    expect(result.prefix).toBe('ACA');
    expect(result.full).toBe('ACA');
  });
});
