import assert from 'node:assert/strict';
import test from 'node:test';
import { LocationTracker } from '../src/location/locationTracker.js';

class FakeMarker {
  setLngLat(coordinates) {
    this.coordinates = coordinates;
    return this;
  }

  addTo(map) {
    map.marker = this;
    return this;
  }
}

function createHarness() {
  const states = [];
  const easeCalls = [];
  const sources = new Map();
  let watchSuccess;
  let watchError;
  let watchOptions;
  let watchCalls = 0;

  const geolocation = {
    watchPosition(success, error, options) {
      watchCalls += 1;
      watchSuccess = success;
      watchError = error;
      watchOptions = options;
      return 17;
    },
    clearWatch() {},
  };
  const map = {
    addLayer() {},
    addSource(id, source) {
      sources.set(id, {
        ...source,
        setData(data) { this.data = data; },
      });
    },
    easeTo(options) { easeCalls.push(options); },
    getSource(id) { return sources.get(id); },
    getZoom() { return 11; },
  };

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { geolocation },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement() {
        return {
          setAttribute() {},
          className: '',
          innerHTML: '',
        };
      },
    },
  });

  const tracker = new LocationTracker({
    map,
    onState: (state) => states.push(state),
    MarkerClass: FakeMarker,
  });

  return {
    easeCalls,
    map,
    states,
    tracker,
    get watchCalls() { return watchCalls; },
    get watchError() { return watchError; },
    get watchOptions() { return watchOptions; },
    get watchSuccess() { return watchSuccess; },
  };
}

function position(longitude, latitude, accuracy = 12) {
  return { coords: { longitude, latitude, accuracy } };
}

test('starts the GPS watcher once with bounded high-accuracy options', () => {
  const harness = createHarness();

  harness.tracker.start();
  harness.tracker.start();

  assert.equal(harness.watchCalls, 1);
  assert.deepEqual(harness.watchOptions, {
    enableHighAccuracy: true,
    maximumAge: 5_000,
    timeout: 15_000,
  });
  assert.equal(harness.states[0].state, 'requesting');
});

test('centers once on the first fix, then leaves the map where the user moved it', () => {
  const harness = createHarness();
  harness.tracker.markMapReady();
  harness.tracker.start();

  harness.watchSuccess(position(-76.5, 42.4));
  harness.watchSuccess(position(-76.6, 42.5));

  assert.equal(harness.states.at(-1).state, 'tracking');
  assert.deepEqual(harness.map.marker.coordinates, [-76.6, 42.5]);
  assert.equal(harness.easeCalls.length, 1);
  assert.deepEqual(harness.easeCalls[0].center, [-76.5, 42.4]);

  harness.tracker.recenter();
  assert.equal(harness.easeCalls.length, 2);
  assert.deepEqual(harness.easeCalls[1].center, [-76.6, 42.5]);
});

test('reports a fix immediately and renders the latest fix when the map finishes loading', () => {
  const harness = createHarness();
  harness.tracker.start();

  harness.watchSuccess(position(-76.1, 42.1, 75));
  harness.watchSuccess(position(-76.2, 42.2, 20));

  assert.equal(harness.states.at(-1).state, 'tracking');
  assert.equal(harness.map.marker, undefined);
  assert.equal(harness.easeCalls.length, 0);

  harness.tracker.markMapReady();

  assert.deepEqual(harness.map.marker.coordinates, [-76.2, 42.2]);
  assert.equal(harness.easeCalls.length, 1);
  assert.deepEqual(harness.easeCalls[0].center, [-76.1, 42.1]);
});

test('shows geolocation failures and accepts a delayed fix afterward', () => {
  const harness = createHarness();
  harness.tracker.markMapReady();
  harness.tracker.start();

  harness.watchError({ code: 3, TIMEOUT: 3 });
  assert.equal(harness.states.at(-1).message, 'Location request timed out');
  harness.tracker.recenter();
  assert.equal(harness.states.at(-1).message, 'Location request timed out');

  harness.watchSuccess(position(-76.3, 42.3));
  assert.equal(harness.states.at(-1).state, 'tracking');
  assert.equal(harness.easeCalls.length, 1);
});

test('reports unavailable and denied positions, and permits a denied watcher to retry', () => {
  const harness = createHarness();
  harness.tracker.start();

  harness.watchError({ code: 2, POSITION_UNAVAILABLE: 2 });
  assert.equal(harness.states.at(-1).message, 'Position unavailable');

  harness.watchError({ code: 1, PERMISSION_DENIED: 1 });
  assert.equal(harness.states.at(-1).message, 'Location permission denied');

  harness.tracker.recenter();
  assert.equal(harness.watchCalls, 2);
  assert.equal(harness.states.at(-1).state, 'requesting');
});
