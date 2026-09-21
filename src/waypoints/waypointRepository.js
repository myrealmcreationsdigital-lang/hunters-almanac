import {
  HuntNavDatabaseError,
  WAYPOINT_STORE_NAME,
  openHuntNavDatabase,
} from '../storage/huntNavDatabase.js';
import { WaypointValidationError, normalizeWaypoint } from './model.js';

export class WaypointRepositoryError extends Error {
  constructor(code, message, { cause, operation } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'WaypointRepositoryError';
    this.code = code;
    if (operation !== undefined) this.operation = operation;
  }
}

function storageError(error, operation) {
  if (error instanceof HuntNavDatabaseError
    || error instanceof WaypointRepositoryError
    || error instanceof WaypointValidationError) return error;

  if (error?.name === 'ConstraintError') {
    return new WaypointRepositoryError('duplicate-id', 'A waypoint with this id already exists', {
      cause: error,
      operation,
    });
  }
  if (error?.name === 'QuotaExceededError') {
    return new WaypointRepositoryError('quota-exceeded', 'Waypoint storage quota was exceeded', {
      cause: error,
      operation,
    });
  }
  if (error?.name === 'AbortError') {
    return new WaypointRepositoryError('transaction-aborted', 'The waypoint storage transaction was aborted', {
      cause: error,
      operation,
    });
  }
  return new WaypointRepositoryError('storage-failure', 'Waypoint storage failed', {
    cause: error,
    operation,
  });
}

function transactionCompletion(transaction, operation) {
  return new Promise((resolve, reject) => {
    let requestError = null;
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => { requestError = transaction.error ?? requestError; };
    transaction.onabort = () => reject(storageError(
      transaction.error ?? requestError ?? new DOMException('Transaction aborted', 'AbortError'),
      operation,
    ));
  });
}

function requireId(id) {
  if (typeof id !== 'string' || !id.trim()) {
    throw new WaypointValidationError('Waypoint id must be a nonempty string', {
      field: 'id',
      value: id,
    });
  }
  return id.trim();
}

export class WaypointRepository {
  constructor({ indexedDB = globalThis.indexedDB, onBlocked = () => {} } = {}) {
    this.indexedDB = indexedDB;
    this.onBlocked = onBlocked;
    this.databasePromise = null;
  }

  async open() {
    if (!this.databasePromise) {
      const opening = openHuntNavDatabase({
        indexedDB: this.indexedDB,
        onBlocked: this.onBlocked,
      });
      this.databasePromise = opening;
      opening.catch(() => {
        if (this.databasePromise === opening) this.databasePromise = null;
      });
    }
    return this.databasePromise;
  }

  async close() {
    const opening = this.databasePromise;
    this.databasePromise = null;
    if (!opening) return;
    const database = await opening.catch(() => null);
    database?.close();
  }

  async list() {
    const database = await this.open();
    let storedRecords = [];
    try {
      const transaction = database.transaction(WAYPOINT_STORE_NAME, 'readonly');
      const completion = transactionCompletion(transaction, 'list');
      const request = transaction.objectStore(WAYPOINT_STORE_NAME).getAll();
      request.onsuccess = () => { storedRecords = request.result; };
      await completion;
    } catch (error) {
      throw storageError(error, 'list');
    }

    const records = [];
    const issues = [];
    storedRecords.forEach((storedRecord, index) => {
      try {
        records.push(normalizeWaypoint(storedRecord));
      } catch (error) {
        issues.push({
          index,
          id: typeof storedRecord?.id === 'string' ? storedRecord.id : null,
          code: error?.code ?? 'invalid-record',
          error,
        });
      }
    });
    return { records, issues };
  }

  async create(record) {
    const normalized = normalizeWaypoint(record);
    const database = await this.open();
    try {
      const transaction = database.transaction(WAYPOINT_STORE_NAME, 'readwrite');
      const completion = transactionCompletion(transaction, 'create');
      transaction.objectStore(WAYPOINT_STORE_NAME).add(normalized);
      await completion;
      return normalized;
    } catch (error) {
      throw storageError(error, 'create');
    }
  }

  async update(record) {
    const normalized = normalizeWaypoint(record);
    const database = await this.open();
    let missing = false;
    let existingRecordError = null;
    try {
      const transaction = database.transaction(WAYPOINT_STORE_NAME, 'readwrite');
      const completion = transactionCompletion(transaction, 'update');
      const store = transaction.objectStore(WAYPOINT_STORE_NAME);
      const request = store.get(normalized.id);
      request.onsuccess = () => {
        if (request.result === undefined) {
          missing = true;
          transaction.abort();
          return;
        }
        try {
          normalizeWaypoint(request.result);
        } catch (error) {
          existingRecordError = error;
          transaction.abort();
          return;
        }
        store.put(normalized);
      };
      await completion;
      return normalized;
    } catch (error) {
      if (missing) {
        throw new WaypointRepositoryError('record-not-found', 'Waypoint does not exist', {
          operation: 'update',
        });
      }
      if (existingRecordError) throw existingRecordError;
      throw storageError(error, 'update');
    }
  }

  async delete(id) {
    const normalizedId = requireId(id);
    const database = await this.open();
    let missing = false;
    try {
      const transaction = database.transaction(WAYPOINT_STORE_NAME, 'readwrite');
      const completion = transactionCompletion(transaction, 'delete');
      const store = transaction.objectStore(WAYPOINT_STORE_NAME);
      const request = store.getKey(normalizedId);
      request.onsuccess = () => {
        if (request.result === undefined) {
          missing = true;
          transaction.abort();
          return;
        }
        store.delete(normalizedId);
      };
      await completion;
    } catch (error) {
      if (missing) {
        throw new WaypointRepositoryError('record-not-found', 'Waypoint does not exist', {
          operation: 'delete',
        });
      }
      throw storageError(error, 'delete');
    }
  }
}
