/**
 * Runtime waypoint state exposed by getState() and subscription callbacks:
 * { records, loading, ready, issues, error }.
 *
 * error is null or { operation, cause }, where operation is one of
 * load/create/update/delete. Every snapshot is detached from authoritative
 * state so consumers cannot mutate the store through returned references.
 */

export class WaypointStoreError extends Error {
  constructor(code, message, { operation, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'WaypointStoreError';
    this.code = code;
    if (operation !== undefined) this.operation = operation;
  }
}

function cloneValue(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);

  if (value instanceof Date) return new Date(value.getTime());

  const isDomException = typeof globalThis.DOMException === 'function'
    && value instanceof globalThis.DOMException;
  if (isDomException || value instanceof Error) {
    const clone = {};
    seen.set(value, clone);
    const copiedKeys = new Set();
    const copySafeValue = (key) => {
      let propertyValue;
      try {
        propertyValue = value[key];
      } catch {
        return;
      }
      if (propertyValue === undefined) return;
      Object.defineProperty(clone, key, {
        value: cloneValue(propertyValue, seen),
        enumerable: true,
        configurable: true,
        writable: true,
      });
      copiedKeys.add(key);
    };

    ['name', 'message', 'code', 'stack'].forEach(copySafeValue);
    Reflect.ownKeys(value).forEach((key) => {
      if (!copiedKeys.has(key)) copySafeValue(key);
    });
    return clone;
  }

  const clone = Array.isArray(value)
    ? []
    : Object.create(Object.getPrototypeOf(value));
  seen.set(value, clone);

  Reflect.ownKeys(value).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if ('value' in descriptor) descriptor.value = cloneValue(descriptor.value, seen);
    Object.defineProperty(clone, key, descriptor);
  });
  return clone;
}

function cloneRecords(records) {
  return records.map((record) => cloneValue(record));
}

function cloneIssues(issues) {
  return issues.map((issue) => cloneValue(issue));
}

function operationError(operation, cause) {
  return { operation, cause };
}

function requireRepository(repository) {
  const methods = ['list', 'create', 'update', 'delete'];
  if (!repository || methods.some((method) => typeof repository[method] !== 'function')) {
    throw new TypeError('WaypointStore requires a repository with list/create/update/delete methods');
  }
  return repository;
}

export class WaypointStore {
  constructor({ repository } = {}) {
    this.repository = requireRepository(repository);
    this.records = [];
    this.loading = false;
    this.ready = false;
    this.issues = [];
    this.error = null;
    this.listeners = new Set();
    this.loadSequence = 0;
  }

  getState() {
    return {
      records: cloneRecords(this.records),
      loading: this.loading,
      ready: this.ready,
      issues: cloneIssues(this.issues),
      error: cloneValue(this.error),
    };
  }

  subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('WaypointStore listener must be a function');
    }
    this.listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.listeners.delete(listener);
    };
  }

  notify() {
    [...this.listeners].forEach((listener) => {
      try {
        listener(this.getState());
      } catch {
        // Listener failures must not affect store state or repository outcomes.
      }
    });
  }

  async load() {
    const sequence = ++this.loadSequence;
    this.loading = true;
    this.ready = false;
    this.issues = [];
    this.error = null;
    this.notify();

    try {
      const result = await this.repository.list();
      if (sequence !== this.loadSequence) return this.getState();

      this.records = cloneRecords(result.records);
      this.issues = cloneIssues(result.issues);
      this.loading = false;
      this.ready = true;
      this.error = null;
      this.notify();
      return this.getState();
    } catch (error) {
      if (sequence === this.loadSequence) {
        this.loading = false;
        this.ready = false;
        this.error = operationError('load', error);
        this.notify();
      }
      throw error;
    }
  }

  async create(record) {
    try {
      const created = await this.repository.create(record);
      this.records = [...this.records, cloneValue(created)];
      this.error = null;
      this.notify();
      return cloneValue(created);
    } catch (error) {
      this.error = operationError('create', error);
      this.notify();
      throw error;
    }
  }

  async update(record) {
    const id = typeof record?.id === 'string' ? record.id.trim() : record?.id;
    const index = this.records.findIndex((existing) => existing.id === id);
    if (index === -1) {
      const error = new WaypointStoreError(
        'runtime-record-not-found',
        'Waypoint is not present in runtime state',
        { operation: 'update' },
      );
      this.error = operationError('update', error);
      this.notify();
      throw error;
    }

    try {
      const updated = await this.repository.update(record);
      const records = [...this.records];
      records[index] = cloneValue(updated);
      this.records = records;
      this.error = null;
      this.notify();
      return cloneValue(updated);
    } catch (error) {
      this.error = operationError('update', error);
      this.notify();
      throw error;
    }
  }

  async delete(id) {
    try {
      await this.repository.delete(id);
      const persistedId = typeof id === 'string' ? id.trim() : id;
      this.records = this.records.filter((record) => record.id !== persistedId);
      this.error = null;
      this.notify();
    } catch (error) {
      this.error = operationError('delete', error);
      this.notify();
      throw error;
    }
  }
}

export function startWaypointStore({ repository }) {
  const store = new WaypointStore({ repository });
  void store.load().catch(() => {
    // The store already records the structured failure; startup must continue.
  });
  return store;
}
