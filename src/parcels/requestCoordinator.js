export class ViewportRequestCoordinator {
  constructor({ delay = 300, onRun }) {
    this.delay = delay;
    this.onRun = onRun;
    this.timer = null;
    this.controller = null;
  }

  schedule(payload) {
    this.cancel();
    this.timer = globalThis.setTimeout(() => {
      this.timer = null;
      this.controller = new AbortController();
      const { signal } = this.controller;
      Promise.resolve(this.onRun(payload, signal)).finally(() => {
        if (this.controller?.signal === signal) this.controller = null;
      });
    }, this.delay);
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
    this.abortActive();
  }
}
