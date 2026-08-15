import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SkuMaskSegmentDto } from './sku-mask-segment.dto';

describe('SkuMaskSegmentDto', () => {
  it('accepts a valid literal segment', async () => {
    const dto = plainToInstance(SkuMaskSegmentDto, { type: 'literal', value: '-' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts a valid category segment', async () => {
    const dto = plainToInstance(SkuMaskSegmentDto, { type: 'category', length: 2 });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts a valid sequence segment', async () => {
    const dto = plainToInstance(SkuMaskSegmentDto, { type: 'sequence', digits: 4 });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a sequence segment without digits', async () => {
    const dto = plainToInstance(SkuMaskSegmentDto, { type: 'sequence' });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects an out-of-range length', async () => {
    const dto = plainToInstance(SkuMaskSegmentDto, { type: 'category', length: 10 });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects an unknown type', async () => {
    const dto = plainToInstance(SkuMaskSegmentDto, { type: 'bogus' });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
