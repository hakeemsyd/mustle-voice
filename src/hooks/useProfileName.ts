import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getCachedDisplayName, setCachedDisplayName, subscribeToProfile } from '../lib/profileStore';

export function useProfileName(userId: string | null): string | null {
  const [name, setName] = useState(() => getCachedDisplayName(userId));

  useEffect(() => {
    if (!userId) return;
    setName(getCachedDisplayName(userId));
    const unsubscribe = subscribeToProfile(() => setName(getCachedDisplayName(userId)));

    if (getCachedDisplayName(userId) === null) {
      supabase
        .from('profile')
        .select('display_name')
        .eq('user_id', userId)
        .maybeSingle()
        .then(({ data }) => setCachedDisplayName(userId, data?.display_name ?? null));
    }

    return unsubscribe;
  }, [userId]);

  return name;
}
