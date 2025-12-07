import { Injectable } from '@nestjs/common';

@Injectable()
export class SmsProvider {
  async send(to: string, body: string) {
    // TODO(ENV): Implement Twilio integration

    // TODO: Implement real Twilio integration
    // const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // return await client.messages.create({
    //   body,
    //   from: process.env.TWILIO_PHONE_NUMBER,
    //   to,
    // });

    throw new Error('SMS provider not configured');
  }
}

