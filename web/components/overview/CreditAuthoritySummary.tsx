import type { DataState } from "@/lib/data-state";
import type { CreditAuthority } from "@/hooks/useCreditAuthority";
import { formatBot } from "@/lib/format";
import {
  describeFallback,
  RowMeta,
  RowNote,
  RowValue,
  SummaryRow,
  ValueSkeleton,
} from "@/components/overview/SummaryRow";

/*
  Spending authority: how much credit CreditLine has granted, how much of it
  is drawn, and the daily ceiling PolicyVault enforces on top.

  PolicyVault's allowed targets and selectors are arrays inside a struct, so
  Solidity's generated getter does not return them. The page therefore does
  not claim to know them.
*/
export function CreditAuthoritySummary({
  state,
  hasAgent,
}: {
  state: DataState<CreditAuthority>;
  hasAgent: boolean;
}) {
  const fallback = describeFallback(state);

  return (
    <SummaryRow label="Credit authority">
      {state.status === "loading" ? (
        <ValueSkeleton />
      ) : fallback ? (
        <>
          <RowValue tone={fallback.tone}>{fallback.value}</RowValue>
          <RowNote>{fallback.note}</RowNote>
        </>
      ) : state.status === "empty" ? (
        <>
          <RowValue tone="muted">No credit line</RowValue>
          <RowNote>
            {hasAgent
              ? "A credit line is granted against reputation tier, so it follows the first attestations."
              : "Credit is extended to an agent identity, so there is no line to draw on yet."}
          </RowNote>
        </>
      ) : state.status === "ready" ? (
        <Ready authority={state.value} />
      ) : null}
    </SummaryRow>
  );
}

function Ready({ authority }: { authority: CreditAuthority }) {
  const { credit, policy } = authority;
  const expired = credit.status === "Expired";

  const meta = [
    { label: "Granted", value: `${formatBot(credit.totalCredit)} BOT`, mono: true },
    { label: "Drawn", value: `${formatBot(credit.drawdown)} BOT`, mono: true },
    {
      label: "Expires",
      value: new Date(Number(credit.expiry) * 1000).toISOString().slice(0, 10),
      mono: true,
    },
  ];

  if (policy) {
    meta.push({
      label: "Daily remaining",
      value: `${formatBot(policy.remainingDaily)} BOT`,
      mono: true,
    });
  }

  return (
    <>
      <RowValue tone={credit.status === "Active" ? "cream" : "amber"}>
        {formatBot(credit.remaining)} BOT
      </RowValue>
      <RowNote>
        {credit.status === "Active"
          ? "Available to draw down through PolicyVault."
          : expired
            ? "This credit line has expired and cannot be drawn against."
            : "This credit line was liquidated after a failed behaviour proof."}
        {policy
          ? ` Daily limit ${formatBot(policy.dailyLimit)} BOT.`
          : " No spending policy has been set for this agent."}
      </RowNote>
      <RowMeta items={meta} />
    </>
  );
}
