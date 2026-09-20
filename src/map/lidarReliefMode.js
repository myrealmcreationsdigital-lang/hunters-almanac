export const MAP_LAYER_IDS = Object.freeze({
  fieldBackground: 'field-background',
  coarseUsgsImagery: 'usgs-imagery-coarse-layer',
  usgsImagery: 'usgs-imagery-layer',
  lidarRelief: 'nys-lidar-relief-layer',
  nysImagery: 'nys-imagery-layer',
});

const IMAGERY_LAYER_IDS = Object.freeze([
  MAP_LAYER_IDS.coarseUsgsImagery,
  MAP_LAYER_IDS.usgsImagery,
  MAP_LAYER_IDS.nysImagery,
]);

export function createLidarReliefLayer(sourceId) {
  return {
    id: MAP_LAYER_IDS.lidarRelief,
    type: 'raster',
    source: sourceId,
    layout: { visibility: 'none' },
  };
}

export function insertLidarReliefLayer(layers, sourceId) {
  const nysImageryIndex = layers.findIndex((layer) => layer.id === MAP_LAYER_IDS.nysImagery);
  if (nysImageryIndex < 0) throw new Error('NYS imagery layer is required');
  return [
    ...layers.slice(0, nysImageryIndex),
    createLidarReliefLayer(sourceId),
    ...layers.slice(nysImageryIndex),
  ];
}

function readVisibility(map, layerId) {
  return map.getLayoutProperty(layerId, 'visibility') ?? 'visible';
}

export function createLidarReliefMode(map) {
  let enabled = false;
  let previousImageryVisibility = null;

  const setEnabled = (nextEnabled) => {
    const next = Boolean(nextEnabled);
    if (next === enabled) return;

    if (next) {
      previousImageryVisibility = new Map(
        IMAGERY_LAYER_IDS.map((layerId) => [layerId, readVisibility(map, layerId)]),
      );
      for (const layerId of IMAGERY_LAYER_IDS) {
        map.setLayoutProperty(layerId, 'visibility', 'none');
      }
      map.setLayoutProperty(MAP_LAYER_IDS.lidarRelief, 'visibility', 'visible');
    } else {
      map.setLayoutProperty(MAP_LAYER_IDS.lidarRelief, 'visibility', 'none');
      for (const layerId of IMAGERY_LAYER_IDS) {
        map.setLayoutProperty(
          layerId,
          'visibility',
          previousImageryVisibility?.get(layerId) ?? 'visible',
        );
      }
      previousImageryVisibility = null;
    }

    enabled = next;
  };

  return {
    isEnabled: () => enabled,
    setEnabled,
  };
}
