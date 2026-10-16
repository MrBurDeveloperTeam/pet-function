-- MANUAL INSTALL ONLY: review and run in Supabase SQL Editor yourself.
-- Requires the existing public.inventory_pet(user_id, coins, pet_name) wallet.
-- Adds independent cosmetic ownership and per-slot decor skins. Does not replace pet saves.
begin;

create schema if not exists pet_private;
revoke all on schema pet_private from public, anon;
grant usage on schema pet_private to authenticated;

create table if not exists public.pet_decor_catalog (
 item_id text primary key,
 slot text not null,
 price integer not null check(price>0), unique(item_id,slot)
);
insert into public.pet_decor_catalog(item_id,slot,price) values
 ('games_curtains','GAMES:curtains',1400),
 ('games_rug','GAMES:rug',1100),
 ('games_console','GAMES:console',2300),
 ('bathroom_curtains','BATHROOM:curtains',1300),
 ('bathroom_rug','BATHROOM:rug',900),
 ('bathroom_toilet','BATHROOM:toilet',1700),
 ('bedroom_curtains','BEDROOM:curtains',1500),
 ('bedroom_rug','BEDROOM:rug',1200),
 ('bedroom_bed','BEDROOM:bed',3200),
 ('kitchen_curtains','KITCHEN:curtains',1400),
 ('kitchen_rug','KITCHEN:rug',1000),
 ('kitchen_fridge','KITCHEN:fridge',2800)
on conflict(item_id) do update set slot=excluded.slot,price=excluded.price;

create table if not exists public.pet_decor_owned (
 user_id uuid not null references auth.users(id) on delete cascade,
 item_id text not null references public.pet_decor_catalog(item_id),
 purchased_at timestamptz not null default now(),
 primary key(user_id,item_id)
);
create table if not exists public.pet_decor_equipped (
 user_id uuid not null,
 slot text not null,
 item_id text not null,
 updated_at timestamptz not null default now(),
 primary key(user_id,slot),
 foreign key(user_id,item_id) references public.pet_decor_owned(user_id,item_id) on delete cascade,
 foreign key(item_id,slot) references public.pet_decor_catalog(item_id,slot)
);
alter table public.pet_decor_catalog enable row level security;
alter table public.pet_decor_owned enable row level security;
alter table public.pet_decor_equipped enable row level security;
revoke all on public.pet_decor_catalog,public.pet_decor_owned,public.pet_decor_equipped from public,anon,authenticated;
grant select on public.pet_decor_catalog,public.pet_decor_owned,public.pet_decor_equipped to authenticated;
grant all on public.pet_decor_catalog,public.pet_decor_owned,public.pet_decor_equipped to service_role;
drop policy if exists "Decor catalog" on public.pet_decor_catalog;
create policy "Decor catalog" on public.pet_decor_catalog for select to authenticated using(true);
drop policy if exists "Own decor skins" on public.pet_decor_owned;
create policy "Own decor skins" on public.pet_decor_owned for select to authenticated using((select auth.uid())=user_id);
drop policy if exists "Own slot skins" on public.pet_decor_equipped;
create policy "Own slot skins" on public.pet_decor_equipped for select to authenticated using((select auth.uid())=user_id);

-- Internal assembler: not callable by clients and never accepts a browser-supplied owner.
create or replace function pet_private.decor_state(p_owner uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object(
  'owned',coalesce((select jsonb_agg(o.item_id order by o.item_id) from public.pet_decor_owned o where o.user_id=p_owner),'[]'::jsonb),
  'selected',coalesce((select jsonb_object_agg(e.slot,e.item_id) from public.pet_decor_equipped e where e.user_id=p_owner),'{}'::jsonb)
 );
$$;
revoke all on function pet_private.decor_state(uuid) from public,anon,authenticated;

-- Privileged writes stay in a non-exposed schema. All owners come from auth.uid().
create or replace function pet_private.decor_get()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();
begin
 if v_owner is null then raise exception 'Authentication required'; end if;
 return pet_private.decor_state(v_owner);
end;
$$;

create or replace function pet_private.decor_purchase(p_item_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_price integer; v_coins bigint;
begin
 if v_owner is null then raise exception 'Authentication required'; end if;
 select c.price into v_price from public.pet_decor_catalog c where c.item_id=p_item_id;
 if not found then raise exception 'Unknown decor skin'; end if;
 -- The same wallet row lock serializes purchases across all apps and tabs.
 select coalesce(p.coins,0) into v_coins from public.inventory_pet p
  where p.user_id=v_owner and nullif(p.pet_name,'') is not null for update;
 if not found then raise exception 'Adopt a cat first'; end if;
 if not exists(select 1 from public.pet_decor_owned o where o.user_id=v_owner and o.item_id=p_item_id) then
  if v_coins<v_price then raise exception 'Insufficient coins'; end if;
  insert into public.pet_decor_owned(user_id,item_id) values(v_owner,p_item_id);
  update public.inventory_pet p set coins=coalesce(p.coins,0)-v_price where p.user_id=v_owner returning coins into v_coins;
 end if;
 return jsonb_build_object('decor',pet_private.decor_state(v_owner),'coins',v_coins);
end;
$$;

create or replace function pet_private.decor_select(p_slot text,p_item_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();
begin
 if v_owner is null then raise exception 'Authentication required'; end if;
 if p_slot is null or not exists(select 1 from public.pet_decor_catalog c where c.slot=p_slot) then raise exception 'Invalid decor slot'; end if;
 if p_item_id is null then
  delete from public.pet_decor_equipped e where e.user_id=v_owner and e.slot=p_slot;
 else
  if not exists(select 1 from public.pet_decor_owned o join public.pet_decor_catalog c using(item_id)
    where o.user_id=v_owner and o.item_id=p_item_id and c.slot=p_slot) then raise exception 'Buy this item before using it'; end if;
  insert into public.pet_decor_equipped(user_id,slot,item_id) values(v_owner,p_slot,p_item_id)
   on conflict(user_id,slot) do update set item_id=excluded.item_id,updated_at=now();
 end if;
 return pet_private.decor_state(v_owner);
end;
$$;
revoke all on function pet_private.decor_get(),pet_private.decor_purchase(text),pet_private.decor_select(text,text) from public,anon,authenticated;
grant execute on function pet_private.decor_get(),pet_private.decor_purchase(text),pet_private.decor_select(text,text) to authenticated;

create or replace function public.pet_decor_get()
returns jsonb language sql security invoker set search_path='' as $$ select pet_private.decor_get(); $$;
create or replace function public.pet_decor_purchase(p_item_id text)
returns jsonb language sql security invoker set search_path='' as $$ select pet_private.decor_purchase(p_item_id); $$;
create or replace function public.pet_decor_select(p_slot text,p_item_id text default null)
returns jsonb language sql security invoker set search_path='' as $$ select pet_private.decor_select(p_slot,p_item_id); $$;
revoke all on function public.pet_decor_get(),public.pet_decor_purchase(text),public.pet_decor_select(text,text) from public,anon,authenticated;
grant execute on function public.pet_decor_get(),public.pet_decor_purchase(text),public.pet_decor_select(text,text) to authenticated;
commit;

-- After install, sign in through the app to test. SQL Editor has no auth.uid()
-- unless you deliberately establish an authenticated test identity.
