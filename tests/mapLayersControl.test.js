import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROPERTY_LINES_STORAGE_KEY,
  createMapLayersControl,
  readPropertyLinesEnabled,
} from '../src/ui/mapLayersControl.js';

class FakeElement {
  constructor() {
    this.attributes = new Map();
    this.dataset = {};
    this.hidden = false;
    this.inert = false;
    this.listeners = new Map();
    this.textContent = '';
  }

  addEventListener(type, listener) { this.listeners.set(type, listener); }
  click() { this.listeners.get('click')?.(); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
}

function elements() {
  return {
    menuButton: new FakeElement(),
    panel: new FakeElement(),
    closeButton: new FakeElement(),
    propertyToggle: new FakeElement(),
    propertyStatus: new FakeElement(),
    lidarReliefToggle: new FakeElement(),
    lidarReliefStatus: new FakeElement(),
  };
}

test('starts LiDAR Relief off and reports toggle changes', () => {
  const controls = elements();
  const changes = [];
  const control = createMapLayersControl({
    elements: controls,
    storage: memoryStorage(),
    onLidarReliefChange: (enabled) => changes.push(enabled),
  });

  assert.equal(control.isLidarReliefEnabled(), false);
  assert.equal(controls.lidarReliefToggle.getAttribute('aria-pressed'), 'false');
  assert.equal(controls.lidarReliefStatus.textContent, 'Bare-earth terrain off');

  controls.lidarReliefToggle.click();
  assert.equal(control.isLidarReliefEnabled(), true);
  assert.equal(controls.lidarReliefToggle.getAttribute('aria-pressed'), 'true');
  assert.equal(controls.lidarReliefStatus.textContent, 'Bare-earth terrain on');

  controls.lidarReliefToggle.click();
  assert.equal(control.isLidarReliefEnabled(), false);
  assert.deepEqual(changes, [true, false]);
});

test('reads and persists the Property Lines setting', () => {
  const storage = memoryStorage({ [PROPERTY_LINES_STORAGE_KEY]: 'false' });
  assert.equal(readPropertyLinesEnabled(storage), false);

  const controls = elements();
  const control = createMapLayersControl({
    elements: controls,
    storage,
    initialPropertyLinesEnabled: readPropertyLinesEnabled(storage),
  });
  assert.equal(control.isPropertyLinesEnabled(), false);
  assert.equal(controls.propertyToggle.getAttribute('aria-pressed'), 'false');
  assert.equal(controls.propertyStatus.textContent, 'Property lines off');

  control.setPropertyLinesEnabled(true);

  assert.equal(storage.values.get(PROPERTY_LINES_STORAGE_KEY), 'true');
  assert.equal(control.isPropertyLinesEnabled(), true);
});

test('shows the instructional hint only for an OFF to ON transition', () => {
  const controls = elements();
  const hints = [];
  const changes = [];
  createMapLayersControl({
    elements: controls,
    storage: memoryStorage(),
    initialPropertyLinesEnabled: false,
    onPropertyLinesChange: (enabled) => changes.push(enabled),
    onHint: (message) => hints.push(message),
  });

  controls.propertyToggle.click();
  controls.propertyToggle.click();

  assert.deepEqual(changes, [true, false]);
  assert.deepEqual(hints, ['Tap a parcel for property details']);
});

test('opens and closes the Map Layers panel accessibly', () => {
  const controls = elements();
  createMapLayersControl({ elements: controls, storage: memoryStorage() });

  assert.equal(controls.panel.hidden, true);
  assert.equal(controls.panel.inert, true);
  assert.equal(controls.menuButton.getAttribute('aria-expanded'), 'false');

  controls.menuButton.click();
  assert.equal(controls.panel.hidden, false);
  assert.equal(controls.panel.inert, false);
  assert.equal(controls.menuButton.getAttribute('aria-expanded'), 'true');

  controls.closeButton.click();
  assert.equal(controls.panel.hidden, true);
  assert.equal(controls.panel.inert, true);
});
