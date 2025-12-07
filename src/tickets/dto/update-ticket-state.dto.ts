import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsDecimal } from 'class-validator';
import { TicketState } from '@prisma/client';

// Define enum values explicitly for runtime
const TicketStateEnum = {
  RECIBIDO: 'RECIBIDO',
  DIAGNOSTICO: 'DIAGNOSTICO',
  ESPERANDO_PIEZA: 'ESPERANDO_PIEZA',
  EN_REPARACION: 'EN_REPARACION',
  REPARADO: 'REPARADO',
  ENTREGADO: 'ENTREGADO',
  CANCELADO: 'CANCELADO',
} as const;

export class UpdateTicketStateDto {
  @ApiProperty({ enum: TicketStateEnum, enumName: 'TicketState' })
  @IsEnum(TicketStateEnum)
  state: TicketState;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  solution?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDecimal()
  estimatedCost?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDecimal()
  finalCost?: number;

  @ApiProperty({ required: false, description: 'Anticipo recibido' })
  @IsOptional()
  @IsDecimal()
  advancePayment?: number;

  @ApiProperty({ required: false, description: 'Notas internas visibles solo para personal' })
  @IsOptional()
  @IsString()
  internalNotes?: string;
}

