import test from 'node:test';
import assert from 'node:assert/strict';
import { PARCEL_STATES } from '../src/parcels/ParcelProvider.js';
import { ParcelController } from '../src/parcels/parcelController.js';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

Object.defineProperty(globalThis.navigator, 'onLine', {
  configurable: true,
  value: true,
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function parcel(id) {
  return {
    type: 'Feature',
    id: String(id),
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    },
    properties: {
      parcelId: String(id),
      displayId: String(id),
      providerFeatureId: String(id),
      owner: null,
      ownerAvailability: 'unavailable',
      acreage: null,
      acreageBasis: 'unknown',
      jurisdiction: { country: 'US', subdivision: 'NY', county: 'Steuben', municipality: null },
      source: { name: 'Test parcels', url: 'https://example.test', rollYear: null, spatialYear: null, retrievedAt: null },
      duplicateGeometry: false,
    },
  };
}

function harness(queryViewport) {
  const sourceUpdates = [];
  const states = [];
  const selections = [];
  let bounds = [-77.5, 42, -77.25, 42.25];
  const source = { setData: (data) => sourceUpdates.push(data) };
  const map = {
    getBounds: () => ({
      getWest: () => bounds[0],
      getSouth: () => bounds[1],
      getEast: () => bounds[2],
      getNorth: () => bounds[3],
    }),
    getZoom: () => 15,
    getSource: () => source,
    getLayer: () => undefined,
  };
  const controller = new ParcelController({
    map,
    provider: { queryViewport },
    onState: (state) => states.push(state),
    onSelection: (selection) => selections.push(selection),
    requestDelay: 0,
  });

  return {
    controller,
    sourceUpdates,
    states,
    selections,
    setBounds(nextBounds) { bounds = nextBounds; },
  };
}

test('renders a successful active result before immediately starting the latest pending viewport', async () => {
  const first = deferred();
  const second = deferred();
  const calls = [];
  const pending = [first, second];
  const testHarness = harness((request) => {
    calls.push(request);
    return pending.shift().promise;
  });

  testHarness.controller.refresh();
  await wait(5);
  testHarness.setBounds([-77.25, 42, -77, 42.25]);
  testHarness.controller.refresh();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].signal.aborted, false);

  first.resolve({ state: PARCEL_STATES.READY, parcels: [parcel(1)], complete: true });
  await wait(5);

  assert.deepEqual(testHarness.sourceUpdates.map((data) => data.features.map((feature) => feature.id)), [['1']]);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].bbox, [-77.25, 42, -77, 42.25]);

  second.resolve({ state: PARCEL_STATES.READY, parcels: [parcel(2)], complete: true });
  await wait(5);
});

for (const obsoleteResult of [
  { name: 'empty', value: { state: PARCEL_STATES.EMPTY, count: 0, parcels: [] } },
  { name: 'unavailable', value: { state: PARCEL_STATES.UNAVAILABLE, parcels: [] } },
  { name: 'too-dense', value: { state: PARCEL_STATES.TOO_DENSE, count: 3500, parcels: [] } },
  { name: 'error', value: new Error('service unavailable') },
]) {
  test(`obsolete ${obsoleteResult.name} result does not clear displayed geometry`, async () => {
    const obsolete = deferred();
    const latest = deferred();
    let call = 0;
    const testHarness = harness(async () => {
      call += 1;
      if (call === 1) {
        return { state: PARCEL_STATES.READY, parcels: [parcel('current')], complete: true };
      }
      if (call === 2) return obsolete.promise;
      return latest.promise;
    });

    testHarness.controller.refresh();
    await wait(5);
    assert.deepEqual(testHarness.sourceUpdates.map((data) => data.features.length), [1]);

    testHarness.controller.refresh();
    await wait(5);
    testHarness.setBounds([-77.25, 42, -77, 42.25]);
    testHarness.controller.refresh();

    if (obsoleteResult.value instanceof Error) obsolete.reject(obsoleteResult.value);
    else obsolete.resolve(obsoleteResult.value);
    await wait(5);

    assert.deepEqual(testHarness.sourceUpdates.map((data) => data.features.length), [1]);
    assert.deepEqual(testHarness.selections, []);
    assert.equal(call, 3);

    latest.resolve({ state: PARCEL_STATES.READY, parcels: [parcel('latest')], complete: true });
    await wait(5);
  });
}
