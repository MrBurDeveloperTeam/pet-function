'use client';
import {useEffect,useRef,useState} from 'react';
import {SharedVirtualPet} from '../../pet';
import type {ExtraGame} from '../../pet';
import type {PetRepository} from '../../contracts';
import type {AppointmentDatabaseClient} from './transport';
import {PET_ASSET_URLS} from '../../resources';
export interface AppointmentsVirtualPetProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Canonical Pet backend owner id — the same Supabase Auth session
   * user.id App.jsx already resolves via AuthProvider's `user` and keeps
   * live-synced via onAuthStateChange (the same identity that drives
   * CatMascot's own identity-bound key). `null` means a confirmed
   * signed-out guest — never "still resolving": App.jsx's own auth
   * lifecycle (the `!user` -> LoginView branch) already prevents this
   * component from mounting at all before identity resolves. This
   * component must never independently re-derive Pet ownership identity
   * (e.g. via its own `supabase.auth.getSession()` call) — the Host is the
   * sole source, so an account switch is only ever reflected via a fresh
   * prop value paired with a Host-owned `key` boundary (see App.jsx's call
   * site), never by this component noticing a change on its own.
   */
  userId: string | null;
  /** Host-local games (e.g. Meowdoku, which predates this package's
   *  shared Games catalog) rendered as extra cards after the 3 built-in
   *  games. See `ExtraGame`'s own doc — this package never opens or
   *  tracks state for these, only calls `onSelect`. */
  extraGames?: ExtraGame[];
}
export function createAppointmentsVirtualPet(supabase:AppointmentDatabaseClient, repository:PetRepository){
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

const getSupportedPricingCurrency = async (currency?: string | null): Promise<string> => {
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
async function detectAndLogVisit(): Promise<string> {
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
      return getSupportedPricingCurrency(geo.currency);
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
        return getSupportedPricingCurrency(lastVisit.currency);
      }
    }
  } catch {
    console.warn('[VirtualPet] Could not fetch stored visit currency.');
  }

  // --- Fallback: USD ---
  return DEFAULT_CURRENCY_CODE;
}



function AppointmentsVirtualPet({ isOpen, onClose, userId, extraGames }: AppointmentsVirtualPetProps) {
  const hasLoggedRef = useRef(false);
  const [detectedCurrency, setDetectedCurrency] = useState(DEFAULT_CURRENCY_CODE);

  useEffect(() => {
    if (isOpen) {
      // Detect geo only once per open session
      if (!hasLoggedRef.current) {
        hasLoggedRef.current = true;
        detectAndLogVisit().then((currency) => {
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
      repository={repository}
      userId={userId}
      currencyCode={detectedCurrency}
      assetUrls={PET_ASSET_URLS}
      extraGames={extraGames}
      gameProgressClient={supabase}
    />
  );
}

return AppointmentsVirtualPet;
}
