import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WAYPOINT_CATEGORY_COLORS,
  WAYPOINT_LAYER_IDS,
  WAYPOINT_SOURCE_ID,
  createWaypointLayer,
  toWaypointFeatureCollection,
} from '../src/map/waypointLayer.js';

function waypoint(overrides = {}) {
  return {
    id: 'waypoint-1',
    latitude: 42.123,
    longitude: -77.456,
    category: 'stand',
    ...overrides,
  };
}

function storeHarness(records = []) {
  let state = { records, loading: false, ready: true, issues: [], error: null };
  const listeners = new Set();
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(nextRecords, overrides = {}) {
      state = { ...state, ...overrides, records: nextRecords };
      listeners.forEach((listener) => listener(state));
    },
    emitState(nextState) {
      state = nextState;
      listeners.forEach((listener) => listener(state));
    },
  };
}

function mapHarness({ loaded = true, initialLayers = [] } = {}) {
  const sources = new Map();
  const layers = initialLayers.map((id) => ({ id }));
  const listeners = new Map();
  const sourceAdds = [];
  const layerAdds = [];
  const dataUpdates = [];
  const filterUpdates = [];
  const moves = [];
  const map = {
    isStyleLoaded: () => loaded,
    loaded: () => loaded,
    getSource: (id) => sources.get(id),
    addSource(id, configuration) {
      sourceAdds.push({ id, configuration });
      sources.set(id, {
        ...configuration,
        setData(data) {
          this.data = data;
          dataUpdates.push(data);
        },
      });
    },
    getLayer: (id) => layers.find((layer) => layer.id === id),
    addLayer(layer) {
      layerAdds.push(layer);
      layers.push(layer);
    },
    setFilter(id, filter) {
      filterUpdates.push({ id, filter });
      const layer = layers.find((candidate) => candidate.id === id);
      if (layer) layer.filter = filter;
    },
    getStyle: () => ({ layers }),
    moveLayer(id) {
      moves.push(id);
      const index = layers.findIndex((layer) => layer.id === id);
      layers.push(...layers.splice(index, 1));
    },
    on(event, handler) {
      const handlers = listeners.get(event) ?? [];
      handlers.push(handler);
      listeners.set(event, handlers);
    },
    off(event, handler) {
      listeners.set(event, (listeners.get(event) ?? []).filter((item) => item !== handler));
    },
  };
  return {
    map,
    sources,
    layers,
    sourceAdds,
    layerAdds,
    dataUpdates,
    filterUpdates,
    moves,
    emit(event) {
      if (event === 'load') loaded = true;
      [...(listeners.get(event) ?? [])].forEach((handler) => handler());
    },
  };
}

test('converts authoritative records to minimal GeoJSON Point features', () => {
  assert.deepEqual(toWaypointFeatureCollection([
    waypoint({ title: 'North stand', note: 'Must not reach map data' }),
  ]), {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      id: 'waypoint-1',
      geometry: { type: 'Point', coordinates: [-77.456, 42.123] },
      properties: { id: 'waypoint-1', category: 'stand', title: 'North stand' },
    }],
  });
});

test('adds one GeoJSON source and the three configured layers only once', () => {
  const mapState = mapHarness();
  const store = storeHarness();
  const layer = createWaypointLayer({ map: mapState.map, store });
  layer.initialize();

  assert.equal(mapState.sourceAdds.length, 1);
  assert.deepEqual(mapState.sourceAdds[0], {
    id: WAYPOINT_SOURCE_ID,
    configuration: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  });
  assert.deepEqual(mapState.layerAdds.map(({ id }) => id), [
    WAYPOINT_LAYER_IDS.selected,
    WAYPOINT_LAYER_IDS.point,
    WAYPOINT_LAYER_IDS.hit,
  ]);
  assert.equal(mapState.layerAdds.find(({ id }) => id === WAYPOINT_LAYER_IDS.hit)
    .paint['circle-radius'], 12);
  assert.deepEqual(mapState.layerAdds.find(({ id }) => id === WAYPOINT_LAYER_IDS.point)
    .paint['circle-color'].slice(0, 2), ['match', ['get', 'category']]);
  assert.deepEqual(Object.keys(WAYPOINT_CATEGORY_COLORS), [
    'stand', 'camera', 'parking', 'access', 'sign', 'hazard', 'other',
  ]);
});

test('keeps waypoint layers above imagery, parcels, and later GPS style layers', () => {
  const mapState = mapHarness({ initialLayers: ['nys-imagery-layer', 'parcel-fill', 'parcel-line'] });
  createWaypointLayer({ map: mapState.map, store: storeHarness() });

  mapState.layers.push({ id: 'gps-accuracy-fill' });
  mapState.emit('styledata');

  assert.deepEqual(mapState.layers.slice(-3).map(({ id }) => id), [
    WAYPOINT_LAYER_IDS.selected,
    WAYPOINT_LAYER_IDS.point,
    WAYPOINT_LAYER_IDS.hit,
  ]);
  assert.deepEqual(mapState.moves.slice(-3), [
    WAYPOINT_LAYER_IDS.selected,
    WAYPOINT_LAYER_IDS.point,
    WAYPOINT_LAYER_IDS.hit,
  ]);
});

test('renders initial empty data then tracks create, update, delete, and error notifications', () => {
  const mapState = mapHarness();
  const store = storeHarness();
  createWaypointLayer({ map: mapState.map, store });
  const created = waypoint();
  const updated = waypoint({ longitude: -76, title: 'Updated' });

  assert.deepEqual(mapState.sources.get(WAYPOINT_SOURCE_ID).data.features, []);
  store.emit([created]);
  store.emit([updated]);
  store.emit([updated], { error: { operation: 'delete', cause: new Error('failed') } });
  store.emit([], { error: null });

  assert.deepEqual(mapState.dataUpdates.slice(-4).map((data) => data.features), [
    toWaypointFeatureCollection([created]).features,
    toWaypointFeatureCollection([updated]).features,
    toWaypointFeatureCollection([updated]).features,
    [],
  ]);
  assert.ok(mapState.sources.has(WAYPOINT_SOURCE_ID));
});

test('handles store load before map load', () => {
  const mapState = mapHarness({ loaded: false });
  const store = storeHarness();
  createWaypointLayer({ map: mapState.map, store });
  store.emit([waypoint()]);

  assert.equal(mapState.sourceAdds.length, 0);
  mapState.emit('load');
  assert.deepEqual(mapState.sources.get(WAYPOINT_SOURCE_ID).data,
    toWaypointFeatureCollection([waypoint()]));
});

test('handles map load before store load', () => {
  const mapState = mapHarness({ loaded: false });
  const store = storeHarness();
  createWaypointLayer({ map: mapState.map, store });
  mapState.emit('load');
  store.emit([waypoint()]);

  assert.deepEqual(mapState.sources.get(WAYPOINT_SOURCE_ID).data,
    toWaypointFeatureCollection([waypoint()]));
});

test('updates the selected halo deterministically and clears a removed selection', () => {
  const record = waypoint();
  const mapState = mapHarness();
  const store = storeHarness([record]);
  const layer = createWaypointLayer({ map: mapState.map, store });

  layer.selectWaypoint(record.id);
  assert.equal(layer.getSelectedWaypointId(), record.id);
  assert.deepEqual(mapState.filterUpdates.at(-1), {
    id: WAYPOINT_LAYER_IDS.selected,
    filter: ['==', ['get', 'id'], record.id],
  });

  store.emit([]);
  assert.equal(layer.getSelectedWaypointId(), null);
  assert.deepEqual(mapState.filterUpdates.at(-1).filter, ['all', false]);
});

test('uses an unconditional false filter without colliding with a real former-sentinel ID', () => {
  const record = waypoint({ id: '__none__' });
  const mapState = mapHarness();
  const layer = createWaypointLayer({ map: mapState.map, store: storeHarness([record]) });

  layer.clearWaypointSelection();
  assert.deepEqual(mapState.filterUpdates.at(-1).filter, ['all', false]);
  assert.equal(layer.getSelectedWaypointId(), null);

  assert.equal(layer.selectWaypoint('__none__'), true);
  assert.deepEqual(mapState.filterUpdates.at(-1).filter, [
    '==', ['get', 'id'], '__none__',
  ]);

  layer.clearWaypointSelection();
  assert.deepEqual(mapState.filterUpdates.at(-1).filter, ['all', false]);
});

test('preserves the last valid collection and selection across unusable snapshots', () => {
  const record = waypoint();
  const mapState = mapHarness();
  const store = storeHarness([record]);
  const layer = createWaypointLayer({ map: mapState.map, store });
  assert.equal(layer.selectWaypoint(record.id), true);
  const expected = toWaypointFeatureCollection([record]);
  const updateCount = mapState.dataUpdates.length;
  const filterCount = mapState.filterUpdates.length;

  for (const malformedState of [null, undefined, [], {}, { records: null }, { records: {} }]) {
    assert.doesNotThrow(() => store.emitState(malformedState));
  }

  assert.deepEqual(mapState.sources.get(WAYPOINT_SOURCE_ID).data, expected);
  assert.equal(mapState.dataUpdates.length, updateCount);
  assert.equal(mapState.filterUpdates.length, filterCount);
  assert.equal(layer.getSelectedWaypointId(), record.id);
  assert.deepEqual(toWaypointFeatureCollection(null), {
    type: 'FeatureCollection',
    features: [],
  });
});

test('renders valid mixed records while skipping null, non-object, and invalid-ID entries', () => {
  const valid = waypoint();
  const records = [
    null,
    undefined,
    7,
    'bad',
    [],
    {},
    waypoint({ id: '' }),
    waypoint({ id: ' padded ' }),
    valid,
  ];

  assert.deepEqual(toWaypointFeatureCollection(records), toWaypointFeatureCollection([valid]));
});

test('skips non-finite and out-of-range coordinates without hiding valid records', () => {
  const valid = waypoint();
  const records = [
    waypoint({ id: 'nan-latitude', latitude: Number.NaN }),
    waypoint({ id: 'infinite-latitude', latitude: Number.POSITIVE_INFINITY }),
    waypoint({ id: 'low-latitude', latitude: -91 }),
    waypoint({ id: 'high-latitude', latitude: 91 }),
    waypoint({ id: 'nan-longitude', longitude: Number.NaN }),
    waypoint({ id: 'infinite-longitude', longitude: Number.NEGATIVE_INFINITY }),
    waypoint({ id: 'low-longitude', longitude: -181 }),
    waypoint({ id: 'high-longitude', longitude: 181 }),
    valid,
  ];

  assert.deepEqual(toWaypointFeatureCollection(records), toWaypointFeatureCollection([valid]));
});

test('falls back unknown categories and omits malformed titles without mutating records', () => {
  const record = waypoint({ category: { unexpected: true }, title: { text: 'Bad title' } });
  const original = structuredClone(record);

  const collection = toWaypointFeatureCollection([record]);

  assert.deepEqual(collection.features[0].properties, {
    id: record.id,
    category: 'other',
  });
  assert.deepEqual(record, original);
});

test('rejects invalid selections while preserving a current valid selection and filter', () => {
  const first = waypoint({ id: 'first' });
  const second = waypoint({ id: 'second' });
  const mapState = mapHarness();
  const store = storeHarness([first, second]);
  const layer = createWaypointLayer({ map: mapState.map, store });

  assert.equal(layer.selectWaypoint(first.id), true);
  const filterCount = mapState.filterUpdates.length;
  for (const invalidId of ['missing', '', ' ', null, undefined, 7, {}]) {
    assert.equal(layer.selectWaypoint(invalidId), false);
  }
  assert.equal(layer.getSelectedWaypointId(), first.id);
  assert.equal(mapState.filterUpdates.length, filterCount);
  assert.deepEqual(mapState.filterUpdates.at(-1).filter, [
    '==', ['get', 'id'], first.id,
  ]);

  store.emit([waypoint({ id: first.id, title: 'Still present' }), second]);
  assert.equal(layer.getSelectedWaypointId(), first.id);
  assert.equal(mapState.filterUpdates.length, filterCount);

  store.emit([waypoint({ id: first.id, latitude: 91 }), second]);
  assert.equal(layer.getSelectedWaypointId(), null);
  assert.deepEqual(mapState.filterUpdates.at(-1).filter, ['all', false]);
});
