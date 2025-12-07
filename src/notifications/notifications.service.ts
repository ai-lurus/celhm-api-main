import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationChannel } from '@prisma/client';
import { EmailProvider } from './providers/email.provider';
import { SmsProvider } from './providers/sms.provider';
import { WhatsappProvider } from './providers/whatsapp.provider';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private emailProvider: EmailProvider,
    private smsProvider: SmsProvider,
    private whatsappProvider: WhatsappProvider,
  ) {}

  async sendNotification(
    organizationId: number,
    channel: NotificationChannel,
    code: string,
    recipient: string,
    variables: Record<string, any>,
    subject?: string,
  ) {
    // Get template
    const template = await this.prisma.notificationTemplate.findUnique({
      where: {
        organizationId_channel_code: {
          organizationId,
          channel,
          code,
        },
      },
    });

    if (!template) {
      throw new Error(`Template not found: ${code} for channel ${channel}`);
    }

    // Render template with variables
    const body = this.renderTemplate(template.bodyMdx, variables);

    // Create notification record
    const notification = await this.prisma.notification.create({
      data: {
        templateId: template.id,
        channel,
        recipient,
        subject,
        body,
        status: 'pending',
      },
    });

    try {
      // Send notification based on channel
      let result;
      switch (channel) {
        case NotificationChannel.EMAIL:
          result = await this.emailProvider.send(recipient, subject || '', body);
          break;
        case NotificationChannel.SMS:
          result = await this.smsProvider.send(recipient, body);
          break;
        case NotificationChannel.WHATSAPP:
          result = await this.whatsappProvider.send(recipient, body);
          break;
        default:
          throw new Error(`Unsupported channel: ${channel}`);
      }

      // Update notification status
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
        },
      });

      return { success: true, notification, result };
    } catch (error: unknown) {
      const err = error as { message?: string };
      // Update notification status
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'failed',
          error: err.message ?? 'Unknown error',
        },
      });

      return { success: false, notification, error: err.message ?? 'Unknown error' };
    }
  }

  private renderTemplate(template: string, variables: Record<string, any>): string {
    let rendered = template;

    // Replace variables like {{variableName}}
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      rendered = rendered.replace(regex, String(value));
    });

    // Handle conditional blocks like {{#if condition}}...{{/if}}
    rendered = rendered.replace(/{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g, (match, condition, content) => {
      return variables[condition] ? content : '';
    });

    return rendered;
  }

  async getNotificationTemplates(organizationId: number) {
    return this.prisma.notificationTemplate.findMany({
      where: { organizationId },
      orderBy: [
        { channel: 'asc' },
        { code: 'asc' },
      ],
    });
  }

  async updateNotificationTemplate(
    id: number,
    organizationId: number,
    data: {
      name?: string;
      bodyMdx?: string;
      active?: boolean;
    },
  ) {
    return this.prisma.notificationTemplate.updateMany({
      where: {
        id,
        organizationId,
      },
      data,
    });
  }
}

