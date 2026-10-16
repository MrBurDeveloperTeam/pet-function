-- MANUAL INSTALL ONLY: review and run in Supabase SQL Editor yourself.
-- Requires the existing public.inventory_pet(user_id, coins, pet_name) wallet.
-- Adds independent cosmetic ownership and per-room cabinet skins. Does not replace pet saves.
begin;

create schema if not exists pet_private;
revoke all on schema pet_private from public, anon;
grant usage on schema pet_private to authenticated;

create table if not exists public.pet_cabinets_catalog (
 item_id text primary key,
 room text not null check(room in ('GAMES','BATHROOM','BEDROOM','KITCHEN')),
 price integer not null check(price>0), unique(item_id,room)
);
insert into public.pet_cabinets_catalog(item_id,room,price) values
 ('cabinet_games_blue','GAMES',2200),('cabinet_bathroom_teal','BATHROOM',1800),
 ('cabinet_bedroom_lavender','BEDROOM',2600),('cabinet_kitchen_sage','KITCHEN',2800)
on conflict(item_id) do update set room=excluded.room,price=excluded.price;

create table if not exists public.pet_cabinets_owned (
 user_id uuid not null references auth.users(id) on delete cascade,
 item_id text not null references public.pet_cabinets_catalog(item_id),
 purchased_at timestamptz not null default now(),
 primary key(user_id,item_id)
);
create table if not exists public.pet_cabinets_equipped (
 user_id uuid not null,
 room text not null check(room in ('GAMES','BATHROOM','BEDROOM','KITCHEN')),
 item_id text not null,
 updated_at timestamptz not null default now(),
 primary key(user_id,room),
 foreign key(user_id,item_id) references public.pet_cabinets_owned(user_id,item_id) on delete cascade,
 foreign key(item_id,room) references public.pet_cabinets_catalog(item_id,room)
);
alter table public.pet_cabinets_catalog enable row level security;
alter table public.pet_cabinets_owned enable row level security;
alter table public.pet_cabinets_equipped enable row level security;
revoke all on public.pet_cabinets_catalog,public.pet_cabinets_owned,public.pet_cabinets_equipped from public,anon,authenticated;
grant select on public.pet_cabinets_catalog,public.pet_cabinets_owned,public.pet_cabinets_equipped to authenticated;
grant all on public.pet_cabinets_catalog,public.pet_cabinets_owned,public.pet_cabinets_equipped to service_role;
drop policy if exists "Cabinet catalog" on public.pet_cabinets_catalog;
create policy "Cabinet catalog" on public.pet_cabinets_catalog for select to authenticated using(true);
drop policy if exists "Own cabinet skins" on public.pet_cabinets_owned;
create policy "Own cabinet skins" on public.pet_cabinets_owned for select to authenticated using((select auth.uid())=user_id);
drop policy if exists "Own room skins" on public.pet_cabinets_equipped;
create policy "Own room skins" on public.pet_cabinets_equipped for select to authenticated using((select auth.uid())=user_id);

-- Internal assembler: not callable by clients and never accepts a browser-supplied owner.
create or replace function pet_private.cabinets_state(p_owner uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object(
  'owned',coalesce((select jsonb_agg(o.item_id order by o.item_id) from public.pet_cabinets_owned o where o.user_id=p_owner),'[]'::jsonb),
  'selected',coalesce((select jsonb_object_agg(e.room,e.item_id) from public.pet_cabinets_equipped e where e.user_id=p_owner),'{}'::jsonb)
 );
$$;
revoke all on function pet_private.cabinets_state(uuid) from public,anon,authenticated;

-- Privileged writes stay in a non-exposed schema. All owners come from auth.uid().
create or replace function pet_private.cabinets_get()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();
begin
 if v_owner is null then raise exception 'Authentication required'; end if;
 return pet_private.cabinets_state(v_owner);
end;
$$;

create or replace function pet_private.cabinets_purchase(p_item_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_price integer; v_coins bigint;
begin
 if v_owner is null then raise exception 'Authentication required'; end if;
 select c.price into v_price from public.pet_cabinets_catalog c where c.item_id=p_item_id;
 if not found then raise exception 'Unknown cabinet skin'; end if;
 -- The same wallet row lock serializes purchases across all apps and tabs.
 select coalesce(p.coins,0) into v_coins from public.inventory_pet p
  where p.user_id=v_owner and nullif(p.pet_name,'') is not null for update;
 if not found then raise exception 'Adopt a cat first'; end if;
 if not exists(select 1 from public.pet_cabinets_owned o where o.user_id=v_owner and o.item_id=p_item_id) then
  if v_coins<v_price then raise exception 'Insufficient coins'; end if;
  insert into public.pet_cabinets_owned(user_id,item_id) values(v_owner,p_item_id);
  update public.inventory_pet p set coins=coalesce(p.coins,0)-v_price where p.user_id=v_owner returning coins into v_coins;
 end if;
 return jsonb_build_object('cabinets',pet_private.cabinets_state(v_owner),'coins',v_coins);
end;
$$;

create or replace function pet_private.cabinets_select(p_room text,p_item_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();
begin
 if v_owner is null then raise exception 'Authentication required'; end if;
 if p_room is null or p_room not in ('GAMES','BATHROOM','BEDROOM','KITCHEN') then raise exception 'Invalid cabinet room'; end if;
 if p_item_id is null then
  delete from public.pet_cabinets_equipped e where e.user_id=v_owner and e.room=p_room;
 else
  if not exists(select 1 from public.pet_cabinets_owned o join public.pet_cabinets_catalog c using(item_id)
    where o.user_id=v_owner and o.item_id=p_item_id and c.room=p_room) then raise exception 'Buy this item before using it'; end if;
  insert into public.pet_cabinets_equipped(user_id,room,item_id) values(v_owner,p_room,p_item_id)
   on conflict(user_id,room) do update set item_id=excluded.item_id,updated_at=now();
 end if;
 return pet_private.cabinets_state(v_owner);
end;
$$;
revoke all on function pet_private.cabinets_get(),pet_private.cabinets_purchase(text),pet_private.cabinets_select(text,text) from public,anon,authenticated;
grant execute on function pet_private.cabinets_get(),pet_private.cabinets_purchase(text),pet_private.cabinets_select(text,text) to authenticated;

create or replace function public.pet_cabinets_get()
returns jsonb language sql security invoker set search_path='' as $$ select pet_private.cabinets_get(); $$;
create or replace function public.pet_cabinets_purchase(p_item_id text)
returns jsonb language sql security invoker set search_path='' as $$ select pet_private.cabinets_purchase(p_item_id); $$;
create or replace function public.pet_cabinets_select(p_room text,p_item_id text default null)
returns jsonb language sql security invoker set search_path='' as $$ select pet_private.cabinets_select(p_room,p_item_id); $$;
revoke all on function public.pet_cabinets_get(),public.pet_cabinets_purchase(text),public.pet_cabinets_select(text,text) from public,anon,authenticated;
grant execute on function public.pet_cabinets_get(),public.pet_cabinets_purchase(text),public.pet_cabinets_select(text,text) to authenticated;
commit;

-- After install, sign in through the app to test. SQL Editor has no auth.uid()
-- unless you deliberately establish an authenticated test identity.
