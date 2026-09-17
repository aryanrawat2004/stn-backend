import { Router } from "express";
import crypto from "crypto";
import Razorpay from "razorpay";
import { supabase } from "../db";
import { redeemCoupon, validateCouponForOrder } from "./coupons";

const router = Router();

const PAID_PLANS = {
  "single-job": { amount: 49900, currency: "INR", name: "Single Job" },
  starter: { amount: 149900, currency: "INR", name: "Starter" },
  growth: { amount: 299900, currency: "INR", name: "Growth" },
  pro: { amount: 999900, currency: "INR", name: "Pro" },
  "pro-plus": { amount: 2999900, currency: "INR", name: "Pro Plus" },
  "talent-passport": { amount: 99900, currency: "INR", name: "Talent Passport Verification" },
} as const;

type PaidPlanId = keyof typeof PAID_PLANS;

function getRazorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

function getRazorpayClient() {
  const config = getRazorpayConfig();
  if (!config) return null;
  return {
    client: new Razorpay({ key_id: config.keyId, key_secret: config.keySecret }),
    keyId: config.keyId,
  };
}

router.post("/create-order", async (req, res) => {
  try {
    const planId = String(req.body?.planId || "") as PaidPlanId;
    const plan = PAID_PLANS[planId];
    if (!plan) return res.status(400).json({ error: "Invalid paid plan" });
    if (plan.amount < 100) return res.status(400).json({ error: "Amount must be at least 100 paise" });

    const razorpayConfig = getRazorpayClient();
    if (!razorpayConfig) {
      return res.status(500).json({
        error: "Razorpay is not configured on the server",
        missing: {
          keyId: !(process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID),
          keySecret: !process.env.RAZORPAY_KEY_SECRET,
        },
      });
    }

    const couponCode = String(req.body?.couponCode || "").trim().toUpperCase();
    let amount = plan.amount;
    let discountAmount = 0;
    let appliedCoupon = "";

    if (couponCode) {
      const couponResult = await validateCouponForOrder(couponCode, planId, plan.amount);
      if (!couponResult.valid) return res.status(400).json({ error: couponResult.error });
      amount = couponResult.finalAmount;
      discountAmount = couponResult.discountAmount;
      appliedCoupon = couponResult.code;
    }

    const verificationId = req.body?.verificationId ? String(req.body.verificationId) : "";
    const receipt = `sn_${planId}_${Date.now()}`.slice(0, 40);

    const order = await razorpayConfig.client.orders.create({
      amount,
      currency: plan.currency,
      receipt,
      notes: {
        planId,
        planName: plan.name,
        verificationId,
        couponCode: appliedCoupon,
        originalAmount: String(plan.amount),
        discountAmount: String(discountAmount),
        source: planId === "talent-passport" ? "solarnaukri-talent-passport" : "solarnaukri-pricing",
      },
    });

    return res.status(201).json({
      order_id: order.id,
      amount: order.amount,
      original_amount: plan.amount,
      discount_amount: discountAmount,
      coupon_code: appliedCoupon || null,
      currency: order.currency,
      plan_id: planId,
      plan_name: plan.name,
      key_id: razorpayConfig.keyId,
    });
  } catch (error: any) {
    console.error("Razorpay create-order error:", error);
    const statusCode = Number(error?.statusCode || error?.status || 500);
    if (statusCode === 401) return res.status(401).json({ error: "Razorpay authentication failed" });
    return res.status(500).json({
      error: "Could not create Razorpay order",
      details: process.env.NODE_ENV !== "production" ? error?.message || String(error) : undefined,
    });
  }
});

router.post("/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      planId,
      verificationId,
    } = req.body || {};

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing Razorpay payment verification fields" });
    }

    const razorpayConfig = getRazorpayClient();
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!razorpayConfig || !keySecret) return res.status(500).json({ error: "Razorpay is not configured on the server" });

    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const receivedBuffer = Buffer.from(String(razorpay_signature), "utf8");
    const matches = expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);

    if (!matches) {
      return res.status(400).json({ success: false, error: "Payment signature verification failed" });
    }

    const order = await razorpayConfig.client.orders.fetch(String(razorpay_order_id));
    const notes = (order.notes || {}) as Record<string, string>;
    const verifiedPlanId = String(notes.planId || planId || "");
    const verifiedVerificationId = String(notes.verificationId || verificationId || "");
    const couponCode = String(notes.couponCode || "");
    const discountAmount = Number(notes.discountAmount || 0);

    if (verifiedPlanId === "talent-passport" && verifiedVerificationId) {
      if (!supabase) return res.status(503).json({ error: "Database is not configured" });
      const { error: paymentUpdateError } = await supabase
        .from("candidate_verifications")
        .update({
          payment_status: "paid",
          payment_id: String(razorpay_payment_id),
          payment_order_id: String(razorpay_order_id),
          updated_at: new Date().toISOString(),
        })
        .eq("id", verifiedVerificationId);

      if (paymentUpdateError) {
        console.error("Talent Passport payment update failed:", paymentUpdateError);
        return res.status(500).json({ error: "Payment verified but verification record could not be updated" });
      }
    }

    if (couponCode) {
      await redeemCoupon({
        couponCode,
        paymentId: String(razorpay_payment_id),
        orderId: String(razorpay_order_id),
        planId: verifiedPlanId,
        discountAmount,
      });
    }

    return res.json({
      success: true,
      message: "Payment verified successfully",
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
      coupon_code: couponCode || null,
      discount_amount: discountAmount,
    });
  } catch (error: any) {
    console.error("Razorpay verify-payment error:", error);
    return res.status(500).json({ error: "Could not verify Razorpay payment" });
  }
});

export default router;
