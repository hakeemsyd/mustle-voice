import { requestRecordingPermissionsAsync } from 'expo-audio';

export const requestMicPermission = async (): Promise<boolean> => {
  try {
    const { granted } = await requestRecordingPermissionsAsync();
    return granted;
  } catch (err) {
    console.error('[onboarding voice] mic permission request failed:', err);
    return false;
  }
};
