import test from 'node:test';
import assert from 'node:assert/strict';
import { NysParcelProvider } from '../src/parcels/NysParcelProvider.js';

const BBOX = [-77.4, 42.2, -77.3, 42.3];

function feature(objectId) {
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [] },
    properties: { OBJECTID: objectId, COUNTY_NAME: 'Steuben' },
  };
}

test('gates parcel transfer below minimum zoom', async () => {
  let called = false;
  const provider = new NysParcelProvider({ fetchImpl: async () => { called = true; } });
  const result = await provider.queryViewport({ bbox: BBOX, zoom: 12, signal: new AbortController().signal });
  assert.equal(result.state, 'zoom-required');
  assert.equal(called, false);
});

test('calls the browser fetch implementation with its required global receiver', async () => {
  const originalFetch = globalThis.fetch;
  let receiver;
  globalThis.fetch = async function fetchStub() {
    receiver = this;
    return { ok: true, json: async () => ({ count: 0 }) };
  };

  try {
    const provider = new NysParcelProvider();
    const result = await provider.queryViewport({
      bbox: BBOX,
      zoom: 15,
      signal: new AbortController().signal,
    });
    assert.equal(result.state, 'empty');
    assert.equal(receiver, globalThis);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('checks density before downloading features', async () => {
  const urls = [];
  const provider = new NysParcelProvider({
    fetchImpl: async (url) => {
      urls.push(new URL(url));
      return { ok: true, json: async () => ({ count: 3001 }) };
    },
  });
  const result = await provider.queryViewport({ bbox: BBOX, zoom: 15, signal: new AbortController().signal });
  assert.equal(result.state, 'too-dense');
  assert.equal(urls.length, 1);
  assert.equal(urls[0].searchParams.get('returnCountOnly'), 'true');
});

test('paginates in pages no larger than 1000 and passes the abort signal', async () => {
  const requests = [];
  const signal = new AbortController().signal;
  const provider = new NysParcelProvider({
    fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      requests.push({ parsed, options });
      if (parsed.searchParams.get('returnCountOnly') === 'true') {
        return { ok: true, json: async () => ({ count: 1501 }) };
      }
      const offset = Number(parsed.searchParams.get('resultOffset'));
      const length = offset === 0 ? 1000 : 501;
      return {
        ok: true,
        json: async () => ({
          type: 'FeatureCollection',
          features: Array.from({ length }, (_, index) => feature(offset + index + 1)),
        }),
      };
    },
  });

  const result = await provider.queryViewport({ bbox: BBOX, zoom: 15, signal });
  const featureRequests = requests.slice(1);
  assert.equal(result.state, 'ready');
  assert.equal(result.parcels.length, 1501);
  assert.deepEqual(featureRequests.map(({ parsed }) => parsed.searchParams.get('resultOffset')), ['0', '1000']);
  assert.ok(featureRequests.every(({ parsed }) => Number(parsed.searchParams.get('resultRecordCount')) <= 1000));
  assert.ok(requests.every(({ options }) => options.signal === signal));
});
