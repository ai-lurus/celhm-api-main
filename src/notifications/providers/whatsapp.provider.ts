import { Injectable } from '@nestjs/common';

@Injectable()
export class WhatsappProvider {
  async send(to: string, body: string) {
    // TODO(ENV): Implement Meta Cloud API integration

    // TODO: Implement real Meta Cloud API integration
    // const response = await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${process.env.META_APP_TOKEN}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     messaging_product: 'whatsapp',
    //     to,
    //     type: 'text',
    //     text: { body },
    //   }),
    // });
    // return await response.json();

    throw new Error('WhatsApp provider not configured');
  }
}

