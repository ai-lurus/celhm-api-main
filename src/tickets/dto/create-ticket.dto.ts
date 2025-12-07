import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, IsEmail, IsPhoneNumber, IsDecimal } from 'class-validator';

export class CreateTicketDto {
  @ApiProperty()
  @IsInt()
  branchId: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  customerId?: number;

  @ApiProperty()
  @IsString()
  customerName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiProperty()
  @IsString()
  device: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  serialNumber?: string;

  @ApiProperty({ required: false, description: 'IMEI del dispositivo' })
  @IsOptional()
  @IsString()
  imei?: string;

  @ApiProperty()
  @IsString()
  problem: string;

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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  estimatedTime?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  warrantyDays?: number;

  @ApiProperty({ required: false, description: 'Anticipo recibido' })
  @IsOptional()
  @IsDecimal()
  advancePayment?: number;

  @ApiProperty({ required: false, description: 'Notas internas visibles solo para personal' })
  @IsOptional()
  @IsString()
  internalNotes?: string;
}

