import { Injectable } from '@nestjs/common';

@Injectable()
export class EmailProvider {
  async send(to: string, subject: string, body: string) {
    // TODO(ENV): Implement Resend integration

    // TODO: Implement real Resend integration
    // const resend = new Resend(process.env.RESEND_API_KEY);
    // return await resend.emails.send({
    //   from: 'noreply@celhm.com',
    //   to,
    //   subject,
    //   html: body,
    // });

    throw new Error('Email provider not configured');
  }
}

