import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPointInGeometry,
  classifyPointInRing,
  pointOnSegment,
} from '../src/parcels/geometry.js';

const square = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]];

test('detects a point on a segment', () => {
  assert.equal(pointOnSegment([2, 0], [0, 0], [4, 0]), true);
  assert.equal(pointOnSegment([2, 1], [0, 0], [4, 0]), false);
});

test('classifies Polygon interior independently of ring winding', () => {
  assert.equal(classifyPointInRing([2, 2], square), 'inside');
  assert.equal(classifyPointInRing([2, 2], [...square].reverse()), 'inside');
  assert.equal(classifyPointInGeometry([2, 2], {
    type: 'Polygon',
    coordinates: [square],
  }), 'inside');
});

test('classifies Polygon exterior', () => {
  assert.equal(classifyPointInGeometry([5, 2], {
    type: 'Polygon',
    coordinates: [square],
  }), 'outside');
});

test('classifies a point exactly on a Polygon boundary', () => {
  assert.equal(classifyPointInGeometry([4, 2], {
    type: 'Polygon',
    coordinates: [square],
  }), 'boundary');
});

test('classifies a Polygon with a hole', () => {
  const geometry = {
    type: 'Polygon',
    coordinates: [square, [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]],
  };

  assert.equal(classifyPointInGeometry([0.5, 0.5], geometry), 'inside');
});

test('classifies a point inside a Polygon hole as outside', () => {
  const geometry = {
    type: 'Polygon',
    coordinates: [square, [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]],
  };

  assert.equal(classifyPointInGeometry([2, 2], geometry), 'outside');
});

test('classifies a point on a hole boundary as boundary', () => {
  const geometry = {
    type: 'Polygon',
    coordinates: [square, [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]],
  };

  assert.equal(classifyPointInGeometry([1, 2], geometry), 'boundary');
});

test('classifies MultiPolygon components', () => {
  const geometry = {
    type: 'MultiPolygon',
    coordinates: [
      [square],
      [[[10, 10], [12, 10], [12, 12], [10, 12], [10, 10]]],
    ],
  };

  assert.equal(classifyPointInGeometry([11, 11], geometry), 'inside');
  assert.equal(classifyPointInGeometry([8, 8], geometry), 'outside');
  assert.equal(classifyPointInGeometry([10, 11], geometry), 'boundary');
});
