import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsObject, IsOptional } from 'class-validator';

export class SendNotificationDto {
  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty()
  @IsString()
  recipient: string;

  @ApiProperty()
  @IsObject()
  variables: Record<string, any>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  subject?: string;
}

