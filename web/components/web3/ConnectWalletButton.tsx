"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useConnect } from "wagmi";
import { useMounted } from "@/hooks/useMounted";
import { truncateAddress } from "@/lib/format";
import { ArrowRight } from "@/components/icons";

type Variant = "nav" | "hero";

/*
  The landing page's only wallet entry point. Sprint 1 ships the injected
  connector alone: no modal, no WalletConnect, no third-party kit whose own
  visual language would fight the reference.

  Sprint 2 gives the click a destination. The button now always means "enter
  the application": it connects if it has to, then routes to /dashboard.
  Disconnecting moved into the application shell, where the wallet is a
  status readout rather than the page's call to action.
*/
export function ConnectWalletButton({ variant }: { variant: Variant }) {
  const mounted = useMounted();
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();

  const injected = connectors.find((c) => c.type === "injected") ?? connectors[0];
  const connected = mounted && isConnected && !!address;

  /* Set while a connection opened from this button is still in flight. */
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    router.prefetch("/dashboard");
  }, [router]);

  useEffect(() => {
    if (entering && connected) router.push("/dashboard");
  }, [entering, connected, router]);

  useEffect(() => {
    if (error) setEntering(false);
  }, [error]);

  function onClick() {
    if (connected) {
      router.push("/dashboard");
      return;
    }
    if (!injected) {
      /* No injected provider: surface the connector's own error. */
      connect({ connector: connectors[0] });
      return;
    }
    setEntering(true);
    connect({ connector: injected });
  }

  const label = connected
    ? truncateAddress(address)
    : isPending
      ? "Connecting…"
      : "Connect wallet";

  const ariaLabel = connected
    ? `Open the AgentKredit dashboard as ${address}`
    : "Connect wallet";

  const message = errorMessage(error);

  if (variant === "nav") {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={onClick}
          disabled={!mounted || isPending}
          aria-label={ariaLabel}
          className="text-nav flex cursor-pointer items-center shrink-0 rounded-full bg-cream-bright py-[0.92em] pr-[1.55em] pl-[1.55em] leading-none font-medium whitespace-nowrap text-ground transition-opacity duration-300 hover:opacity-90 disabled:cursor-default"
        >
          {connected || isPending ? (
            <span className={connected ? "font-mono text-[0.92em]" : undefined}>
              {label}
            </span>
          ) : (
            <>
              <span className="sm:hidden">Connect</span>
              <span className="hidden sm:inline">Connect Wallet</span>
            </>
          )}
          <ArrowRight className="ml-[1.5em] h-[1.15em] w-[1.15em]" />
        </button>
        {message ? (
          <p className="text-fine absolute top-full right-0 mt-3 max-w-[22rem] text-right text-amber">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={!mounted || isPending}
        aria-label={ariaLabel}
        className="text-lede group flex cursor-pointer items-center rounded-full bg-cream py-[0.16em] pr-[0.16em] pl-[2.18em] font-medium whitespace-nowrap text-ground transition-opacity duration-300 hover:opacity-90 disabled:cursor-default"
      >
        <span className={connected ? "font-mono text-[0.92em]" : undefined}>
          {label}
        </span>
        <span className="ml-[1.5em] flex size-[3.27em] items-center justify-center rounded-full bg-ground text-cream transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-[2px]">
          <ArrowRight className="size-[1.3em]" />
        </span>
      </button>
      {message ? (
        <p className="text-fine mt-4 max-w-[34ch] text-amber">{message}</p>
      ) : null}
    </div>
  );
}

function errorMessage(error: unknown): string | null {
  if (!error) return null;
  const name = (error as { name?: string }).name ?? "";
  const raw = (error as { message?: string }).message ?? "";

  if (name === "ConnectorNotFoundError" || /provider|not found|no injected/i.test(raw)) {
    return "No browser wallet detected. Install MetaMask or another injected wallet, then try again.";
  }
  if (name === "UserRejectedRequestError" || /rejected|denied/i.test(raw)) {
    return "Connection request was rejected in your wallet.";
  }
  return raw.split("\n")[0] || "Could not connect to your wallet.";
}
