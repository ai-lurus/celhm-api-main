import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateCashRegisterDto {
    @ApiProperty()
    @IsInt()
    @IsNotEmpty()
    branchId: number;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    code?: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    name: string;
}
