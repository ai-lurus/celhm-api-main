import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { FoliosModule } from '../folios/folios.module';

@Module({
  imports: [PrismaModule, FoliosModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}

