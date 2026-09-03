/** Bounds even providers that ignore AbortSignal; always removes timers/listeners. */
export async function boundedRequest<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  parent: AbortSignal,
  timeoutMs: number,
): Promise<T> {
  parent.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(parent.reason);
  parent.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('请求超时，已有资料仍保留，可稍后重试。')), timeoutMs);
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return operation(controller.signal);
    }), aborted]);
  } finally {
    clearTimeout(timer);
    parent.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
