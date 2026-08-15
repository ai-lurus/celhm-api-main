import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsBoolean, Min } from 'class-validator';

export class AddTicketPartDto {
  @ApiProperty()
  @IsInt()
  variantId: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  qty: number;

  @ApiPropertyOptional({
    description: 'Si es true, suma el precio actual del variant al finalCost del ticket.',
  })
  @IsOptional()
  @IsBoolean()
  includeCost?: boolean;
}

