import AsyncStorage from '@react-native-async-storage/async-storage';

const planPendingKey = (userId: string) => `plan_pending_v1:${userId}`;

export async function markPlanPending(userId: string) {
  await AsyncStorage.setItem(planPendingKey(userId), '1').catch(() => null);
}

export async function clearPlanPending(userId: string) {
  await AsyncStorage.removeItem(planPendingKey(userId)).catch(() => null);
}

export async function isPlanPending(userId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(planPendingKey(userId)).catch(() => null)) === '1';
}
