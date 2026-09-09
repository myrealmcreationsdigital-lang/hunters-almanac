import { Marker } from 'maplibre-gl';

const EMPTY_COLLECTION = { type: 'FeatureCollection', features: [] };

function accuracyPolygon(longitude, latitude, radiusMeters, points = 64) {
  const coordinates = [];
  const latitudeDegrees = radiusMeters / 111_320;
  const longitudeDegrees = radiusMeters / (111_320 * Math.max(Math.cos((latitude * Math.PI) / 180), 0.1));

  for (let index = 0; index <= points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    coordinates.push([
      longitude + Math.cos(angle) * longitudeDegrees,
      latitude + Math.sin(angle) * latitudeDegrees,
    ]);
  }

  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { accuracy: radiusMeters },
      geometry: { type: 'Polygon', coordinates: [coordinates] },
    }],
  };
}

function locationErrorMessage(error) {
  if (!error) return 'Location unavailable';
  if (error.code === error.PERMISSION_DENIED) return 'Location permission denied';
  if (error.code === error.POSITION_UNAVAILABLE) return 'Position unavailable';
  if (error.code === error.TIMEOUT) return 'Location request timed out';
  return 'Location unavailable';
}

export class LocationTracker {
  constructor({ map, onState, MarkerClass = Marker }) {
    this.map = map;
    this.onState = onState;
    this.MarkerClass = MarkerClass;
    this.watchId = null;
    this.marker = null;
    this.position = null;
    this.startupPosition = null;
    this.pendingRecenter = true;
    this.isMapReady = false;
  }

  start() {
    if (!('geolocation' in navigator)) {
      this.onState({ state: 'unsupported', message: 'GPS is not supported by this browser' });
      return;
    }
    if (this.watchId !== null) return;

    this.onState({ state: 'requesting', message: 'Requesting location…' });
    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.#onPosition(position),
      (error) => this.#onError(error),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );
  }

  recenter() {
    if (!this.position || !this.isMapReady) {
      this.pendingRecenter = true;
      this.start();
      return false;
    }

    return this.#centerOnPosition(this.position);
  }

  #centerOnPosition(position) {
    const { longitude, latitude } = position.coords;
    this.map.easeTo({
      center: [longitude, latitude],
      zoom: Math.max(this.map.getZoom(), 15),
      duration: 650,
    });
    return true;
  }

  stop() {
    if (this.watchId !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.watchId = null;
  }

  markMapReady() {
    if (this.isMapReady) return;
    this.isMapReady = true;
    if (this.position) this.#renderPosition(this.position);
  }

  #ensureMapLayers() {
    if (!this.map.getSource('gps-accuracy')) {
      this.map.addSource('gps-accuracy', { type: 'geojson', data: EMPTY_COLLECTION });
      this.map.addLayer({
        id: 'gps-accuracy-fill',
        type: 'fill',
        source: 'gps-accuracy',
        paint: {
          'fill-color': '#e4c46f',
          'fill-opacity': 0.1,
          'fill-outline-color': '#e4c46f',
        },
      });
    }

    if (!this.marker) {
      const element = document.createElement('div');
      element.className = 'gps-marker';
      element.innerHTML = '<span></span>';
      element.setAttribute('aria-label', 'Current GPS position');
      this.marker = new this.MarkerClass({ element, anchor: 'center' });
    }
  }

  #onPosition(position) {
    this.position = position;
    if (this.pendingRecenter && !this.startupPosition) this.startupPosition = position;
    const { accuracy } = position.coords;

    const roundedAccuracy = Math.round(accuracy);
    this.onState({
      state: accuracy <= 50 ? 'tracking' : 'limited',
      message: `GPS accuracy ±${roundedAccuracy} m`,
      accuracy: roundedAccuracy,
    });

    if (this.isMapReady) this.#renderPosition(position);
  }

  #renderPosition(position) {
    const { longitude, latitude, accuracy } = position.coords;

    this.#ensureMapLayers();
    this.marker.setLngLat([longitude, latitude]).addTo(this.map);
    this.map.getSource('gps-accuracy').setData(
      accuracyPolygon(longitude, latitude, Math.max(accuracy, 1)),
    );

    if (this.pendingRecenter) {
      if (this.#centerOnPosition(this.startupPosition ?? position)) {
        this.pendingRecenter = false;
        this.startupPosition = null;
      }
    }
  }

  #onError(error) {
    if (error?.code === error?.PERMISSION_DENIED) this.watchId = null;
    this.onState({ state: 'error', message: locationErrorMessage(error), error });
  }
}
