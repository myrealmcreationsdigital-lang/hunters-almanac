import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import {
  HUNTNAV_DATABASE_NAME,
  HUNTNAV_DATABASE_VERSION,
  HuntNavDatabaseError,
  WAYPOINT_STORE_NAME,
  openHuntNavDatabase,
} from '../src/storage/huntNavDatabase.js';
import { WaypointValidationError } from '../src/waypoints/model.js';
import { WaypointRepository } from '../src/waypoints/waypointRepository.js';

const CREATED_AT = '2026-09-20T18:42:00.000Z';

function waypoint(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'waypoint-1',
    latitude: 42.123,
    longitude: -77.456,
    category: 'stand',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => {};
  });
}

async function storeRaw(indexedDB, record) {
  const database = await openHuntNavDatabase({ indexedDB });
  const transaction = database.transaction(WAYPOINT_STORE_NAME, 'readwrite');
  const completion = transactionComplete(transaction);
  transaction.objectStore(WAYPOINT_STORE_NAME).put(record);
  await completion;
  database.close();
}

async function readRaw(indexedDB, id) {
  const database = await openHuntNavDatabase({ indexedDB });
  const transaction = database.transaction(WAYPOINT_STORE_NAME, 'readonly');
  const completion = transactionComplete(transaction);
  const request = transaction.objectStore(WAYPOINT_STORE_NAME).get(id);
  let result;
  request.onsuccess = () => { result = request.result; };
  await completion;
  database.close();
  return result;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function controlledOpen({ onBlocked = () => {} } = {}) {
  const request = {};
  const indexedDB = {
    open() { return request; },
  };
  return {
    request,
    opening: openHuntNavDatabase({ indexedDB, onBlocked }),
  };
}

test('initializes database version 1 with the waypoints object store', async () => {
  const indexedDB = new IDBFactory();
  const database = await openHuntNavDatabase({ indexedDB });

  assert.equal(database.name, HUNTNAV_DATABASE_NAME);
  assert.equal(database.version, HUNTNAV_DATABASE_VERSION);
  assert.equal(database.objectStoreNames.contains(WAYPOINT_STORE_NAME), true);
  assert.equal(
    database.transaction(WAYPOINT_STORE_NAME).objectStore(WAYPOINT_STORE_NAME).keyPath,
    'id',
  );
  database.close();
});

test('closes an active database connection when a newer version is requested', async () => {
  const indexedDB = new IDBFactory();
  const database = await openHuntNavDatabase({ indexedDB });
  const upgradeRequest = indexedDB.open(HUNTNAV_DATABASE_NAME, 2);
  const upgraded = await requestResult(upgradeRequest);

  assert.equal(upgraded.version, 2);
  assert.throws(() => database.transaction(WAYPOINT_STORE_NAME), { name: 'InvalidStateError' });
  upgraded.close();
});

test('reports unavailable IndexedDB as a structured open failure', async () => {
  await assert.rejects(
    openHuntNavDatabase({ indexedDB: null }),
    (error) => error instanceof HuntNavDatabaseError && error.code === 'database-unavailable',
  );
});

test('preserves a detectable quota error during database open', async () => {
  const quotaError = new Error('Storage is full');
  quotaError.name = 'QuotaExceededError';

  await assert.rejects(
    openHuntNavDatabase({ indexedDB: { open: () => { throw quotaError; } } }),
    (error) => error instanceof HuntNavDatabaseError && error.code === 'quota-exceeded',
  );
});

test('blocked database open rejects with metadata and invokes the callback', async () => {
  const blockedErrors = [];
  const { opening, request } = controlledOpen({
    onBlocked: (error) => blockedErrors.push(error),
  });
  const outcome = opening.then(
    () => ({ state: 'resolved' }),
    (error) => ({ state: 'rejected', error }),
  );

  request.onblocked({ oldVersion: 1, newVersion: 2 });

  const result = await outcome;
  assert.equal(result.state, 'rejected');
  assert.equal(result.error.code, 'upgrade-blocked');
  assert.deepEqual(result.error.details, { oldVersion: 1, newVersion: 2 });
  assert.deepEqual(blockedErrors, [result.error]);
});

test('throwing blocked callback cannot prevent or replace upgrade-blocked rejection', async () => {
  let callbackCalls = 0;
  const { opening, request } = controlledOpen({
    onBlocked() {
      callbackCalls += 1;
      throw new Error('callback failure');
    },
  });
  const outcome = opening.then(
    () => ({ state: 'resolved' }),
    (error) => ({ state: 'rejected', error }),
  );

  assert.doesNotThrow(() => request.onblocked({ oldVersion: 1, newVersion: 2 }));

  const result = await outcome;
  assert.equal(callbackCalls, 1);
  assert.equal(result.state, 'rejected');
  assert.equal(result.error.code, 'upgrade-blocked');
  assert.notEqual(result.error.message, 'callback failure');
});

test('late success, error, and repeated blocked events preserve rejection and close the database', async () => {
  let callbackCalls = 0;
  let closeCalls = 0;
  const { opening, request } = controlledOpen({
    onBlocked: () => { callbackCalls += 1; },
  });
  const outcome = opening.then(
    () => ({ state: 'resolved' }),
    (error) => ({ state: 'rejected', error }),
  );

  request.onblocked({ oldVersion: 1, newVersion: 2 });
  const firstResult = await outcome;
  request.result = { close: () => { closeCalls += 1; } };
  request.onsuccess();
  request.error = new DOMException('Late open failure', 'UnknownError');
  request.onerror();
  request.onblocked({ oldVersion: 1, newVersion: 2 });
  const finalResult = await outcome;

  assert.equal(firstResult.state, 'rejected');
  assert.equal(firstResult.error.code, 'upgrade-blocked');
  assert.strictEqual(finalResult, firstResult);
  assert.equal(closeCalls, 1);
  assert.equal(callbackCalls, 1);
});

test('creates and lists a waypoint after transaction commit', async () => {
  const repository = new WaypointRepository({ indexedDB: new IDBFactory() });
  const created = await repository.create(waypoint({ title: '  North ridge  ' }));
  const result = await repository.list();

  assert.equal(created.title, 'North ridge');
  assert.deepEqual(result, { records: [created], issues: [] });
  await repository.close();
});

test('updates an existing waypoint and persists the normalized record', async () => {
  const repository = new WaypointRepository({ indexedDB: new IDBFactory() });
  await repository.create(waypoint());
  const updated = await repository.update(waypoint({
    category: 'camera',
    title: '  Ridge camera  ',
    updatedAt: '2026-09-20T19:00:00.000Z',
  }));

  assert.equal(updated.category, 'camera');
  assert.equal(updated.title, 'Ridge camera');
  assert.deepEqual((await repository.list()).records, [updated]);
  await repository.close();
});

test('update returns a typed not-found failure and does not create a record', async () => {
  const repository = new WaypointRepository({ indexedDB: new IDBFactory() });

  await assert.rejects(repository.update(waypoint()), (error) => error.code === 'record-not-found');
  assert.deepEqual(await repository.list(), { records: [], issues: [] });
  await repository.close();
});

test('deletes an existing waypoint and persists its removal', async () => {
  const repository = new WaypointRepository({ indexedDB: new IDBFactory() });
  await repository.create(waypoint());

  const result = await repository.delete('waypoint-1');

  assert.equal(result, undefined);
  assert.deepEqual(await repository.list(), { records: [], issues: [] });
  await repository.close();
});

test('delete returns a typed not-found failure for a missing id', async () => {
  const repository = new WaypointRepository({ indexedDB: new IDBFactory() });

  await assert.rejects(repository.delete('missing'), (error) => error.code === 'record-not-found');
  await repository.close();
});

test('delete rejects an invalid id before opening a transaction', async () => {
  const repository = new WaypointRepository({ indexedDB: new IDBFactory() });

  await assert.rejects(
    repository.delete('   '),
    (error) => error instanceof WaypointValidationError && error.code === 'invalid-record',
  );
});

test('close and reopen retains committed waypoint data', async () => {
  const indexedDB = new IDBFactory();
  const firstRepository = new WaypointRepository({ indexedDB });
  await firstRepository.create(waypoint());
  await firstRepository.close();

  const reopenedRepository = new WaypointRepository({ indexedDB });
  assert.deepEqual((await reopenedRepository.list()).records, [waypoint()]);
  await reopenedRepository.close();
});

test('duplicate create fails without overwriting the stored waypoint', async () => {
  const repository = new WaypointRepository({ indexedDB: new IDBFactory() });
  await repository.create(waypoint({ title: 'Original' }));

  await assert.rejects(
    repository.create(waypoint({ title: 'Replacement' })),
    (error) => error.code === 'duplicate-id' && error.operation === 'create',
  );

  assert.equal((await repository.list()).records[0].title, 'Original');
  await repository.close();
});

test('malformed records are rejected before persistence', async () => {
  const repository = new WaypointRepository({ indexedDB: new IDBFactory() });

  await assert.rejects(
    repository.create(waypoint({ latitude: 91 })),
    (error) => error instanceof WaypointValidationError && error.code === 'invalid-record',
  );
  assert.deepEqual(await repository.list(), { records: [], issues: [] });
  await repository.close();
});

test('unsupported schema records are rejected before persistence', async () => {
  const repository = new WaypointRepository({ indexedDB: new IDBFactory() });

  await assert.rejects(
    repository.create(waypoint({ schemaVersion: 2 })),
    (error) => error.code === 'unsupported-schema-version',
  );
  assert.deepEqual(await repository.list(), { records: [], issues: [] });
  await repository.close();
});

test('valid records remain readable when another stored record is malformed', async () => {
  const indexedDB = new IDBFactory();
  const repository = new WaypointRepository({ indexedDB });
  await repository.create(waypoint());
  await repository.close();
  await storeRaw(indexedDB, waypoint({ id: 'corrupt', latitude: 999 }));

  const reopenedRepository = new WaypointRepository({ indexedDB });
  const result = await reopenedRepository.list();

  assert.deepEqual(result.records, [waypoint()]);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].id, 'corrupt');
  assert.equal(result.issues[0].code, 'invalid-record');
  await reopenedRepository.close();
});

test('unsupported stored schema versions are reported and left untouched', async () => {
  const indexedDB = new IDBFactory();
  const unsupported = waypoint({ id: 'future', schemaVersion: 2 });
  await storeRaw(indexedDB, unsupported);

  const repository = new WaypointRepository({ indexedDB });
  const result = await repository.list();

  assert.deepEqual(result.records, []);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].code, 'unsupported-schema-version');
  assert.deepEqual(await readRaw(indexedDB, 'future'), unsupported);
  await repository.close();
});

test('update does not overwrite an existing unsupported-schema record', async () => {
  const indexedDB = new IDBFactory();
  const unsupported = waypoint({ id: 'future', schemaVersion: 2, title: 'Future data' });
  await storeRaw(indexedDB, unsupported);
  const repository = new WaypointRepository({ indexedDB });

  await assert.rejects(
    repository.update(waypoint({ id: 'future', title: 'Downgraded data' })),
    (error) => error.code === 'unsupported-schema-version',
  );

  assert.deepEqual(await readRaw(indexedDB, 'future'), unsupported);
  await repository.close();
});

test('invalid stored records are reported and are not automatically deleted', async () => {
  const indexedDB = new IDBFactory();
  const corrupt = waypoint({ id: 'corrupt', category: 'unknown' });
  await storeRaw(indexedDB, corrupt);

  const repository = new WaypointRepository({ indexedDB });
  const result = await repository.list();

  assert.equal(result.issues[0].code, 'invalid-record');
  assert.deepEqual(await readRaw(indexedDB, 'corrupt'), corrupt);
  await repository.close();
});

test('a failed transaction rejects and never reports create success', async () => {
  const repository = new WaypointRepository({ indexedDB: new IDBFactory() });
  await repository.create(waypoint());
  let reportedSuccess = false;

  try {
    await repository.create(waypoint());
    reportedSuccess = true;
  } catch (error) {
    assert.equal(error.code, 'duplicate-id');
  }

  assert.equal(reportedSuccess, false);
  assert.equal((await repository.list()).records.length, 1);
  await repository.close();
});
