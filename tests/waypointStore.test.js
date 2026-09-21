import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WaypointStore,
  WaypointStoreError,
  startWaypointStore,
} from '../src/waypoints/waypointStore.js';
import { WaypointRepositoryError } from '../src/waypoints/waypointRepository.js';

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

function repository(overrides = {}) {
  return {
    async list() { return { records: [], issues: [] }; },
    async create(record) { return record; },
    async update(record) { return record; },
    async delete() {},
    ...overrides,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('starts with explicit empty, idle, not-ready state', () => {
  const store = new WaypointStore({ repository: repository() });

  assert.deepEqual(store.getState(), {
    records: [],
    loading: false,
    ready: false,
    issues: [],
    error: null,
  });
});

test('snapshots and repository results cannot mutate authoritative records or issues', async () => {
  const sourceRecord = waypoint({ title: 'Source title' });
  const issueError = Object.assign(new Error('Invalid record'), { code: 'invalid-record' });
  const sourceIssue = {
    index: 1,
    id: 'corrupt',
    code: 'invalid-record',
    error: issueError,
    details: { field: 'latitude' },
  };
  const store = new WaypointStore({
    repository: repository({
      async list() { return { records: [sourceRecord], issues: [sourceIssue] }; },
    }),
  });

  await store.load();
  sourceRecord.title = 'Changed by repository';
  sourceIssue.details.field = 'longitude';
  issueError.code = 'changed';

  const snapshot = store.getState();
  snapshot.records.push(waypoint({ id: 'external' }));
  snapshot.records[0].title = 'Changed by consumer';
  snapshot.issues[0].details.field = 'category';
  snapshot.issues[0].error.code = 'also-changed';

  const current = store.getState();
  assert.equal(current.records.length, 1);
  assert.equal(current.records[0].title, 'Source title');
  assert.equal(current.issues[0].details.field, 'latitude');
  assert.equal(current.issues[0].error.code, 'invalid-record');
});

test('successful load retains valid records and corrupt-record issues separately', async () => {
  const issue = {
    index: 1,
    id: 'corrupt',
    code: 'invalid-record',
    error: Object.assign(new Error('Bad latitude'), { code: 'invalid-record' }),
  };
  const notifications = [];
  const store = new WaypointStore({
    repository: repository({
      async list() { return { records: [waypoint()], issues: [issue] }; },
    }),
  });
  store.subscribe((state) => notifications.push(state));

  const result = await store.load();

  assert.deepEqual(result.records, [waypoint()]);
  assert.equal(result.loading, false);
  assert.equal(result.ready, true);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].id, 'corrupt');
  assert.equal(result.error, null);
  assert.equal(notifications[0].loading, true);
  assert.equal(notifications.at(-1).ready, true);
});

test('load failure preserves records but reports that the latest load is not ready', async () => {
  const failure = Object.assign(new Error('Storage unavailable'), { code: 'database-unavailable' });
  let calls = 0;
  const store = new WaypointStore({
    repository: repository({
      async list() {
        calls += 1;
        if (calls === 1) return { records: [waypoint()], issues: [] };
        throw failure;
      },
    }),
  });
  await store.load();

  await assert.rejects(store.load(), (error) => error === failure);

  const state = store.getState();
  assert.deepEqual(state.records, [waypoint()]);
  assert.equal(state.loading, false);
  assert.equal(state.ready, false);
  assert.deepEqual(state.issues, []);
  assert.equal(state.error.operation, 'load');
  assert.equal(state.error.cause.code, 'database-unavailable');

  state.error.cause.code = 'consumer-change';
  assert.equal(store.getState().error.cause.code, 'database-unavailable');
});

test('latest requested load wins when loads overlap', async () => {
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const store = new WaypointStore({
    repository: repository({
      list() {
        calls += 1;
        return calls === 1 ? first.promise : second.promise;
      },
    }),
  });

  const olderLoad = store.load();
  const newerLoad = store.load();
  second.resolve({ records: [waypoint({ id: 'newer' })], issues: [] });
  await newerLoad;
  first.resolve({ records: [waypoint({ id: 'older' })], issues: [] });
  await olderLoad;

  assert.deepEqual(store.getState().records.map(({ id }) => id), ['newer']);
  assert.equal(store.getState().ready, true);
});

test('a stale load failure cannot replace a newer successful result', async () => {
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const store = new WaypointStore({
    repository: repository({
      list() {
        calls += 1;
        return calls === 1 ? first.promise : second.promise;
      },
    }),
  });

  const olderLoad = store.load();
  const newerLoad = store.load();
  second.resolve({ records: [waypoint({ id: 'newer' })], issues: [] });
  await newerLoad;
  first.reject(new Error('Old failure'));
  await assert.rejects(olderLoad, /Old failure/);

  const state = store.getState();
  assert.deepEqual(state.records.map(({ id }) => id), ['newer']);
  assert.equal(state.ready, true);
  assert.equal(state.error, null);
});

test('create persists before inserting once and notifying success', async () => {
  const persistence = deferred();
  const notifications = [];
  const record = waypoint({ id: 'created' });
  const store = new WaypointStore({
    repository: repository({ create: () => persistence.promise }),
  });
  store.subscribe((state) => notifications.push(state));

  const creating = store.create(record);
  assert.deepEqual(store.getState().records, []);
  assert.equal(notifications.length, 0);
  persistence.resolve(record);

  assert.deepEqual(await creating, record);
  assert.deepEqual(store.getState().records, [record]);
  assert.equal(notifications.length, 1);
  assert.deepEqual(notifications[0].records, [record]);
});

test('failed create leaves records unchanged and exposes the structured failure', async () => {
  const failure = Object.assign(new Error('Duplicate'), {
    code: 'duplicate-id',
    operation: 'create',
  });
  const notifications = [];
  const store = new WaypointStore({
    repository: repository({ async create() { throw failure; } }),
  });
  store.subscribe((state) => notifications.push(state));

  await assert.rejects(store.create(waypoint()), (error) => error === failure);

  assert.deepEqual(store.getState().records, []);
  assert.equal(store.getState().error.operation, 'create');
  assert.equal(store.getState().error.cause.code, 'duplicate-id');
  assert.ok(notifications.every((state) => state.records.length === 0));
});

test('normalizes a real nested DOMException into safely detached plain error data', async () => {
  const nativeCause = new DOMException('Transaction aborted', 'AbortError');
  const failure = new WaypointRepositoryError(
    'transaction-aborted',
    'Waypoint storage transaction was aborted',
    { cause: nativeCause, operation: 'create' },
  );
  failure.details = { retryable: false };
  const store = new WaypointStore({
    repository: repository({ async create() { throw failure; } }),
  });
  await assert.rejects(store.create(waypoint()), (error) => error === failure);

  let snapshot;
  assert.doesNotThrow(() => { snapshot = store.getState(); });
  assert.equal(snapshot.error.operation, 'create');
  assert.equal(Object.getPrototypeOf(snapshot.error.cause), Object.prototype);
  assert.equal(snapshot.error.cause.name, 'WaypointRepositoryError');
  assert.equal(snapshot.error.cause.message, 'Waypoint storage transaction was aborted');
  assert.equal(snapshot.error.cause.code, 'transaction-aborted');
  assert.deepEqual(snapshot.error.cause.details, { retryable: false });
  assert.equal(Object.getPrototypeOf(snapshot.error.cause.cause), Object.prototype);
  assert.equal(snapshot.error.cause.cause.name, nativeCause.name);
  assert.equal(snapshot.error.cause.cause.message, nativeCause.message);
  assert.equal(snapshot.error.cause.cause.code, nativeCause.code);

  snapshot.error.cause.message = 'Changed snapshot';
  snapshot.error.cause.details.retryable = true;
  snapshot.error.cause.cause.name = 'ChangedCause';
  assert.equal(failure.message, 'Waypoint storage transaction was aborted');
  assert.deepEqual(failure.details, { retryable: false });
  assert.equal(nativeCause.name, 'AbortError');

  const laterSnapshot = store.getState();
  assert.equal(laterSnapshot.error.cause.message, 'Waypoint storage transaction was aborted');
  assert.deepEqual(laterSnapshot.error.cause.details, { retryable: false });
  assert.equal(laterSnapshot.error.cause.cause.name, 'AbortError');
});

test('subscribers receive isolated normalized native-error snapshots', async () => {
  const nativeCause = new DOMException('Storage transaction failed', 'UnknownError');
  const failure = new WaypointRepositoryError(
    'storage-failure',
    'Waypoint storage failed',
    { cause: nativeCause, operation: 'create' },
  );
  const store = new WaypointStore({
    repository: repository({ async create() { throw failure; } }),
  });
  let secondSnapshot;
  store.subscribe((state) => {
    state.error.cause.code = 'changed-by-first-listener';
    state.error.cause.cause.message = 'changed-by-first-listener';
  });
  store.subscribe((state) => { secondSnapshot = state; });

  await assert.rejects(store.create(waypoint()), (error) => error === failure);

  assert.equal(secondSnapshot.error.cause.code, 'storage-failure');
  assert.equal(secondSnapshot.error.cause.cause.name, nativeCause.name);
  assert.equal(secondSnapshot.error.cause.cause.message, 'Storage transaction failed');
  assert.equal(failure.code, 'storage-failure');
  assert.equal(nativeCause.message, 'Storage transaction failed');
  assert.equal(store.getState().error.cause.code, 'storage-failure');
  assert.equal(store.getState().error.cause.cause.message, 'Storage transaction failed');
});

test('update persists before replacing the matching record without reordering', async () => {
  const persistence = deferred();
  const original = waypoint({ id: 'first', title: 'Original' });
  const unrelated = waypoint({ id: 'second' });
  const updated = waypoint({ id: 'first', title: 'Updated' });
  const store = new WaypointStore({
    repository: repository({
      async list() { return { records: [original, unrelated], issues: [] }; },
      update: () => persistence.promise,
    }),
  });
  await store.load();

  const updating = store.update(updated);
  assert.deepEqual(store.getState().records, [original, unrelated]);
  persistence.resolve(updated);
  await updating;

  assert.deepEqual(store.getState().records, [updated, unrelated]);
});

test('failed update leaves the original and unrelated records unchanged', async () => {
  const original = waypoint({ id: 'first', title: 'Original' });
  const unrelated = waypoint({ id: 'second' });
  const failure = Object.assign(new Error('Write failed'), { code: 'storage-failure' });
  const store = new WaypointStore({
    repository: repository({
      async list() { return { records: [original, unrelated], issues: [] }; },
      async update() { throw failure; },
    }),
  });
  await store.load();

  await assert.rejects(
    store.update(waypoint({ id: 'first', title: 'Changed' })),
    (error) => error === failure,
  );

  assert.deepEqual(store.getState().records, [original, unrelated]);
  assert.equal(store.getState().error.operation, 'update');
});

test('update rejects a runtime-missing record without writing or appending it', async () => {
  let updateCalls = 0;
  const store = new WaypointStore({
    repository: repository({
      async update(record) {
        updateCalls += 1;
        return record;
      },
    }),
  });

  await assert.rejects(
    store.update(waypoint({ id: 'missing' })),
    (error) => error instanceof WaypointStoreError
      && error.code === 'runtime-record-not-found'
      && error.operation === 'update',
  );

  assert.equal(updateCalls, 0);
  assert.deepEqual(store.getState().records, []);
  assert.equal(store.getState().error.operation, 'update');
});

test('delete persists before removing only the matching record', async () => {
  const persistence = deferred();
  const first = waypoint({ id: 'first' });
  const second = waypoint({ id: 'second' });
  const store = new WaypointStore({
    repository: repository({
      async list() { return { records: [first, second], issues: [] }; },
      delete: () => persistence.promise,
    }),
  });
  await store.load();

  const deleting = store.delete('first');
  assert.deepEqual(store.getState().records, [first, second]);
  persistence.resolve();
  await deleting;

  assert.deepEqual(store.getState().records, [second]);
});

test('update and delete match the repository normalized waypoint id', async () => {
  const original = waypoint({ title: 'Original' });
  const updated = waypoint({ title: 'Updated' });
  const passedIds = [];
  const store = new WaypointStore({
    repository: repository({
      async list() { return { records: [original], issues: [] }; },
      async update(record) { return { ...record, id: record.id.trim() }; },
      async delete(id) { passedIds.push(id); },
    }),
  });
  await store.load();

  await store.update({ ...updated, id: ' waypoint-1 ' });
  assert.deepEqual(store.getState().records, [updated]);

  await store.delete(' waypoint-1 ');
  assert.deepEqual(passedIds, [' waypoint-1 ']);
  assert.deepEqual(store.getState().records, []);
});

test('failed delete leaves every runtime record present and reports delete failure', async () => {
  const records = [waypoint({ id: 'first' }), waypoint({ id: 'second' })];
  const failure = Object.assign(new Error('Delete failed'), { code: 'transaction-aborted' });
  const store = new WaypointStore({
    repository: repository({
      async list() { return { records, issues: [] }; },
      async delete() { throw failure; },
    }),
  });
  await store.load();

  await assert.rejects(store.delete('first'), (error) => error === failure);

  assert.deepEqual(store.getState().records, records);
  assert.equal(store.getState().error.operation, 'delete');
  assert.equal(store.getState().error.cause.code, 'transaction-aborted');
});

test('throwing listeners are isolated and unsubscribe is idempotent', async () => {
  const laterSnapshots = [];
  let throwingCalls = 0;
  const store = new WaypointStore({ repository: repository() });
  const unsubscribeThrowing = store.subscribe(() => {
    throwingCalls += 1;
    throw new Error('Listener failed');
  });
  const unsubscribeLater = store.subscribe((state) => laterSnapshots.push(state));

  await assert.doesNotReject(store.create(waypoint()));
  assert.equal(throwingCalls, 1);
  assert.deepEqual(laterSnapshots[0].records, [waypoint()]);
  assert.equal(store.getState().error, null);

  unsubscribeThrowing();
  unsubscribeThrowing();
  unsubscribeLater();
  unsubscribeLater();
  await store.delete('waypoint-1');

  assert.equal(throwingCalls, 1);
  assert.equal(laterSnapshots.length, 1);
  assert.deepEqual(store.getState().records, []);
});

test('startup begins loading without waiting and contains load rejection in store state', async () => {
  const listing = deferred();
  let listCalls = 0;
  const repo = repository({
    list() {
      listCalls += 1;
      return listing.promise;
    },
  });

  const store = startWaypointStore({ repository: repo });
  let unrelatedStartupContinued = false;
  unrelatedStartupContinued = true;

  assert.equal(listCalls, 1);
  assert.equal(unrelatedStartupContinued, true);
  assert.equal(store.getState().loading, true);
  assert.equal(store.getState().ready, false);

  listing.reject(Object.assign(new Error('IndexedDB unavailable'), {
    code: 'database-unavailable',
  }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(store.getState().loading, false);
  assert.equal(store.getState().ready, false);
  assert.equal(store.getState().error.operation, 'load');
  assert.equal(store.getState().error.cause.code, 'database-unavailable');
});
