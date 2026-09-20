-- Storewatch schema for the INE intern assignment.
-- Run this in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists catalog_products (
  store_id integer primary key,
  slug text,
  name text not null,
  brand text,
  category text,
  sku text,
  description text,
  specs jsonb,
  reviews jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists catalog_products_name_idx on catalog_products using gin (to_tsvector('simple', coalesce(name, '')));
create index if not exists catalog_products_sku_idx on catalog_products (sku);

create table if not exists tracked_products (
  id uuid primary key default gen_random_uuid(),
  store_id integer not null unique references catalog_products(store_id) on delete cascade,
  scrape_interval_minutes integer not null default 120,
  last_scraped_at timestamptz,
  last_success_at timestamptz,
  last_price numeric,
  last_in_stock boolean,
  notify_price_drop boolean not null default true,
  notify_back_in_stock boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  tracked_id uuid not null references tracked_products(id) on delete cascade,
  price numeric not null,
  currency text not null default 'INR',
  mrp numeric,
  in_stock boolean not null,
  stock_qty integer,
  stock_text text,
  seller text,
  extra jsonb,
  layout_revision integer,
  scraped_at timestamptz not null default now()
);

create index if not exists price_history_tracked_idx on price_history (tracked_id, scraped_at desc);

create table if not exists scrape_logs (
  id uuid primary key default gen_random_uuid(),
  tracked_id uuid references tracked_products(id) on delete cascade,
  store_id integer,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text not null check (outcome in ('success', 'retried', 'failed')),
  attempts integer not null default 1,
  error_message text,
  details jsonb,
  duration_ms integer
);

create index if not exists scrape_logs_tracked_idx on scrape_logs (tracked_id, started_at desc);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  tracked_id uuid references tracked_products(id) on delete cascade,
  type text not null,
  message text not null,
  payload jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists store_layout_snapshots (
  id uuid primary key default gen_random_uuid(),
  revision integer,
  variant integer,
  classes jsonb,
  price_tag text,
  price_carrier text,
  captured_at timestamptz not null default now(),
  changed_from integer,
  change_summary text
);

alter table catalog_products enable row level security;
alter table tracked_products enable row level security;
alter table price_history enable row level security;
alter table scrape_logs enable row level security;
alter table alerts enable row level security;
alter table store_layout_snapshots enable row level security;
