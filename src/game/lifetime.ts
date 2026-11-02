export class Lifetime {
  active = true;
  private controller = new AbortController();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private intervals = new Set<ReturnType<typeof setInterval>>();
  private frames = new Set<number>();
  private cleanups: (() => void)[] = [];

  add(cleanup: () => void) {
    this.cleanups.push(cleanup);
  }
  setTimeout(callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (this.active) callback(...args);
    }, delay);
    this.timers.add(id);
    return id;
  }
  clearTimeout(id: ReturnType<typeof setTimeout>) {
    clearTimeout(id);
    this.timers.delete(id);
  }
  setInterval(callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) {
    const id = setInterval(() => {
      if (this.active) callback(...args);
    }, delay);
    this.intervals.add(id);
    return id;
  }
  clearInterval(id: ReturnType<typeof setInterval>) {
    clearInterval(id);
    this.intervals.delete(id);
  }
  requestAnimationFrame(callback: FrameRequestCallback) {
    const id = requestAnimationFrame((time) => {
      this.frames.delete(id);
      if (this.active) callback(time);
    });
    this.frames.add(id);
    return id;
  }
  cancelAnimationFrame(id: number) {
    cancelAnimationFrame(id);
    this.frames.delete(id);
  }
  listen(
    target: EventTarget,
    event: string,
    callback: EventListener,
    options: AddEventListenerOptions = {},
  ) {
    if (
      (event === 'load' && document.readyState === 'complete') ||
      (event === 'DOMContentLoaded' && document.readyState !== 'loading')
    ) {
      this.setTimeout(() => callback(new Event(event)), 0);
      return;
    }
    target.addEventListener(event, callback, { ...options, signal: this.controller.signal });
  }
  dispose() {
    if (!this.active) return;
    this.active = false;
    this.controller.abort();
    this.timers.forEach(clearTimeout);
    this.intervals.forEach(clearInterval);
    this.frames.forEach((id) => cancelAnimationFrame(id));
    for (const cleanup of this.cleanups.reverse()) {
      try {
        cleanup();
      } catch (error) {
        console.warn('[cleanup]', error);
      }
    }
    this.timers.clear();
    this.intervals.clear();
    this.frames.clear();
    this.cleanups = [];
  }
}
