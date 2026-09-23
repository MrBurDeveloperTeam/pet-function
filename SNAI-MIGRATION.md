# SNAI shared ownership

All seven frontends use pet-function for SNAI presentation, fixed light colors,
support link, lifecycle, per-app adapters, welcome content and chat transports.
All model-facing backend behavior is now owned by the authenticated central
Cloudflare Worker endpoint `https://app.snabbb.com/api/snai/chat`.

- UI and support: src/ai
- Color source: src/styles/index.css (generated isolation in scripts/postbuild.mjs)
- App welcome/data/intent/response logic: src/apps/<app>
- Client requests: `src/apps/<app>/snaiService.ts` or `.js`
- Shared authenticated transport: `src/ai/internal/snaiTransport.ts`
- Shared backend policy/prompts/provider call: `snabb-superapp/worker.js`
- Superapp mount: src/apps/superapp/SuperappMolarAIFloat.tsx

Hosts retain thin imports, their authenticated Supabase client, app data hooks,
account/clinic identity boundaries, route visibility and confirmed business
action executors. Inventory keeps only local OCR result adaptation (IDs/defaults);
the model call itself uses the shared backend.
AIBoard database configuration remains authoritative when present; changing a
fallback in source does not overwrite existing database welcome content.

The former per-app `molar-chat-*` Edge Functions and same-origin `/api/molar-chat`
handlers must not be used by current hosts. The only Gemini secret is the
server-side `GEMINI_API_KEY` configured on the central Production Worker.
No provider key is accepted from or exposed to a mini-app browser bundle.

## Request boundary

Every request contains an `appId` and one allowed mode. The shared function:

1. verifies the Supabase bearer token with Supabase Auth;
2. checks the app/mode allowlist and input bounds;
3. applies the centrally owned app policy and prompt;
4. calls Gemini and returns one normalized response shape.

The function never queries an app table. Each mini app remains responsible for
selecting data the current user is allowed to see and passing only minimized
facts/context. Data mutations stay in explicit host confirmation/executor code.

## Release order

Do not deploy host changes until a pet-function release containing the shared
transport has been published and `snai-chat` has been deployed successfully.

1. Build and test pet-function locally.
2. Commit/push/tag the shared package only with explicit approval.
3. Deploy the central Worker and verify authenticated/unauthenticated calls.
4. Update all seven dependency refs and locks to the published tag.
5. Build/test/deploy hosts and retire the old remote `molar-chat-*` functions.

The local verification script aliases imports to this local dist only in memory.
It never changes manifests, locks or installed node_modules.
