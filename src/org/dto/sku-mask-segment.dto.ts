import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Max, Min, ValidateIf } from 'class-validator';

export class SkuMaskSegmentDto {
  @ApiProperty({
    description: 'Segment type',
    enum: ['literal', 'root', 'category', 'product', 'sequence'],
  })
  @IsIn(['literal', 'root', 'category', 'product', 'sequence'])
  type: 'literal' | 'root' | 'category' | 'product' | 'sequence';

  @ApiPropertyOptional({ description: 'Fixed text (required when type is "literal")' })
  @ValidateIf((o) => o.type === 'literal')
  @IsString()
  value?: string;

  @ApiPropertyOptional({
    description: 'Number of characters to take (required for root/category/product)',
  })
  @ValidateIf((o) => o.type === 'root' || o.type === 'category' || o.type === 'product')
  @IsInt()
  @Min(1)
  @Max(4)
  length?: number;

  @ApiPropertyOptional({ description: 'Digits for the sequence counter (required when type is "sequence")' })
  @ValidateIf((o) => o.type === 'sequence')
  @IsInt()
  @Min(1)
  @Max(8)
  digits?: number;
}
