import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class AddTicketPartDto {
  @ApiProperty()
  @IsInt()
  variantId: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  qty: number;
}

