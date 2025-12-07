// @ts-nocheck
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsNumber,
} from 'class-validator';

export class UpdateTicketDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  device?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serialNumber?: string;

  @ApiPropertyOptional({ description: 'IMEI del dispositivo' })
  @IsOptional()
  @IsString()
  imei?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  problem?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  solution?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  estimatedCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  finalCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  estimatedTime?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  warrantyDays?: number;

  @ApiPropertyOptional({ description: 'Anticipo recibido' })
  @IsOptional()
  @IsNumber()
  advancePayment?: number;

  @ApiPropertyOptional({ description: 'Notas internas visibles solo para personal' })
  @IsOptional()
  @IsString()
  internalNotes?: string;
}


