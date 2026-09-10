import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { createMap } from './map/createMap.js';
import { LocationTracker } from './location/locationTracker.js';
import { NysParcelProvider } from './parcels/NysParcelProvider.js';
import { ParcelController } from './parcels/parcelController.js';
import { createMapLayersControl, readPropertyLinesEnabled } from './ui/mapLayersControl.js';
import { createParcelPanel } from './ui/parcelPanel.js';

const elements = {
  networkStatus: document.querySelector('#network-status'),
  gpsChip: document.querySelector('#gps-chip'),
  locationStatus: document.querySelector('#location-status'),
  layersButton: document.querySelector('#layers-button'),
  layersPanel: document.querySelector('#layers-panel'),
  layersClose: document.querySelector('#layers-close'),
  parcelToggle: document.querySelector('#parcel-toggle'),
  parcelStatus: document.querySelector('#parcel-status'),
  bearingReset: document.querySelector('#bearing-reset'),
  bearingArrow: document.querySelector('#bearing-arrow'),
  bearingValue: document.querySelector('#bearing-value'),
  recenter: document.querySelector('#recenter'),
  message: document.querySelector('#map-message'),
  panel: document.querySelector('#parcel-panel'),
  panelClose: document.querySelector('#parcel-panel-close'),
  panelHandle: document.querySelector('#parcel-panel-handle'),
  panelExpandedContent: document.querySelector('#parcel-panel-expanded'),
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

let parcelController;
let layersControl;
let parcelPanel;
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
  layersControl.setStatus({ state, message });
}

function renderParcelDiagnostic(diagnostic) {
  parcelDiagnosticSequence += 1;
  const entry = { sequence: parcelDiagnosticSequence, ...diagnostic };
  parcelDiagnostics.push(entry);
  if (parcelDiagnostics.length > 50) parcelDiagnostics.shift();
  globalThis.huntNavLastParcelDiagnostic = entry;
  console.info(`[HuntNav parcel diagnostic #${entry.sequence}]`, entry);
}

const initialPropertyLinesEnabled = readPropertyLinesEnabled();
layersControl = createMapLayersControl({
  elements: {
    menuButton: elements.layersButton,
    panel: elements.layersPanel,
    closeButton: elements.layersClose,
    propertyToggle: elements.parcelToggle,
    propertyStatus: elements.parcelStatus,
  },
  initialPropertyLinesEnabled,
  onPropertyLinesChange: (enabled) => parcelController?.setEnabled(enabled),
  onHint: showMessage,
});

parcelPanel = createParcelPanel({
  elements: {
    panel: elements.panel,
    closeButton: elements.panelClose,
    handleButton: elements.panelHandle,
    expandedContent: elements.panelExpandedContent,
    owner: elements.owner,
    acreage: elements.acreage,
    parcelId: elements.parcelId,
    jurisdiction: elements.jurisdiction,
    year: elements.year,
    source: elements.source,
    recordNav: elements.recordNav,
    recordCount: elements.recordCount,
    recordPrev: elements.recordPrev,
    recordNext: elements.recordNext,
  },
  onClose: () => parcelController?.clearSelection('panel-close-button'),
  onRecordChange: (parcel) => parcelController?.selectRecord(
    parcel.properties.providerFeatureId,
  ),
});

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
    onSelection: (parcels) => parcelPanel.setSelection(parcels),
    onDiagnostic: renderParcelDiagnostic,
    enabled: layersControl.isPropertyLinesEnabled(),
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

elements.bearingReset.addEventListener('click', () => map.resetNorth({ duration: 500 }));
elements.recenter.addEventListener('click', () => locationTracker.recenter());

globalThis.addEventListener('online', updateNetworkState);
globalThis.addEventListener('offline', updateNetworkState);
globalThis.addEventListener('beforeunload', () => locationTracker.stop());
updateNetworkState();

registerSW({
  immediate: true,
  onOfflineReady() { showMessage('HuntNav app shell is ready for offline launch'); },
  onRegisterError() { showMessage('Offline shell setup could not be completed'); },
});
