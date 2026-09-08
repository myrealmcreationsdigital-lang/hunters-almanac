import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNysParcel } from '../src/parcels/model.js';

test('normalizes NYS fields without leaking source names into consumers', () => {
  const parcel = normalizeNysParcel({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [] },
    properties: {
      OBJECTID: 42,
      COUNTY_NAME: 'Steuben',
      MUNI_NAME: 'Addison',
      PRINT_KEY: '123.00-01-02.000',
      MUNI_PARCEL_ID: '46000123000102000',
      PRIMARY_OWNER: 'Example Owner',
      ACRES: 18.25,
      CALC_ACRES: 18.4,
      ROLL_YR: 2025,
      SPATIAL_YR: 2025,
      DUP_GEO: 'N',
    },
  }, '2026-09-07T00:00:00.000Z');

  assert.equal(parcel.properties.parcelId, '46000123000102000');
  assert.equal(parcel.properties.displayId, '123.00-01-02.000');
  assert.equal(parcel.properties.owner, 'Example Owner');
  assert.equal(parcel.properties.acreage, 18.25);
  assert.equal(parcel.properties.acreageBasis, 'assessed');
  assert.equal(parcel.properties.jurisdiction.subdivision, 'NY');
  assert.equal(parcel.properties.source.spatialYear, 2025);
});

test('uses honest unavailable states and calculated acreage fallback', () => {
  const parcel = normalizeNysParcel({
    geometry: { type: 'Polygon', coordinates: [] },
    properties: {
      OBJECTID: 9,
      SWIS_SBL_ID: '461289-1-2-3',
      PRIMARY_OWNER: '  ',
      ACRES: null,
      CALC_ACRES: 4.125,
    },
  });

  assert.equal(parcel.properties.owner, null);
  assert.equal(parcel.properties.ownerAvailability, 'unavailable');
  assert.equal(parcel.properties.acreage, 4.125);
  assert.equal(parcel.properties.acreageBasis, 'calculated');
});

test('preserves distinct records with coincident geometry', () => {
  const geometry = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
  const first = normalizeNysParcel({ geometry, properties: { OBJECTID: 1, DUP_GEO: 'Y' } });
  const second = normalizeNysParcel({ geometry, properties: { OBJECTID: 2, DUP_GEO: 'Y' } });

  assert.notEqual(first.properties.providerFeatureId, second.properties.providerFeatureId);
  assert.equal(first.properties.duplicateGeometry, true);
  assert.equal(second.properties.duplicateGeometry, true);
});
