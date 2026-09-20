import { AttributionControl, Map, setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { INITIAL_VIEW, NYS_IMAGERY, USGS_IMAGERY } from '../config.js';

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
      },
      layers: [
        { id: 'field-background', type: 'background', paint: { 'background-color': '#07100d' } },
        {
          id: 'usgs-imagery-coarse-layer',
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
          id: 'usgs-imagery-layer',
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
          id: 'nys-imagery-layer',
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
      ],
    },
  });

  map.touchZoomRotate.enableRotation();
  map.addControl(new AttributionControl({ compact: true }), 'bottom-right');
  return map;
}
