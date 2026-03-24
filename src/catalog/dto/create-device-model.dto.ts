import { IsString, IsNotEmpty, IsInt, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

  @ApiPropertyOptional({ description: 'Device type', example: 'Teléfono', enum: ['Teléfono', 'Tablet', 'Laptop', 'Smartwatch', 'Otro'] })
  @IsString()
  @IsOptional()
  deviceType?: string;
}
