import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBrandDto {
    @ApiProperty({ description: 'Brand name', example: 'Xiaomi' })
    @IsString()
    @IsNotEmpty()
    name: string;
}
