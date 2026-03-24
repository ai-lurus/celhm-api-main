import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateDeviceModelDto {
  @ApiPropertyOptional({ description: 'Model name', example: 'iPhone 15 Pro Max' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Device type', example: 'Teléfono', enum: ['Teléfono', 'Tablet', 'Laptop', 'Smartwatch', 'Otro'] })
  @IsString()
  @IsOptional()
  deviceType?: string;
}
