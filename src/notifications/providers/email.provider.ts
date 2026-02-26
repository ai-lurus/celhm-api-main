import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailProvider {
  private resend: Resend;
  private from: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.from = this.configService.get<string>('EMAIL_FROM') || 'CelHM <noreply@celhm.com>';
    this.resend = new Resend(apiKey);
  }

  async send(to: string, subject: string, body: string) {
    const { data, error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      html: body,
    });

    if (error) {
      throw new Error(`Resend error: ${error.message}`);
    }

    return data;
  }
}
