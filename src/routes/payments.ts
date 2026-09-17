import { Router } from "express";
import crypto from "crypto";
import Razorpay from "razorpay";

const router = Router();

const PAID_PLANS = {
  "single-job": { amount: 49900, currency: "INR", name: "Single Job" },
  starter: { amount: 149900, currency: "INR", name: "Starter" },
  growth: { amount: 299900, currency: "INR", name: "Growth" },
  pro: { amount: 999900, currency: "INR", name: "Pro" },
  "pro-plus": { amount: 2999900, currency: "INR", name: "Pro Plus" },
} as const;

type PaidPlanId = keyof typeof PAID_PLANS;

function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return null;
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

router.post("/create-order", async (req, res) => {
  try {
    const planId = String(req.body?.planId || "") as PaidPlanId;
    const plan = PAID_PLANS[planId];

    if (!plan) {
      return res.status(400).json({ error: "Invalid paid plan" });
    }

    if (plan.amount < 100) {
      return res.status(400).json({ error: "Amount must be at least 100 paise" });
    }

    const razorpay = getRazorpayClient();

    if (!razorpay) {
      return res.status(500).json({ error: "Razorpay is not configured on the server" });
    }

    const receipt = `sn_${planId}_${Date.now()}`.slice(0, 40);

    const order = await razorpay.orders.create({
      amount: plan.amount,
      currency: plan.currency,
      receipt,
      notes: {
        planId,
        planName: plan.name,
        source: "solarnaukri-pricing",
      },
    });

    return res.status(201).json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      plan_id: planId,
      plan_name: plan.name,
    });
  } catch (error: any) {
    console.error("Razorpay create-order error:", error);

    const statusCode = Number(error?.statusCode || error?.status || 500);

    if (statusCode === 401) {
      return res.status(401).json({ error: "Razorpay authentication failed" });
    }

    return res.status(500).json({
      error: "Could not create Razorpay order",
      details: process.env.NODE_ENV !== "production" ? error?.message || String(error) : undefined,
    });
  }
});

router.post("/verify-payment", (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    } = req.body || {};

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing Razorpay payment verification fields" });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keySecret) {
      return res.status(500).json({ error: "Razorpay is not configured on the server" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const receivedBuffer = Buffer.from(String(razorpay_signature), "utf8");

    const matches =
      expectedBuffer.length === receivedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, receivedBuffer);

    if (!matches) {
      return res.status(400).json({
        success: false,
        error: "Payment signature verification failed",
      });
    }

    return res.json({
      success: true,
      message: "Payment verified successfully",
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
    });
  } catch (error: any) {
    console.error("Razorpay verify-payment error:", error);
    return res.status(500).json({ error: "Could not verify Razorpay payment" });
  }
});

export default router;
