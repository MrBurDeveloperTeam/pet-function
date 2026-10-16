# Room decor — manual installation

Run `pet_room_decor.sql` in the project's Supabase SQL Editor after reviewing it. This task does not deploy or modify a remote database. The existing `inventory_pet(user_id, coins, pet_name)` wallet must already exist.

The migration is repeatable. It adds 12 catalog items, ownership, and selections keyed by `ROOM:slot`. Curtains, rugs, and special furniture can be mixed independently, alongside existing cabinets. Purchases do not automatically equip; Use applies the purchased skin. Use original clears only that slot and keeps ownership. Existing pet beds, clothing, room layout, and interaction hitboxes remain separate.

Authenticated RPCs: `pet_decor_get()`, `pet_decor_purchase(p_item_id)`, `pet_decor_select(p_slot,p_item_id)`. Passing null as the item restores that slot. Prices are server-controlled; purchases lock the wallet and are idempotent. RLS restricts ownership/selection reads and clients cannot write tables directly.

After installing, verify buying once, duplicate purchase without another charge, using two items in the same room, restoring one while retaining the other, and reloading the page. The local preview repository supports the same flow without a cloud installation.
