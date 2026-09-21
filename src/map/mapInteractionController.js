import { WAYPOINT_LAYER_IDS } from './waypointLayer.js';

export function createMapInteractionController({ map, waypointLayer, parcelController }) {
  let started = false;

  const handleMapClick = (event) => {
    const waypointHits = map.getLayer(WAYPOINT_LAYER_IDS.hit)
      ? map.queryRenderedFeatures(event.point, { layers: [WAYPOINT_LAYER_IDS.hit] })
      : [];
    const waypointId = waypointHits[0]?.properties?.id;

    if (waypointId !== undefined && waypointId !== null && String(waypointId)) {
      waypointLayer.selectWaypoint(String(waypointId));
      parcelController.clearSelection('waypoint-selected');
      return;
    }

    waypointLayer.clearWaypointSelection();
    parcelController.handleMapClick(event);
  };

  return {
    handleMapClick,
    start() {
      if (started) return;
      started = true;
      map.on('click', handleMapClick);
    },
    stop() {
      if (!started) return;
      started = false;
      map.off?.('click', handleMapClick);
    },
  };
}
