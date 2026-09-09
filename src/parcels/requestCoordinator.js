export class ViewportRequestCoordinator {
  constructor({ delay = 300, onRun }) {
    this.delay = delay;
    this.onRun = onRun;
    this.timer = null;
    this.controller = null;
    this.pendingPayload = null;
    this.hasPendingPayload = false;
  }

  schedule(payload) {
    this.pendingPayload = payload;
    this.hasPendingPayload = true;

    if (this.controller) return;
    if (this.timer !== null) globalThis.clearTimeout(this.timer);

    this.timer = globalThis.setTimeout(() => {
      this.timer = null;
      this.#runPending();
    }, this.delay);
  }

  #runPending() {
    if (!this.hasPendingPayload || this.controller) return;

    const payload = this.pendingPayload;
    this.pendingPayload = null;
    this.hasPendingPayload = false;
    const controller = new AbortController();
    this.controller = controller;
    const context = { hasPending: () => this.hasPendingPayload };

    Promise.resolve(this.onRun(payload, controller.signal, context)).finally(() => {
      if (this.controller !== controller) return;
      this.controller = null;
      this.#runPending();
    });
  }

  abortActive() {
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
  }

  cancel() {
    if (this.timer !== null) {
      globalThis.clearTimeout(this.timer);
      this.timer = null;
    }
    this.pendingPayload = null;
    this.hasPendingPayload = false;
    this.abortActive();
  }
}
