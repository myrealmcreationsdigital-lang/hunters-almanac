import { AttributionControl, Map, setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { INITIAL_VIEW, NYS_IMAGERY, NYS_LIDAR_RELIEF, USGS_IMAGERY } from '../config.js';
import {
  MAP_LAYER_IDS,
  insertLidarReliefLayer,
} from './lidarReliefMode.js';

setWorkerUrl(maplibreWorkerUrl);

export function createMap(container) {
  const map = new Map({
    container,
    ...INITIAL_VIEW,
    minZoom: 3,
    maxZoom: 19,
    dragRotate: true,
    touchPitch: false,
    attributionControl: false,
    style: {
      version: 8,
      sources: {
        'usgs-imagery-coarse': {
          type: 'raster',
          tiles: USGS_IMAGERY.tiles,
          tileSize: 256,
          minzoom: 0,
          maxzoom: 12,
        },
        [USGS_IMAGERY.id]: {
          type: 'raster',
          tiles: USGS_IMAGERY.tiles,
          tileSize: USGS_IMAGERY.tileSize,
          minzoom: USGS_IMAGERY.minzoom,
          maxzoom: USGS_IMAGERY.maxzoom,
          attribution: USGS_IMAGERY.attribution,
        },
        [NYS_IMAGERY.id]: {
          type: 'raster',
          tiles: NYS_IMAGERY.tiles,
          tileSize: NYS_IMAGERY.tileSize,
          minzoom: NYS_IMAGERY.minzoom,
          maxzoom: NYS_IMAGERY.maxzoom,
          attribution: NYS_IMAGERY.attribution,
        },
        [NYS_LIDAR_RELIEF.id]: {
          type: 'raster',
          tiles: NYS_LIDAR_RELIEF.tiles,
          tileSize: NYS_LIDAR_RELIEF.tileSize,
          minzoom: NYS_LIDAR_RELIEF.minzoom,
          maxzoom: NYS_LIDAR_RELIEF.maxzoom,
          bounds: NYS_LIDAR_RELIEF.bounds,
          attribution: NYS_LIDAR_RELIEF.attribution,
        },
      },
      layers: insertLidarReliefLayer([
        { id: MAP_LAYER_IDS.fieldBackground, type: 'background', paint: { 'background-color': '#07100d' } },
        {
          id: MAP_LAYER_IDS.coarseUsgsImagery,
          type: 'raster',
          source: 'usgs-imagery-coarse',
          paint: {
            'raster-saturation': -0.22,
            'raster-contrast': 0.12,
            'raster-brightness-max': 0.78,
            'raster-fade-duration': 0,
            'raster-resampling': 'linear',
          },
        },
        {
          id: MAP_LAYER_IDS.usgsImagery,
          type: 'raster',
          source: USGS_IMAGERY.id,
          paint: {
            'raster-saturation': -0.22,
            'raster-contrast': 0.12,
            'raster-brightness-max': 0.78,
            'raster-fade-duration': 180,
            'raster-resampling': 'linear',
          },
        },
        {
          id: MAP_LAYER_IDS.nysImagery,
          type: 'raster',
          source: NYS_IMAGERY.id,
          paint: {
            'raster-saturation': -0.22,
            'raster-contrast': 0.12,
            'raster-brightness-max': 0.78,
            'raster-fade-duration': 180,
            'raster-resampling': 'linear',
          },
        },
      ], NYS_LIDAR_RELIEF.id),
    },
  });

  map.touchZoomRotate.enableRotation();
  map.addControl(new AttributionControl({ compact: true }), 'bottom-right');
  return map;
}
