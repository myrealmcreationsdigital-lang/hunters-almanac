import test from 'node:test';
import assert from 'node:assert/strict';
import { ViewportRequestCoordinator } from '../src/parcels/requestCoordinator.js';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test('uses the default 300 ms idle debounce and keeps only the latest payload', async () => {
  const runs = [];
  const coordinator = new ViewportRequestCoordinator({ onRun: (payload) => runs.push(payload) });
  coordinator.schedule('first');
  coordinator.schedule('latest');
  await wait(100);
  assert.deepEqual(runs, []);
  await wait(225);
  assert.deepEqual(runs, ['latest']);
});

test('does not abort active work, runs only the latest pending payload, and never overlaps', async () => {
  const runs = [];
  const signals = [];
  const gates = [];
  let active = 0;
  let maxActive = 0;
  const coordinator = new ViewportRequestCoordinator({
    delay: 0,
    onRun: (payload, signal) => {
      runs.push(payload);
      signals.push(signal);
      active += 1;
      maxActive = Math.max(maxActive, active);
      const gate = deferred();
      gates.push(gate);
      return gate.promise.finally(() => { active -= 1; });
    },
  });

  coordinator.schedule('active');
  await wait(5);
  coordinator.schedule('superseded');
  coordinator.schedule('latest');

  assert.deepEqual(runs, ['active']);
  assert.equal(signals[0].aborted, false);

  gates[0].resolve();
  await wait(5);
  assert.deepEqual(runs, ['active', 'latest']);
  assert.equal(maxActive, 1);

  gates[1].resolve();
  await wait(0);
});

test('renders successful active work before starting the latest pending viewport', async () => {
  const events = [];
  const first = deferred();
  const coordinator = new ViewportRequestCoordinator({
    delay: 0,
    onRun: async (payload) => {
      events.push(`start:${payload}`);
      if (payload === 'active') await first.promise;
      events.push(`render:${payload}`);
    },
  });

  coordinator.schedule('active');
  await wait(5);
  coordinator.schedule('latest');
  first.resolve();
  await wait(5);

  assert.deepEqual(events, ['start:active', 'render:active', 'start:latest', 'render:latest']);
});

test('hard cancellation aborts active work and drops the pending payload', async () => {
  const runs = [];
  const first = deferred();
  let activeSignal;
  const coordinator = new ViewportRequestCoordinator({
    delay: 0,
    onRun: (payload, signal) => {
      runs.push(payload);
      activeSignal = signal;
      return first.promise;
    },
  });

  coordinator.schedule('active');
  await wait(5);
  coordinator.schedule('pending');
  coordinator.cancel();

  assert.equal(activeSignal.aborted, true);
  first.resolve();
  await wait(5);
  assert.deepEqual(runs, ['active']);
});
