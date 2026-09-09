const EPSILON = 1e-10;
const geometryBounds = new WeakMap();

function validPoint(point) {
  return Array.isArray(point)
    && point.length >= 2
    && Number.isFinite(point[0])
    && Number.isFinite(point[1]);
}

function boundsForGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object') return null;
  const cached = geometryBounds.get(geometry);
  if (cached) return cached;

  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (coordinates) => {
    if (validPoint(coordinates)) {
      bounds[0] = Math.min(bounds[0], coordinates[0]);
      bounds[1] = Math.min(bounds[1], coordinates[1]);
      bounds[2] = Math.max(bounds[2], coordinates[0]);
      bounds[3] = Math.max(bounds[3], coordinates[1]);
      return;
    }
    if (Array.isArray(coordinates)) coordinates.forEach(visit);
  };
  visit(geometry.coordinates);

  const result = Number.isFinite(bounds[0]) ? bounds : null;
  if (result) geometryBounds.set(geometry, result);
  return result;
}

function pointInBounds([x, y], bounds) {
  return !bounds || (
    x >= bounds[0] - EPSILON
    && x <= bounds[2] + EPSILON
    && y >= bounds[1] - EPSILON
    && y <= bounds[3] + EPSILON
  );
}

export function pointOnSegment(point, start, end) {
  if (!validPoint(point) || !validPoint(start) || !validPoint(end)) return false;
  const [x, y] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const cross = ((x - x1) * dy) - ((y - y1) * dx);
  const scale = Math.max(1, Math.abs(dx), Math.abs(dy));
  if (Math.abs(cross) > EPSILON * scale) return false;

  return x >= Math.min(x1, x2) - EPSILON
    && x <= Math.max(x1, x2) + EPSILON
    && y >= Math.min(y1, y2) - EPSILON
    && y <= Math.max(y1, y2) + EPSILON;
}

export function classifyPointInRing(point, ring) {
  if (!validPoint(point) || !Array.isArray(ring) || ring.length < 3) return 'outside';
  const [x, y] = point;
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const start = ring[previous];
    const end = ring[index];
    if (!validPoint(start) || !validPoint(end)) continue;
    if (pointOnSegment(point, start, end)) return 'boundary';

    const crosses = (start[1] > y) !== (end[1] > y)
      && x < ((end[0] - start[0]) * (y - start[1])) / (end[1] - start[1]) + start[0];
    if (crosses) inside = !inside;
  }

  return inside ? 'inside' : 'outside';
}

function classifyPointInPolygon(point, rings) {
  if (!Array.isArray(rings) || !rings.length) return 'outside';
  const exterior = classifyPointInRing(point, rings[0]);
  if (exterior !== 'inside') return exterior;

  for (const hole of rings.slice(1)) {
    const relation = classifyPointInRing(point, hole);
    if (relation === 'boundary') return 'boundary';
    if (relation === 'inside') return 'outside';
  }
  return 'inside';
}

export function classifyPointInGeometry(point, geometry) {
  if (!validPoint(point) || !geometry || !pointInBounds(point, boundsForGeometry(geometry))) {
    return 'outside';
  }

  if (geometry.type === 'Polygon') {
    return classifyPointInPolygon(point, geometry.coordinates);
  }
  if (geometry.type === 'MultiPolygon') {
    let foundBoundary = false;
    for (const polygon of geometry.coordinates ?? []) {
      const relation = classifyPointInPolygon(point, polygon);
      if (relation === 'inside') return 'inside';
      if (relation === 'boundary') foundBoundary = true;
    }
    return foundBoundary ? 'boundary' : 'outside';
  }
  return 'outside';
}
