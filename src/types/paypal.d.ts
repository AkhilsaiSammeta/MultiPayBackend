declare module '@paypal/checkout-server-sdk' {
  import type { IncomingHttpHeaders } from 'http';

  export namespace core {
    class PayPalHttpClient {
      constructor(environment: SandboxEnvironment | LiveEnvironment);
      execute<T>(request: HttpRequest<T>): Promise<{ result: any }>;
    }

    class SandboxEnvironment {
      constructor(clientId: string, clientSecret: string);
    }

    class LiveEnvironment {
      constructor(clientId: string, clientSecret: string);
    }
  }

  export namespace orders {
    class OrdersCreateRequest extends HttpRequest<any> {
      prefer(value: string): void;
    }

    class OrdersCaptureRequest extends HttpRequest<any> {
      constructor(orderId: string);
    }
  }

  export namespace payments {
    class CapturesRefundRequest extends HttpRequest<any> {
      constructor(captureId: string);
    }
  }

  export namespace notifications {
    class VerifyWebhookSignatureRequest extends HttpRequest<any> {}
  }

  export class HttpRequest<T> {
    public headers: Record<string, string>;
    constructor();
    requestBody(body: any): void;
  }

  export interface WebhookEvent {
    id?: string;
    event_type?: string;
    resource?: unknown;
  }

  export const WebhookEvent: {
    constructEvent(payload: Buffer, headers: IncomingHttpHeaders, webhookId: string, webhookSecret: string): WebhookEvent;
  };

  const paypal: {
    core: typeof core;
    orders: typeof orders;
    payments: typeof payments;
    notifications: typeof notifications;
    HttpRequest: typeof HttpRequest;
  };

  export default paypal;
}
