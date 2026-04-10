import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateDeviceModelDto {
  @ApiPropertyOptional({ description: 'Model name', example: 'iPhone 15 Pro Max' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;
}
