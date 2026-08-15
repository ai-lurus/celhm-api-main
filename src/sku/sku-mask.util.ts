export type SkuMaskSegment =
  | { type: 'literal'; value: string }
  | { type: 'root' | 'category' | 'product'; length: number }
  | { type: 'sequence'; digits: number };

export const DEFAULT_SKU_MASK: SkuMaskSegment[] = [
  { type: 'category', length: 2 },
  { type: 'product', length: 1 },
  { type: 'sequence', digits: 4 },
];

export interface SkuMaskContext {
  root: string;
  category: string;
  product: string;
  seq: number;
}

export function normalizeSkuToken(text: string, length: number): string {
  const cleaned = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return cleaned.slice(0, length);
}

export function renderSkuMask(
  segments: SkuMaskSegment[],
  ctx: SkuMaskContext,
): { prefix: string; full: string } {
  let prefix = '';
  let sequencePart = '';

  for (const segment of segments) {
    switch (segment.type) {
      case 'literal':
        prefix += segment.value;
        break;
      case 'root':
        prefix += normalizeSkuToken(ctx.root, segment.length);
        break;
      case 'category':
        prefix += normalizeSkuToken(ctx.category, segment.length);
        break;
      case 'product':
        prefix += normalizeSkuToken(ctx.product, segment.length);
        break;
      case 'sequence':
        sequencePart = String(ctx.seq).padStart(segment.digits, '0');
        break;
    }
  }

  return { prefix, full: prefix + sequencePart };
}
