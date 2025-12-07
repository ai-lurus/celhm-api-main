// @ts-nocheck
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketState, TicketPartState } from '@prisma/client';

export class TicketPartResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  variantId: number;

  @ApiProperty()
  qty: number;

  @ApiProperty({ enum: TicketPartState })
  state: TicketPartState;

  @ApiPropertyOptional()
  variant?: {
    id: number;
    sku: string;
    name: string;
    product?: {
      name: string;
      brand: string;
      model: string;
    };
  };
}

export class TicketHistoryResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ enum: TicketState })
  toState: TicketState;

  @ApiPropertyOptional()
  notes?: string;

  @ApiProperty()
  createdAt: string;

  @ApiPropertyOptional()
  user?: {
    name: string;
    email: string;
  };
}

export class TicketResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'LAB-0001' })
  folio: string;

  @ApiProperty({ example: 1 })
  branchId: number;

  @ApiProperty({ example: 'Juan Pérez' })
  customerName: string;

  @ApiPropertyOptional({ example: '+52 123 456 7890' })
  customerPhone?: string;

  @ApiPropertyOptional({ example: 'juan@example.com' })
  customerEmail?: string;

  @ApiProperty({ example: 'iPhone 12' })
  device: string;

  @ApiPropertyOptional({ example: 'Apple' })
  brand?: string;

  @ApiPropertyOptional({ example: 'iPhone 12 Pro' })
  model?: string;

  @ApiPropertyOptional({ example: 'SN123456789' })
  serialNumber?: string;

  @ApiProperty({ example: 'Pantalla rota' })
  problem: string;

  @ApiPropertyOptional({ example: 'Pantalla LCD dañada, requiere reemplazo' })
  diagnosis?: string;

  @ApiPropertyOptional({ example: 'Reemplazo de pantalla LCD' })
  solution?: string;

  @ApiProperty({ enum: TicketState, example: 'RECIBIDO' })
  state: TicketState;

  @ApiPropertyOptional({ example: 1500.00 })
  estimatedCost?: number;

  @ApiPropertyOptional({ example: 1500.00 })
  finalCost?: number;

  @ApiPropertyOptional({ example: 2 })
  estimatedTime?: number;

  @ApiPropertyOptional({ example: 90 })
  warrantyDays?: number;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  @ApiPropertyOptional({ type: [TicketPartResponseDto] })
  parts?: TicketPartResponseDto[];

  @ApiPropertyOptional({ type: [TicketHistoryResponseDto] })
  history?: TicketHistoryResponseDto[];

  @ApiPropertyOptional()
  user?: {
    name: string;
    email: string;
  };

  @ApiPropertyOptional()
  branch?: {
    id: number;
    name: string;
    code: string;
  };
}

export class TicketsListResponseDto {
  @ApiProperty({ type: [TicketResponseDto] })
  data: TicketResponseDto[];

  @ApiProperty({
    example: {
      page: 1,
      pageSize: 20,
      total: 100,
      totalPages: 5,
    },
  })
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

