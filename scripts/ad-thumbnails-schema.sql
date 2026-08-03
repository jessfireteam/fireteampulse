-- Schema behind the Movement page's ad thumbnails. ALREADY APPLIED — this file
-- is the record, not a pending migration.
--
-- IT DOES NOT BELONG TO PULSE'S OWN SUPABASE PROJECT. It lives in the ad-spend
-- project (ojqdhqbynccwgowbzhir), alongside fb_ad_spend and fb_accounts, which
-- friday-flashback also reads. Pulse has no migration tooling pointed there, so
-- applying it is a manual step and this file exists so the next person can see
-- what was done without reading it out of the dashboard.
--
-- Applied 2026-08-03 as migrations add_fb_ad_creative_thumbnails and
-- add_ads_needing_thumbnails_rpc.

-- ---------------------------------------------------------------------------
-- Ad creative thumbnails.
--
-- Meta's Insights API, which fills fb_ad_spend, carries no creative imagery, so
-- the thumbnail is a separate two-hop Graph fetch (ad -> creative id, then the
-- adcreative node with thumbnail_width/height set).
--
-- BYTES, NOT URLS. Meta signs thumbnail_url with an `oe` expiry two to five
-- days out, measured on live ads. The Movement page's whole point is stepping
-- back through earlier periods, so a stored URL would leave every historical
-- view rendering broken images within a week.
-- ---------------------------------------------------------------------------
create table if not exists public.fb_ad_creative (
  ad_id       text primary key,
  account_id  text not null,
  creative_id text,
  -- Path inside the public ad-thumbnails bucket. Null when status <> 'ok'.
  thumb_path  text,
  -- 'ok' | 'no_thumbnail' (creative has none) | 'error'. Lets the incremental
  -- job skip ads it has already failed on instead of retrying them nightly.
  status      text not null default 'ok',
  fetched_at  timestamptz not null default now()
);

create index if not exists fb_ad_creative_account_idx on public.fb_ad_creative (account_id);

alter table public.fb_ad_creative enable row level security;

-- Mirrors anon_read_fb_ad_spend: Pulse is a pure client-side app reading with
-- the publishable key, so the read has to be allowed to anon.
drop policy if exists anon_read_fb_ad_creative on public.fb_ad_creative;
create policy anon_read_fb_ad_creative
  on public.fb_ad_creative for select to anon using (true);

-- Public bucket: these are 320px crops of ads already running in public feeds,
-- and public means Pulse needs no signing round trip per row.
insert into storage.buckets (id, name, public)
values ('ad-thumbnails', 'ad-thumbnails', true)
on conflict (id) do update set public = true;

-- ---------------------------------------------------------------------------
-- The fill job's worklist.
--
-- The spend floor mirrors the page's own absolute threshold: an ad that never
-- cleared $400 across its whole life can never appear in a Breaking out /
-- Established block, so fetching its creative is pure cost. That one filter is
-- what turns ~30,000 all-time ads into the ~6,500 worth storing.
--
-- Rows already present are excluded regardless of status, so ads that came back
-- without a thumbnail are not retried nightly. Delete the row to force a retry.
-- ---------------------------------------------------------------------------
create or replace function public.ads_needing_thumbnails(
  min_spend numeric default 400,
  row_limit integer default null
)
returns table (ad_id text, account_id text)
language sql
stable
security definer
set search_path = public
as $$
  select s.ad_id, min(s.account_id) as account_id
  from fb_ad_spend s
  where s.ad_id is not null
    and not exists (select 1 from fb_ad_creative c where c.ad_id = s.ad_id)
  group by s.ad_id
  having sum(s.spend) >= min_spend
  order by sum(s.spend) desc
  limit row_limit
$$;

revoke all on function public.ads_needing_thumbnails(numeric, integer) from public, anon;
grant execute on function public.ads_needing_thumbnails(numeric, integer) to service_role;
