import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_WAYPOINT_CATEGORY,
  WAYPOINT_CATEGORIES,
  WAYPOINT_CATEGORY_LABELS,
  WAYPOINT_SCHEMA_VERSION,
  WaypointValidationError,
  createWaypoint,
  normalizeWaypoint,
} from '../src/waypoints/model.js';

const CREATED_AT = '2026-09-20T18:42:00.000Z';

function waypoint(overrides = {}) {
  return {
    schemaVersion: WAYPOINT_SCHEMA_VERSION,
    id: 'waypoint-1',
    latitude: 42.123,
    longitude: -77.456,
    category: 'stand',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function assertValidationError(action, { code = 'invalid-record', field } = {}) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof WaypointValidationError);
    assert.equal(error.code, code);
    if (field !== undefined) assert.equal(error.field, field);
    return true;
  });
}

test('accepts and normalizes a valid waypoint record', () => {
  assert.deepEqual(normalizeWaypoint(waypoint({
    id: ' waypoint-1 ',
    title: '  North ridge  ',
    note: '  Check west wind  ',
  })), waypoint({
    title: 'North ridge',
    note: 'Check west wind',
  }));
});

test('defines the stable category keys and labels', () => {
  assert.deepEqual(WAYPOINT_CATEGORIES, [
    'stand', 'camera', 'parking', 'access', 'sign', 'hazard', 'other',
  ]);
  assert.equal(WAYPOINT_CATEGORY_LABELS.camera, 'Trail Camera');
  assert.equal(DEFAULT_WAYPOINT_CATEGORY, 'other');
});

test('creates schema version 1 waypoints with a stable nonempty generated id', () => {
  const created = createWaypoint(
    { latitude: 42.1, longitude: -77.2 },
    { now: () => new Date(CREATED_AT), idFactory: () => 'generated-id' },
  );

  assert.equal(created.schemaVersion, 1);
  assert.equal(created.id, 'generated-id');
  assert.equal(created.category, 'other');
  assert.equal(normalizeWaypoint(created).id, created.id);
  assert.equal(created.createdAt, CREATED_AT);
  assert.equal(created.updatedAt, CREATED_AT);
});

test('uses platform UUID generation for a new waypoint when available', () => {
  const created = createWaypoint(
    { latitude: 0, longitude: 0 },
    { now: () => new Date(CREATED_AT) },
  );

  assert.equal(typeof created.id, 'string');
  assert.ok(created.id.length > 0);
});

test('accepts every supported waypoint category', () => {
  for (const category of WAYPOINT_CATEGORIES) {
    assert.equal(normalizeWaypoint(waypoint({ category })).category, category);
  }
});

test('rejects an unknown waypoint category', () => {
  assertValidationError(() => normalizeWaypoint(waypoint({ category: 'scrape' })), {
    field: 'category',
  });
});

test('rejects invalid waypoint ids', () => {
  assertValidationError(() => normalizeWaypoint(waypoint({ id: '   ' })), { field: 'id' });
  assertValidationError(() => normalizeWaypoint(waypoint({ id: 42 })), { field: 'id' });
});

test('accepts latitude boundaries and rejects invalid latitude', () => {
  assert.equal(normalizeWaypoint(waypoint({ latitude: -90 })).latitude, -90);
  assert.equal(normalizeWaypoint(waypoint({ latitude: 90 })).latitude, 90);
  for (const latitude of [-90.0001, 90.0001, Number.NaN, Infinity, '42']) {
    assertValidationError(() => normalizeWaypoint(waypoint({ latitude })), { field: 'latitude' });
  }
});

test('accepts longitude boundaries and rejects invalid longitude', () => {
  assert.equal(normalizeWaypoint(waypoint({ longitude: -180 })).longitude, -180);
  assert.equal(normalizeWaypoint(waypoint({ longitude: 180 })).longitude, 180);
  for (const longitude of [-180.0001, 180.0001, Number.NaN, -Infinity, '-77']) {
    assertValidationError(() => normalizeWaypoint(waypoint({ longitude })), { field: 'longitude' });
  }
});

test('rejects invalid ISO timestamps', () => {
  for (const createdAt of [
    'not-a-date',
    '2026-09-20',
    '2026-02-30T12:00:00.000Z',
    '2026-09-20T25:00:00.000Z',
  ]) {
    assertValidationError(() => normalizeWaypoint(waypoint({ createdAt })), { field: 'createdAt' });
  }
});

test('normalizes valid offset timestamps to UTC ISO strings', () => {
  const normalized = normalizeWaypoint(waypoint({
    createdAt: '2026-09-20T14:42:00-04:00',
    updatedAt: '2026-09-20T14:43:00-04:00',
  }));
  assert.equal(normalized.createdAt, CREATED_AT);
  assert.equal(normalized.updatedAt, '2026-09-20T18:43:00.000Z');
});

test('rejects updatedAt earlier than createdAt', () => {
  assertValidationError(() => normalizeWaypoint(waypoint({
    updatedAt: '2026-09-20T18:41:59.999Z',
  })), { field: 'updatedAt' });
});

test('trims title, omits empty title, and enforces the 80-character limit', () => {
  assert.equal(normalizeWaypoint(waypoint({ title: ` ${'a'.repeat(80)} ` })).title.length, 80);
  assert.equal('title' in normalizeWaypoint(waypoint({ title: '   ' })), false);
  assertValidationError(() => normalizeWaypoint(waypoint({ title: 'a'.repeat(81) })), {
    field: 'title',
  });
});

test('trims note, omits empty note, and enforces the 1000-character limit', () => {
  assert.equal(normalizeWaypoint(waypoint({ note: ` ${'a'.repeat(1_000)} ` })).note.length, 1_000);
  assert.equal('note' in normalizeWaypoint(waypoint({ note: '\n\t ' })), false);
  assertValidationError(() => normalizeWaypoint(waypoint({ note: 'a'.repeat(1_001) })), {
    field: 'note',
  });
});

test('rejects unsupported waypoint schema versions distinctly', () => {
  assertValidationError(() => normalizeWaypoint(waypoint({ schemaVersion: 2 })), {
    code: 'unsupported-schema-version',
    field: 'schemaVersion',
  });
});
