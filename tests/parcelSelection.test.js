import test from 'node:test';
import assert from 'node:assert/strict';
import { collectRenderedParcels } from '../src/parcels/parcelController.js';

test('selects coincident parcel records without geometry-based deduplication', () => {
  const first = { properties: { providerFeatureId: '101' } };
  const second = { properties: { providerFeatureId: '102' } };
  const parcels = new Map([['101', first], ['102', second]]);
  const rendered = [
    { properties: { providerFeatureId: '101' } },
    { properties: { providerFeatureId: '102' } },
    { properties: { providerFeatureId: '101' } },
  ];

  assert.deepEqual(collectRenderedParcels(rendered, parcels), [first, second]);
});
