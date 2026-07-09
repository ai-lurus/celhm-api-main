import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

export class UpdateCustomerGroupDto {
  @ApiProperty({ description: 'Id of the customer group to assign, from the organization\'s catalog' })
  @IsInt()
  groupId: number;
}
