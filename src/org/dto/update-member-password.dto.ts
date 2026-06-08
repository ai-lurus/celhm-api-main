import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateMemberPasswordDto {
  @ApiProperty({ example: 'newPassword123', description: 'The new password for the user' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
