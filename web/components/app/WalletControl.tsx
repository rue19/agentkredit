"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useMounted } from "@/hooks/useMounted";
import { truncateAddress } from "@/lib/format";
import { ArrowRight, Disconnect } from "@/components/icons";

/*
  The shell's wallet control.

  Deliberately quieter than the landing page's filled cream CTA: inside the
  product the wallet is a status readout you can act on, not the page's
  primary call to action.
*/
export function WalletControl({ className = "" }: { className?: string }) {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();

  const injected = connectors.find((c) => c.type === "injected") ?? connectors[0];
  const connected = mounted && isConnected && !!address;

  function onClick() {
    if (connected) {
      disconnect();
      return;
    }
    if (injected) connect({ connector: injected });
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={!mounted || isPending}
        aria-label={connected ? `Disconnect wallet ${address}` : "Connect wallet"}
        className="flex cursor-pointer items-center gap-3 rounded-full border border-hair px-4 py-2 text-[0.8125rem] leading-none whitespace-nowrap transition-colors duration-300 hover:border-cream disabled:cursor-default"
      >
        {connected ? (
          <>
            <span className="font-mono text-chalk">{truncateAddress(address)}</span>
            <Disconnect className="size-[0.95rem] shrink-0 text-faint" />
          </>
        ) : (
          <>
            <span className="text-chalk">{isPending ? "Connecting…" : "Connect wallet"}</span>
            {isPending ? null : <ArrowRight className="size-[0.95rem] shrink-0 text-faint" />}
          </>
        )}
      </button>

      {error ? (
        <p className="mt-2 max-w-[20rem] text-[0.75rem] leading-snug text-amber sm:absolute sm:top-full sm:right-0 sm:mt-2 sm:text-right">
          {connectErrorMessage(error)}
        </p>
      ) : null}
    </div>
  );
}

function connectErrorMessage(error: unknown): string {
  const name = (error as { name?: string }).name ?? "";
  const raw = (error as { message?: string }).message ?? "";

  if (name === "ConnectorNotFoundError" || /provider|not found|no injected/i.test(raw)) {
    return "No browser wallet detected.";
  }
  if (name === "UserRejectedRequestError" || /rejected|denied/i.test(raw)) {
    return "Connection request was rejected.";
  }
  return raw.split("\n")[0] || "Could not connect to your wallet.";
}
