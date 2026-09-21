import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeForRecipe, STORAGE_KEY } from '../../src/solo/study/hub.js';
import { parameters } from '../../src/solo/seed.js';
import { generateCase } from '../../src/solo/generate.js';
import { CONCEPTS } from '../../src/solo/study/concepts.js';

test('taking a ticket from a concept hands you exactly that fault', () => {
  for (const concept of CONCEPTS) {
    for (const recipe of concept.recipes) {
      const code = codeForRecipe(recipe);
      assert.ok(code, `no case code found for ${recipe}`);
      assert.deepEqual(parameters(code).recipes, [recipe], `${code} does not produce ${recipe} alone`);
      assert.deepEqual(generateCase(code).recipeIds, [recipe], `${code} generates a different fault`);
    }
  }
});

test('the codes it hands out are ones the app accepts', () => {
  for (const recipe of ['P1', 'P2', 'I1', 'I2', 'V1', 'V2', 'D1', 'D2']) {
    assert.match(codeForRecipe(recipe), /^TF1-BR-1-[PIVD]-prep\d+$/);
  }
});

test('the hub keeps its progress under its own storage key', () => {
  // Distinct from the issue library's key, so neither can overwrite the other.
  assert.equal(STORAGE_KEY, 'field-exam-prep-v1');
  assert.notEqual(STORAGE_KEY, 'field-issue-progress-v1');
});
