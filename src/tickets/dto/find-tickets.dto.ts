import { ApiPropertyOptional } from '@nestjs/swagger';
import { TicketState } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min, Max, IsDate, IsBoolean } from 'class-validator';

export class FindTicketsDto {
    @ApiPropertyOptional({ minimum: 1, default: 1 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @IsOptional()
    page?: number = 1;

    @ApiPropertyOptional({ minimum: 1, maximum: 1000, default: 10 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(1000)
    @IsOptional()
    pageSize?: number = 10;

    @ApiPropertyOptional()
    @Type(() => Number)
    @IsInt()
    @IsOptional()
    branchId?: number;

    @ApiPropertyOptional({ enum: TicketState })
    @IsEnum(TicketState)
    @IsOptional()
    state?: TicketState;

    @ApiPropertyOptional()
    @Type(() => Date)
    @IsDate()
    @IsOptional()
    startDate?: Date;

    @ApiPropertyOptional()
    @Type(() => Date)
    @IsDate()
    @IsOptional()
    endDate?: Date;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    search?: string;

    @ApiPropertyOptional()
    @Type(() => Boolean)
    @IsBoolean()
    @IsOptional()
    kanban?: boolean;

    @ApiPropertyOptional({ default: 'createdAt' })
    @IsString()
    @IsOptional()
    sortBy?: string = 'createdAt';

    @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
    @IsString()
    @IsOptional()
    sortOrder?: 'asc' | 'desc' = 'desc';
}
