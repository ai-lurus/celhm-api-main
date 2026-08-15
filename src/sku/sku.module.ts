import { Module } from '@nestjs/common';
import { SkuGeneratorService } from './sku-generator.service';

@Module({
  providers: [SkuGeneratorService],
  exports: [SkuGeneratorService],
})
export class SkuModule {}
