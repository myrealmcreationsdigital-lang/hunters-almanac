import { AttributionControl, Map } from 'maplibre-gl';
import { INITIAL_VIEW, USGS_IMAGERY } from '../config.js';

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
        [USGS_IMAGERY.id]: {
          type: 'raster',
          tiles: USGS_IMAGERY.tiles,
          tileSize: USGS_IMAGERY.tileSize,
          minzoom: USGS_IMAGERY.minzoom,
          maxzoom: USGS_IMAGERY.maxzoom,
          attribution: USGS_IMAGERY.attribution,
        },
      },
      layers: [
        { id: 'field-background', type: 'background', paint: { 'background-color': '#07100d' } },
        {
          id: 'usgs-imagery-layer',
          type: 'raster',
          source: USGS_IMAGERY.id,
          paint: {
            'raster-saturation': -0.22,
            'raster-contrast': 0.12,
            'raster-brightness-max': 0.78,
            'raster-fade-duration': 180,
            'raster-resampling': 'nearest',
          },
        },
      ],
    },
  });

  map.touchZoomRotate.enableRotation();
  map.addControl(new AttributionControl({ compact: true }), 'bottom-right');
  return map;
}
