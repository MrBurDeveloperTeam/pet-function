# Cabinet skins

Local preview is ready at `http://127.0.0.1:3000/?pet=1`.
Open Shopping → Furniture Shop → Cabinets → Games / Bathroom / Bedroom / Kitchen.
Buy once, then choose **Use**. **Use original** restores the original cabinet for that room, without losing the purchase. Each room saves its own cabinet choice.

For hosted accounts, manually review and run `pet_cabinets.sql` in the Supabase SQL Editor. It adds cabinet tables and RPCs using the existing `inventory_pet` wallet. This file has not been deployed automatically. Install it before publishing the client that exposes cabinet purchases. Existing wardrobe SQL and saves are independent.

Assets are aligned transparent 1862 × 845 canvases under `public/pet-function/cabinets/`. They share the background's cover/camera transform and never receive pointer events. The old room art remains the fallback; interaction areas and decorative/interactive behavior remain unchanged. Current skins only repaint the existing furniture surfaces; outlines, shading, handles and foreground objects are preserved.

The cabinet namespace represents one furniture slot per room. Existing beds use their existing independent selection. Future chairs, baths or curtains should use their own slot selections and aligned transparent layers, so selecting one cannot overwrite another. New cabinet styles can be added as catalog entries with the same room, their matching asset and a server catalog row.

Validation: TypeScript check, cabinet state/cloud tests, existing wardrobe and NPC tests. Temporary image-generation and browser-review artifacts are excluded from the project. SQL has been statically reviewed; remote execution remains manual.
