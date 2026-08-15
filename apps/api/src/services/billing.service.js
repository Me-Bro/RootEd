import crypto from 'crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const PLAN_PRICES = {
  starter: 80,   // per student per year, INR
  growth: 120,
  pro: 180,
};

export const DISCOUNT_RATES = { none: 0, annual_prepay: 15, nonprofit: 30, government: 30 };

export function calculateFinalPrice(planKey, studentCount, discountType = 'none') {
  const baseRate = PLAN_PRICES[planKey] ?? 180;
  const discount = DISCOUNT_RATES[discountType] ?? 0;
  const annual = baseRate * studentCount;
  return { baseAmount: annual, discountPct: discount, finalAmount: Math.round(annual * (1 - discount / 100)) };
}

let razorpayInstance = null;

async function getRazorpay() {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return null;
  if (!razorpayInstance) {
    const Razorpay = (await import('razorpay')).default;
    razorpayInstance = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayInstance;
}

/**
 * Create a Razorpay subscription for the given tenant + plan.
 * Falls back to a mock if Razorpay credentials are not configured.
 */
export async function createSubscription(tenantId, plan) {
  const razorpay = await getRazorpay();

  if (!razorpay) {
    logger.warn({ tenantId, plan }, 'Razorpay not configured — returning mock subscription');
    return {
      id: `mock_sub_${Date.now()}`,
      tenantId,
      plan,
      status: 'mock',
      amount: PLAN_PRICES[plan] ?? 0,
      currency: 'INR',
    };
  }

  const subscription = await razorpay.subscriptions.create({
    plan_id: plan,
    total_count: 12,
    notes: { tenantId: tenantId.toString() },
  });

  logger.info({ tenantId, plan, subscriptionId: subscription.id }, 'Razorpay subscription created');
  return subscription;
}

/**
 * Verify Razorpay webhook signature and return parsed event.
 * @param {string|Buffer} payload - Raw request body
 * @param {string} signature - X-Razorpay-Signature header
 * @returns {{ event: string, payload: object }}
 */
export function handleWebhook(payload, signature) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET not configured');
  }

  const expectedSignature = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  if (expectedSignature !== signature) {
    throw new Error('Invalid webhook signature');
  }

  return JSON.parse(typeof payload === 'string' ? payload : payload.toString('utf8'));
}
