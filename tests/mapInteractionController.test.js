import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapInteractionController } from '../src/map/mapInteractionController.js';
import { WAYPOINT_LAYER_IDS } from '../src/map/waypointLayer.js';

function harness(hits = []) {
  const waypointSelections = [];
  const waypointClears = [];
  const parcelClears = [];
  const parcelClicks = [];
  const registered = [];
  let currentHits = hits;
  const waypointLayer = {
    selectWaypoint: (id) => waypointSelections.push(id),
    clearWaypointSelection: () => waypointClears.push(true),
  };
  const parcelController = {
    clearSelection: (reason) => parcelClears.push(reason),
    handleMapClick: (event) => parcelClicks.push(event),
  };
  const map = {
    getLayer: (id) => id === WAYPOINT_LAYER_IDS.hit,
    queryRenderedFeatures: (point, options) => {
      assert.deepEqual(options, { layers: [WAYPOINT_LAYER_IDS.hit] });
      return currentHits;
    },
    on: (event, handler) => registered.push({ event, handler }),
    off: () => {},
  };
  const controller = createMapInteractionController({ map, waypointLayer, parcelController });
  return {
    controller,
    waypointSelections,
    waypointClears,
    parcelClears,
    parcelClicks,
    registered,
    setHits: (nextHits) => { currentHits = nextHits; },
  };
}

test('owns one idempotent ordinary map-click registration', () => {
  const testHarness = harness();
  testHarness.controller.start();
  testHarness.controller.start();
  assert.equal(testHarness.registered.length, 1);
  assert.equal(testHarness.registered[0].event, 'click');
});

test('waypoint hit consumes the click, selects it, and clears parcel details', () => {
  const testHarness = harness([{ properties: { id: 'waypoint-a' } }]);
  const event = { point: { x: 10, y: 20 } };
  testHarness.controller.handleMapClick(event);

  assert.deepEqual(testHarness.waypointSelections, ['waypoint-a']);
  assert.deepEqual(testHarness.parcelClears, ['waypoint-selected']);
  assert.deepEqual(testHarness.parcelClicks, []);
});

test('no waypoint hit clears waypoint selection and delegates the original click', () => {
  const testHarness = harness();
  const event = { point: { x: 10, y: 20 }, lngLat: { lng: -77, lat: 42 } };
  testHarness.controller.handleMapClick(event);

  assert.deepEqual(testHarness.waypointClears, [true]);
  assert.equal(testHarness.parcelClicks[0], event);
});

test('overlap selects the first topmost rendered waypoint', () => {
  const testHarness = harness([
    { properties: { id: 'top' } },
    { properties: { id: 'under' } },
  ]);
  testHarness.controller.handleMapClick({ point: { x: 1, y: 1 } });
  assert.deepEqual(testHarness.waypointSelections, ['top']);
});

test('empty map stays waypoint-clear and leaves parcel empty-map handling delegated', () => {
  const testHarness = harness();
  const event = { point: { x: 50, y: 60 } };
  testHarness.controller.handleMapClick(event);
  assert.deepEqual(testHarness.waypointClears, [true]);
  assert.deepEqual(testHarness.parcelClicks, [event]);
});

test('repeated waypoint clicks move selection from A to B', () => {
  const testHarness = harness([{ properties: { id: 'a' } }]);
  testHarness.controller.handleMapClick({ point: { x: 1, y: 1 } });
  testHarness.setHits([{ properties: { id: 'b' } }]);
  testHarness.controller.handleMapClick({ point: { x: 2, y: 2 } });
  assert.deepEqual(testHarness.waypointSelections, ['a', 'b']);
  assert.deepEqual(testHarness.parcelClears, ['waypoint-selected', 'waypoint-selected']);
});

test('a parcel click after a waypoint clears waypoint selection before delegation', () => {
  const testHarness = harness([{ properties: { id: 'a' } }]);
  testHarness.controller.handleMapClick({ point: { x: 1, y: 1 } });
  testHarness.setHits([]);
  const parcelEvent = { point: { x: 9, y: 9 } };
  testHarness.controller.handleMapClick(parcelEvent);

  assert.equal(testHarness.waypointClears.at(-1), true);
  assert.equal(testHarness.parcelClicks.at(-1), parcelEvent);
});
