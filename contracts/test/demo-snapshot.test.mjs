import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const fixture = JSON.parse(read('../fixtures/m0-demo.v1.json'));
const validate = new Ajv2020({ allErrors: true }).compile(JSON.parse(read('../schemas/demo-snapshot.v1.schema.json')));

test('fixture cumpre o contrato isolado da demonstração', () => {
  assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
  assert.equal(fixture.projects.length, 6);
  assert.equal(fixture.projects.some(project => project.status === 'atencao'), true);
  assert.equal(fixture.projects.some(project => project.status === 'inativo'), true);
});

test('projetos e encaixes possuem identidades únicas e seleção válida', () => {
  assert.equal(new Set(fixture.projects.map(project => project.projectId)).size, 6);
  assert.equal(new Set(fixture.projects.map(project => project.slotId)).size, 6);
  assert.equal(fixture.projects.some(project => project.projectId === fixture.selectedProjectId), true);
});

test('contrato rejeita dados operacionais e campos não previstos', () => {
  for (const mutation of [
    { ...fixture, mode: 'live' },
    { ...fixture, token: 'segredo-ficticio' },
    { ...fixture, projects: [...fixture.projects, fixture.projects[0]] }
  ]) {
    assert.equal(validate(mutation), false);
  }
});

test('fixture embarcada no Unity corresponde ao contrato versionado', () => {
  assert.equal(read('../../unity/Assets/WarRoom3D/Demo/m0-demo.v1.json'), read('../fixtures/m0-demo.v1.json'));
});
