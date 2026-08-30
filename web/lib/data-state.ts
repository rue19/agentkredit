/*
  One vocabulary for everything the app reads off-chain-of-nothing.

  Each blockchain-derived value in the UI is in exactly one of these states,
  and every one of them has a designed rendering. There is no "unknown"
  fallback that quietly renders a zero.
*/
export type DataState<T> =
  | { status: "disconnected" }
  | { status: "unsupported"; chainId: number }
  | { status: "unavailable"; reason: string }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "ready"; value: T };

export const disconnected = { status: "disconnected" } as const;
export const loading = { status: "loading" } as const;
export const empty = { status: "empty" } as const;

export function unsupported(chainId: number): DataState<never> {
  return { status: "unsupported", chainId };
}

export function unavailable(reason: string): DataState<never> {
  return { status: "unavailable", reason };
}

export function failed(message: string): DataState<never> {
  return { status: "error", message };
}

export function ready<T>(value: T): DataState<T> {
  return { status: "ready", value };
}

/** First line of a thrown error, or a generic fallback. Never a stack trace. */
export function readErrorMessage(error: unknown, fallback = "Could not read from the network."): string {
  if (!error) return fallback;
  const short = (error as { shortMessage?: string }).shortMessage;
  if (typeof short === "string" && short.length > 0) return short;
  const message = (error as { message?: string }).message;
  if (typeof message === "string" && message.length > 0) return message.split("\n")[0];
  return fallback;
}
