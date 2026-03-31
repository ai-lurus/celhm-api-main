import 'reflect-metadata';
import { validate } from 'class-validator';
import { CreateSaleDto } from './src/sales/dto/create-sale.dto';

async function test() {
  const dto = new CreateSaleDto();
  dto.branchId = 1;
  dto.cashRegisterId = 1;
  dto.lines = [];
  dto.payments = [
    { amount: 100, method: 'EFECTIVO' as any }
  ];

  const errors = await validate(dto);
  console.log('ERRORS:', JSON.stringify(errors, null, 2));
}
test();
