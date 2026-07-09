import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerGroupsController } from './customer-groups.controller';
import { CustomerGroupsService } from './customer-groups.service';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CustomersController, CustomerGroupsController],
  providers: [CustomersService, CustomerGroupsService],
  exports: [CustomersService, CustomerGroupsService],
})
export class CustomersModule {}

