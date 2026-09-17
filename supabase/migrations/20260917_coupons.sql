create extension if not exists pgcrypto;

create table if not exists public.sn_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  applicable_plans text[] not null default array['single-job','starter','growth','pro','pro-plus'],
  min_order_amount integer not null default 100 check (min_order_amount >= 0),
  max_uses integer,
  used_count integer not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sn_coupons_code_idx on public.sn_coupons (upper(code));
create index if not exists sn_coupons_active_idx on public.sn_coupons (active);

create table if not exists public.sn_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.sn_coupons(id) on delete cascade,
  coupon_code text not null,
  payment_id text not null unique,
  order_id text not null,
  plan_id text not null,
  discount_amount integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.sn_coupons enable row level security;
alter table public.sn_coupon_redemptions enable row level security;
