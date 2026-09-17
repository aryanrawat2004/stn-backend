import { Router } from "express";
import { supabase } from "../db";

export type CouponRecord = {
  id: string;
  code: string;
  description?: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number;
  applicable_plans: string[];
  min_order_amount: number;
  max_uses?: number | null;
  used_count: number;
  starts_at?: string | null;
  expires_at?: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

function normaliseCode(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

export async function validateCouponForOrder(codeValue: unknown, planId: string, baseAmount: number) {
  const code = normaliseCode(codeValue);
  if (!code) return { valid: false as const, error: "Enter a coupon code" };
  if (!supabase) return { valid: false as const, error: "Database is not configured" };

  const { data, error } = await supabase
    .from("sn_coupons")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (error) return { valid: false as const, error: error.message };
  if (!data) return { valid: false as const, error: "Coupon code is invalid" };

  const coupon = data as CouponRecord;
  const now = Date.now();
  if (!coupon.active) return { valid: false as const, error: "Coupon is inactive" };
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) return { valid: false as const, error: "Coupon is not active yet" };
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < now) return { valid: false as const, error: "Coupon has expired" };
  if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) return { valid: false as const, error: "Coupon usage limit has been reached" };
  if (baseAmount < Number(coupon.min_order_amount || 0)) return { valid: false as const, error: "Order amount is below the coupon minimum" };
  if (Array.isArray(coupon.applicable_plans) && coupon.applicable_plans.length && !coupon.applicable_plans.includes(planId)) {
    return { valid: false as const, error: "Coupon is not valid for this plan" };
  }

  const rawDiscount = coupon.discount_type === "percent"
    ? Math.round(baseAmount * (Number(coupon.discount_value) / 100))
    : Math.round(Number(coupon.discount_value) * 100);
  const discountAmount = Math.max(0, Math.min(baseAmount - 100, rawDiscount));
  const finalAmount = Math.max(100, baseAmount - discountAmount);

  return {
    valid: true as const,
    coupon,
    code,
    baseAmount,
    discountAmount,
    finalAmount,
  };
}

export async function redeemCoupon(args: {
  couponCode: string;
  paymentId: string;
  orderId: string;
  planId: string;
  discountAmount: number;
}) {
  if (!supabase || !args.couponCode) return;
  const code = normaliseCode(args.couponCode);
  const { data: coupon } = await supabase.from("sn_coupons").select("id,used_count").eq("code", code).maybeSingle();
  if (!coupon) return;

  const { error: redemptionError } = await supabase.from("sn_coupon_redemptions").insert({
    coupon_id: coupon.id,
    coupon_code: code,
    payment_id: args.paymentId,
    order_id: args.orderId,
    plan_id: args.planId,
    discount_amount: args.discountAmount,
  });
  if (redemptionError) {
    if (String(redemptionError.code) === "23505") return;
    console.error("Coupon redemption insert failed:", redemptionError);
    return;
  }

  await supabase
    .from("sn_coupons")
    .update({ used_count: Number(coupon.used_count || 0) + 1, updated_at: new Date().toISOString() })
    .eq("id", coupon.id);
}

export const couponsPublicRouter = Router();
export const couponsAdminRouter = Router();

couponsPublicRouter.post("/validate", async (req, res) => {
  const planId = String(req.body?.planId || "");
  const baseAmount = Number(req.body?.baseAmount || 0);
  if (!planId || baseAmount < 100) return res.status(400).json({ error: "planId and baseAmount are required" });
  const result = await validateCouponForOrder(req.body?.code, planId, baseAmount);
  if (!result.valid) return res.status(400).json({ valid: false, error: result.error });
  return res.json({
    valid: true,
    data: {
      code: result.code,
      description: result.coupon.description,
      discountType: result.coupon.discount_type,
      discountValue: Number(result.coupon.discount_value),
      baseAmount: result.baseAmount,
      discountAmount: result.discountAmount,
      finalAmount: result.finalAmount,
    },
  });
});

couponsAdminRouter.get("/", async (_req, res) => {
  if (!supabase) return res.status(503).json({ error: "Database is not configured" });
  const { data, error } = await supabase.from("sn_coupons").select("*").order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ data: data || [], meta: { total: data?.length || 0, page: 1, limit: 100 } });
});

couponsAdminRouter.post("/", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Database is not configured" });
  const code = normaliseCode(req.body?.code);
  const discountType = req.body?.discount_type === "fixed" ? "fixed" : "percent";
  const discountValue = Number(req.body?.discount_value || 0);
  if (!code || discountValue <= 0) return res.status(400).json({ error: "Valid code and discount value are required" });
  if (discountType === "percent" && discountValue > 100) return res.status(400).json({ error: "Percent discount cannot exceed 100" });

  const record = {
    id: req.body?.id || undefined,
    code,
    description: String(req.body?.description || "").trim() || null,
    discount_type: discountType,
    discount_value: discountValue,
    applicable_plans: Array.isArray(req.body?.applicable_plans) ? req.body.applicable_plans : ["single-job", "starter", "growth", "pro", "pro-plus"],
    min_order_amount: Math.max(0, Number(req.body?.min_order_amount || 0)),
    max_uses: req.body?.max_uses ? Math.max(1, Number(req.body.max_uses)) : null,
    used_count: 0,
    starts_at: req.body?.starts_at || null,
    expires_at: req.body?.expires_at || null,
    active: req.body?.active !== false,
    updated_at: new Date().toISOString(),
  };
  if (!record.id) delete (record as any).id;
  const { data, error } = await supabase.from("sn_coupons").insert(record).select("*").single();
  if (error) return res.status(error.code === "23505" ? 409 : 500).json({ error: error.code === "23505" ? "Coupon code already exists" : error.message });
  return res.status(201).json({ data });
});

couponsAdminRouter.patch("/:id", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Database is not configured" });
  const updates: Record<string, unknown> = { ...req.body, updated_at: new Date().toISOString() };
  delete updates.id;
  delete updates.created_at;
  if (updates.code) updates.code = normaliseCode(updates.code);
  const { data, error } = await supabase.from("sn_coupons").update(updates).eq("id", req.params.id).select("*").single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ data });
});

couponsAdminRouter.delete("/:id", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Database is not configured" });
  const { error } = await supabase.from("sn_coupons").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});
