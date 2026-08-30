"use client";

import { useAgentIdentity } from "@/hooks/useAgentIdentity";
import { useReputation } from "@/hooks/useReputation";
import { useCreditAuthority } from "@/hooks/useCreditAuthority";
import { useRecentActivity } from "@/hooks/useRecentActivity";
import type { DataState } from "@/lib/data-state";
import { IdentitySummary } from "@/components/overview/IdentitySummary";
import { ReputationSummary } from "@/components/overview/ReputationSummary";
import { CreditAuthoritySummary } from "@/components/overview/CreditAuthoritySummary";
import { RecentActivity } from "@/components/overview/RecentActivity";
import { OverviewNotice } from "@/components/overview/OverviewNotice";

/*
  The Overview.

  Identity comes first because reputation and credit are both keyed by it:
  until the registry names an agent for this wallet there is genuinely
  nothing downstream to report, and each row says so in its own terms.
*/
export function Overview() {
  const identity = useAgentIdentity();

  const primary = identity.status === "ready" ? identity.value.primary : null;
  const hasAgent = primary !== null;
  const agentIds =
    identity.status === "ready"
      ? identity.value.agents.map((agent) => agent.agentId)
      : identity.status === "empty"
        ? []
        : null;

  const reputation = useReputation(primary?.agentId ?? null);
  const credit = useCreditAuthority(primary?.agentId ?? null);
  const activity = useRecentActivity(agentIds);

  /*
    Whether the page is blocked by a single fact rather than three separate
    ones. When it is, the three rows would each repeat the same sentence.
  */
  const blocked =
    identity.status === "disconnected" ||
    identity.status === "unsupported" ||
    identity.status === "unavailable" ||
    identity.status === "error"
      ? identity
      : null;

  return (
    <div className="px-gutter py-(--page-pad)">
      <div className="max-w-[64rem]">
        <header>
          <p className="text-label leading-none font-medium tracking-[0.13em] text-faint uppercase">
            Overview
          </p>
          <h1 className="text-page-title mt-5 max-w-[18ch] text-cream">
            Your position across identity, reputation, and spending authority.
          </h1>
        </header>

        {blocked ? (
          <OverviewNotice state={blocked} />
        ) : (
          <>
            <div className="mt-(--page-pad)">
              <IdentitySummary state={identity} />
              <ReputationSummary state={inherit(identity, reputation)} hasAgent={hasAgent} />
              <CreditAuthoritySummary state={inherit(identity, credit)} hasAgent={hasAgent} />
            </div>

            <RecentActivity state={inherit(identity, activity)} />
          </>
        )}
      </div>
    </div>
  );
}

/*
  Reputation, credit and activity are all read per-agent, so while identity
  is still resolving — or has failed — they inherit its state rather than
  reporting an emptiness they have not actually established.
*/
function inherit<T>(source: DataState<unknown>, own: DataState<T>): DataState<T> {
  if (source.status === "ready" || source.status === "empty") return own;
  return source as Exclude<DataState<T>, { status: "ready" }>;
}
