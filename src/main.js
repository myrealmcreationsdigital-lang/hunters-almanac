import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { createMap } from './map/createMap.js';
import { LocationTracker } from './location/locationTracker.js';
import { NysParcelProvider } from './parcels/NysParcelProvider.js';
import { ParcelController } from './parcels/parcelController.js';

const elements = {
  networkStatus: document.querySelector('#network-status'),
  gpsChip: document.querySelector('#gps-chip'),
  locationStatus: document.querySelector('#location-status'),
  parcelToggle: document.querySelector('#parcel-toggle'),
  parcelStatus: document.querySelector('#parcel-status'),
  bearingReset: document.querySelector('#bearing-reset'),
  bearingArrow: document.querySelector('#bearing-arrow'),
  bearingValue: document.querySelector('#bearing-value'),
  recenter: document.querySelector('#recenter'),
  message: document.querySelector('#map-message'),
  panel: document.querySelector('#parcel-panel'),
  panelClose: document.querySelector('#parcel-panel-close'),
  owner: document.querySelector('#parcel-owner'),
  acreage: document.querySelector('#parcel-acreage'),
  parcelId: document.querySelector('#parcel-id'),
  jurisdiction: document.querySelector('#parcel-jurisdiction'),
  year: document.querySelector('#parcel-year'),
  source: document.querySelector('#parcel-source'),
  recordNav: document.querySelector('#parcel-record-nav'),
  recordCount: document.querySelector('#parcel-record-count'),
  recordPrev: document.querySelector('#parcel-record-prev'),
  recordNext: document.querySelector('#parcel-record-next'),
};

let selection = [];
let selectionIndex = 0;
let parcelController;
let parcelDiagnosticSequence = 0;
const parcelDiagnostics = [];
globalThis.huntNavParcelDiagnostics = parcelDiagnostics;

function showMessage(message, timeout = 3500) {
  elements.message.textContent = message;
  elements.message.hidden = false;
  globalThis.clearTimeout(showMessage.timer);
  showMessage.timer = globalThis.setTimeout(() => {
    elements.message.hidden = true;
  }, timeout);
}

function updateNetworkState() {
  const online = navigator.onLine;
  elements.networkStatus.textContent = online ? 'ONLINE' : 'OFFLINE';
  elements.networkStatus.dataset.state = online ? 'online' : 'offline';
  if (!online) showMessage('Offline shell active · live map and parcel data are unavailable');
  parcelController?.refresh();
}

function renderLocationState({ state, message }) {
  elements.locationStatus.dataset.state = state;
  elements.locationStatus.querySelector('span:last-child').textContent = message;
  elements.gpsChip.dataset.state = state;
  elements.gpsChip.textContent = state === 'tracking'
    ? 'GPS LIVE'
    : state === 'limited'
      ? 'GPS WEAK'
      : state === 'requesting'
        ? 'GPS WAIT'
        : 'GPS ERR';
}

function renderParcelState({ state, message }) {
  elements.parcelStatus.textContent = message;
  elements.parcelToggle.dataset.state = state;
}

function renderParcelDiagnostic(diagnostic) {
  parcelDiagnosticSequence += 1;
  const entry = { sequence: parcelDiagnosticSequence, ...diagnostic };
  parcelDiagnostics.push(entry);
  if (parcelDiagnostics.length > 50) parcelDiagnostics.shift();
  globalThis.huntNavLastParcelDiagnostic = entry;
  console.info(`[HuntNav parcel diagnostic #${entry.sequence}]`, entry);
}

function formatAcreage(value, basis) {
  if (value === null || value === undefined) return 'Unavailable';
  const suffix = basis === 'calculated' ? ' · calculated' : basis === 'assessed' ? ' · assessed' : '';
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} acres${suffix}`;
}

function renderSelectedRecord() {
  const parcel = selection[selectionIndex];
  if (!parcel) return;
  const { properties } = parcel;
  const { jurisdiction, source } = properties;
  const places = [
    jurisdiction.municipality,
    jurisdiction.county ? `${jurisdiction.county} County` : null,
    jurisdiction.subdivision,
  ].filter(Boolean);
  const years = [
    source.rollYear ? `Assessment ${source.rollYear}` : null,
    source.spatialYear ? `Geometry ${source.spatialYear}` : null,
  ].filter(Boolean);

  elements.owner.textContent = properties.owner ?? 'Unavailable';
  elements.acreage.textContent = formatAcreage(properties.acreage, properties.acreageBasis);
  elements.parcelId.textContent = properties.displayId ?? properties.parcelId ?? 'Unavailable';
  elements.jurisdiction.textContent = places.join(' · ') || 'Unavailable';
  elements.year.textContent = years.join(' · ') || 'Unavailable';
  elements.source.textContent = source.name;
  elements.source.href = source.url;

  const multiple = selection.length > 1;
  elements.recordNav.hidden = !multiple;
  elements.recordCount.textContent = multiple
    ? `${selectionIndex + 1} of ${selection.length} coincident records`
    : '';
  if (multiple) {
    elements.recordPrev.disabled = selectionIndex === 0;
    elements.recordNext.disabled = selectionIndex === selection.length - 1;
  }
  parcelController.selectRecord(properties.providerFeatureId);
}

function renderSelection(parcels) {
  selection = parcels;
  selectionIndex = 0;
  if (!selection.length) {
    elements.panel.classList.remove('is-open');
    elements.panel.setAttribute('aria-hidden', 'true');
    return;
  }
  renderSelectedRecord();
  elements.panel.classList.add('is-open');
  elements.panel.setAttribute('aria-hidden', 'false');
}

const map = createMap('map');
const locationTracker = new LocationTracker({ map, onState: renderLocationState });
const parcelProvider = new NysParcelProvider();

locationTracker.start();

map.on('load', () => {
  locationTracker.markMapReady();
  parcelController = new ParcelController({
    map,
    provider: parcelProvider,
    onState: renderParcelState,
    onSelection: renderSelection,
    onDiagnostic: renderParcelDiagnostic,
  });
  parcelController.start();
});

map.on('rotate', () => {
  const bearing = ((map.getBearing() % 360) + 360) % 360;
  elements.bearingArrow.style.transform = `rotate(${-bearing}deg)`;
  elements.bearingValue.textContent = bearing < 0.5 || bearing > 359.5 ? 'N' : `${Math.round(bearing)}°`;
  elements.bearingReset.classList.toggle('is-rotated', bearing >= 0.5 && bearing <= 359.5);
});

map.on('error', (event) => {
  if (navigator.onLine && event?.error?.message) showMessage('A live map resource could not be loaded');
});

elements.parcelToggle.addEventListener('click', () => {
  const enabled = elements.parcelToggle.getAttribute('aria-pressed') !== 'true';
  elements.parcelToggle.setAttribute('aria-pressed', String(enabled));
  parcelController?.setEnabled(enabled);
});
elements.bearingReset.addEventListener('click', () => map.resetNorth({ duration: 500 }));
elements.recenter.addEventListener('click', () => locationTracker.recenter());
elements.panelClose.addEventListener('click', () => parcelController?.clearSelection('panel-close-button'));
elements.recordPrev.addEventListener('click', () => {
  selectionIndex = Math.max(0, selectionIndex - 1);
  renderSelectedRecord();
});
elements.recordNext.addEventListener('click', () => {
  selectionIndex = Math.min(selection.length - 1, selectionIndex + 1);
  renderSelectedRecord();
});

globalThis.addEventListener('online', updateNetworkState);
globalThis.addEventListener('offline', updateNetworkState);
globalThis.addEventListener('beforeunload', () => locationTracker.stop());
updateNetworkState();

registerSW({
  immediate: true,
  onOfflineReady() { showMessage('HuntNav app shell is ready for offline launch'); },
  onRegisterError() { showMessage('Offline shell setup could not be completed'); },
});
