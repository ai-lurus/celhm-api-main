import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { NotificationsService } from './notifications.service';
import { SendNotificationDto } from './dto/send-notification.dto';

@ApiTags('notifications')
@Controller('notify')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Post('email')
  @Throttle({ medium: { limit: 10, ttl: 60000 } }) // 10 emails per minute
  @ApiOperation({ summary: 'Send email notification' })
  @ApiResponse({ status: 200, description: 'Email sent' })
  async sendEmail(
    @Body() sendNotificationDto: SendNotificationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notificationsService.sendNotification(
      user.organizationId,
      'EMAIL' as any,
      sendNotificationDto.code,
      sendNotificationDto.recipient,
      sendNotificationDto.variables,
      sendNotificationDto.subject,
    );
  }

  @Post('sms')
  @Throttle({ medium: { limit: 5, ttl: 60000 } }) // 5 SMS per minute
  @ApiOperation({ summary: 'Send SMS notification' })
  @ApiResponse({ status: 200, description: 'SMS sent' })
  async sendSms(
    @Body() sendNotificationDto: SendNotificationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notificationsService.sendNotification(
      user.organizationId,
      'SMS' as any,
      sendNotificationDto.code,
      sendNotificationDto.recipient,
      sendNotificationDto.variables,
    );
  }

  @Post('whatsapp')
  @Throttle({ medium: { limit: 10, ttl: 60000 } }) // 10 WhatsApp per minute
  @ApiOperation({ summary: 'Send WhatsApp notification' })
  @ApiResponse({ status: 200, description: 'WhatsApp sent' })
  async sendWhatsapp(
    @Body() sendNotificationDto: SendNotificationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notificationsService.sendNotification(
      user.organizationId,
      'WHATSAPP' as any,
      sendNotificationDto.code,
      sendNotificationDto.recipient,
      sendNotificationDto.variables,
    );
  }
}
