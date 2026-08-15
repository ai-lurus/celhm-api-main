export interface CategoryRef {
  id: number;
  name: string;
}

export function matchCategoryId(
  categoryName: string | null | undefined,
  categories: CategoryRef[],
): number | null {
  if (!categoryName) return null;
  const normalized = categoryName.trim().toLowerCase();
  const match = categories.find((c) => c.name.trim().toLowerCase() === normalized);
  return match ? match.id : null;
}
