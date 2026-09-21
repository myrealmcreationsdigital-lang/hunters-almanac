export const WAYPOINT_SOURCE_ID = 'huntnav-waypoints';

export const WAYPOINT_LAYER_IDS = Object.freeze({
  selected: 'waypoint-selected',
  point: 'waypoint-point',
  hit: 'waypoint-hit',
});

export const WAYPOINT_CATEGORY_COLORS = Object.freeze({
  stand: '#d8b45c',
  camera: '#65a9d8',
  parking: '#d7d9d4',
  access: '#73b97b',
  sign: '#d99045',
  hazard: '#d85b4f',
  other: '#aa8ac4',
});

const EMPTY_COLLECTION = Object.freeze({ type: 'FeatureCollection', features: [] });
const NO_WAYPOINT_SELECTION_FILTER = Object.freeze(['all', false]);
const WAYPOINT_RENDER_ORDER = [
  WAYPOINT_LAYER_IDS.selected,
  WAYPOINT_LAYER_IDS.point,
  WAYPOINT_LAYER_IDS.hit,
];

const categoryColorExpression = [
  'match',
  ['get', 'category'],
  ...Object.entries(WAYPOINT_CATEGORY_COLORS).flat(),
  WAYPOINT_CATEGORY_COLORS.other,
];

function selectionFilter(id) {
  return id === null
    ? NO_WAYPOINT_SELECTION_FILTER
    : ['==', ['get', 'id'], id];
}

export function toWaypointFeatureCollection(records) {
  if (!Array.isArray(records)) return { type: 'FeatureCollection', features: [] };

  const features = [];
  for (const record of records) {
    let id;
    let latitude;
    let longitude;
    let category;
    let title;
    try {
      if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
      ({ id, latitude, longitude, category, title } = record);
    } catch {
      continue;
    }

    if (typeof id !== 'string' || !id || id.trim() !== id) continue;
    if (typeof latitude !== 'number'
      || !Number.isFinite(latitude)
      || latitude < -90
      || latitude > 90) continue;
    if (typeof longitude !== 'number'
      || !Number.isFinite(longitude)
      || longitude < -180
      || longitude > 180) continue;

    const renderCategory = typeof category === 'string'
      && Object.hasOwn(WAYPOINT_CATEGORY_COLORS, category)
      ? category
      : 'other';
    features.push({
      type: 'Feature',
      id,
      geometry: {
        type: 'Point',
        coordinates: [longitude, latitude],
      },
      properties: {
        id,
        category: renderCategory,
        ...(typeof title === 'string' ? { title } : {}),
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

function snapshotRecords(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  try {
    return Array.isArray(state.records) ? state.records : null;
  } catch {
    return null;
  }
}

export function createWaypointLayer({ map, store }) {
  const initialRecords = snapshotRecords(store.getState());
  let featureCollection = initialRecords === null
    ? EMPTY_COLLECTION
    : toWaypointFeatureCollection(initialRecords);
  let renderableWaypointIds = new Set(
    featureCollection.features.map((feature) => feature.properties.id),
  );
  let selectedWaypointId = null;
  let initialized = false;
  let destroyed = false;
  let updatingStyle = false;

  const updateSelectionFilter = () => {
    if (map.getLayer(WAYPOINT_LAYER_IDS.selected)) {
      map.setFilter(WAYPOINT_LAYER_IDS.selected, selectionFilter(selectedWaypointId));
    }
  };

  const ensureLayerOrder = () => {
    const styleLayers = map.getStyle?.()?.layers ?? [];
    const currentOrder = styleLayers.map(({ id }) => id);
    const currentWaypointOrder = currentOrder.filter((id) => WAYPOINT_RENDER_ORDER.includes(id));
    const alreadyOnTop = currentWaypointOrder.length === WAYPOINT_RENDER_ORDER.length
      && WAYPOINT_RENDER_ORDER.every((id, index) => id === currentWaypointOrder[index])
      && currentOrder.slice(-WAYPOINT_RENDER_ORDER.length)
        .every((id, index) => id === WAYPOINT_RENDER_ORDER[index]);
    if (alreadyOnTop || typeof map.moveLayer !== 'function') return;

    WAYPOINT_RENDER_ORDER.forEach((id) => {
      if (map.getLayer(id)) map.moveLayer(id);
    });
  };

  const initialize = () => {
    if (destroyed || updatingStyle) return;
    updatingStyle = true;
    try {
      if (!map.getSource(WAYPOINT_SOURCE_ID)) {
        map.addSource(WAYPOINT_SOURCE_ID, {
          type: 'geojson',
          data: EMPTY_COLLECTION,
        });
      }

      if (!map.getLayer(WAYPOINT_LAYER_IDS.selected)) {
        map.addLayer({
          id: WAYPOINT_LAYER_IDS.selected,
          type: 'circle',
          source: WAYPOINT_SOURCE_ID,
          filter: selectionFilter(selectedWaypointId),
          paint: {
            'circle-radius': 11,
            'circle-color': 'rgba(0, 0, 0, 0)',
            'circle-stroke-color': '#fff0b5',
            'circle-stroke-width': 3,
            'circle-stroke-opacity': 1,
          },
        });
      }

      if (!map.getLayer(WAYPOINT_LAYER_IDS.point)) {
        map.addLayer({
          id: WAYPOINT_LAYER_IDS.point,
          type: 'circle',
          source: WAYPOINT_SOURCE_ID,
          paint: {
            'circle-radius': 6,
            'circle-color': categoryColorExpression,
            'circle-stroke-color': '#17130d',
            'circle-stroke-width': 2,
            'circle-opacity': 1,
          },
        });
      }

      if (!map.getLayer(WAYPOINT_LAYER_IDS.hit)) {
        map.addLayer({
          id: WAYPOINT_LAYER_IDS.hit,
          type: 'circle',
          source: WAYPOINT_SOURCE_ID,
          paint: {
            'circle-radius': 12,
            'circle-color': 'rgba(0, 0, 0, 0)',
            'circle-opacity': 0,
          },
        });
      }

      initialized = true;
      map.getSource(WAYPOINT_SOURCE_ID)?.setData(featureCollection);
      updateSelectionFilter();
      ensureLayerOrder();
    } finally {
      updatingStyle = false;
    }
  };

  const onLoad = () => initialize();
  const onStyleData = () => {
    if (initialized && !updatingStyle) ensureLayerOrder();
  };
  const unsubscribe = store.subscribe((state) => {
    const records = snapshotRecords(state);
    if (records === null) return;

    featureCollection = toWaypointFeatureCollection(records);
    renderableWaypointIds = new Set(
      featureCollection.features.map((feature) => feature.properties.id),
    );
    if (selectedWaypointId !== null
      && !renderableWaypointIds.has(selectedWaypointId)) {
      selectedWaypointId = null;
      updateSelectionFilter();
    }
    if (initialized) {
      map.getSource(WAYPOINT_SOURCE_ID)?.setData(featureCollection);
    }
  });

  map.on('load', onLoad);
  map.on('styledata', onStyleData);
  if (map.isStyleLoaded?.() || map.loaded?.()) initialize();

  return {
    initialize,
    selectWaypoint(id) {
      if (typeof id !== 'string' || !renderableWaypointIds.has(id)) return false;
      selectedWaypointId = id;
      updateSelectionFilter();
      return true;
    },
    clearWaypointSelection() {
      selectedWaypointId = null;
      updateSelectionFilter();
    },
    getSelectedWaypointId() {
      return selectedWaypointId;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      map.off?.('load', onLoad);
      map.off?.('styledata', onStyleData);
    },
  };
}
