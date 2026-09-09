import test from 'node:test';
import assert from 'node:assert/strict';
import { collectRenderedParcels } from '../src/parcels/parcelController.js';

Object.defineProperty(globalThis.navigator, 'onLine', {
  configurable: true,
  value: true,
});

function parcel(id, xOffset = 0) {
  return {
    type: 'Feature',
    id: String(id),
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [xOffset, 0], [xOffset + 1, 0], [xOffset + 1, 1], [xOffset, 1], [xOffset, 0],
      ]],
    },
    properties: {
      providerFeatureId: String(id),
      parcelId: String(id),
      displayId: String(id),
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

async function loadController() {
  const { ParcelController } = await import('../src/parcels/parcelController.js');
  return ParcelController;
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.fail('Timed out waiting for controller state');
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function harness(ParcelController, queryResults = []) {
  const diagnostics = [];
  const selections = [];
  const queries = [];
  const filters = [];
  const idleHandlers = [];
  const projectedLngLats = [];
  const sourceUpdates = [];
  const source = { setData: (data) => sourceUpdates.push(data) };
  const map = {
    getBounds: () => ({
      getWest: () => -77.5,
      getSouth: () => 42,
      getEast: () => -77.25,
      getNorth: () => 42.25,
    }),
    getZoom: () => 15,
    getSource: () => source,
    getLayer: () => true,
    setFilter: (layer, filter) => filters.push({ layer, filter }),
    queryRenderedFeatures: (geometry) => {
      queries.push(geometry);
      return queryResults.shift() ?? [];
    },
    project: (lngLat) => {
      projectedLngLats.push(lngLat);
      return { x: lngLat.lng * 10, y: lngLat.lat * 10 };
    },
    once: (event, handler) => {
      if (event === 'idle') idleHandlers.push(handler);
    },
  };
  const controller = new ParcelController({
    map,
    provider: { queryViewport: async () => ({ state: 'ready', parcels: [], complete: true }) },
    onState: () => {},
    onSelection: (selection) => selections.push(selection),
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    requestDelay: 0,
  });

  return {
    controller,
    diagnostics,
    filters,
    idleHandlers,
    map,
    projectedLngLats,
    queryResults,
    queries,
    selections,
    sourceUpdates,
  };
}

test('selects coincident parcel records without geometry-based deduplication', () => {
  const first = { properties: { providerFeatureId: '101' } };
  const second = { properties: { providerFeatureId: '102' } };
  const parcels = new Map([['101', first], ['102', second]]);
  const rendered = [
    { properties: { providerFeatureId: '101' } },
    { properties: { providerFeatureId: '102' } },
    { properties: { providerFeatureId: '101' } },
  ];

  assert.deepEqual(collectRenderedParcels(rendered, parcels), [first, second]);
});

test('uses an exact parcel hit without running the touch-tolerance query', async () => {
  const ParcelController = await loadController();
  const first = parcel('101');
  const testHarness = harness(ParcelController, [[first], [parcel('neighbor')]]);
  testHarness.controller.parcels = new Map([['101', first]]);

  testHarness.controller.onMapClick({ point: { x: 120, y: 80 } });

  assert.deepEqual(testHarness.queries, [{ x: 120, y: 80 }]);
  assert.deepEqual(testHarness.selections, [[first]]);
  assert.deepEqual(testHarness.diagnostics[0].exact, {
    renderedFeatureCount: 1,
    returnedFeatureIds: ['101'],
    resolutions: [{ id: '101', current: true, previous: false }],
  });
  assert.equal(testHarness.diagnostics[0].tolerance, null);
  assert.equal(testHarness.diagnostics[0].action, 'replaced');
});

test('clears selection after both exact and touch-tolerance queries miss empty map', async () => {
  const ParcelController = await loadController();
  const first = parcel('101');
  const testHarness = harness(ParcelController, [[first], [], []]);
  testHarness.controller.parcels = new Map([['101', first]]);
  testHarness.controller.onMapClick({ point: { x: 120, y: 80 } });

  testHarness.controller.onMapClick({ point: { x: 240, y: 160 } });

  assert.deepEqual(testHarness.selections, [[first], []]);
  assert.equal(
    testHarness.diagnostics.at(-1).clearReason,
    'map-tap-no-rendered-parcel-features',
  );
});

test('reports rendered parcel IDs that fail both current and handoff lookup resolution', async () => {
  const ParcelController = await loadController();
  const renderedOnly = parcel('rendered-only');
  const testHarness = harness(ParcelController, [[renderedOnly], [renderedOnly]]);

  testHarness.controller.onMapClick({ point: { x: 240, y: 160 } });

  assert.equal(
    testHarness.diagnostics.at(-1).clearReason,
    'map-tap-rendered-feature-ids-unresolved',
  );
  assert.deepEqual(testHarness.diagnostics.at(-1).exact.resolutions, [
    { id: 'rendered-only', current: false, previous: false },
  ]);
  assert.deepEqual(testHarness.diagnostics.at(-1).tolerance.resolutions, [
    { id: 'rendered-only', current: false, previous: false },
  ]);
});

test('selects a parcel found only by the small touch-tolerance box', async () => {
  const ParcelController = await loadController();
  const first = parcel('101');
  const testHarness = harness(ParcelController, [[], [first]]);
  testHarness.controller.parcels = new Map([['101', first]]);

  testHarness.controller.onMapClick({ point: { x: 120, y: 80 } });

  assert.deepEqual(testHarness.queries, [
    { x: 120, y: 80 },
    [[112, 72], [128, 88]],
  ]);
  assert.deepEqual(testHarness.selections, [[first]]);
});

test('selects a geographic Polygon interior when rendered hit testing misses', async () => {
  const ParcelController = await loadController();
  const first = parcel('101');
  const testHarness = harness(ParcelController, [[]]);
  testHarness.controller.parcels = new Map([['101', first]]);

  testHarness.controller.onMapClick({
    point: { x: 120, y: 80 },
    lngLat: { lng: 0.5, lat: 0.5 },
  });

  assert.equal(testHarness.queries.length, 1);
  assert.deepEqual(testHarness.selections, [[first]]);
  assert.equal(testHarness.diagnostics.at(-1).geographic.relation, 'inside');
  assert.equal(testHarness.diagnostics.at(-1).geographic.lookup, 'current');
});

test('clears a stable geographic empty-space tap after rendered queries also miss', async () => {
  const ParcelController = await loadController();
  const first = parcel('101');
  const testHarness = harness(ParcelController, [[first], [], []]);
  testHarness.controller.parcels = new Map([['101', first]]);
  testHarness.controller.onMapClick({ point: { x: 120, y: 80 }, lngLat: { lng: 0.5, lat: 0.5 } });

  testHarness.controller.onMapClick({ point: { x: 240, y: 160 }, lngLat: { lng: 5, lat: 5 } });

  assert.deepEqual(testHarness.selections, [[first], []]);
  assert.equal(testHarness.diagnostics.at(-1).geographic.relation, 'outside');
  assert.equal(testHarness.diagnostics.at(-1).clearReason, 'map-tap-no-rendered-parcel-features');
});

test('preserves coincident records found through geographic containment', async () => {
  const ParcelController = await loadController();
  const first = parcel('101');
  const coincident = parcel('102');
  const testHarness = harness(ParcelController, [[]]);
  testHarness.controller.parcels = new Map([
    ['101', first],
    ['102', coincident],
  ]);

  testHarness.controller.onMapClick({
    point: { x: 120, y: 80 },
    lngLat: { lng: 0.5, lat: 0.5 },
  });

  assert.deepEqual(testHarness.selections, [[first, coincident]]);
});

test('preserves coincident records on their shared geographic boundary', async () => {
  const ParcelController = await loadController();
  const first = parcel('101');
  const coincident = parcel('102');
  const testHarness = harness(ParcelController, [[]]);
  testHarness.controller.parcels = new Map([
    ['101', first],
    ['102', coincident],
  ]);

  testHarness.controller.onMapClick({
    point: { x: 120, y: 80 },
    lngLat: { lng: 0, lat: 0.5 },
  });

  assert.deepEqual(testHarness.selections, [[first, coincident]]);
  assert.equal(testHarness.diagnostics.at(-1).geographic.relation, 'boundary');
  assert.equal(testHarness.diagnostics.at(-1).ambiguous, false);
});

test('preserves the selected parcel on a shared geographic boundary', async () => {
  const ParcelController = await loadController();
  const first = parcel('101');
  const adjacent = parcel('102', 1);
  const testHarness = harness(ParcelController, [[first], []]);
  testHarness.controller.parcels = new Map([
    ['101', first],
    ['102', adjacent],
  ]);
  testHarness.controller.onMapClick({ point: { x: 120, y: 80 }, lngLat: { lng: 0.5, lat: 0.5 } });

  testHarness.controller.onMapClick({
    point: { x: 128, y: 80 },
    lngLat: { lng: 1, lat: 0.5 },
  });

  assert.equal(testHarness.queries.length, 2);
  assert.deepEqual(testHarness.selections, [[first]]);
  assert.equal(testHarness.diagnostics.at(-1).geographic.relation, 'boundary');
  assert.equal(testHarness.diagnostics.at(-1).ambiguous, true);
  assert.equal(testHarness.diagnostics.at(-1).action, 'preserved');
});

test('does not choose an arbitrary parcel on an unselected shared geographic boundary', async () => {
  const ParcelController = await loadController();
  const first = parcel('101');
  const adjacent = parcel('102', 1);
  const testHarness = harness(ParcelController, [[]]);
  testHarness.controller.parcels = new Map([
    ['101', first],
    ['102', adjacent],
  ]);

  testHarness.controller.onMapClick({
    point: { x: 128, y: 80 },
    lngLat: { lng: 1, lat: 0.5 },
  });

  assert.deepEqual(testHarness.selections, []);
  assert.equal(testHarness.diagnostics.at(-1).ambiguous, true);
  assert.equal(testHarness.diagnostics.at(-1).action, 'preserved');
});

test('uses current geographic geometry before previous handoff geometry', async () => {
  const ParcelController = await loadController();
  const previous = parcel('previous');
  const current = parcel('current');
  const testHarness = harness(ParcelController, [[]]);
  testHarness.controller.parcels = new Map([['current', current]]);
  testHarness.controller.previousParcels = new Map([['previous', previous]]);
  testHarness.controller.sourceHandoffInFlight = true;

  testHarness.controller.onMapClick({
    point: { x: 120, y: 80 },
    lngLat: { lng: 0.5, lat: 0.5 },
  });

  assert.deepEqual(testHarness.selections, [[current]]);
  assert.equal(testHarness.diagnostics.at(-1).geographic.lookup, 'current');
});

test('consults previous geographic geometry only during a source handoff', async () => {
  const ParcelController = await loadController();
  const previous = parcel('previous');
  const current = parcel('current', 2);
  const testHarness = harness(ParcelController, [[], [], []]);
  testHarness.controller.parcels = new Map([['current', current]]);
  testHarness.controller.previousParcels = new Map([['previous', previous]]);

  testHarness.controller.onMapClick({
    point: { x: 120, y: 80 },
    lngLat: { lng: 0.5, lat: 0.5 },
  });
  assert.deepEqual(testHarness.selections, [[]]);

  testHarness.controller.previousParcels = new Map([['previous', previous]]);
  testHarness.controller.sourceHandoffInFlight = true;
  testHarness.controller.onMapClick({
    point: { x: 120, y: 80 },
    lngLat: { lng: 0.5, lat: 0.5 },
  });

  assert.deepEqual(testHarness.selections, [[], [previous]]);
  assert.equal(testHarness.diagnostics.at(-1).geographic.lookup, 'previous');
});

test('does not replace an open selection with ambiguous adjacent tolerance candidates', async () => {
  const ParcelController = await loadController();
  const first = parcel('101');
  const adjacent = parcel('102', 1);
  const testHarness = harness(ParcelController, [[first], [], [first, adjacent]]);
  testHarness.controller.parcels = new Map([
    ['101', first],
    ['102', adjacent],
  ]);

  testHarness.controller.onMapClick({ point: { x: 120, y: 80 } });
  testHarness.controller.onMapClick({ point: { x: 128, y: 80 } });

  assert.equal(testHarness.queries.length, 3);
  assert.deepEqual(testHarness.selections, [[first]]);
  assert.equal(testHarness.diagnostics.at(-1).ambiguous, true);
  assert.equal(testHarness.diagnostics.at(-1).action, 'preserved');
});

test('preserves coincident records returned by an exact parcel hit', async () => {
  const ParcelController = await loadController();
  const first = parcel('101');
  const coincident = parcel('102');
  const testHarness = harness(ParcelController, [[first, coincident, first]]);
  testHarness.controller.parcels = new Map([
    ['101', first],
    ['102', coincident],
  ]);

  testHarness.controller.onMapClick({ point: { x: 120, y: 80 } });

  assert.deepEqual(testHarness.selections, [[first, coincident]]);
});

test('replaces an open parcel selection directly when another parcel is tapped', async () => {
  const ParcelController = await loadController();
  const first = parcel('101');
  const second = parcel('202');
  const testHarness = harness(ParcelController, [[first], [second]]);
  testHarness.controller.parcels = new Map([
    ['101', first],
    ['202', second],
  ]);

  testHarness.controller.onMapClick({ point: { x: 120, y: 80 } });
  testHarness.controller.onMapClick({ point: { x: 220, y: 80 } });

  assert.deepEqual(testHarness.selections, [[first], [second]]);
});

test('keeps selection through a rendered-feature lookup handoff, then clears it after idle if stale', async () => {
  const ParcelController = await loadController();
  const oldParcel = parcel('old');
  const nextParcel = parcel('next');
  const testHarness = harness(ParcelController, [[oldParcel], [oldParcel]]);
  testHarness.controller.parcels = new Map([['old', oldParcel]]);
  testHarness.controller.provider.queryViewport = async () => ({
    state: 'ready',
    parcels: [nextParcel],
    complete: true,
  });

  testHarness.controller.onMapClick({ point: { x: 120, y: 80 } });
  testHarness.controller.refresh();
  await waitFor(() => testHarness.idleHandlers.length === 1);
  assert.equal(testHarness.controller.previousParcels.get('old'), oldParcel);
  testHarness.controller.onMapClick({ point: { x: 120, y: 80 } });

  assert.deepEqual(testHarness.selections, [[oldParcel]]);
  assert.equal(testHarness.idleHandlers.length, 1);
  assert.deepEqual(testHarness.diagnostics.at(-1).exact.resolutions, [
    { id: 'old', current: false, previous: true },
  ]);

  testHarness.idleHandlers[0]();

  assert.deepEqual(testHarness.selections, [[oldParcel], []]);
  assert.equal(
    testHarness.diagnostics.at(-1).clearReason,
    'refresh-reconciliation-selection-not-in-current-source',
  );
});

test('keeps a selected parcel after source replacement when it remains in the rendered viewport', async () => {
  const ParcelController = await loadController();
  const selectedParcel = parcel('101');
  const refreshedParcel = parcel('101');
  const testHarness = harness(ParcelController, [[selectedParcel]]);
  testHarness.controller.parcels = new Map([['101', selectedParcel]]);
  testHarness.controller.provider.queryViewport = async () => ({
    state: 'ready',
    parcels: [refreshedParcel],
    complete: true,
  });

  testHarness.controller.onMapClick({ point: { x: 120, y: 80 } });
  testHarness.controller.refresh();
  await waitFor(() => testHarness.idleHandlers.length === 1);
  testHarness.idleHandlers[0]();

  assert.deepEqual(testHarness.selections, [[selectedParcel]]);
  assert.equal(testHarness.controller.previousParcels.size, 0);
});

test('does not immediately clear a zero-hit tap while parcel refresh is active', async () => {
  const ParcelController = await loadController();
  const first = parcel('101');
  const refresh = deferred();
  const testHarness = harness(ParcelController, [[first], [], []]);
  testHarness.controller.parcels = new Map([['101', first]]);
  testHarness.controller.provider.queryViewport = () => refresh.promise;

  testHarness.controller.onMapClick({ point: { x: 120, y: 80 }, lngLat: { lng: 12, lat: 8 } });
  testHarness.controller.refresh();
  testHarness.controller.onMapClick({ point: { x: 220, y: 80 }, lngLat: { lng: 2.5, lat: 0.5 } });

  assert.deepEqual(testHarness.selections, [[first]]);
  assert.equal(testHarness.diagnostics.at(-1).action, 'preserved');
  assert.equal(testHarness.diagnostics.at(-1).retryPending, true);

  refresh.resolve({ state: 'ready', parcels: [first], complete: true });
});

test('selects the intended parcel when a deferred tap succeeds after refresh', async () => {
  const ParcelController = await loadController();
  const first = parcel('101');
  const intended = parcel('202', 2);
  const refresh = deferred();
  const queryResults = [[first], [], []];
  const testHarness = harness(ParcelController, queryResults);
  testHarness.controller.parcels = new Map([['101', first]]);
  testHarness.controller.provider.queryViewport = () => refresh.promise;

  testHarness.controller.onMapClick({ point: { x: 120, y: 80 }, lngLat: { lng: 12, lat: 8 } });
  testHarness.controller.refresh();
  testHarness.controller.onMapClick({ point: { x: 220, y: 80 }, lngLat: { lng: 2.5, lat: 0.5 } });
  refresh.resolve({ state: 'ready', parcels: [intended], complete: true });
  await waitFor(() => testHarness.idleHandlers.length === 1
    && testHarness.controller.coordinator.controller === null);
  queryResults.push([]);

  testHarness.idleHandlers[0]();

  assert.deepEqual(testHarness.projectedLngLats, [{ lng: 2.5, lat: 0.5 }]);
  assert.deepEqual(testHarness.selections, [[first], [intended]]);
  assert.equal(testHarness.diagnostics.at(-1).kind, 'map-tap-retry');
  assert.equal(testHarness.diagnostics.at(-1).action, 'replaced');
  assert.equal(testHarness.diagnostics.at(-1).geographic.relation, 'inside');
});

test('clears selection when the post-refresh retry still hits genuine empty map', async () => {
  const ParcelController = await loadController();
  const first = parcel('101');
  const refresh = deferred();
  const queryResults = [[first], [], []];
  const testHarness = harness(ParcelController, queryResults);
  testHarness.controller.parcels = new Map([['101', first]]);
  testHarness.controller.provider.queryViewport = () => refresh.promise;

  testHarness.controller.onMapClick({ point: { x: 120, y: 80 }, lngLat: { lng: 12, lat: 8 } });
  testHarness.controller.refresh();
  testHarness.controller.onMapClick({ point: { x: 220, y: 80 }, lngLat: { lng: 22, lat: 8 } });
  refresh.resolve({ state: 'ready', parcels: [first], complete: true });
  await waitFor(() => testHarness.idleHandlers.length === 1
    && testHarness.controller.coordinator.controller === null);
  queryResults.push([], []);

  testHarness.idleHandlers[0]();

  assert.deepEqual(testHarness.selections, [[first], []]);
  assert.equal(
    testHarness.diagnostics.at(-1).clearReason,
    'map-tap-retry-no-rendered-parcel-features',
  );
});

test('uses the newest tap when another tap replaces a pending post-refresh retry', async () => {
  const ParcelController = await loadController();
  const first = parcel('101');
  const newest = parcel('303', 3);
  const refresh = deferred();
  const queryResults = [[first], [], [], [], []];
  const testHarness = harness(ParcelController, queryResults);
  testHarness.controller.parcels = new Map([['101', first]]);
  testHarness.controller.provider.queryViewport = () => refresh.promise;

  testHarness.controller.onMapClick({ point: { x: 120, y: 80 }, lngLat: { lng: 12, lat: 8 } });
  testHarness.controller.refresh();
  testHarness.controller.onMapClick({ point: { x: 210, y: 80 }, lngLat: { lng: 21, lat: 8 } });
  testHarness.controller.onMapClick({ point: { x: 230, y: 80 }, lngLat: { lng: 23, lat: 8 } });
  refresh.resolve({ state: 'ready', parcels: [newest], complete: true });
  await waitFor(() => testHarness.idleHandlers.length === 1
    && testHarness.controller.coordinator.controller === null);
  queryResults.push([newest]);

  testHarness.idleHandlers[0]();

  assert.deepEqual(testHarness.projectedLngLats, [{ lng: 23, lat: 8 }]);
  assert.deepEqual(testHarness.selections, [[first], [newest]]);
});
