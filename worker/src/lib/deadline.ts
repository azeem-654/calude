/**
 * A read that cannot hang forever.
 *
 * Both mail clients here loop "is the reply complete yet? no — read more", and
 * each checks a deadline before reading again. That check only fires between
 * reads, so it does nothing about the case it most needs to cover: a host that
 * accepts the TCP connection and then never says anything. `reader.read()`
 * simply never settles, the deadline is never reached, and the request hangs
 * until the platform kills it — which the customer sees as the app freezing
 * rather than as "that mail server did not answer".
 *
 * Racing each read against a timer makes the existing deadlines real.
 */
export async function readBefore<T>(
  read: Promise<T>,
  deadline: number,
  what: string,
): Promise<T> {
  const left = deadline - Date.now();
  if (left <= 0) throw new Error(what);

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(what)), left);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Hang up without waiting to be hung up on.
 *
 * `socket.close()` returns a promise that resolves once the peer has finished
 * closing. On a socket that never finished *opening* — the case that brought us
 * here, a host that accepts nothing — that promise never settles, and awaiting
 * it in a `finally` block holds the whole response open. The timeout we just
 * raised then reports nothing, because the function it was protecting can no
 * longer return. The close is still worth starting; it is not worth waiting for.
 */
export function closeQuietly(socket: { close(): Promise<void> } | null): void {
  try { void socket?.close().catch(() => { /* already gone */ }); } catch { /* already gone */ }
}
