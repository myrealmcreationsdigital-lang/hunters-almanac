import test from 'node:test';
import assert from 'node:assert/strict';
import { createParcelPanel } from '../src/ui/parcelPanel.js';

class FakeClassList {
  constructor() { this.values = new Set(); }
  toggle(name, force) {
    if (force) this.values.add(name);
    else this.values.delete(name);
  }
  contains(name) { return this.values.has(name); }
}

class FakeElement {
  constructor(tagName = 'DIV') {
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.href = '';
    this.inert = false;
    this.listeners = new Map();
    this.parentElement = null;
    this.scrollTop = 0;
    this.tagName = tagName;
    this.textContent = '';
  }

  addEventListener(type, listener) { this.listeners.set(type, listener); }
  click() { this.listeners.get('click')?.(); }
  dispatch(type, event = {}) { this.listeners.get(type)?.(event); }
  contains(candidate) {
    for (let node = candidate; node; node = node.parentElement) {
      if (node === this) return true;
    }
    return false;
  }
  setPointerCapture(pointerId) { this.capturedPointerId = pointerId; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
}

function elements() {
  const panel = new FakeElement();
  const scrollBody = new FakeElement();
  scrollBody.parentElement = panel;
  const expandedContent = new FakeElement();
  expandedContent.parentElement = scrollBody;
  const result = {
    panel,
    closeButton: new FakeElement('BUTTON'),
    handleButton: new FakeElement('BUTTON'),
    header: new FakeElement(),
    scrollBody,
    expandedContent,
    owner: new FakeElement(),
    acreage: new FakeElement(),
    parcelId: new FakeElement(),
    jurisdiction: new FakeElement(),
    year: new FakeElement(),
    source: new FakeElement('A'),
    recordNav: new FakeElement(),
    recordCount: new FakeElement(),
    recordPrev: new FakeElement('BUTTON'),
    recordNext: new FakeElement('BUTTON'),
  };
  Object.values(result).forEach((element) => {
    if (element !== panel && element.parentElement === null) element.parentElement = panel;
  });
  for (const element of [result.owner, result.acreage, result.parcelId, result.recordNav]) {
    element.parentElement = scrollBody;
  }
  result.source.parentElement = expandedContent;
  return result;
}

function drag(panelElements, target, startY, endY, pointerId = 7) {
  let prevented = 0;
  panelElements.panel.dispatch('pointerdown', {
    button: 0,
    isPrimary: true,
    pointerId,
    clientY: startY,
    target,
    preventDefault: () => { prevented += 1; },
  });
  panelElements.panel.dispatch('pointerup', {
    pointerId,
    clientY: endY,
    target,
    preventDefault: () => { prevented += 1; },
  });
  return { prevented };
}

function parcel(id, owner = `Owner ${id}`) {
  return {
    properties: {
      providerFeatureId: id,
      owner,
      acreage: 12.345,
      acreageBasis: 'assessed',
      displayId: `SBL ${id}`,
      parcelId: id,
      jurisdiction: { municipality: 'Bath', county: 'Steuben', subdivision: 'NY' },
      source: {
        name: 'NYS parcels',
        url: 'https://example.test/parcels',
        rollYear: 2025,
        spatialYear: 2024,
      },
    },
  };
}

test('moves between closed, compact, and expanded states', () => {
  const panelElements = elements();
  const panel = createParcelPanel({ elements: panelElements });

  assert.equal(panel.getState(), 'closed');
  assert.equal(panelElements.panel.hidden, true);
  assert.equal(panelElements.panel.inert, true);

  panel.setSelection([parcel('101')]);
  assert.equal(panel.getState(), 'compact');
  assert.equal(panelElements.panel.hidden, false);
  assert.equal(panelElements.panel.inert, false);
  assert.equal(panelElements.expandedContent.hidden, true);
  assert.equal(panelElements.expandedContent.inert, true);
  assert.equal(panelElements.handleButton.getAttribute('aria-expanded'), 'false');

  panelElements.handleButton.click();
  assert.equal(panel.getState(), 'expanded');
  assert.equal(panelElements.expandedContent.hidden, false);
  assert.equal(panelElements.expandedContent.inert, false);
  assert.equal(panelElements.handleButton.getAttribute('aria-expanded'), 'true');

  panelElements.handleButton.click();
  assert.equal(panel.getState(), 'compact');
});

test('drags upward from the compact non-interactive sheet surface to expand', () => {
  const panelElements = elements();
  const panel = createParcelPanel({ elements: panelElements });
  panel.setSelection([parcel('101')]);

  drag(panelElements, panelElements.owner, 180, 130);

  assert.equal(panel.getState(), 'expanded');
  assert.equal(panelElements.panel.capturedPointerId, 7);
});

test('drags downward from the expanded header to collapse', () => {
  const panelElements = elements();
  const panel = createParcelPanel({ elements: panelElements });
  panel.setSelection([parcel('101')]);
  panel.expand();

  drag(panelElements, panelElements.header, 130, 180, 8);

  assert.equal(panel.getState(), 'compact');
});

test('ignores short handle movement and toggles on the fallback tap', () => {
  const panelElements = elements();
  const panel = createParcelPanel({ elements: panelElements });
  panel.setSelection([parcel('101')]);

  drag(panelElements, panelElements.handleButton, 180, 176, 9);
  assert.equal(panel.getState(), 'compact');

  panelElements.handleButton.click();
  assert.equal(panel.getState(), 'expanded');
});

test('does not start sheet drags from buttons or links', () => {
  const panelElements = elements();
  const panel = createParcelPanel({ elements: panelElements });
  panel.setSelection([parcel('101'), parcel('102')]);

  for (const target of [
    panelElements.closeButton,
    panelElements.recordPrev,
    panelElements.recordNext,
    panelElements.source,
  ]) {
    drag(panelElements, target, 180, 120);
    assert.equal(panel.getState(), 'compact');
  }
});

test('does not capture or prevent pointer gestures from the expanded scroll body', () => {
  const panelElements = elements();
  const panel = createParcelPanel({ elements: panelElements });
  panel.setSelection([parcel('101')]);
  panel.expand();
  panelElements.scrollBody.scrollTop = 24;

  const gesture = drag(panelElements, panelElements.owner, 130, 190);

  assert.equal(panel.getState(), 'expanded');
  assert.equal(panelElements.scrollBody.scrollTop, 24);
  assert.equal(panelElements.panel.capturedPointerId, undefined);
  assert.equal(gesture.prevented, 0);
});

test('ordinary sheet taps do not toggle the state', () => {
  const panelElements = elements();
  const panel = createParcelPanel({ elements: panelElements });
  panel.setSelection([parcel('101')]);

  panelElements.panel.dispatch('click', { target: panelElements.owner });

  assert.equal(panel.getState(), 'compact');
});

test('updates the same sheet for a new selection and returns to compact', () => {
  const panelElements = elements();
  const panel = createParcelPanel({ elements: panelElements });
  const sheet = panelElements.panel;

  panel.setSelection([parcel('101')]);
  panel.expand();
  panel.setSelection([parcel('202')]);

  assert.equal(panelElements.panel, sheet);
  assert.equal(panel.getState(), 'compact');
  assert.equal(panelElements.owner.textContent, 'Owner 202');
  assert.equal(panelElements.parcelId.textContent, 'SBL 202');
});

test('navigates multiple parcel records with updated user-facing wording', () => {
  const panelElements = elements();
  const shown = [];
  const panel = createParcelPanel({
    elements: panelElements,
    onRecordChange: (record) => shown.push(record.properties.providerFeatureId),
  });
  panel.setSelection([parcel('101'), parcel('102')]);

  assert.equal(panelElements.recordNav.hidden, false);
  assert.equal(panelElements.recordCount.textContent, '1 of 2 · Multiple parcel records');
  assert.equal(panelElements.recordPrev.disabled, true);
  assert.equal(panelElements.recordNext.disabled, false);

  panelElements.recordNext.click();
  assert.equal(panelElements.recordCount.textContent, '2 of 2 · Multiple parcel records');
  assert.equal(panelElements.owner.textContent, 'Owner 102');
  assert.deepEqual(shown, ['101', '102']);

  panelElements.recordPrev.click();
  assert.equal(panelElements.recordCount.textContent, '1 of 2 · Multiple parcel records');
});

test('closed and conditionally hidden panel controls are removed from interaction', () => {
  const panelElements = elements();
  const panel = createParcelPanel({ elements: panelElements });
  panel.setSelection([parcel('101')]);
  panel.setSelection([]);

  assert.equal(panelElements.panel.hidden, true);
  assert.equal(panelElements.panel.inert, true);
  assert.equal(panelElements.panel.getAttribute('aria-hidden'), 'true');
  assert.equal(panelElements.recordNav.hidden, true);
  assert.equal(panelElements.recordNav.inert, true);
  assert.equal(panelElements.expandedContent.hidden, true);
  assert.equal(panelElements.expandedContent.inert, true);
});
