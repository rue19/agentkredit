import type { DataState } from "@/lib/data-state";
import { defaultChain } from "@/lib/chains";

/*
  One row of the Overview's primary state.

  A label column and a value column separated by a hairline — no card, no
  border box, no icon. The page is three of these stacked, which is the whole
  design: large type, strong alignment, subtle dividers.
*/
export function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 border-t border-hair-soft py-(--row-pad) lg:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] lg:gap-12">
      <h2 className="text-label leading-none font-medium tracking-[0.13em] text-faint uppercase lg:pt-[0.5em]">
        {label}
      </h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export type ValueTone = "cream" | "muted" | "amber";

const TONE: Record<ValueTone, string> = {
  cream: "text-cream",
  muted: "text-muted",
  amber: "text-amber",
};

export function RowValue({
  tone = "cream",
  children,
}: {
  tone?: ValueTone;
  children: React.ReactNode;
}) {
  return <p className={`text-metric ${TONE[tone]}`}>{children}</p>;
}

export function RowNote({ children }: { children: React.ReactNode }) {
  return <p className="text-fine mt-3 max-w-[46ch] leading-relaxed text-faint">{children}</p>;
}

/** Secondary facts, as label/value pairs. Values are monospace when on-chain. */
export function RowMeta({
  items,
}: {
  items: { label: string; value: React.ReactNode; mono?: boolean }[];
}) {
  return (
    <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-5">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-label leading-none font-medium tracking-[0.13em] text-dim uppercase">
            {item.label}
          </dt>
          <dd
            className={`mt-2 truncate text-[0.9375rem] text-chalk ${item.mono ? "font-mono" : ""}`}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* A value bar at roughly cap height plus the note line under it — the shape
   of the content that is coming, not a filled block standing in for it. */
export function ValueSkeleton() {
  return (
    <div aria-busy="true">
      <div className="text-metric" aria-hidden="true">
        <div className="skeleton h-[0.9em] w-[11rem] max-w-full" />
      </div>
      <div aria-hidden="true" className="skeleton mt-5 h-[0.7rem] w-[20rem] max-w-full" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

/*
  The four states that mean the same thing on every row get one wording, so
  the page never contradicts itself about why a value is missing.
*/
export function describeFallback(
  state: DataState<unknown>,
): { value: string; note: string; tone: ValueTone } | null {
  switch (state.status) {
    case "disconnected":
      return {
        value: "Wallet not connected",
        note: "Connect a wallet to read your position from the protocol.",
        tone: "muted",
      };
    case "unsupported":
      return {
        value: "Unsupported network",
        note: `Your wallet is on chain ${state.chainId}. Switch to ${defaultChain.name} to read protocol state.`,
        tone: "amber",
      };
    case "unavailable":
      return { value: "Unavailable", note: state.reason, tone: "muted" };
    case "error":
      return { value: "Read failed", note: state.message, tone: "amber" };
    default:
      return null;
  }
}
