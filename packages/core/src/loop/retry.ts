import type { RetryPolicy } from '../types/agent.js';

export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy,
  onRetry?: (attempt: number, error: Error) => void,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    throwIfAborted(signal);

    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (isAbortError(lastError) || signal?.aborted) {
        throw abortError();
      }

      const isRetryable = policy.retryableErrors.some(
        (code) => lastError!.message.includes(code) || (lastError as NodeJS.ErrnoException).code === code,
      );

      if (!isRetryable || attempt >= policy.maxRetries) {
        throw lastError;
      }

      const base = Math.min(
        policy.baseDelayMs * Math.pow(policy.backoffMultiplier, attempt),
        policy.maxDelayMs,
      );
      // Add ±25% jitter to avoid thundering-herd when parallel tasks all retry together
      const delay = base * (0.75 + Math.random() * 0.5);

      onRetry?.(attempt + 1, lastError);
      await sleep(delay, signal);
    }
  }

  throw lastError;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(abortError());
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      reject(abortError());
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortError();
  }
}

function isAbortError(err: Error): boolean {
  return err.name === 'AbortError' || err.message === 'This operation was aborted';
}

function abortError(): Error {
  const err = new Error('This operation was aborted');
  err.name = 'AbortError';
  return err;
}
