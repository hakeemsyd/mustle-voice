import AsyncStorage from '@react-native-async-storage/async-storage';

const PLAN_PENDING_KEY = 'plan_pending_v1';

export async function markPlanPending() {
  await AsyncStorage.setItem(PLAN_PENDING_KEY, '1').catch(() => null);
}

export async function clearPlanPending() {
  await AsyncStorage.removeItem(PLAN_PENDING_KEY).catch(() => null);
}

export async function isPlanPending(): Promise<boolean> {
  return (await AsyncStorage.getItem(PLAN_PENDING_KEY).catch(() => null)) === '1';
}
