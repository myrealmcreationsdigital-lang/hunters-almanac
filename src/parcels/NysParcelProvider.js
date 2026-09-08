import { NYS_PARCELS } from '../config.js';
import { ParcelProvider, PARCEL_STATES } from './ParcelProvider.js';
import { normalizeNysParcel } from './model.js';

const OUT_FIELDS = [
  'OBJECTID', 'COUNTY_NAME', 'MUNI_NAME', 'PRINT_KEY', 'SBL',
  'MUNI_PARCEL_ID', 'SWIS_SBL_ID', 'SWIS_PRINT_KEY_ID', 'PRIMARY_OWNER',
  'ACRES', 'CALC_ACRES', 'ROLL_YR', 'SPATIAL_YR', 'DUP_GEO',
].join(',');

function intersects([west, south, east, north], [coverageWest, coverageSouth, coverageEast, coverageNorth]) {
  return !(east < coverageWest || west > coverageEast || north < coverageSouth || south > coverageNorth);
}

function baseParams(bbox) {
  return {
    where: `COUNTY_NAME='${NYS_PARCELS.county}'`,
    geometry: bbox.join(','),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
  };
}

export class NysParcelProvider extends ParcelProvider {
  constructor({ fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
    super();
    this.fetchImpl = fetchImpl;
  }

  get metadata() {
    return {
      id: NYS_PARCELS.providerId,
      name: 'NYS Public Tax Parcels',
      jurisdiction: { country: 'US', subdivision: 'NY', county: NYS_PARCELS.county },
      sourceUrl: NYS_PARCELS.sourceUrl,
      minimumZoom: NYS_PARCELS.minZoom,
      capabilities: {
        owner: true,
        acreage: true,
        viewportQuery: true,
        pointIdentify: true,
        pagination: true,
        liveOnly: true,
        attributionRequired: true,
        offlineRedistribution: 'unknown',
      },
    };
  }

  getCoverage({ bbox } = {}) {
    return {
      available: Array.isArray(bbox) && intersects(bbox, NYS_PARCELS.coverageBounds),
      jurisdiction: this.metadata.jurisdiction,
    };
  }

  async queryViewport({ bbox, zoom, signal }) {
    if (zoom < NYS_PARCELS.minZoom) {
      return { state: PARCEL_STATES.ZOOM_REQUIRED, minimumZoom: NYS_PARCELS.minZoom, parcels: [] };
    }
    if (!this.getCoverage({ bbox }).available) {
      return { state: PARCEL_STATES.UNAVAILABLE, parcels: [] };
    }

    const count = await this.#fetchCount({ bbox, signal });
    if (count === 0) return { state: PARCEL_STATES.EMPTY, count, parcels: [] };
    if (count > NYS_PARCELS.maxViewportFeatures) {
      return {
        state: PARCEL_STATES.TOO_DENSE,
        count,
        maximum: NYS_PARCELS.maxViewportFeatures,
        parcels: [],
      };
    }

    const retrievedAt = new Date().toISOString();
    const parcels = [];
    for (let offset = 0; offset < count; offset += NYS_PARCELS.pageSize) {
      const page = await this.#fetchPage({ bbox, offset, signal });
      parcels.push(...page.map((feature) => normalizeNysParcel(feature, retrievedAt)));
      if (page.length < Math.min(NYS_PARCELS.pageSize, count - offset)) break;
    }

    if (parcels.length === 0) return { state: PARCEL_STATES.EMPTY, count: 0, parcels: [] };
    return { state: PARCEL_STATES.READY, count, complete: parcels.length >= count, parcels };
  }

  async identifyAt({ longitude, latitude, signal }) {
    const params = new URLSearchParams({
      where: `COUNTY_NAME='${NYS_PARCELS.county}'`,
      geometry: `${longitude},${latitude}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: OUT_FIELDS,
      returnGeometry: 'true',
      outSR: '4326',
      resultRecordCount: '50',
      orderByFields: 'OBJECTID',
      f: 'geojson',
    });
    const data = await this.#request(`${NYS_PARCELS.serviceUrl}/query?${params}`, signal);
    const retrievedAt = new Date().toISOString();
    return (data.features ?? []).map((feature) => normalizeNysParcel(feature, retrievedAt));
  }

  async #fetchCount({ bbox, signal }) {
    const params = new URLSearchParams({
      ...baseParams(bbox),
      returnGeometry: 'false',
      returnCountOnly: 'true',
      f: 'json',
    });
    const data = await this.#request(`${NYS_PARCELS.serviceUrl}/query?${params}`, signal);
    return Number(data.count ?? 0);
  }

  async #fetchPage({ bbox, offset, signal }) {
    const params = new URLSearchParams({
      ...baseParams(bbox),
      outFields: OUT_FIELDS,
      returnGeometry: 'true',
      returnZ: 'false',
      returnM: 'false',
      outSR: '4326',
      orderByFields: 'OBJECTID',
      resultOffset: String(offset),
      resultRecordCount: String(NYS_PARCELS.pageSize),
      f: 'geojson',
    });
    const data = await this.#request(`${NYS_PARCELS.serviceUrl}/query?${params}`, signal);
    return data.features ?? [];
  }

  async #request(url, signal) {
    const response = await this.fetchImpl(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      signal,
      headers: { Accept: 'application/geo+json, application/json' },
    });
    if (!response.ok) throw new Error(`Parcel service request failed (${response.status})`);
    const data = await response.json();
    if (data.error) throw new Error(data.error.message ?? 'Parcel service returned an error');
    return data;
  }
}
