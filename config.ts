// ElevenLabs Conversational AI agent (realtime voice). The agent — voice, LLM (Claude),
// and the Mustle system prompt — is configured in the ElevenLabs dashboard, so the app
// only needs the agent ID. AGENT_ID is the primary agent (Haiku); AGENT_ID_SONNET is an
// optional second agent (Sonnet) for the in-app A/B toggle.
export const AGENT_ID = process.env.EXPO_PUBLIC_AGENT_ID ?? '';
export const AGENT_ID_SONNET = process.env.EXPO_PUBLIC_AGENT_ID_SONNET ?? '';
