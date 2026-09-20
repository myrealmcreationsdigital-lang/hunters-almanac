import { PARCEL_STATES } from './ParcelProvider.js';
import { classifyPointInGeometry } from './geometry.js';
import { toMapFeatureCollection } from './model.js';
import { ViewportRequestCoordinator } from './requestCoordinator.js';

const EMPTY_COLLECTION = { type: 'FeatureCollection', features: [] };
const PARCEL_TOUCH_TOLERANCE = 8;
const OBSOLETE_CLEAR_STATES = new Set([
  PARCEL_STATES.EMPTY,
  PARCEL_STATES.UNAVAILABLE,
  PARCEL_STATES.TOO_DENSE,
  PARCEL_STATES.ERROR,
]);

function viewport(map) {
  const bounds = map.getBounds();
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

export function collectRenderedParcels(renderedFeatures, ...parcelLookups) {
  const seenIds = new Set();
  const selected = [];

  for (const feature of renderedFeatures) {
    const id = String(feature.properties?.providerFeatureId ?? '');
    if (!id || seenIds.has(id)) continue;
    const parcel = parcelLookups.reduce(
      (match, parcelsById) => match ?? parcelsById.get(id),
      null,
    );
    if (parcel) {
      seenIds.add(id);
      selected.push(parcel);
    }
  }

  return selected;
}

export class ParcelController {
  constructor({
    map,
    provider,
    onState,
    onSelection,
    onDiagnostic = () => {},
    requestDelay = 300,
    enabled = true,
  }) {
    this.map = map;
    this.provider = provider;
    this.onState = onState;
    this.onSelection = onSelection;
    this.onDiagnostic = onDiagnostic;
    this.enabled = enabled;
    this.parcels = new Map();
    this.previousParcels = new Map();
    this.selectedProviderFeatureIds = [];
    this.pendingTap = null;
    this.sourceRevision = 0;
    this.mapIdle = false;
    this.sourceHandoffInFlight = false;
    this.coordinator = new ViewportRequestCoordinator({
      delay: requestDelay,
      onRun: (payload, signal, context) => this.#load(payload, signal, context),
    });

    this.onMoveEnd = () => this.refresh();
    this.onMoveStart = () => { this.mapIdle = false; };
    this.onMapIdle = () => { this.mapIdle = true; };
    this.onMapClick = (event) => this.#select(event);
  }

  start() {
    this.#ensureLayers();
    this.#setVisibility(this.enabled ? 'visible' : 'none');
    this.map.on('movestart', this.onMoveStart);
    this.map.on('moveend', this.onMoveEnd);
    this.map.on('idle', this.onMapIdle);
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
      this.sourceRevision += 1;
      this.sourceHandoffInFlight = false;
      this.#setData(EMPTY_COLLECTION);
      this.parcels.clear();
      this.previousParcels.clear();
      this.onState({ state: 'off', message: 'Property lines off' });
      this.clearSelection('property-lines-disabled');
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

  clearSelection(reason = 'external-clear-selection', diagnostic = null) {
    const { runtime, ...diagnosticDetails } = diagnostic ?? {};
    this.selectedProviderFeatureIds = [];
    this.pendingTap = null;
    if (this.map.getLayer('parcel-selected-fill')) {
      const emptyFilter = ['==', ['get', 'providerFeatureId'], '__none__'];
      this.map.setFilter('parcel-selected-fill', emptyFilter);
      this.map.setFilter('parcel-selected-line', emptyFilter);
    }
    this.onSelection([]);
    this.#emitDiagnostic({
      kind: diagnostic?.kind ?? 'selection-clear',
      ...diagnosticDetails,
      action: 'cleared',
      clearReason: reason,
    }, runtime);
  }

  selectRecord(providerFeatureId) {
    const filter = ['==', ['get', 'providerFeatureId'], String(providerFeatureId)];
    this.map.setFilter('parcel-selected-fill', filter);
    this.map.setFilter('parcel-selected-line', filter);
  }

  async #load({ bbox, zoom }, signal, { hasPending }) {
    this.onState({ state: PARCEL_STATES.LOADING, message: 'Loading property lines…' });
    try {
      const result = await this.provider.queryViewport({ bbox, zoom, signal });
      if (signal.aborted) return;

      if (result.state === PARCEL_STATES.READY) {
        const nextParcels = new Map(
          result.parcels.map((parcel) => [String(parcel.properties.providerFeatureId), parcel]),
        );
        this.previousParcels = this.parcels;
        this.parcels = nextParcels;
        this.sourceHandoffInFlight = true;
        this.mapIdle = false;
        this.#setData(toMapFeatureCollection(result.parcels));
        this.#validateSelectionAfterRender();
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
        message = 'Public parcel data unavailable for this area';
      }
      if (hasPending() && OBSOLETE_CLEAR_STATES.has(result.state)) return;
      this.#clearForState(result.state, message);
    } catch (error) {
      if (error.name === 'AbortError' || signal.aborted) return;
      const state = navigator.onLine ? PARCEL_STATES.ERROR : PARCEL_STATES.OFFLINE;
      if (hasPending() && OBSOLETE_CLEAR_STATES.has(state)) return;
      this.#clearForState(
        state,
        state === PARCEL_STATES.OFFLINE
          ? 'Live parcel data unavailable offline'
          : 'Property service unavailable · move map to retry',
      );
    }
  }

  #clearForState(state, message) {
    this.sourceRevision += 1;
    this.sourceHandoffInFlight = false;
    this.#setData(EMPTY_COLLECTION);
    this.parcels.clear();
    this.previousParcels.clear();
    this.clearSelection(`terminal-parcel-state:${state}`, {
      kind: 'terminal-state-clear',
      terminalState: state,
      terminalMessage: message,
    });
    this.onState({ state, message });
  }

  #select(event, { retry = false } = {}) {
    if (!this.enabled) return;
    if (!retry) this.pendingTap = null;
    const kind = retry ? 'map-tap-retry' : 'map-tap';
    const runtime = this.#runtimeState();
    const exact = this.#queryParcels(event.point);
    if (exact.selected.length) {
      const action = this.#applySelection(exact.selected);
      this.#emitDiagnostic({
        kind,
        exact: exact.diagnostic,
        geographic: null,
        tolerance: null,
        ambiguous: false,
        action,
        clearReason: null,
      }, runtime);
      return;
    }

    const geographic = this.#queryGeographicParcels(event.lngLat);
    if (geographic.selected === null) {
      this.#emitDiagnostic({
        kind,
        exact: exact.diagnostic,
        geographic: geographic.diagnostic,
        tolerance: null,
        ambiguous: true,
        action: 'preserved',
        clearReason: null,
      }, runtime);
      return;
    }

    if (geographic.selected.length) {
      const action = this.#applySelection(geographic.selected);
      this.#emitDiagnostic({
        kind,
        exact: exact.diagnostic,
        geographic: geographic.diagnostic,
        tolerance: null,
        ambiguous: geographic.ambiguous,
        action,
        clearReason: null,
      }, runtime);
      return;
    }

    const { x, y } = event.point;
    const toleranceBox = [
      [x - PARCEL_TOUCH_TOLERANCE, y - PARCEL_TOUCH_TOLERANCE],
      [x + PARCEL_TOUCH_TOLERANCE, y + PARCEL_TOUCH_TOLERANCE],
    ];
    const tolerance = this.#queryParcels(toleranceBox);
    const resolvedTolerance = this.#resolveToleranceCandidates(tolerance.selected);
    if (resolvedTolerance.selected === null) {
      this.#emitDiagnostic({
        kind,
        exact: exact.diagnostic,
        geographic: geographic.diagnostic,
        tolerance: tolerance.diagnostic,
        ambiguous: true,
        action: 'preserved',
        clearReason: null,
      }, runtime);
      return;
    }

    if (!resolvedTolerance.selected.length) {
      const renderedCount = exact.diagnostic.renderedFeatureCount
        + tolerance.diagnostic.renderedFeatureCount;
      if (!retry && runtime.refreshInFlight) {
        this.pendingTap = this.#retainTap(event);
        this.#emitDiagnostic({
          kind,
          exact: exact.diagnostic,
          geographic: geographic.diagnostic,
          tolerance: tolerance.diagnostic,
          ambiguous: false,
          action: 'preserved',
          clearReason: null,
          retryPending: true,
        }, runtime);
        return;
      }
      const reason = renderedCount
        ? `${kind}-rendered-feature-ids-unresolved`
        : `${kind}-no-rendered-parcel-features`;
      this.clearSelection(reason, {
        kind,
        runtime,
        exact: exact.diagnostic,
        geographic: geographic.diagnostic,
        tolerance: tolerance.diagnostic,
        ambiguous: false,
      });
      return;
    }

    const action = this.#applySelection(resolvedTolerance.selected);
    this.#emitDiagnostic({
      kind,
      exact: exact.diagnostic,
      geographic: geographic.diagnostic,
      tolerance: tolerance.diagnostic,
      ambiguous: resolvedTolerance.ambiguous,
      action,
      clearReason: null,
    }, runtime);
  }

  #queryParcels(geometry) {
    const rendered = this.map.queryRenderedFeatures(geometry, { layers: ['parcel-fill'] });
    const resolutions = [];
    const seenIds = new Set();
    for (const feature of rendered) {
      const id = String(feature.properties?.providerFeatureId ?? '');
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      resolutions.push({
        id: id || '(missing)',
        current: Boolean(id && this.parcels.has(id)),
        previous: Boolean(id && this.previousParcels.has(id)),
      });
    }
    return {
      selected: collectRenderedParcels(rendered, this.parcels, this.previousParcels),
      diagnostic: {
        renderedFeatureCount: rendered.length,
        returnedFeatureIds: rendered.map((feature) => String(
          feature.properties?.providerFeatureId ?? '(missing)',
        )),
        resolutions,
      },
    };
  }

  #queryGeographicParcels(lngLat) {
    const point = [Number(lngLat?.lng), Number(lngLat?.lat)];
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      return {
        selected: [],
        ambiguous: false,
        diagnostic: {
          relation: 'unavailable',
          lookup: 'none',
          insideFeatureIds: [],
          boundaryFeatureIds: [],
        },
      };
    }

    const current = this.#classifyParcelLookup(point, this.parcels);
    const currentResolution = this.#resolveGeographicCandidates(current);
    if (currentResolution.relation !== 'outside') {
      return {
        ...currentResolution,
        diagnostic: this.#geographicDiagnostic(currentResolution, 'current'),
      };
    }

    if (this.sourceHandoffInFlight) {
      const previous = this.#classifyParcelLookup(point, this.previousParcels);
      const previousResolution = this.#resolveGeographicCandidates(previous);
      if (previousResolution.relation !== 'outside') {
        return {
          ...previousResolution,
          diagnostic: this.#geographicDiagnostic(previousResolution, 'previous'),
        };
      }
    }

    return {
      selected: [],
      ambiguous: false,
      relation: 'outside',
      inside: [],
      boundary: [],
      diagnostic: {
        relation: 'outside',
        lookup: 'none',
        insideFeatureIds: [],
        boundaryFeatureIds: [],
      },
    };
  }

  #classifyParcelLookup(point, parcelLookup) {
    const inside = [];
    const boundary = [];
    for (const parcel of parcelLookup.values()) {
      const relation = classifyPointInGeometry(point, parcel.geometry);
      if (relation === 'inside') inside.push(parcel);
      else if (relation === 'boundary') boundary.push(parcel);
    }
    return { inside, boundary };
  }

  #resolveGeographicCandidates({ inside, boundary }) {
    if (inside.length) {
      return { selected: inside, ambiguous: false, relation: 'inside', inside, boundary };
    }
    if (!boundary.length) {
      return { selected: [], ambiguous: false, relation: 'outside', inside, boundary };
    }
    if (boundary.length === 1) {
      return { selected: boundary, ambiguous: false, relation: 'boundary', inside, boundary };
    }

    const resolvedBoundary = this.#resolveToleranceCandidates(boundary);
    return {
      selected: resolvedBoundary.selected,
      ambiguous: resolvedBoundary.ambiguous,
      relation: 'boundary',
      inside,
      boundary,
    };
  }

  #geographicDiagnostic(result, lookup) {
    const ids = (parcels) => parcels.map((parcel) => String(parcel.properties.providerFeatureId));
    return {
      relation: result.relation,
      lookup,
      insideFeatureIds: ids(result.inside),
      boundaryFeatureIds: ids(result.boundary),
    };
  }

  #retainTap(event) {
    let lngLat = event.lngLat
      ? { lng: Number(event.lngLat.lng), lat: Number(event.lngLat.lat) }
      : null;
    if (!lngLat && typeof this.map.unproject === 'function') {
      const unprojected = this.map.unproject(event.point);
      lngLat = { lng: Number(unprojected.lng), lat: Number(unprojected.lat) };
    }
    return {
      lngLat,
      point: { x: event.point.x, y: event.point.y },
    };
  }

  #retryPendingTap() {
    if (!this.pendingTap || this.#runtimeState().refreshInFlight) return false;
    const pendingTap = this.pendingTap;
    this.pendingTap = null;
    const point = pendingTap.lngLat && typeof this.map.project === 'function'
      ? this.map.project(pendingTap.lngLat)
      : pendingTap.point;
    this.#select({ point, lngLat: pendingTap.lngLat }, { retry: true });
    return true;
  }

  #resolveToleranceCandidates(candidates) {
    if (candidates.length < 2) return { selected: candidates, ambiguous: false };

    const geometryGroups = new Map();
    for (const parcel of candidates) {
      const key = JSON.stringify(parcel.geometry);
      const group = geometryGroups.get(key) ?? [];
      group.push(parcel);
      geometryGroups.set(key, group);
    }
    if (geometryGroups.size === 1) return { selected: candidates, ambiguous: false };

    return {
      selected: [...geometryGroups.values()].find((group) => group.some((parcel) => (
        this.selectedProviderFeatureIds.includes(String(parcel.properties.providerFeatureId))
      ))) ?? null,
      ambiguous: true,
    };
  }

  #applySelection(selected) {
    const providerFeatureIds = selected.map((parcel) => String(parcel.properties.providerFeatureId));
    const unchanged = providerFeatureIds.length === this.selectedProviderFeatureIds.length
      && providerFeatureIds.every((id, index) => id === this.selectedProviderFeatureIds[index]);
    if (unchanged) return 'preserved';

    this.selectedProviderFeatureIds = providerFeatureIds;
    this.selectRecord(providerFeatureIds[0]);
    this.onSelection(selected);
    return 'replaced';
  }

  #validateSelectionAfterRender() {
    const revision = ++this.sourceRevision;
    const validate = () => {
      if (revision !== this.sourceRevision) return;
      this.previousParcels = new Map();
      this.sourceHandoffInFlight = false;
      if (this.#runtimeState().refreshInFlight) return;
      if (this.#retryPendingTap()) return;
      if (!this.selectedProviderFeatureIds.length) return;

      const currentSelection = this.selectedProviderFeatureIds
        .map((id) => this.parcels.get(id))
        .filter(Boolean);
      if (!currentSelection.length) {
        this.clearSelection('refresh-reconciliation-selection-not-in-current-source');
        return;
      }
      if (currentSelection.length !== this.selectedProviderFeatureIds.length) {
        this.#applySelection(currentSelection);
      }
    };

    if (typeof this.map.once === 'function') this.map.once('idle', validate);
    else validate();
  }

  #runtimeState() {
    const requestActive = Boolean(this.coordinator.controller);
    const refreshScheduled = this.coordinator.timer !== null || this.coordinator.hasPendingPayload;
    let mapIdle = this.mapIdle;
    if (typeof this.map.loaded === 'function') mapIdle = mapIdle && this.map.loaded();
    if (typeof this.map.isMoving === 'function') mapIdle = mapIdle && !this.map.isMoving();
    return {
      refreshInFlight: requestActive || refreshScheduled || this.sourceHandoffInFlight,
      requestActive,
      refreshScheduled,
      sourceHandoffInFlight: this.sourceHandoffInFlight,
      mapIdle,
    };
  }

  #emitDiagnostic(diagnostic, runtime = this.#runtimeState()) {
    this.onDiagnostic({
      timestamp: new Date().toISOString(),
      ...runtime,
      ...diagnostic,
    });
  }

  #setData(data) {
    this.map.getSource('parcels')?.setData(data);
  }

  #setVisibility(visibility) {
    ['parcel-fill', 'parcel-line-casing', 'parcel-line', 'parcel-selected-fill', 'parcel-selected-line'].forEach((layer) => {
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
    // Dark casing line rendered under the brass line so boundaries stay
    // legible over light fields, dark woods, roads, and buildings alike.
    this.map.addLayer({
      id: 'parcel-line-casing',
      type: 'line',
      source: 'parcels',
      paint: {
        'line-color': '#140d06',
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2.6, 18, 4.4],
        'line-opacity': 0.8,
      },
    });
    this.map.addLayer({
      id: 'parcel-line',
      type: 'line',
      source: 'parcels',
      paint: {
        'line-color': '#f0d68a',
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1.15, 18, 2.1],
        'line-opacity': 0.95,
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
    this.#ensureLayerOrder();
  }

  // Explicit, unmistakable guarantee that parcel layers render above the primary
  // raster imagery, independent of the order addLayer() happened to run in.
  // moveLayer(id) with no beforeId moves a layer to the very top of the stack.
  #ensureLayerOrder() {
    const imageryIndex = this.map.getStyle().layers.findIndex((layer) => layer.id === 'nys-imagery-layer');
    for (const id of ['parcel-fill', 'parcel-line-casing', 'parcel-line', 'parcel-selected-fill', 'parcel-selected-line']) {
      if (!this.map.getLayer(id)) continue;
      const layerIndex = this.map.getStyle().layers.findIndex((layer) => layer.id === id);
      if (layerIndex <= imageryIndex) this.map.moveLayer(id);
    }
  }
}
