import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { MovementType } from '@prisma/client';

// Define enum values explicitly for runtime
const MovementTypeEnum = {
  ING: 'ING',
  EGR: 'EGR',
  VTA: 'VTA',
  AJU: 'AJU',
  TRF_OUT: 'TRF_OUT',
  TRF_IN: 'TRF_IN',
} as const;

export class CreateMovementDto {
  @ApiProperty()
  @IsInt()
  branchId: number;

  @ApiProperty()
  @IsInt()
  variantId: number;

  @ApiProperty({ enum: MovementTypeEnum, enumName: 'MovementType' })
  @IsEnum(MovementTypeEnum)
  type: MovementType;

  @ApiProperty()
  @IsInt()
  @Min(1)
  qty: number;

  @ApiProperty({ required: false, description: 'Costo total de la entrada (solo para tipo ING)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalCost?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  folio?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  ticketId?: number;
}
