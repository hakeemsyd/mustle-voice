import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Units } from '../lib/units';

let cachedUnits: Units | null = null;

export const primeUnitPrefs = (units: Units): void => {
  cachedUnits = units;
};

export interface UnitPrefsState {
  units: Units;
  ready: boolean;
}

export const useUnitPrefsState = (): UnitPrefsState => {
  const [units, setUnits] = useState<Units>(cachedUnits ?? 'metric');
  const [ready, setReady] = useState(cachedUnits !== null);

  useEffect(() => {
    if (cachedUnits !== null) return;
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user.id;
      if (!userId || cancelled) return;
      const { data } = await supabase.from('profile').select('unit_prefs').eq('user_id', userId).maybeSingle();
      if (cancelled) return;
      cachedUnits = data?.unit_prefs === 'imperial' ? 'imperial' : 'metric';
      setUnits(cachedUnits);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { units, ready };
};

export const useUnitPrefs = (): Units => useUnitPrefsState().units;
