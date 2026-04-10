import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsArray, ValidateNested, IsOptional, IsString, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

export class CreateReturnLineDto {
  @ApiProperty({ description: 'ID de la línea de venta original' })
  @IsInt()
  saleLineId: number;

  @ApiProperty({ description: 'Cantidad a devolver', minimum: 1 })
  @IsInt()
  @Min(1)
  qty: number;

  @ApiPropertyOptional({ description: 'Motivo de la devolución' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateReturnDto {
  @ApiProperty({ description: 'ID de la caja registradora' })
  @IsInt()
  cashRegisterId: number;

  @ApiProperty({ description: 'Método de reembolso al cliente', enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  refundMethod: PaymentMethod;

  @ApiProperty({ description: 'Líneas de venta a devolver', type: [CreateReturnLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateReturnLineDto)
  lines: CreateReturnLineDto[];
}
