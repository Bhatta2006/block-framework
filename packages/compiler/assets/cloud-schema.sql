-- Apply to a dedicated Supabase project. User data is isolated by auth.uid().
begin;
create table if not exists public.paper_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 100),
  focus text not null default 'personal' check (focus in ('personal','work','study')),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.paper_collections (
  user_id uuid not null references auth.users(id) on delete cascade,
  collection_key text not null check (collection_key ~ '^[a-z][a-z0-9-]{0,63}$'),
  data jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, collection_key)
);
create table if not exists public.paper_payments (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('plus','pro')),
  amount integer not null check (amount in (50000,100000)),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'pending' check (status in ('pending','submitted','approved','rejected')),
  reference text unique check (reference is null or reference ~ '^[A-Za-z0-9]{8,35}$'),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_note text not null default '' check (char_length(review_note) <= 500),
  constraint paper_plan_amount check ((plan='plus' and amount=50000) or (plan='pro' and amount=100000))
);
create table if not exists public.paper_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null check (plan in ('plus','pro')),
  expires_at timestamptz not null,
  payment_id uuid not null references public.paper_payments(id)
);
create table if not exists public.paper_sessions (
  id_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  credentials text not null,
  recovery boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists paper_sessions_user on public.paper_sessions(user_id);
create index if not exists paper_payments_queue on public.paper_payments(status, created_at);
create table if not exists public.paper_payment_audit (
  id bigint generated always as identity primary key,
  payment_id uuid not null references public.paper_payments(id),
  actor_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approved','rejected')),
  note text not null,
  created_at timestamptz not null default now()
);
alter table public.paper_profiles enable row level security;
alter table public.paper_collections enable row level security;
alter table public.paper_payments enable row level security;
alter table public.paper_entitlements enable row level security;
alter table public.paper_sessions enable row level security;
alter table public.paper_payment_audit enable row level security;
revoke all on public.paper_profiles, public.paper_collections, public.paper_payments,
  public.paper_entitlements, public.paper_sessions, public.paper_payment_audit from anon, authenticated;
grant select, insert, update on public.paper_profiles to authenticated;
grant select on public.paper_collections, public.paper_payments, public.paper_entitlements to authenticated;
grant all on public.paper_profiles, public.paper_collections, public.paper_payments,
  public.paper_entitlements, public.paper_sessions, public.paper_payment_audit to service_role;
grant usage, select on sequence public.paper_payment_audit_id_seq to service_role;
drop policy if exists paper_profile_self on public.paper_profiles;
create policy paper_profile_self on public.paper_profiles to authenticated
  using (id=auth.uid()) with check (id=auth.uid());
drop policy if exists paper_collection_self on public.paper_collections;
create policy paper_collection_self on public.paper_collections for select to authenticated using (user_id=auth.uid());
drop policy if exists paper_payment_self on public.paper_payments;
create policy paper_payment_self on public.paper_payments for select to authenticated using (user_id=auth.uid());
drop policy if exists paper_entitlement_self on public.paper_entitlements;
create policy paper_entitlement_self on public.paper_entitlements for select to authenticated using (user_id=auth.uid());

-- The only client write path for collections. Locks serialize quotas across collections.
create or replace function public.paper_save_collection(p_key text, p_revision bigint, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); current_revision bigint; max_records integer := 25;
  total_records integer; plan_name text; record_count integer;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not exists (select 1 from public.paper_profiles where id=uid and onboarding_completed_at is not null)
    then raise exception 'Complete onboarding first' using errcode='42501'; end if;
  if p_key is null or p_key !~ '^[a-z][a-z0-9-]{0,63}$' or p_revision < 0 or p_revision is null
    or p_data is null or octet_length(p_data::text)>3000000
    or (p_data->'version') is distinct from '1'::jsonb
    or jsonb_typeof(p_data->'records') is distinct from 'array'
    or jsonb_typeof(p_data->'folders') is distinct from 'array'
    then raise exception 'Invalid collection' using errcode='22023'; end if;
  record_count := jsonb_array_length(p_data->'records');
  if record_count>10000 or jsonb_array_length(p_data->'folders')>1000
    then raise exception 'Collection is too large' using errcode='22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_data->'records') r where
    jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'id') is distinct from 'string' or coalesce(r->>'id','')='' or char_length(r->>'id')>100
    or jsonb_typeof(r->'title') is distinct from 'string' or char_length(r->>'title')>1000
    or jsonb_typeof(r->'body') is distinct from 'string' or char_length(r->>'body')>200000
    or jsonb_typeof(r->'folder') is distinct from 'string' or char_length(r->>'folder')>100
    or jsonb_typeof(r->'tags') is distinct from 'array'
    or jsonb_typeof(r->'favorite') is distinct from 'boolean'
    or jsonb_typeof(r->'pinned') is distinct from 'boolean'
    or jsonb_typeof(r->'archived') is distinct from 'boolean'
    or jsonb_typeof(r->'trashed') is distinct from 'boolean'
    or jsonb_typeof(r->'createdAt') is distinct from 'string'
    or jsonb_typeof(r->'updatedAt') is distinct from 'string')
    then raise exception 'Invalid note' using errcode='22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_data->'folders') f where
      jsonb_typeof(f) <> 'string' or btrim(f#>>'{}')='' or char_length(f#>>'{}')>100)
    or exists (select 1 from jsonb_array_elements(p_data->'records') r where jsonb_array_length(r->'tags')>50)
    or exists (select 1 from jsonb_array_elements(p_data->'records') r,
      lateral jsonb_array_elements(r->'tags') t where jsonb_typeof(t)<>'string' or char_length(t#>>'{}')>100)
    then raise exception 'Invalid folders or tags' using errcode='22023'; end if;
  -- PostgreSQL performs the authoritative date validation; clients cannot poison a collection.
  begin
    perform (r->>'createdAt')::timestamptz, (r->>'updatedAt')::timestamptz
      from jsonb_array_elements(p_data->'records') r;
    if exists (select 1 from jsonb_array_elements(p_data->'records') r where
        not isfinite((r->>'createdAt')::timestamptz) or not isfinite((r->>'updatedAt')::timestamptz))
      then raise exception 'Invalid date'; end if;
  exception when others then raise exception 'Invalid note date' using errcode='22023';
  end;
  if (select count(distinct r->>'id') from jsonb_array_elements(p_data->'records') r) <> record_count
    then raise exception 'Duplicate note IDs' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  select revision into current_revision from public.paper_collections where user_id=uid and collection_key=p_key for update;
  if coalesce(current_revision,0) <> p_revision
    then raise exception 'Collection changed on another device. Preserve your draft and reload.' using errcode='PT409'; end if;
  select plan into plan_name from public.paper_entitlements where user_id=uid and expires_at>now();
  max_records := case plan_name when 'plus' then 1000 when 'pro' then 10000 else 25 end;
  select coalesce(sum(jsonb_array_length(data->'records')),0)::integer into total_records
    from public.paper_collections where user_id=uid and collection_key<>p_key;
  -- Downgrades never delete notes. Saving/removing existing notes is allowed over quota.
  if total_records+record_count>max_records and record_count > coalesce(
    (select jsonb_array_length(data->'records') from public.paper_collections where user_id=uid and collection_key=p_key),0)
    then raise exception 'Your plan note limit is reached. Upgrade or remove a note.' using errcode='P0001'; end if;
  insert into public.paper_collections(user_id,collection_key,data,revision)
    values(uid,p_key,p_data,p_revision+1)
    on conflict(user_id,collection_key) do update set data=excluded.data,revision=excluded.revision,updated_at=now();
  return jsonb_build_object('revision',p_revision+1);
end $$;
revoke all on function public.paper_save_collection(text,bigint,jsonb) from public, anon;
grant execute on function public.paper_save_collection(text,bigint,jsonb) to authenticated;

-- Called only by the trusted owner endpoint using service_role, never by a browser.
create or replace function public.paper_review_payment(p_id uuid, p_actor uuid, p_approve boolean, p_note text, p_days integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payment public.paper_payments%rowtype; deadline timestamptz;
begin
  if p_days is null or p_days<1 or p_days>366 or p_actor is null or p_approve is null or p_note is null or char_length(p_note)>500
    then raise exception 'Invalid review' using errcode='22023'; end if;
  select * into payment from public.paper_payments where id=p_id for update;
  if not found then raise exception 'Payment not found' using errcode='P0002'; end if;
  if payment.status='approved' and p_approve then return jsonb_build_object('status','approved','alreadyReviewed',true); end if;
  if payment.status='rejected' and not p_approve then return jsonb_build_object('status','rejected','alreadyReviewed',true); end if;
  if payment.status<>'submitted' then raise exception 'Only submitted payments can be reviewed' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(payment.user_id::text,0));
  update public.paper_payments set status=case when p_approve then 'approved' else 'rejected' end,
    reviewed_at=now(),reviewed_by=p_actor,review_note=p_note where id=p_id;
  if p_approve then
    select greatest(expires_at,now()) into deadline from public.paper_entitlements where user_id=payment.user_id;
    deadline := coalesce(deadline,now())+make_interval(days=>p_days);
    insert into public.paper_entitlements(user_id,plan,expires_at,payment_id)
      values(payment.user_id,payment.plan,deadline,p_id)
      on conflict(user_id) do update set plan=excluded.plan,expires_at=excluded.expires_at,payment_id=excluded.payment_id;
  end if;
  insert into public.paper_payment_audit(payment_id,actor_id,decision,note)
    values(p_id,p_actor,case when p_approve then 'approved' else 'rejected' end,p_note);
  return jsonb_build_object('status',case when p_approve then 'approved' else 'rejected' end,'expiresAt',deadline);
end $$;
revoke all on function public.paper_review_payment(uuid,uuid,boolean,text,integer) from public, anon, authenticated;
grant execute on function public.paper_review_payment(uuid,uuid,boolean,text,integer) to service_role;
commit;
