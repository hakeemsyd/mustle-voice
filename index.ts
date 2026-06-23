// MUST be first — polyfills global DOMException before any LiveKit/WebRTC module evaluates.
import './polyfills';

import { registerRootComponent } from 'expo';

import App from './App';

// The @elevenlabs/react-native SDK calls registerGlobals() internally (which also sets up
// iOS audio-session management) when it's imported. We do NOT call it again here — a second
// call has no idempotency guard and installs duplicate observers. Matches the official example.

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
