'use client';

import { useCallback, useEffect } from 'react';

type SleepSyncClient = {
  from: (table: string) => any;
  channel?: (name: string) => any;
  removeChannel?: (channel: any) => Promise<unknown> | unknown;
};

/**
 * Keeps the floating cat-bed sleep state account-scoped across every host.
 * The database row is the cross-domain source of truth; Realtime makes open
 * apps react immediately while their existing snapshot reads cover reloads.
 */
export function useSharedCatSleepSync(
  client: SleepSyncClient | null | undefined,
  userId: string | null | undefined,
  onSleepChange: (sleeping: boolean) => void,
) {
  useEffect(() => {
    if (!client || !userId) return;

    let cancelled = false;
    const refresh = async () => {
      const { data, error } = await client
        .from('inventory_pet')
        .select('is_sleeping')
        .eq('user_id', userId)
        .maybeSingle();
      if (!cancelled && !error && typeof data?.is_sleeping === 'boolean') {
        onSleepChange(data.is_sleeping);
      }
    };
    const handleFocus = () => void refresh();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    void refresh();
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    const channel = client.channel?.(
      `shared-cat-sleep:${userId}`,
    )
      ?.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'inventory_pet', filter: `user_id=eq.${userId}` },
        (payload: { new?: { is_sleeping?: boolean | null } }) => {
          if (typeof payload.new?.is_sleeping === 'boolean') {
            onSleepChange(payload.new.is_sleeping);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (channel && client.removeChannel) void client.removeChannel(channel);
      else channel?.unsubscribe?.();
    };
  }, [client, onSleepChange, userId]);

  return useCallback(async (sleeping: boolean) => {
    onSleepChange(sleeping);
    window.dispatchEvent(new CustomEvent('virtual-pet-sleep-change', { detail: sleeping }));
    if (!client || !userId) return;

    const { error } = await client
      .from('inventory_pet')
      .update({ is_sleeping: sleeping })
      .eq('user_id', userId);
    if (error) {
      onSleepChange(!sleeping);
      window.dispatchEvent(new CustomEvent('virtual-pet-sleep-change', { detail: !sleeping }));
      console.error('Failed to synchronize cat sleep state:', error);
    }
  }, [client, onSleepChange, userId]);
}
