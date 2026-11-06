import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const validate = new Ajv2020({ strict: true }).compile(read('../schemas/resource.v1.schema.json'));
const inventory = read('../fixtures/m2/shared-infrastructure.v1.json');

test('inventário M2 exige ambiente, tipo, fonte e vínculo com proveniência', () => {
  assert.equal(validate(inventory), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...inventory, resources: [{ ...inventory.resources[0], environmentId: undefined }] }), false);
  assert.equal(validate({ ...inventory, projectResources: [{ ...inventory.projectResources[0], origin: undefined }] }), false);
  assert.equal(validate({ ...inventory, resources: [{ ...inventory.resources[0], credential: 'segredo' }] }), false);
});
