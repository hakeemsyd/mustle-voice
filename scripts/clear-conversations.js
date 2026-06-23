#!/usr/bin/env node
/**
 * Deletes ElevenLabs Conversational AI conversation history for the Mustle agent.
 * Usage: node scripts/clear-conversations.js
 * API key read from ELEVENLABS_API_KEY, else EXPO_PUBLIC_ELEVENLABS_API_KEY in .env. Node 18+.
 */
const fs = require('fs');
const path = require('path');

const AGENT_ID = 'agent_4301kv8ffakqern9y5q74r66da0j';
const BASE = 'https://api.elevenlabs.io/v1/convai/conversations';

function readKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  try {
    const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    const m = env.match(/EXPO_PUBLIC_ELEVENLABS_API_KEY=(.+)/);
    if (m) return m[1].trim();
  } catch {}
  return null;
}

async function main() {
  const apiKey = readKey();
  if (!apiKey) { console.error('No API key found.'); process.exit(1); }
  const headers = { 'xi-api-key': apiKey };

  const ids = [];
  let cursor = '';
  do {
    const url = `${BASE}?agent_id=${AGENT_ID}&page_size=100${cursor ? `&cursor=${cursor}` : ''}`;
    const res = await fetch(url, { headers });
    if (!res.ok) { console.error('List failed', res.status, await res.text()); process.exit(1); }
    const data = await res.json();
    for (const c of data.conversations ?? []) ids.push(c.conversation_id);
    cursor = data.has_more ? data.next_cursor : '';
  } while (cursor);

  if (ids.length === 0) { console.log('No conversations to delete.'); return; }
  console.log(`Deleting ${ids.length} conversation(s)...`);

  let ok = 0, fail = 0;
  for (const id of ids) {
    const res = await fetch(`${BASE}/${id}`, { method: 'DELETE', headers });
    if (res.ok) { ok++; process.stdout.write('.'); }
    else { fail++; console.error(`\nFailed ${id}: ${res.status}`); }
  }
  console.log(`\nDone. Deleted ${ok}, failed ${fail}.`);
}

main().catch(e => { console.error(e); process.exit(1); });
