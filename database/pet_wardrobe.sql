-- MANUAL INSTALL ONLY: review and run in Supabase SQL Editor yourself.
-- Requires the existing public.inventory_pet(user_id, coins, pet_name) wallet.
-- Adds independent cosmetic ownership and per-cat outfits. Does not replace pet saves.
begin;

create schema if not exists pet_private;
revoke all on schema pet_private from public, anon;
grant usage on schema pet_private to authenticated;

create table if not exists public.pet_wardrobe_catalog (
 item_id text primary key,
 slot text not null check (slot in ('neck','body')),
 price integer not null check (price > 0),
 unique(item_id,slot)
);
insert into public.pet_wardrobe_catalog(item_id,slot,price) values
 ('ruby_bell_collar','neck',500),('pearl_necklace','neck',900),
 ('moon_pendant','neck',1500),('sapphire_bow','neck',2200),
 ('sky_sailor','body',1200),('rose_knit','body',1800),
 ('forest_vest','body',2400),('royal_cape','body',3200)
on conflict(item_id) do update set slot=excluded.slot,price=excluded.price;

create table if not exists public.pet_wardrobe_owned (
 user_id uuid not null references auth.users(id) on delete cascade,
 item_id text not null references public.pet_wardrobe_catalog(item_id),
 purchased_at timestamptz not null default now(),
 primary key(user_id,item_id)
);
create table if not exists public.pet_wardrobe_equipped (
 user_id uuid not null,
 pet_id text not null check (pet_id in ('mallow','silverbelt','fastrat','gulu','munchkin','mochi')),
 slot text not null check(slot in ('neck','body')),
 item_id text not null,
 updated_at timestamptz not null default now(),
 primary key(user_id,pet_id,slot),
 foreign key(user_id,item_id) references public.pet_wardrobe_owned(user_id,item_id) on delete cascade,
 foreign key(item_id,slot) references public.pet_wardrobe_catalog(item_id,slot)
);
alter table public.pet_wardrobe_catalog enable row level security;
alter table public.pet_wardrobe_owned enable row level security;
alter table public.pet_wardrobe_equipped enable row level security;
revoke all on public.pet_wardrobe_catalog,public.pet_wardrobe_owned,public.pet_wardrobe_equipped from public,anon,authenticated;
grant select on public.pet_wardrobe_catalog,public.pet_wardrobe_owned,public.pet_wardrobe_equipped to authenticated;
grant all on public.pet_wardrobe_catalog,public.pet_wardrobe_owned,public.pet_wardrobe_equipped to service_role;
drop policy if exists "Wardrobe catalog" on public.pet_wardrobe_catalog;
create policy "Wardrobe catalog" on public.pet_wardrobe_catalog for select to authenticated using(true);
drop policy if exists "Own wardrobe items" on public.pet_wardrobe_owned;
create policy "Own wardrobe items" on public.pet_wardrobe_owned for select to authenticated using((select auth.uid())=user_id);
drop policy if exists "Own cat outfits" on public.pet_wardrobe_equipped;
create policy "Own cat outfits" on public.pet_wardrobe_equipped for select to authenticated using((select auth.uid())=user_id);

-- Internal assembler: not callable by clients and never accepts a browser-supplied owner.
create or replace function pet_private.wardrobe_state(p_owner uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object(
  'owned',coalesce((select jsonb_agg(o.item_id order by o.item_id) from public.pet_wardrobe_owned o where o.user_id=p_owner),'[]'::jsonb),
  'outfits',coalesce((select jsonb_object_agg(t.pet_id,t.outfit) from (
   select e.pet_id,jsonb_object_agg(e.slot,e.item_id) outfit from public.pet_wardrobe_equipped e where e.user_id=p_owner group by e.pet_id
  ) t),'{}'::jsonb)
 );
$$;
revoke all on function pet_private.wardrobe_state(uuid) from public,anon,authenticated;

-- Privileged writes stay in a non-exposed schema. All owners come from auth.uid().
create or replace function pet_private.wardrobe_get()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();
begin
 if v_owner is null then raise exception 'Authentication required'; end if;
 return pet_private.wardrobe_state(v_owner);
end;
$$;

create or replace function pet_private.wardrobe_purchase(p_item_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_price integer; v_coins bigint;
begin
 if v_owner is null then raise exception 'Authentication required'; end if;
 select c.price into v_price from public.pet_wardrobe_catalog c where c.item_id=p_item_id;
 if not found then raise exception 'Unknown wardrobe item'; end if;
 -- The same wallet row lock serializes purchases across all apps and tabs.
 select coalesce(p.coins,0) into v_coins from public.inventory_pet p
  where p.user_id=v_owner and nullif(p.pet_name,'') is not null for update;
 if not found then raise exception 'Adopt a cat first'; end if;
 if not exists(select 1 from public.pet_wardrobe_owned o where o.user_id=v_owner and o.item_id=p_item_id) then
  if v_coins<v_price then raise exception 'Insufficient coins'; end if;
  insert into public.pet_wardrobe_owned(user_id,item_id) values(v_owner,p_item_id);
  update public.inventory_pet p set coins=coalesce(p.coins,0)-v_price where p.user_id=v_owner returning coins into v_coins;
 end if;
 return jsonb_build_object('wardrobe',pet_private.wardrobe_state(v_owner),'coins',v_coins);
end;
$$;

create or replace function pet_private.wardrobe_equip(p_pet_id text,p_slot text,p_item_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();
begin
 if v_owner is null then raise exception 'Authentication required'; end if;
 if p_pet_id is null or p_pet_id not in ('mallow','silverbelt','fastrat','gulu','munchkin','mochi') or p_slot is null or p_slot not in ('neck','body') then raise exception 'Invalid outfit slot'; end if;
 if p_item_id is null then
  delete from public.pet_wardrobe_equipped e where e.user_id=v_owner and e.pet_id=p_pet_id and e.slot=p_slot;
 else
  if not exists(select 1 from public.pet_wardrobe_owned o join public.pet_wardrobe_catalog c using(item_id)
    where o.user_id=v_owner and o.item_id=p_item_id and c.slot=p_slot) then raise exception 'Buy this item before wearing it'; end if;
  insert into public.pet_wardrobe_equipped(user_id,pet_id,slot,item_id) values(v_owner,p_pet_id,p_slot,p_item_id)
   on conflict(user_id,pet_id,slot) do update set item_id=excluded.item_id,updated_at=now();
 end if;
 return pet_private.wardrobe_state(v_owner);
end;
$$;
revoke all on function pet_private.wardrobe_get(),pet_private.wardrobe_purchase(text),pet_private.wardrobe_equip(text,text,text) from public,anon,authenticated;
grant execute on function pet_private.wardrobe_get(),pet_private.wardrobe_purchase(text),pet_private.wardrobe_equip(text,text,text) to authenticated;

create or replace function public.pet_wardrobe_get()
returns jsonb language sql security invoker set search_path='' as $$ select pet_private.wardrobe_get(); $$;
create or replace function public.pet_wardrobe_purchase(p_item_id text)
returns jsonb language sql security invoker set search_path='' as $$ select pet_private.wardrobe_purchase(p_item_id); $$;
create or replace function public.pet_wardrobe_equip(p_pet_id text,p_slot text,p_item_id text default null)
returns jsonb language sql security invoker set search_path='' as $$ select pet_private.wardrobe_equip(p_pet_id,p_slot,p_item_id); $$;
revoke all on function public.pet_wardrobe_get(),public.pet_wardrobe_purchase(text),public.pet_wardrobe_equip(text,text,text) from public,anon,authenticated;
grant execute on function public.pet_wardrobe_get(),public.pet_wardrobe_purchase(text),public.pet_wardrobe_equip(text,text,text) to authenticated;
commit;

-- After install, sign in through the app to test. SQL Editor has no auth.uid()
-- unless you deliberately establish an authenticated test identity.
