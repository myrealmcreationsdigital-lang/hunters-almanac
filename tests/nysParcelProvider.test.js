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

test('advertises statewide NYS jurisdiction and coarse state bounds', () => {
  const provider = new NysParcelProvider();

  assert.deepEqual(provider.metadata.jurisdiction, { country: 'US', subdivision: 'NY' });
  assert.equal(provider.getCoverage({ bbox: BBOX }).available, true);
  assert.equal(provider.getCoverage({ bbox: [-120, 35, -119, 36] }).available, false);
});

test('calls the browser fetch implementation with its required global receiver', async () => {
  const originalFetch = globalThis.fetch;
  const receivers = [];
  globalThis.fetch = async function fetchStub(url) {
    receivers.push(this);
    const count = url.includes('/FeatureServer/0/query') ? 1 : 0;
    return { ok: true, json: async () => ({ count }) };
  };

  try {
    const provider = new NysParcelProvider();
    const result = await provider.queryViewport({
      bbox: BBOX,
      zoom: 15,
      signal: new AbortController().signal,
    });
    assert.equal(result.state, 'empty');
    assert.ok(receivers.every((receiver) => receiver === globalThis));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('distinguishes covered empty views from areas outside public parcel coverage', async () => {
  for (const { coverageCount, expectedState } of [
    { coverageCount: 1, expectedState: 'empty' },
    { coverageCount: 0, expectedState: 'unavailable' },
  ]) {
    const requests = [];
    const signal = new AbortController().signal;
    const provider = new NysParcelProvider({
      fetchImpl: async (url, options) => {
        const parsed = new URL(url);
        requests.push({ parsed, options });
        const count = parsed.pathname.includes('/FeatureServer/0/query') ? coverageCount : 0;
        return { ok: true, json: async () => ({ count }) };
      },
    });

    const result = await provider.queryViewport({ bbox: BBOX, zoom: 15, signal });

    assert.equal(result.state, expectedState);
    assert.equal(requests.length, 2);
    assert.ok(requests[0].parsed.pathname.includes('/FeatureServer/1/query'));
    assert.ok(requests[1].parsed.pathname.includes('/FeatureServer/0/query'));
    assert.ok(requests.every(({ parsed }) => parsed.searchParams.get('where') === '1=1'));
    assert.ok(requests.every(({ options }) => options.signal === signal));
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
  assert.equal(urls[0].searchParams.get('where'), '1=1');
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
  assert.ok(requests.every(({ parsed }) => parsed.searchParams.get('where') === '1=1'));
  assert.ok(requests.every(({ options }) => options.signal === signal));
});

test('identifies parcels statewide without a county filter', async () => {
  let request;
  const provider = new NysParcelProvider({
    fetchImpl: async (url) => {
      request = new URL(url);
      return { ok: true, json: async () => ({ features: [] }) };
    },
  });

  await provider.identifyAt({
    longitude: -76.7,
    latitude: 42.8,
    signal: new AbortController().signal,
  });

  assert.equal(request.searchParams.get('where'), '1=1');
});
