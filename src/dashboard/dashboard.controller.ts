import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    @Get('summary')
    @ApiOperation({ summary: 'Get dashboard summary metrics' })
    @ApiResponse({ status: 200, description: 'Summary metrics' })
    getSummary(@CurrentUser() user: AuthUser) {
        return this.dashboardService.getSummary(user.organizationId);
    }

    @Get('chart')
    @ApiOperation({ summary: 'Get sales chart data' })
    @ApiResponse({ status: 200, description: 'Chart data' })
    getChartData(@CurrentUser() user: AuthUser) {
        return this.dashboardService.getChartData(user.organizationId);
    }

    @Get('top-products')
    @ApiOperation({ summary: 'Get top selling products' })
    @ApiResponse({ status: 200, description: 'Top products' })
    getTopProducts(@CurrentUser() user: AuthUser) {
        return this.dashboardService.getTopProducts(user.organizationId);
    }

    @Get('recent')
    @ApiOperation({ summary: 'Get recent activity' })
    @ApiResponse({ status: 200, description: 'Recent activity' })
    getRecentActivity(@CurrentUser() user: AuthUser) {
        return this.dashboardService.getRecentActivity(user.organizationId);
    }
}
