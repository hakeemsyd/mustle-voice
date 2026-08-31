import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'pending_email_confirmation_v1';

export async function savePendingEmailConfirmation(email: string) {
  await AsyncStorage.setItem(KEY, email).catch(() => null);
}

export async function getPendingEmailConfirmation(): Promise<string | null> {
  return await AsyncStorage.getItem(KEY).catch(() => null);
}

export async function clearPendingEmailConfirmation() {
  await AsyncStorage.removeItem(KEY).catch(() => null);
}
