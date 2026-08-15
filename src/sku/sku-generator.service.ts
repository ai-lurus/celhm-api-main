import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { renderSkuMask, DEFAULT_SKU_MASK, SkuMaskSegment } from './sku-mask.util';

@Injectable()
export class SkuGeneratorService {
  constructor(private prisma: PrismaService) {}

  private async resolveCategoryNames(
    categoryId: number,
  ): Promise<{ root: string; category: string }> {
    const leaf = await this.prisma.productCategory.findUnique({ where: { id: categoryId } });
    if (!leaf) {
      throw new BadRequestException(`Categoría con id ${categoryId} no encontrada`);
    }

    let current = leaf;
    while (current.parentId !== null) {
      const parent = await this.prisma.productCategory.findUnique({
        where: { id: current.parentId },
      });
      if (!parent) break;
      current = parent;
    }

    return { root: current.name, category: leaf.name };
  }

  private async getMaskConfig(organizationId: number): Promise<SkuMaskSegment[]> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { skuMaskConfig: true },
    });
    const configured = org?.skuMaskConfig as SkuMaskSegment[] | undefined;
    return configured && configured.length > 0 ? configured : DEFAULT_SKU_MASK;
  }

  async preview(organizationId: number, categoryId: number, productName: string): Promise<string> {
    const { root, category } = await this.resolveCategoryNames(categoryId);
    const segments = await this.getMaskConfig(organizationId);
    const { prefix } = renderSkuMask(segments, { root, category, product: productName, seq: 0 });

    const existing = await this.prisma.skuSequence.findUnique({ where: { prefix } });
    const nextSeq = (existing?.seq ?? 0) + 1;

    return renderSkuMask(segments, { root, category, product: productName, seq: nextSeq }).full;
  }

  async next(organizationId: number, categoryId: number, productName: string): Promise<string> {
    const { root, category } = await this.resolveCategoryNames(categoryId);
    const segments = await this.getMaskConfig(organizationId);
    const { prefix } = renderSkuMask(segments, { root, category, product: productName, seq: 0 });

    const maxRetries = 5;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        const sequence = await this.prisma.skuSequence.upsert({
          where: { prefix },
          update: { seq: { increment: 1 } },
          create: { prefix, seq: 1 },
        });
        return renderSkuMask(segments, {
          root,
          category,
          product: productName,
          seq: sequence.seq,
        }).full;
      } catch (error: any) {
        if (error.code === 'P2002' || error.code === 'P2034') {
          retries++;
          if (retries >= maxRetries) {
            throw new Error('Failed to generate SKU after retries');
          }
          await new Promise((resolve) => setTimeout(resolve, 10 * retries));
          continue;
        }
        throw error;
      }
    }

    throw new Error('Failed to generate SKU');
  }
}
