import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAP_LAYER_IDS,
  createLidarReliefLayer,
  createLidarReliefMode,
  insertLidarReliefLayer,
} from '../src/map/lidarReliefMode.js';

function mapHarness(initialVisibility = {}) {
  const visibility = new Map(Object.entries(initialVisibility));
  const calls = [];
  const map = {
    getLayoutProperty(layerId, property) {
      assert.equal(property, 'visibility');
      return visibility.get(layerId);
    },
    setLayoutProperty(layerId, property, value) {
      assert.equal(property, 'visibility');
      calls.push({ layerId, value });
      visibility.set(layerId, value);
    },
  };
  return { map, visibility, calls };
}

test('relief starts hidden and is inserted immediately before NYS imagery', () => {
  assert.deepEqual(createLidarReliefLayer('terrain-source'), {
    id: MAP_LAYER_IDS.lidarRelief,
    type: 'raster',
    source: 'terrain-source',
    layout: { visibility: 'none' },
  });

  const layers = insertLidarReliefLayer([
    { id: MAP_LAYER_IDS.fieldBackground },
    { id: MAP_LAYER_IDS.usgsImagery },
    { id: MAP_LAYER_IDS.nysImagery },
    { id: 'parcel-line' },
  ], 'terrain-source');
  assert.deepEqual(layers.map((layer) => layer.id), [
    MAP_LAYER_IDS.fieldBackground,
    MAP_LAYER_IDS.usgsImagery,
    MAP_LAYER_IDS.lidarRelief,
    MAP_LAYER_IDS.nysImagery,
    'parcel-line',
  ]);
});

test('enabling relief hides every imagery layer and shows bare-earth terrain', () => {
  const harness = mapHarness({ [MAP_LAYER_IDS.lidarRelief]: 'none' });
  const mode = createLidarReliefMode(harness.map);

  assert.equal(mode.isEnabled(), false);
  mode.setEnabled(true);

  assert.equal(harness.visibility.get(MAP_LAYER_IDS.coarseUsgsImagery), 'none');
  assert.equal(harness.visibility.get(MAP_LAYER_IDS.usgsImagery), 'none');
  assert.equal(harness.visibility.get(MAP_LAYER_IDS.nysImagery), 'none');
  assert.equal(harness.visibility.get(MAP_LAYER_IDS.lidarRelief), 'visible');
});

test('disabling relief restores each prior imagery visibility state', () => {
  const harness = mapHarness({
    [MAP_LAYER_IDS.coarseUsgsImagery]: 'visible',
    [MAP_LAYER_IDS.usgsImagery]: 'none',
    [MAP_LAYER_IDS.nysImagery]: 'visible',
    [MAP_LAYER_IDS.lidarRelief]: 'none',
  });
  const mode = createLidarReliefMode(harness.map);

  mode.setEnabled(true);
  mode.setEnabled(false);

  assert.equal(harness.visibility.get(MAP_LAYER_IDS.coarseUsgsImagery), 'visible');
  assert.equal(harness.visibility.get(MAP_LAYER_IDS.usgsImagery), 'none');
  assert.equal(harness.visibility.get(MAP_LAYER_IDS.nysImagery), 'visible');
  assert.equal(harness.visibility.get(MAP_LAYER_IDS.lidarRelief), 'none');
});

test('repeated toggle requests do not duplicate layers or corrupt restored state', () => {
  const harness = mapHarness({ [MAP_LAYER_IDS.lidarRelief]: 'none' });
  const mode = createLidarReliefMode(harness.map);

  mode.setEnabled(true);
  const callsAfterEnable = harness.calls.length;
  mode.setEnabled(true);
  assert.equal(harness.calls.length, callsAfterEnable);

  mode.setEnabled(false);
  const callsAfterDisable = harness.calls.length;
  mode.setEnabled(false);
  assert.equal(harness.calls.length, callsAfterDisable);

  assert.equal(harness.visibility.get(MAP_LAYER_IDS.coarseUsgsImagery), 'visible');
  assert.equal(harness.visibility.get(MAP_LAYER_IDS.usgsImagery), 'visible');
  assert.equal(harness.visibility.get(MAP_LAYER_IDS.nysImagery), 'visible');
  assert.equal(harness.visibility.get(MAP_LAYER_IDS.lidarRelief), 'none');
});
