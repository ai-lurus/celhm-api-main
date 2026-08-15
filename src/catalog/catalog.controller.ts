import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { Role } from '@prisma/client';
import { CatalogService } from './catalog.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateDeviceModelDto } from './dto/create-device-model.dto';
import { UpdateDeviceModelDto } from './dto/update-device-model.dto';

@ApiTags('catalog')
@Controller('catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRADOR)
@ApiBearerAuth()
export class CatalogController {
  constructor(private catalogService: CatalogService) { }

  @Get('products')
  @ApiOperation({ summary: 'Get products with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Products list with pagination' })
  @ApiQuery({ name: 'categoria', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'marca', required: false, description: 'Filter by brand' })
  @ApiQuery({ name: 'modelo', required: false, description: 'Filter by model' })
  @ApiQuery({ name: 'q', required: false, description: 'Search by name, description, brand, model or category' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-based)', example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, description: 'Items per page', example: 50 })
  @Roles(Role.ADMINISTRADOR, Role.VENDEDOR)
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
  @Roles(Role.ADMINISTRADOR, Role.VENDEDOR)
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
  async createVariant(
    @Body() createVariantDto: CreateVariantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.catalogService.createVariant(createVariantDto, user.organizationId);
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
  @Roles(Role.ADMINISTRADOR, Role.VENDEDOR)
  async getVariantById(@Param('id') id: string) {
    return this.catalogService.getVariantById(parseInt(id, 10));
  }

  @Get('sku/preview')
  @ApiOperation({ summary: 'Preview the next auto-generated SKU for a category/product name' })
  @ApiQuery({ name: 'categoryId', required: true })
  @ApiQuery({ name: 'name', required: true })
  async previewSku(
    @Query('categoryId') categoryId: string,
    @Query('name') name: string,
    @CurrentUser() user: AuthUser,
  ) {
    return { sku: await this.catalogService.previewSku(user.organizationId, parseInt(categoryId, 10), name) };
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get all categories' })
  @ApiResponse({ status: 200, description: 'List of categories' })
  @Roles(Role.ADMINISTRADOR, Role.VENDEDOR)
  async getCategories() {
    return this.catalogService.getCategories();
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create new category' })
  @ApiResponse({ status: 201, description: 'Category created successfully' })
  @Roles(Role.ADMINISTRADOR)
  async createCategory(@Body() createCategoryDto: CreateCategoryDto) {
    return this.catalogService.createCategory(createCategoryDto.name, createCategoryDto.parentId);
  }

  @Patch('categories/:id')
  @ApiOperation({ summary: 'Update category' })
  @ApiResponse({ status: 200, description: 'Category updated successfully' })
  @Roles(Role.ADMINISTRADOR)
  async updateCategory(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.catalogService.updateCategory(
      parseInt(id, 10),
      updateCategoryDto.name,
      updateCategoryDto.parentId,
    );
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: 'Delete category' })
  @ApiResponse({ status: 200, description: 'Category deleted successfully' })
  @Roles(Role.ADMINISTRADOR)
  async deleteCategory(@Param('id') id: string) {
    return this.catalogService.deleteCategory(parseInt(id, 10));
  }

  @Get('brands')
  @ApiOperation({ summary: 'Get all brands' })
  @ApiResponse({ status: 200, description: 'List of brands' })
  @Roles(Role.ADMINISTRADOR, Role.VENDEDOR, Role.TECNICO)
  async getBrands() {
    // Return both product brands and managed device brands
    const [productBrands, deviceBrands] = await Promise.all([
      this.catalogService.getBrands(),
      this.catalogService.getBrandsList(),
    ]);

    // Merge unique brands names if they are just strings, or return structured objects
    // The frontend expects either string[] or Brand objects. 
    // For now, let's return the structured device brands as the primary source of truth for the CRUD
    // but we might want to include legacy product brands if they don't exist in device brands.

    return deviceBrands;
  }

  @Post('brands')
  @ApiOperation({ summary: 'Create new brand' })
  @ApiResponse({ status: 201, description: 'Brand created successfully' })
  @Roles(Role.ADMINISTRADOR)
  async createBrand(@Body() createBrandDto: CreateBrandDto) {
    return this.catalogService.createBrand(createBrandDto.name);
  }

  @Patch('brands/:id')
  @ApiOperation({ summary: 'Update brand' })
  @ApiResponse({ status: 200, description: 'Brand updated successfully' })
  @Roles(Role.ADMINISTRADOR)
  async updateBrand(
    @Param('id') id: string,
    @Body() updateBrandDto: UpdateBrandDto,
  ) {
    return this.catalogService.updateBrand(parseInt(id, 10), updateBrandDto.name);
  }

  @Delete('brands/:id')
  @ApiOperation({ summary: 'Delete brand' })
  @ApiResponse({ status: 200, description: 'Brand deleted successfully' })
  @Roles(Role.ADMINISTRADOR)
  async deleteBrand(@Param('id') id: string) {
    return this.catalogService.deleteBrand(parseInt(id, 10));
  }

  // ─── Device Models ───────────────────────────────────────────────────────────

  @Get('device-models')
  @ApiOperation({ summary: 'Get all device models, optionally filtered by brand' })
  @ApiResponse({ status: 200, description: 'List of device models' })
  @ApiQuery({ name: 'brandId', required: false, description: 'Filter by brand ID' })
  @Roles(Role.ADMINISTRADOR, Role.VENDEDOR, Role.TECNICO)
  async getDeviceModels(@Query('brandId') brandId?: string) {
    return this.catalogService.getDeviceModels(brandId ? parseInt(brandId, 10) : undefined);
  }

  @Post('device-models')
  @ApiOperation({ summary: 'Create a new device model' })
  @ApiResponse({ status: 201, description: 'Device model created successfully' })
  @Roles(Role.ADMINISTRADOR)
  async createDeviceModel(@Body() dto: CreateDeviceModelDto) {
    return this.catalogService.createDeviceModel(dto);
  }

  @Patch('device-models/:id')
  @ApiOperation({ summary: 'Update a device model' })
  @ApiResponse({ status: 200, description: 'Device model updated successfully' })
  @Roles(Role.ADMINISTRADOR)
  async updateDeviceModel(
    @Param('id') id: string,
    @Body() dto: UpdateDeviceModelDto,
  ) {
    return this.catalogService.updateDeviceModel(parseInt(id, 10), dto);
  }

  @Delete('device-models/:id')
  @ApiOperation({ summary: 'Delete a device model' })
  @ApiResponse({ status: 200, description: 'Device model deleted successfully' })
  @Roles(Role.ADMINISTRADOR)
  async deleteDeviceModel(@Param('id') id: string) {
    return this.catalogService.deleteDeviceModel(parseInt(id, 10));
  }
}
