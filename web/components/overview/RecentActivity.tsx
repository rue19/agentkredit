"use client";

import type { DataState } from "@/lib/data-state";
import type { ActivityItem } from "@/lib/contracts/events";
import { useMounted } from "@/hooks/useMounted";
import { formatRelativeTime, truncateHash } from "@/lib/format";
import { describeFallback } from "@/components/overview/SummaryRow";

/*
  Recent activity, read from contract logs.

  Nothing is synthesised here. When there is no deployment, no wallet, or no
  matching log, the section says exactly that instead of listing a plausible
  transaction.
*/
export function RecentActivity({ state }: { state: DataState<ActivityItem[]> }) {
  const fallback = describeFallback(state);

  return (
    <section className="mt-(--page-pad) border-t border-hair-soft pt-(--row-pad)">
      <h2 className="text-label leading-none font-medium tracking-[0.13em] text-faint uppercase">
        Recent activity
      </h2>

      <div className="mt-6">
        {state.status === "loading" ? (
          <ActivitySkeleton />
        ) : fallback ? (
          <Notice title={fallback.value} body={fallback.note} />
        ) : state.status === "empty" ? (
          <Notice
            title="No recent activity"
            body="Protocol activity will appear here once your wallet interacts with AgentKredit."
          />
        ) : state.status === "ready" ? (
          <ul>
            {state.value.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  /* Relative time is computed from the client clock, so it waits for mount. */
  const mounted = useMounted();
  const when =
    mounted && item.timestamp !== null
      ? formatRelativeTime(item.timestamp)
      : `Block ${item.blockNumber.toString()}`;

  return (
    <li className="grid gap-1 border-b border-hair-soft py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-8">
      <div className="min-w-0">
        <p className="text-[0.9375rem] text-chalk">{item.title}</p>
        <p className="text-fine mt-1 flex flex-wrap items-baseline gap-x-3 text-dim">
          {item.agentId ? (
            <span className="font-mono">{truncateHash(item.agentId, 8, 4)}</span>
          ) : null}
          {item.detail ? <span>{item.detail}</span> : null}
        </p>
      </div>
      <p className="text-fine shrink-0 text-faint sm:text-right">{when}</p>
    </li>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-label leading-none font-medium tracking-[0.13em] text-muted uppercase">
        {title}
      </p>
      <p className="text-fine mt-3 max-w-[46ch] leading-relaxed text-faint">{body}</p>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <ul aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <li key={row} className="border-b border-hair-soft py-4 last:border-b-0">
          <div className="skeleton h-[0.9rem] w-[9rem]" />
          <div className="skeleton mt-2 h-[0.75rem] w-[13rem]" />
        </li>
      ))}
    </ul>
  );
}
