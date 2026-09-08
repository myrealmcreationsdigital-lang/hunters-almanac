import { PARCEL_STATES } from './ParcelProvider.js';
import { toMapFeatureCollection } from './model.js';
import { ViewportRequestCoordinator } from './requestCoordinator.js';

const EMPTY_COLLECTION = { type: 'FeatureCollection', features: [] };

function viewport(map) {
  const bounds = map.getBounds();
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

export function collectRenderedParcels(renderedFeatures, parcelsById) {
  const seenIds = new Set();
  const selected = [];

  for (const feature of renderedFeatures) {
    const id = String(feature.properties?.providerFeatureId ?? '');
    if (!id || seenIds.has(id)) continue;
    const parcel = parcelsById.get(id);
    if (parcel) {
      seenIds.add(id);
      selected.push(parcel);
    }
  }

  return selected;
}

export class ParcelController {
  constructor({ map, provider, onState, onSelection }) {
    this.map = map;
    this.provider = provider;
    this.onState = onState;
    this.onSelection = onSelection;
    this.enabled = true;
    this.parcels = new Map();
    this.coordinator = new ViewportRequestCoordinator({
      delay: 300,
      onRun: (payload, signal) => this.#load(payload, signal),
    });

    this.onMoveStart = () => this.coordinator.abortActive();
    this.onMoveEnd = () => this.refresh();
    this.onMapClick = (event) => this.#select(event);
  }

  start() {
    this.#ensureLayers();
    this.map.on('movestart', this.onMoveStart);
    this.map.on('moveend', this.onMoveEnd);
    this.map.on('click', this.onMapClick);
    this.map.on('mouseenter', 'parcel-fill', () => {
      this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'parcel-fill', () => {
      this.map.getCanvas().style.cursor = '';
    });
    this.refresh();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.coordinator.cancel();
    this.#setVisibility(enabled ? 'visible' : 'none');

    if (!enabled) {
      this.#setData(EMPTY_COLLECTION);
      this.parcels.clear();
      this.onState({ state: 'off', message: 'Property lines off' });
      this.clearSelection();
      return;
    }
    this.refresh();
  }

  refresh() {
    if (!this.enabled) return;
    if (!navigator.onLine) {
      this.#clearForState(PARCEL_STATES.OFFLINE, 'Live parcel data unavailable offline');
      return;
    }
    this.coordinator.schedule({ bbox: viewport(this.map), zoom: this.map.getZoom() });
  }

  clearSelection() {
    if (this.map.getLayer('parcel-selected-fill')) {
      const emptyFilter = ['==', ['get', 'providerFeatureId'], '__none__'];
      this.map.setFilter('parcel-selected-fill', emptyFilter);
      this.map.setFilter('parcel-selected-line', emptyFilter);
    }
    this.onSelection([]);
  }

  selectRecord(providerFeatureId) {
    const filter = ['==', ['get', 'providerFeatureId'], String(providerFeatureId)];
    this.map.setFilter('parcel-selected-fill', filter);
    this.map.setFilter('parcel-selected-line', filter);
  }

  async #load({ bbox, zoom }, signal) {
    this.onState({ state: PARCEL_STATES.LOADING, message: 'Loading property lines…' });
    try {
      const result = await this.provider.queryViewport({ bbox, zoom, signal });
      if (signal.aborted) return;

      if (result.state === PARCEL_STATES.READY) {
        this.parcels = new Map(
          result.parcels.map((parcel) => [String(parcel.properties.providerFeatureId), parcel]),
        );
        this.#setData(toMapFeatureCollection(result.parcels));
        this.onState({
          state: PARCEL_STATES.READY,
          count: result.parcels.length,
          complete: result.complete,
          message: `${result.parcels.length.toLocaleString()} parcels visible`,
        });
        return;
      }

      let message = 'Parcel data unavailable';
      if (result.state === PARCEL_STATES.ZOOM_REQUIRED) {
        message = `Zoom to ${result.minimumZoom}+ for property lines`;
      } else if (result.state === PARCEL_STATES.TOO_DENSE) {
        message = `${result.count.toLocaleString()} parcels here · zoom in`;
      } else if (result.state === PARCEL_STATES.EMPTY) {
        message = 'No parcels found in this view';
      } else if (result.state === PARCEL_STATES.UNAVAILABLE) {
        message = 'Parcel source covers Steuben County only';
      }
      this.#clearForState(result.state, message);
    } catch (error) {
      if (error.name === 'AbortError' || signal.aborted) return;
      const state = navigator.onLine ? PARCEL_STATES.ERROR : PARCEL_STATES.OFFLINE;
      this.#clearForState(
        state,
        state === PARCEL_STATES.OFFLINE
          ? 'Live parcel data unavailable offline'
          : 'Property service unavailable · move map to retry',
      );
    }
  }

  #clearForState(state, message) {
    this.#setData(EMPTY_COLLECTION);
    this.parcels.clear();
    this.clearSelection();
    this.onState({ state, message });
  }

  #select(event) {
    if (!this.enabled) return;
    const rendered = this.map.queryRenderedFeatures(event.point, { layers: ['parcel-fill'] });
    const selected = collectRenderedParcels(rendered, this.parcels);

    if (!selected.length) {
      this.clearSelection();
      return;
    }

    this.selectRecord(selected[0].properties.providerFeatureId);
    this.onSelection(selected);
  }

  #setData(data) {
    this.map.getSource('parcels')?.setData(data);
  }

  #setVisibility(visibility) {
    ['parcel-fill', 'parcel-line', 'parcel-selected-fill', 'parcel-selected-line'].forEach((layer) => {
      if (this.map.getLayer(layer)) this.map.setLayoutProperty(layer, 'visibility', visibility);
    });
  }

  #ensureLayers() {
    if (this.map.getSource('parcels')) return;
    this.map.addSource('parcels', { type: 'geojson', data: EMPTY_COLLECTION });
    this.map.addLayer({
      id: 'parcel-fill',
      type: 'fill',
      source: 'parcels',
      paint: { 'fill-color': '#d8b45c', 'fill-opacity': 0.035 },
    });
    this.map.addLayer({
      id: 'parcel-line',
      type: 'line',
      source: 'parcels',
      paint: {
        'line-color': '#f0d68a',
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1.15, 18, 2.1],
        'line-opacity': 0.92,
        'line-blur': 0.15,
      },
    });
    this.map.addLayer({
      id: 'parcel-selected-fill',
      type: 'fill',
      source: 'parcels',
      filter: ['==', ['get', 'providerFeatureId'], '__none__'],
      paint: { 'fill-color': '#d6a744', 'fill-opacity': 0.24 },
    });
    this.map.addLayer({
      id: 'parcel-selected-line',
      type: 'line',
      source: 'parcels',
      filter: ['==', ['get', 'providerFeatureId'], '__none__'],
      paint: { 'line-color': '#fff0b5', 'line-width': 3, 'line-opacity': 1 },
    });
  }
}
