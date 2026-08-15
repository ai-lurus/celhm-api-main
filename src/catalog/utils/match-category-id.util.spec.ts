import { matchCategoryId, CategoryRef } from './match-category-id.util';

describe('matchCategoryId', () => {
  const categories: CategoryRef[] = [
    { id: 1, name: 'Accesorios' },
    { id: 2, name: 'Cables' },
  ];

  it('matches by exact name', () => {
    expect(matchCategoryId('Cables', categories)).toBe(2);
  });

  it('matches case-insensitively and ignoring whitespace', () => {
    expect(matchCategoryId('  cables  ', categories)).toBe(2);
  });

  it('returns null when there is no match', () => {
    expect(matchCategoryId('Pantallas', categories)).toBeNull();
  });

  it('returns null for a null/empty category name', () => {
    expect(matchCategoryId(null, categories)).toBeNull();
    expect(matchCategoryId('', categories)).toBeNull();
  });
});
