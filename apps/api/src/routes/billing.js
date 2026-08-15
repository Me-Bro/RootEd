import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { AppError } from '../middleware/errorHandler.js';
import { createSubscription, handleWebhook } from '../services/billing.service.js';
import { Tenant } from '../models/Tenant.js';

const router = Router();

/**
 * @openapi
 * /billing/subscribe:
 *   post:
 *     summary: Create a Razorpay subscription for a tenant plan
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tenantId, plan]
 *             properties:
 *               tenantId:
 *                 type: string
 *               plan:
 *                 type: string
 *                 enum: [starter, growth, pro]
 *     responses:
 *       200:
 *         description: Subscription created
 *       403:
 *         description: Forbidden — super_admin only
 */
router.post('/subscribe', authenticate, async (req, res, next) => {
  try {
    if (req.user.systemRole !== 'super_admin') {
      throw new AppError('Forbidden', 403);
    }
    const { tenantId, plan } = req.body;
    const subscription = await createSubscription(tenantId, plan);
    res.json(subscription);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /billing/webhook:
 *   post:
 *     summary: Razorpay webhook handler
 *     tags: [Billing]
 *     security: []
 *     responses:
 *       200:
 *         description: Webhook processed
 *       400:
 *         description: Invalid signature
 */
router.post('/webhook', async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    if (!signature) throw new AppError('Missing signature', 400);

    // Need raw body for signature validation — express.json already parsed it,
    // so we re-stringify for HMAC verification
    const rawBody = JSON.stringify(req.body);
    const event = handleWebhook(rawBody, signature);

    if (event.event === 'subscription.activated') {
      const tenantId = event.payload?.subscription?.entity?.notes?.tenantId;
      if (tenantId) {
        await Tenant.findByIdAndUpdate(tenantId, {
          $set: { plan: event.payload?.subscription?.entity?.plan_id ?? 'starter' },
        });
      }
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
});

export default router;
