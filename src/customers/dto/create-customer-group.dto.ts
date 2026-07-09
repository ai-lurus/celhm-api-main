import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateCustomerGroupDto {
  @ApiProperty({ description: 'Group name, e.g. "Mayorista"' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;
}
