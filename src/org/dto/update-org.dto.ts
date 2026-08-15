import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsNumber, IsInt, Min, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TicketLegendDto } from './ticket-legend.dto';
import { SkuMaskSegmentDto } from './sku-mask-segment.dto';

export class UpdateOrgDto {
    @ApiPropertyOptional({ description: 'Organization name' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ description: 'Organization logo URL' })
    @IsOptional()
    @IsString()
    logo?: string;

    @ApiPropertyOptional({ description: 'Organization address' })
    @IsOptional()
    @IsString()
    address?: string;

    @ApiPropertyOptional({ description: 'Organization phone' })
    @IsOptional()
    @IsString()
    phone?: string;

    @ApiPropertyOptional({ description: 'Organization email' })
    @IsOptional()
    @IsEmail()
    email?: string;

    @ApiPropertyOptional({ description: 'Organization tax ID' })
    @IsOptional()
    @IsString()
    taxId?: string;

    @ApiPropertyOptional({ description: 'Organization website' })
    @IsOptional()
    @IsString()
    website?: string;

    @ApiPropertyOptional({ description: 'Organization currency' })
    @IsOptional()
    @IsString()
    currency?: string;

    @ApiPropertyOptional({ description: 'Organization VAT rate' })
    @IsOptional()
    @IsNumber()
    vatRate?: number;

    @ApiPropertyOptional({ description: 'Number of paid purchases needed to auto-promote a customer to "Cliente Frecuente"' })
    @IsOptional()
    @IsInt()
    @Min(1)
    frequentBuyerThreshold?: number;

    @ApiPropertyOptional({
        description: 'Footer legends printed at the bottom of tickets, in display order',
        type: [TicketLegendDto],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => TicketLegendDto)
    ticketLegends?: TicketLegendDto[];

    @ApiPropertyOptional({
        description: 'SKU mask configuration segments, in display order',
        type: [SkuMaskSegmentDto],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SkuMaskSegmentDto)
    skuMaskConfig?: SkuMaskSegmentDto[];
}
