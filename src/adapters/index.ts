import { StripeAdapter } from './stripeAdapter.js';
import { PayPalAdapter } from './paypalAdapter.js';
import { RazorpayAdapter } from './razorpayAdapter.js';
import type { PaymentAdapter } from './paymentAdapter.js';
import type { PaymentProvider } from '../types/payments.js';

const adapterInstances: Partial<Record<PaymentProvider, PaymentAdapter>> = {};

const instantiateAdapter = (provider: PaymentProvider): PaymentAdapter => {
  switch (provider) {
    case 'stripe':
      adapterInstances.stripe ??= new StripeAdapter();
      return adapterInstances.stripe;
    case 'paypal':
      adapterInstances.paypal ??= new PayPalAdapter();
      return adapterInstances.paypal;
    case 'razorpay':
      adapterInstances.razorpay ??= new RazorpayAdapter();
      return adapterInstances.razorpay;
    default:
      throw new Error(`Unsupported payment provider: ${provider}`);
  }
};

export const getPaymentAdapter = (provider: PaymentProvider): PaymentAdapter => {
  return instantiateAdapter(provider);
};
