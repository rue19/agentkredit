import type { DataState } from "@/lib/data-state";
import type { Reputation } from "@/hooks/useReputation";
import { formatCount, formatScore, truncateHash } from "@/lib/format";
import { tierName } from "@/lib/contracts/reads";
import {
  describeFallback,
  RowMeta,
  RowNote,
  RowValue,
  SummaryRow,
  ValueSkeleton,
} from "@/components/overview/SummaryRow";

/*
  Reputation as ReputationRegistry records it: a signed score, the action
  counts behind it, the tier the contract derives from the score, and the
  Poseidon commitment root the ZK layer proves against.
*/
export function ReputationSummary({
  state,
  hasAgent,
}: {
  state: DataState<Reputation>;
  hasAgent: boolean;
}) {
  const fallback = describeFallback(state);

  return (
    <SummaryRow label="Reputation">
      {state.status === "loading" ? (
        <ValueSkeleton />
      ) : fallback ? (
        <>
          <RowValue tone={fallback.tone}>{fallback.value}</RowValue>
          <RowNote>{fallback.note}</RowNote>
        </>
      ) : state.status === "empty" ? (
        <>
          <RowValue tone="muted">{hasAgent ? "No attestations" : "Nothing recorded"}</RowValue>
          <RowNote>
            {hasAgent
              ? "Reputation appears once an attester records the agent's first action."
              : "Reputation is recorded against an agent identity, so there is nothing to score yet."}
          </RowNote>
        </>
      ) : state.status === "ready" ? (
        <>
          <RowValue>{formatScore(state.value.score)}</RowValue>
          <RowNote>
            Tier {state.value.tier} — {tierName(state.value.tier)}.
          </RowNote>
          <RowMeta
            items={[
              { label: "Actions", value: formatCount(state.value.totalActions), mono: true },
              { label: "Positive", value: formatCount(state.value.positiveActions), mono: true },
              { label: "Negative", value: formatCount(state.value.negativeActions), mono: true },
              {
                label: "Commitment root",
                value: truncateHash(state.value.commitmentRoot),
                mono: true,
              },
            ]}
          />
        </>
      ) : null}
    </SummaryRow>
  );
}
