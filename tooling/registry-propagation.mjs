import {setTimeout as delay} from 'node:timers/promises';

/** An accepted npm upload may take minutes to become readable from the registry. */
export async function waitForRegistry(read, {
  timeoutMs = 10 * 60_000,
  intervalMs = 15_000,
  now = Date.now,
  sleep = delay,
  onPending = () => {},
} = {}) {
  const deadline = now() + timeoutMs;
  let attempt = 0;
  while (true) {
    const value = await read();
    if (value !== null) return value;
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error('npm accepted the upload, but registry visibility is still pending. Rerun this verification; do not change or republish the version.');
    onPending(++attempt);
    await sleep(Math.min(intervalMs, remaining));
  }
}
