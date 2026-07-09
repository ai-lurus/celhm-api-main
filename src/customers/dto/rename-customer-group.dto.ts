import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class RenameCustomerGroupDto {
  @ApiProperty({ description: 'New group name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;
}
