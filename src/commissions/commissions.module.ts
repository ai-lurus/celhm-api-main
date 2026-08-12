import { Module } from '@nestjs/common';
import { CommissionsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';
import { CommissionPlansController } from './commission-plans.controller';
import { CommissionPlansService } from './commission-plans.service';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CommissionsController, CommissionPlansController],
  providers: [CommissionsService, CommissionPlansService],
  exports: [CommissionsService, CommissionPlansService],
})
export class CommissionsModule {}
