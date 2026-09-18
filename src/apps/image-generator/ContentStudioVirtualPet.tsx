"use client";

// PHASE 3D (Virtual Pet extraction): thin host wrapper around
// `../../pet`'s <SharedVirtualPet>.
//
// Everything generic (room UI, runtime, persistence sequencing, landscape/
// fullscreen handling, mini-game embedding shell) now lives in the shared
// package. What stays here, unchanged from the old
// `src/VirtualPet/VirtualPetContainer.tsx`, is exactly what's genuinely
// Content-Studio-specific and Supabase-coupled:
//   - IP geolocation + currency detection (`detectAndLogVisit`,
//     `virtual_pet_visits` writes) — a Content Studio business decision
//     about how to price the shop per visitor, not generic pet behavior.
//   - Supplying the `contentStudioPetRepository` adapter + this app's own
//     already-known `contentStudioUserId` (no new auth lookup needed —
//     `(app)/layout.tsx` already resolves and passes this down).
import { useEffect, useRef, useState } from "react";
import { SharedVirtualPet, type ExtraGame } from "../../pet";
import type { PetDatabaseClient } from '../databaseClient';
import type { PetRepository } from '../../contracts';
import { PET_ASSET_URLS } from "../../resources";

export interface ContentStudioVirtualPetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Content Studio's own authenticated user id — see this file's header
   *  for why no additional auth lookup happens here. */
  userId: string | null;
  /** molar-experience 0.9.5's host-extension games — see `ExtraGame`'s
   *  own doc in the shared package. Passed straight through. */
  extraGames?: ExtraGame[];
}


export function createContentStudioVirtualPet(supabase: PetDatabaseClient, contentStudioPetRepository: PetRepository) {
interface GeoInfo {
  ip: string;
  country_name: string;
  country_code: string;
  city: string;
  region: string;
  timezone: string;
  currency: string; // e.g. "MYR", "USD", "EUR"
}

const DEFAULT_CURRENCY_CODE = "USD";

const normalizeCurrencyCode = (currency?: string | null) => {
  const normalized = (currency || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : DEFAULT_CURRENCY_CODE;
};

const getSupportedPricingCurrency = async (currency?: string | null): Promise<string> => {
  const requestedCurrency = normalizeCurrencyCode(currency);
  if (requestedCurrency === DEFAULT_CURRENCY_CODE) return DEFAULT_CURRENCY_CODE;

  try {
    const { data, error } = await supabase
      .from("aiboard_pricing_currencies")
      .select("currency_code")
      .ilike("currency_code", requestedCurrency)
      .maybeSingle();

    if (!error && data?.currency_code) {
      return normalizeCurrencyCode(data.currency_code);
    }
  } catch (err) {
    console.warn("[Currency] Failed to verify pricing currency:", err);
  }

  console.warn(`[Currency] ${requestedCurrency} is not configured in aiboard_pricing_currencies. Using USD.`);
  return DEFAULT_CURRENCY_CODE;
};

// Detect IP/country and log the visit to Supabase
// Fallback chain: ipapi.co → last stored visit currency → 'USD'
async function detectAndLogVisit(userId: string | null): Promise<string> {
  // --- Attempt 1: Live geolocation ---
  try {
    const res = await fetch("https://ipapi.co/json/");
    if (res.ok) {
      const geo: GeoInfo = await res.json();

      if (userId) {
        const { error: visitError } = await supabase.from("virtual_pet_visits").upsert(
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
          { onConflict: "user_id" }
        );

        if (visitError) {
          console.warn("[VirtualPet] Could not save visit location:", visitError.message);
        }
      }

      console.log(`[VirtualPet] Visit logged — ${geo.city}, ${geo.country_name} (${geo.currency})`);
      return getSupportedPricingCurrency(geo.currency);
    }
  } catch {
    console.warn("[VirtualPet] Geolocation failed, trying stored record...");
  }

  // --- Attempt 2: Use last known currency from Supabase ---
  try {
    if (userId) {
      const { data: lastVisit } = await supabase
        .from("virtual_pet_visits")
        .select("currency")
        .eq("user_id", userId)
        .not("currency", "is", null)
        .order("visited_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastVisit?.currency) {
        console.log(`[VirtualPet] Using stored currency: ${lastVisit.currency}`);
        return getSupportedPricingCurrency(lastVisit.currency);
      }
    }
  } catch {
    console.warn("[VirtualPet] Could not fetch stored visit currency.");
  }

  // --- Fallback: USD ---
  return DEFAULT_CURRENCY_CODE;
}


function ContentStudioVirtualPet({ isOpen, onClose, userId, extraGames }: ContentStudioVirtualPetProps) {
  const hasLoggedRef = useRef(false);
  const [detectedCurrency, setDetectedCurrency] = useState(DEFAULT_CURRENCY_CODE);

  useEffect(() => {
    if (isOpen) {
      // Detect geo only once per open session
      if (!hasLoggedRef.current) {
        hasLoggedRef.current = true;
        detectAndLogVisit(userId).then((currency) => {
          setDetectedCurrency(currency);
        });
      }
    } else {
      hasLoggedRef.current = false; // Reset so next open logs again
    }
  }, [isOpen, userId]);

  return (
    <SharedVirtualPet
      isOpen={isOpen}
      onClose={onClose}
      repository={contentStudioPetRepository}
      userId={userId}
      currencyCode={detectedCurrency}
      assetUrls={PET_ASSET_URLS}
      extraGames={extraGames}
    />
  );
}

return ContentStudioVirtualPet;
}
