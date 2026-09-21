export const HUNTNAV_DATABASE_NAME = 'huntnav-data';
export const HUNTNAV_DATABASE_VERSION = 1;
export const WAYPOINT_STORE_NAME = 'waypoints';

export class HuntNavDatabaseError extends Error {
  constructor(code, message, { cause, details } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'HuntNavDatabaseError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function openFailure(error) {
  if (error?.name === 'QuotaExceededError') {
    return new HuntNavDatabaseError(
      'quota-exceeded',
      'HuntNav data storage quota was exceeded while opening the database',
      { cause: error },
    );
  }
  return new HuntNavDatabaseError(
    'database-unavailable',
    'HuntNav data storage could not be opened',
    { cause: error },
  );
}

function upgradeDatabase(database, oldVersion) {
  if (oldVersion < 1 && !database.objectStoreNames.contains(WAYPOINT_STORE_NAME)) {
    database.createObjectStore(WAYPOINT_STORE_NAME, { keyPath: 'id' });
  }
}

export function openHuntNavDatabase({
  indexedDB = globalThis.indexedDB,
  onBlocked = () => {},
} = {}) {
  if (!indexedDB || typeof indexedDB.open !== 'function') {
    return Promise.reject(openFailure(new TypeError('IndexedDB is unavailable')));
  }

  return new Promise((resolve, reject) => {
    let request;
    let settled = false;

    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    try {
      request = indexedDB.open(HUNTNAV_DATABASE_NAME, HUNTNAV_DATABASE_VERSION);
    } catch (error) {
      rejectOnce(openFailure(error));
      return;
    }

    request.onupgradeneeded = (event) => {
      try {
        upgradeDatabase(request.result, event.oldVersion);
      } catch (error) {
        request.transaction?.abort();
        rejectOnce(openFailure(error));
      }
    };

    request.onblocked = (event) => {
      if (settled) return;
      const error = new HuntNavDatabaseError(
        'upgrade-blocked',
        'HuntNav data storage upgrade is blocked by another open connection',
        {
          details: {
            oldVersion: event.oldVersion,
            newVersion: event.newVersion,
          },
        },
      );
      rejectOnce(error);
      try {
        onBlocked(error);
      } catch {
        // External notification failures must not change the storage outcome.
      }
    };

    request.onerror = () => rejectOnce(openFailure(request.error));
    request.onsuccess = () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }
      if (!database.objectStoreNames.contains(WAYPOINT_STORE_NAME)) {
        database.close();
        rejectOnce(new HuntNavDatabaseError(
          'storage-failure',
          'HuntNav data storage is missing the waypoint object store',
        ));
        return;
      }

      database.onversionchange = () => database.close();
      settled = true;
      resolve(database);
    };
  });
}
