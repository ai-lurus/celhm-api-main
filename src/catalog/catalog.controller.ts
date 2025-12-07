// @ts-nocheck
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CatalogService } from './catalog.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

@ApiTags('catalog')
@Controller('catalog')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CatalogController {
  constructor(private catalogService: CatalogService) {}

  @Get('products')
  @ApiOperation({ summary: 'Get products with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Products list with pagination' })
  @ApiQuery({ name: 'categoria', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'marca', required: false, description: 'Filter by brand' })
  @ApiQuery({ name: 'modelo', required: false, description: 'Filter by model' })
  @ApiQuery({ name: 'q', required: false, description: 'Search by name, description, brand, model or category' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-based)', example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, description: 'Items per page', example: 50 })
  async getProducts(
    @Query('categoria') categoria?: string,
    @Query('marca') marca?: string,
    @Query('modelo') modelo?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.catalogService.getProducts({
      categoria,
      marca,
      modelo,
      q,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Post('products')
  @ApiOperation({ summary: 'Create new product' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createProduct(@Body() createProductDto: CreateProductDto) {
    return this.catalogService.createProduct(createProductDto);
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Update product' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async updateProduct(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.catalogService.updateProduct(parseInt(id, 10), updateProductDto);
  }

  @Delete('products/:id')
  @ApiOperation({ summary: 'Delete product (cascades to variants)' })
  @ApiResponse({ status: 200, description: 'Product deleted successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async deleteProduct(@Param('id') id: string) {
    return this.catalogService.deleteProduct(parseInt(id, 10));
  }

  @Get('variants')
  @ApiOperation({ summary: 'Get variants with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Variants list with pagination' })
  @ApiQuery({ name: 'marca', required: false, description: 'Filter by brand' })
  @ApiQuery({ name: 'modelo', required: false, description: 'Filter by model' })
  @ApiQuery({ name: 'categoria', required: false, description: 'Filter by product category' })
  @ApiQuery({ name: 'productId', required: false, description: 'Filter by product ID' })
  @ApiQuery({ name: 'q', required: false, description: 'Search by SKU, name or product name' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-based)', example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, description: 'Items per page', example: 50 })
  async getVariants(
    @Query('marca') marca?: string,
    @Query('modelo') modelo?: string,
    @Query('categoria') categoria?: string,
    @Query('productId') productId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.catalogService.getVariants({
      marca,
      modelo,
      categoria,
      productId: productId ? parseInt(productId, 10) : undefined,
      q,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Post('variants')
  @ApiOperation({ summary: 'Create new variant' })
  @ApiResponse({ status: 201, description: 'Variant created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or duplicate SKU' })
  async createVariant(@Body() createVariantDto: CreateVariantDto) {
    return this.catalogService.createVariant(createVariantDto);
  }

  @Patch('variants/:id')
  @ApiOperation({ summary: 'Update variant' })
  @ApiResponse({ status: 200, description: 'Variant updated successfully' })
  @ApiResponse({ status: 404, description: 'Variant not found' })
  async updateVariant(
    @Param('id') id: string,
    @Body() updateVariantDto: UpdateVariantDto,
  ) {
    return this.catalogService.updateVariant(parseInt(id, 10), updateVariantDto);
  }

  @Delete('variants/:id')
  @ApiOperation({ summary: 'Delete variant' })
  @ApiResponse({ status: 200, description: 'Variant deleted successfully' })
  @ApiResponse({ status: 404, description: 'Variant not found' })
  async deleteVariant(@Param('id') id: string) {
    return this.catalogService.deleteVariant(parseInt(id, 10));
  }

  @Get('variants/:id')
  @ApiOperation({ summary: 'Get variant by ID' })
  @ApiResponse({ status: 200, description: 'Variant details' })
  @ApiResponse({ status: 404, description: 'Variant not found' })
  async getVariantById(@Param('id') id: string) {
    return this.catalogService.getVariantById(parseInt(id, 10));
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get all unique categories' })
  @ApiResponse({ status: 200, description: 'List of unique categories' })
  async getCategories() {
    return this.catalogService.getCategories();
  }

  @Get('brands')
  @ApiOperation({ summary: 'Get all unique brands' })
  @ApiResponse({ status: 200, description: 'List of unique brands' })
  async getBrands() {
    return this.catalogService.getBrands();
  }
}

