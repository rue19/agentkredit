import type { DataState } from "@/lib/data-state";
import type { AgentIdentity } from "@/hooks/useAgentIdentity";
import { formatBot, truncateHash } from "@/lib/format";
import {
  describeFallback,
  RowMeta,
  RowNote,
  RowValue,
  SummaryRow,
  ValueSkeleton,
} from "@/components/overview/SummaryRow";

/*
  Does this wallet have an agent identity on AgentKredit?

  Registered means AgentRegistry.getAgent returned a record whose operator is
  this wallet. There is no softer version of the answer.
*/
export function IdentitySummary({ state }: { state: DataState<AgentIdentity> }) {
  const fallback = describeFallback(state);

  return (
    <SummaryRow label="Identity">
      {state.status === "loading" ? (
        <ValueSkeleton />
      ) : fallback ? (
        <>
          <RowValue tone={fallback.tone}>{fallback.value}</RowValue>
          <RowNote>{fallback.note}</RowNote>
        </>
      ) : state.status === "empty" ? (
        <>
          <RowValue>Not registered</RowValue>
          <RowNote>
            This wallet has not registered an agent. Registration bonds BOT against an
            agent identity and is what everything else here is measured against.
          </RowNote>
          <RegisterAction />
        </>
      ) : state.status === "ready" && state.value.primary ? (
        <ReadyIdentity identity={state.value} />
      ) : null}
    </SummaryRow>
  );
}

function ReadyIdentity({ identity }: { identity: AgentIdentity }) {
  const agent = identity.primary!;
  const others = identity.agents.length - 1;

  return (
    <>
      <RowValue>{agent.active ? "Registered" : "Deactivated"}</RowValue>
      <RowNote>
        {agent.active
          ? "This wallet operates a registered agent identity."
          : "This agent identity has been deactivated and its bond is in cooldown."}
        {others > 0
          ? ` ${others} further ${others === 1 ? "identity" : "identities"} on this wallet.`
          : ""}
      </RowNote>
      <RowMeta
        items={[
          { label: "Agent ID", value: truncateHash(agent.agentId), mono: true },
          { label: "Bond", value: `${formatBot(agent.bondAmount)} BOT`, mono: true },
          {
            label: "Registered",
            value: new Date(Number(agent.createdAt) * 1000).toISOString().slice(0, 10),
            mono: true,
          },
        ]}
      />
    </>
  );
}

/*
  The route toward registration exists as a destination, not yet as a page —
  /agents/register belongs to a later sprint. Showing it as a live link would
  send the user to a 404, so it is presented as a named next step that is
  visibly not ready.
*/
function RegisterAction() {
  return (
    <p className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <span aria-disabled="true" className="text-fine text-dim">
        Register an agent →
      </span>
      <span className="text-label tracking-[0.13em] text-dim uppercase">Not yet available</span>
    </p>
  );
}
