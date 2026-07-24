import { mediaDevices } from '@livekit/react-native-webrtc';

export const requestMicPermission = async (): Promise<boolean> => {
  try {
    const stream = await mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
};
