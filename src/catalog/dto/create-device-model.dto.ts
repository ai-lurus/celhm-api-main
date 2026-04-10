import { IsString, IsNotEmpty, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateDeviceModelDto {
  @ApiProperty({ description: 'Brand ID', example: 1 })
  @IsInt()
  @Type(() => Number)
  brandId: number;

  @ApiProperty({ description: 'Model name', example: 'iPhone 15 Pro' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
