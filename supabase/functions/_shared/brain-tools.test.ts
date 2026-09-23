import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRAIN_TOOLS } from './brain-tools.ts';

test('generated plan sessions can never be pinned to a weekday — Damion\'s explicit standard: floating only', () => {
  const generate = BRAIN_TOOLS.find((t) => t.name === 'generate_training_plan')!;
  const sessionItems = (generate.input_schema.properties as any).sessions.items;
  assert.equal(
    'weekday' in sessionItems.properties,
    false,
    'the model must not be able to set a weekday on a generated session',
  );

  const update = BRAIN_TOOLS.find((t) => t.name === 'update_training_plan')!;
  const updateSessionItems = (update.input_schema.properties as any).sessions.items;
  assert.equal('weekday' in updateSessionItems.properties, false);
});
