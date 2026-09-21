export const WAYPOINT_SCHEMA_VERSION = 1;

export const WAYPOINT_CATEGORIES = Object.freeze([
  'stand',
  'camera',
  'parking',
  'access',
  'sign',
  'hazard',
  'other',
]);

export const WAYPOINT_CATEGORY_LABELS = Object.freeze({
  stand: 'Stand',
  camera: 'Trail Camera',
  parking: 'Parking',
  access: 'Access',
  sign: 'Sign',
  hazard: 'Hazard',
  other: 'Other',
});

export const DEFAULT_WAYPOINT_CATEGORY = 'other';

const WAYPOINT_CATEGORY_SET = new Set(WAYPOINT_CATEGORIES);
const ISO_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;

export class WaypointValidationError extends TypeError {
  constructor(message, { code = 'invalid-record', field = null, value } = {}) {
    super(message);
    this.name = 'WaypointValidationError';
    this.code = code;
    this.field = field;
    if (value !== undefined) this.value = value;
  }
}

function invalid(field, message, value) {
  return new WaypointValidationError(message, { field, value });
}

function normalizeId(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw invalid('id', 'Waypoint id must be a nonempty string', value);
  }
  return value.trim();
}

function normalizeCoordinate(value, field, minimum, maximum) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw invalid(field, `Waypoint ${field} must be a finite number from ${minimum} through ${maximum}`, value);
  }
  return value;
}

function normalizeCategory(value) {
  if (typeof value !== 'string' || !WAYPOINT_CATEGORY_SET.has(value)) {
    throw invalid('category', 'Waypoint category is not supported', value);
  }
  return value;
}

function daysInMonth(year, month) {
  if (month === 2) {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leapYear ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function normalizeTimestamp(value, field) {
  if (typeof value !== 'string') {
    throw invalid(field, `Waypoint ${field} must be an ISO timestamp`, value);
  }

  const match = ISO_TIMESTAMP_PATTERN.exec(value);
  if (!match) throw invalid(field, `Waypoint ${field} must be an ISO timestamp`, value);

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const maximumDay = month >= 1 && month <= 12 ? daysInMonth(year, month) : 0;
  const offsetValid = zone === 'Z' || (() => {
    const [offsetHour, offsetMinute] = zone.slice(1).split(':').map(Number);
    return offsetHour <= 23 && offsetMinute <= 59;
  })();

  if (month < 1 || month > 12
    || day < 1 || day > maximumDay
    || hour > 23
    || minute > 59
    || second > 59
    || !offsetValid) {
    throw invalid(field, `Waypoint ${field} must be an ISO timestamp`, value);
  }

  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw invalid(field, `Waypoint ${field} must be an ISO timestamp`, value);
  }
  return new Date(milliseconds).toISOString();
}

function normalizeOptionalText(value, field, maximumLength) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw invalid(field, `Waypoint ${field} must be a string when provided`, value);
  }
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > maximumLength) {
    throw invalid(field, `Waypoint ${field} must not exceed ${maximumLength} characters`, value);
  }
  return normalized;
}

export function normalizeWaypoint(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new WaypointValidationError('Waypoint record must be an object');
  }
  if (record.schemaVersion !== WAYPOINT_SCHEMA_VERSION) {
    throw new WaypointValidationError(
      `Unsupported waypoint schema version: ${String(record.schemaVersion)}`,
      {
        code: 'unsupported-schema-version',
        field: 'schemaVersion',
        value: record.schemaVersion,
      },
    );
  }

  const createdAt = normalizeTimestamp(record.createdAt, 'createdAt');
  const updatedAt = normalizeTimestamp(record.updatedAt, 'updatedAt');
  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw invalid('updatedAt', 'Waypoint updatedAt must not be earlier than createdAt', record.updatedAt);
  }

  const title = normalizeOptionalText(record.title, 'title', 80);
  const note = normalizeOptionalText(record.note, 'note', 1_000);
  const normalized = {
    schemaVersion: WAYPOINT_SCHEMA_VERSION,
    id: normalizeId(record.id),
    latitude: normalizeCoordinate(record.latitude, 'latitude', -90, 90),
    longitude: normalizeCoordinate(record.longitude, 'longitude', -180, 180),
    category: normalizeCategory(record.category),
    createdAt,
    updatedAt,
  };
  if (title !== undefined) normalized.title = title;
  if (note !== undefined) normalized.note = note;
  return normalized;
}

export function generateWaypointId(cryptoApi = globalThis.crypto) {
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues !== 'function') {
    throw new WaypointValidationError('Secure waypoint ID generation is unavailable', { field: 'id' });
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

export function createWaypoint(
  {
    latitude,
    longitude,
    category = DEFAULT_WAYPOINT_CATEGORY,
    title,
    note,
  },
  {
    idFactory = generateWaypointId,
    now = () => new Date(),
  } = {},
) {
  const instant = now();
  const timestamp = instant instanceof Date ? instant.toISOString() : String(instant);
  return normalizeWaypoint({
    schemaVersion: WAYPOINT_SCHEMA_VERSION,
    id: idFactory(),
    latitude,
    longitude,
    category,
    title,
    note,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
