import test from 'node:test';
import assert from 'node:assert/strict';
import { ViewportRequestCoordinator } from '../src/parcels/requestCoordinator.js';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test('debounces viewport work and keeps only the latest payload', async () => {
  const runs = [];
  const coordinator = new ViewportRequestCoordinator({ delay: 10, onRun: (payload) => runs.push(payload) });
  coordinator.schedule('first');
  coordinator.schedule('latest');
  await wait(25);
  assert.deepEqual(runs, ['latest']);
});

test('aborts active viewport work', async () => {
  let observedSignal;
  const coordinator = new ViewportRequestCoordinator({
    delay: 0,
    onRun: (_payload, signal) => {
      observedSignal = signal;
      return new Promise(() => {});
    },
  });
  coordinator.schedule('viewport');
  await wait(5);
  coordinator.abortActive();
  assert.equal(observedSignal.aborted, true);
});
