create extension if not exists pgcrypto;

create table if not exists public.sn_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  discount_type text not null default 'percent' check (discount_type in ('percent','fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  applicable_plans text[] not null default array['single-job','starter','growth','pro','pro-plus','talent-passport']::text[],
  min_order_amount bigint not null default 0 check (min_order_amount >= 0),
  max_uses integer,
  used_count integer not null default 0 check (used_count >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sn_coupons_percent_range check (
    discount_type <> 'percent' or discount_value <= 100
  ),
  constraint sn_coupons_max_uses_valid check (
    max_uses is null or max_uses >= 1
  )
);

create index if not exists sn_coupons_code_idx on public.sn_coupons (upper(code));
create index if not exists sn_coupons_active_idx on public.sn_coupons (active);
create index if not exists sn_coupons_expires_at_idx on public.sn_coupons (expires_at);

create table if not exists public.sn_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.sn_coupons(id) on delete cascade,
  coupon_code text not null,
  payment_id text not null unique,
  order_id text not null,
  plan_id text not null,
  discount_amount bigint not null default 0 check (discount_amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists sn_coupon_redemptions_coupon_id_idx on public.sn_coupon_redemptions (coupon_id);
create index if not exists sn_coupon_redemptions_order_id_idx on public.sn_coupon_redemptions (order_id);
create index if not exists sn_coupon_redemptions_created_at_idx on public.sn_coupon_redemptions (created_at desc);

alter table public.sn_coupons enable row level security;
alter table public.sn_coupon_redemptions enable row level security;

-- These tables are intentionally accessed through the backend Supabase service-role client.
-- No anonymous/public RLS policies are created here.
