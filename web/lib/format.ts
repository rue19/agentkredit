import { formatEther } from "viem";

/** 0x1234…cdef — the single place address truncation is defined. */
export function truncateAddress(address: string, lead = 6, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

/** Same treatment for 32-byte identifiers, which are far too long to show whole. */
export function truncateHash(hash: string, lead = 10, tail = 6): string {
  return truncateAddress(hash, lead, tail);
}

/**
 * Wei to a readable BOT amount.
 *
 * String surgery rather than Number(), because credit limits run to
 * 100,000 ether and float rounding would quietly change the value shown.
 */
export function formatBot(wei: bigint, maxFractionDigits = 4): string {
  const [whole, fraction = ""] = formatEther(wei).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const trimmed = fraction.slice(0, maxFractionDigits).replace(/0+$/, "");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "4h ago" / "in 12d". Rendered client-side only, after hydration. */
export function formatRelativeTime(timestampSeconds: bigint, now = Date.now()): string {
  const delta = Math.round(now / 1000) - Number(timestampSeconds);
  const past = delta >= 0;
  const seconds = Math.abs(delta);

  if (seconds < MINUTE) return "just now";

  const amount =
    seconds < HOUR
      ? `${Math.floor(seconds / MINUTE)}m`
      : seconds < DAY
        ? `${Math.floor(seconds / HOUR)}h`
        : `${Math.floor(seconds / DAY)}d`;

  return past ? `${amount} ago` : `in ${amount}`;
}

/** Integers with thousands separators, for counts rather than balances. */
export function formatCount(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Signed reputation score — the contract allows it to go negative. */
export function formatScore(score: bigint): string {
  return score > 0n ? `+${formatCount(score)}` : formatCount(score);
}
