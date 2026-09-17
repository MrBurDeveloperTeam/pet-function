'use client';
import { useEffect, useRef, useState } from 'react';
import type { PetRepository } from '../contracts/petRepository';
import { SharedVirtualPet, type ExtraGame } from './SharedVirtualPet';
import { PET_ASSET_URLS } from '../resources';

// Host injects its existing client; no client or credentials are created here.
export interface PetHostClient {
  from(name: string): any;
  auth: {
    getSession(): PromiseLike<{ data: { session: { user: { id: string } } | null } }>;
    onAuthStateChange(callback: (event: any, session: { user: { id: string } } | null) => void): { data: { subscription: { unsubscribe(): void } } };
  };
}
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

const getSupportedPricingCurrency = async (client: PetHostClient, currency?: string | null): Promise<string> => {
  const requestedCurrency = normalizeCurrencyCode(currency);
  if (requestedCurrency === DEFAULT_CURRENCY_CODE) return DEFAULT_CURRENCY_CODE;

  try {
    const { data, error } = await client
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
export async function detectAndLogPetVisit(client: PetHostClient, userId: string | null): Promise<string> {
  // --- Attempt 1: Live geolocation ---
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (res.ok) {
      const geo: GeoInfo = await res.json();

      if (userId) {
        const { error: visitError } = await client.from('virtual_pet_visits').upsert(
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
      return getSupportedPricingCurrency(client, geo.currency);
    }
  } catch {
    console.warn('[VirtualPet] Geolocation failed, trying stored record...');
  }

  // --- Attempt 2: Use last known currency from Supabase ---
  try {
    if (userId) {
      const { data: lastVisit } = await client
        .from('virtual_pet_visits')
        .select('currency')
        .eq('user_id', userId)
        .not('currency', 'is', null)
        .order('visited_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastVisit?.currency) {
        console.log(`[VirtualPet] Using stored currency: ${lastVisit.currency}`);
        return getSupportedPricingCurrency(client, lastVisit.currency);
      }
    }
  } catch {
    console.warn('[VirtualPet] Could not fetch stored visit currency.');
  }

  // --- Fallback: USD ---
  return DEFAULT_CURRENCY_CODE;
}


export interface SharedHostedVirtualPetProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null;
  repository: PetRepository;
  client: PetHostClient;
  extraGames?: ExtraGame[];
}
export function SharedHostedVirtualPet({ isOpen, onClose, userId, repository, client, extraGames }: SharedHostedVirtualPetProps) {
  const [resolvedId, setResolvedId] = useState<string | null | undefined>(userId);
  const [currencyCode, setCurrencyCode] = useState('USD');
  const logged = useRef<string | null>(null);
  useEffect(() => {
    if (userId !== undefined) { setResolvedId(userId); return; }
    let active = true;
    setResolvedId(undefined);
    let authChanged = false;
    Promise.resolve(client.auth.getSession()).then(({ data }) => { if (active && !authChanged) setResolvedId(data.session?.user.id ?? null); }).catch(error => { console.error('[pet_function] Identity lookup failed', error); if (active && !authChanged) setResolvedId(null); });
    const { data } = client.auth.onAuthStateChange((_event, session) => { authChanged = true; if (active) setResolvedId(session?.user.id ?? null); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [userId, client]);
  const effectiveId = userId === undefined ? resolvedId : userId;
  useEffect(() => {
    let active = true;
    if (!isOpen) { logged.current = null; return; }
    if (!effectiveId || logged.current === effectiveId) return;
    logged.current = effectiveId;
    detectAndLogPetVisit(client, effectiveId).then(code => { if (active) setCurrencyCode(code); });
    return () => { active = false; };
  }, [isOpen, effectiveId, client]);
  if (!effectiveId) return null;
  return <SharedVirtualPet key={effectiveId ?? 'guest'} isOpen={isOpen} onClose={onClose} userId={effectiveId} repository={repository} currencyCode={currencyCode} assetUrls={PET_ASSET_URLS} extraGames={extraGames} />;
}
