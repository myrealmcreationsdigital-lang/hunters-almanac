export const PARCEL_STATES = Object.freeze({
  READY: 'ready',
  LOADING: 'loading',
  ZOOM_REQUIRED: 'zoom-required',
  TOO_DENSE: 'too-dense',
  EMPTY: 'empty',
  OFFLINE: 'offline',
  UNAVAILABLE: 'unavailable',
  ERROR: 'error',
});

export class ParcelProvider {
  get metadata() {
    throw new Error('ParcelProvider.metadata must be implemented');
  }

  getCoverage() {
    throw new Error('ParcelProvider.getCoverage must be implemented');
  }

  async queryViewport() {
    throw new Error('ParcelProvider.queryViewport must be implemented');
  }

  async identifyAt() {
    throw new Error('ParcelProvider.identifyAt must be implemented');
  }
}
