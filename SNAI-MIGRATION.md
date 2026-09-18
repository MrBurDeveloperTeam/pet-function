# SNAI shared ownership

All seven frontends use pet-function for SNAI presentation, fixed light colors,
support link, lifecycle, per-app adapters, welcome content and chat transports.

- UI and support: src/ai
- Color source: src/styles/index.css (generated isolation in scripts/postbuild.mjs)
- App welcome/data/intent/response logic: src/apps/<app>
- Client requests: src/apps/<app>/snaiService.ts or .js
- Superapp mount: src/apps/superapp/SuperappMolarAIFloat.tsx

Hosts retain thin imports, their authenticated Supabase client, app data hooks,
account/clinic identity boundaries, route visibility and confirmed business
action executors. Inventory's receipt/image OCR is not SNAI and remains local.
AIBoard database configuration remains authoritative when present; changing a
fallback in source does not overwrite existing database welcome content.

Server-only Supabase Edge Functions and Pages API handlers remain deployed in
their original apps. Their model prompts, authorization and secrets have NOT
been moved into the browser package. Changing backend behavior still requires
editing/deploying that server code; this migration is not a claim of 100% shared
server implementation.

## Release order

This changeset adds exports absent from the published v0.9.19 tag.
Do not deploy host changes against v0.9.19.

1. Bump shared package and package-lock root versions together (next: 0.9.20).
2. Build/test, commit and push shared source; create and push a new tag.
3. After release verification, update all seven Git dependency refs and locks.
4. Build/test/commit/deploy hosts. Do not use file: dependencies or move old tags.

The local verification script aliases imports to this local dist only in memory.
It never changes manifests, locks or installed node_modules.

