// PHASE 5D (Virtual Pet migration): thin host wrapper around
// `@mrburdeveloperteam/pet-function/pet`'s <SharedVirtualPet>.
//
// Everything generic (room UI, runtime, persistence sequencing, landscape/
// fullscreen handling, mini-game embedding shell) now lives in the shared
// package. What stays here, unchanged from the old
// `VirtualPet/VirtualPetContainer.tsx`, is exactly what's genuinely
// To-Do-specific and Supabase-coupled:
//   - IP geolocation + currency detection (`detectAndLogVisit`,
//     `virtual_pet_visits` writes) — confirmed byte-identical to Content
//     Studio's/Profit Calculator's original `detectAndLogVisit`, ported
//     mechanically.
// PHASE TODO-PERSIST-HOST: `userId` is now supplied by `App.tsx` as a
// prop (sourced from `session.user.id`, not the `user.user_id` app-state
// field — see App.tsx's call site for why), instead of this component
// independently re-resolving `supabase.auth.getSession()` on its own
// mount. That independent resolution used to guarantee a `userId = null`
// render on every fresh mount (before its own fetch settled) and, since
// its resolution effect had an empty dependency array, never updated
// again after a direct account switch that didn't pass through a
// `session === null` state — leaving `SharedVirtualPet` operating under a
// stale previous user's id. `App.tsx` now also keys this component by
// `session.user.id`, so a full remount happens on every real identity
// change instead.
import { useEffect, useRef, useState } from 'react';
import { SharedVirtualPet, type ExtraGame } from '../../pet';
import type { PetDatabaseClient } from '../databaseClient';
import type { PetRepository } from '../../contracts';
import { PET_ASSET_URLS } from '../../resources';

type TodoPetClient = PetDatabaseClient & {
  auth: PetDatabaseClient['auth'] & {
    getSession(): PromiseLike<{ data: { session: { user: { id: string } } | null } }>;
  };
};

interface GeoInfo {
  ip: string;
  country_name: string;
  country_code: string;
  city: string;
  region: string;
  timezone: string;
  currency: string; // e.g. "MYR", "USD", "EUR"
}

const DEFAULT_CURRENCY_CODE = 'USD';

const normalizeCurrencyCode = (currency?: string | null) => {
  const normalized = (currency || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : DEFAULT_CURRENCY_CODE;
};

const getSupportedPricingCurrency = async (supabase: TodoPetClient, currency?: string | null): Promise<string> => {
  const requestedCurrency = normalizeCurrencyCode(currency);
  if (requestedCurrency === DEFAULT_CURRENCY_CODE) return DEFAULT_CURRENCY_CODE;

  try {
    const { data, error } = await supabase
      .from('aiboard_pricing_currencies')
      .select('currency_code')
      .ilike('currency_code', requestedCurrency)
      .maybeSingle();

    if (!error && data?.currency_code) {
      return normalizeCurrencyCode(data.currency_code);
    }
  } catch (err) {
    console.warn('[Currency] Failed to verify pricing currency:', err);
  }

  console.warn(`[Currency] ${requestedCurrency} is not configured in aiboard_pricing_currencies. Using USD.`);
  return DEFAULT_CURRENCY_CODE;
};

// Detect IP/country and log the visit to Supabase
// Fallback chain: ipapi.co → last stored visit currency → 'USD'
async function detectAndLogVisit(supabase: TodoPetClient): Promise<string> {
  // --- Attempt 1: Live geolocation ---
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (res.ok) {
      const geo: GeoInfo = await res.json();

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id ?? null;

      if (userId) {
        const { error: visitError } = await supabase.from('virtual_pet_visits').upsert(
          {
            user_id: userId,
            ip: geo.ip,
            country: geo.country_name,
            country_code: geo.country_code,
            city: geo.city,
            region: geo.region,
            timezone: geo.timezone,
            currency: normalizeCurrencyCode(geo.currency),
            visited_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

        if (visitError) {
          console.warn('[VirtualPet] Could not save visit location:', visitError.message);
        }
      }

      console.log(`[VirtualPet] Visit logged — ${geo.city}, ${geo.country_name} (${geo.currency})`);
      return getSupportedPricingCurrency(supabase, geo.currency);
    }
  } catch {
    console.warn('[VirtualPet] Geolocation failed, trying stored record...');
  }

  // --- Attempt 2: Use last known currency from Supabase ---
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id ?? null;

    if (userId) {
      const { data: lastVisit } = await supabase
        .from('virtual_pet_visits')
        .select('currency')
        .eq('user_id', userId)
        .not('currency', 'is', null)
        .order('visited_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastVisit?.currency) {
        console.log(`[VirtualPet] Using stored currency: ${lastVisit.currency}`);
        return getSupportedPricingCurrency(supabase, lastVisit.currency);
      }
    }
  } catch {
    console.warn('[VirtualPet] Could not fetch stored visit currency.');
  }

  // --- Fallback: USD ---
  return DEFAULT_CURRENCY_CODE;
}

export interface TodoVirtualPetProps {
  isOpen: boolean;
  onClose: () => void;
  /** To-Do's own authenticated user id (`session.user.id`) — see this
   *  file's header for why no additional auth lookup happens here. */
  userId: string;
  /** Meowdoku, already live in Production via the legacy VirtualPet room
   *  (`VirtualPet/components/RoomMenus.tsx`/`GamePage.tsx`), rendered here
   *  as a 4th game card via the shared package's `extraGames` slot instead
   *  of being ported into the shared runtime itself — this package never
   *  opens or persists state for these, only calls `onSelect`. */
  extraGames?: ExtraGame[];
}

export function createTodoVirtualPet(supabase: TodoPetClient, todoPetRepository: PetRepository) {
return function TodoVirtualPet({ isOpen, onClose, userId, extraGames }: TodoVirtualPetProps) {
  const hasLoggedRef = useRef(false);
  const [detectedCurrency, setDetectedCurrency] = useState(DEFAULT_CURRENCY_CODE);

  useEffect(() => {
    if (isOpen) {
      // Detect geo only once per open session
      if (!hasLoggedRef.current) {
        hasLoggedRef.current = true;
        detectAndLogVisit(supabase).then((currency) => {
          setDetectedCurrency(currency);
        });
      }
    } else {
      hasLoggedRef.current = false; // Reset so next open logs again
    }
  }, [isOpen]);

  return (
    <SharedVirtualPet
      isOpen={isOpen}
      onClose={onClose}
      repository={todoPetRepository}
      userId={userId}
      currencyCode={detectedCurrency}
      assetUrls={PET_ASSET_URLS}
      extraGames={extraGames}
      gameProgressClient={supabase}
    />
  );
};
}
