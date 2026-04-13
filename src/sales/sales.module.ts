import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { FoliosModule } from '../folios/folios.module';
import { CommissionsModule } from '../commissions/commissions.module';

@Module({
  imports: [PrismaModule, FoliosModule, CommissionsModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}

