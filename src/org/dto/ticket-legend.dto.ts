import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString, MaxLength } from 'class-validator';

export class TicketLegendDto {
    @ApiProperty({ description: 'Stable identifier for the legend' })
    @IsString()
    id: string;

    @ApiProperty({ description: 'Legend label shown above the text, e.g. "Garantía"' })
    @IsString()
    @MaxLength(60)
    label: string;

    @ApiProperty({ description: 'Free text body printed at the ticket footer' })
    @IsString()
    @MaxLength(500)
    body: string;

    @ApiProperty({ description: 'Whether the legend is printed on tickets' })
    @IsBoolean()
    enabled: boolean;
}
