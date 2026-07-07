# AgentKredit — Product Description

**Reputation that spends itself, safely. On-chain enforcement infrastructure for AI agent credit, built for BOT Chain.**

---

## The honest starting point

By mid-2026, "give AI agents an on-chain credit score" is not an open question anymore. ERC-8004's Reputation and Validation Registries went to Ethereum mainnet in January 2026 with backing from MetaMask, the Ethereum Foundation, Google, Coinbase, ENS, EigenLayer, The Graph, and Taiko. Cred Protocol, ChainAware, and ACHIVX are already scoring wallets and agents for lenders today. If AgentKredit's pitch were "we invented agent reputation," that would be wrong, and judges who've followed this space would know it.

But the same wave of adoption has exposed the actual unsolved problem — and it's not measurement, it's **enforcement**.

## The gap nobody's closed yet

Every major agent-reputation system today is a **scoring layer**, not a **spending layer**. A score gets computed, a lender or protocol reads it, and then — separately, in its own logic, off to the side — decides whether to let the agent spend. That gap between "here's a score" and "here's what the agent is actually allowed to do" is where things break:

- Security researchers already caught an agent, "Kai Gritun," farming reputation by opening 103 pull requests across 95 repositories within days of its GitHub profile existing — a fabricated track record built at machine speed, fast enough to sell to a bad actor before anyone noticed.
- Most registries (ERC-8004 included) store reputation as **public, plaintext** ratings — which is exactly what makes them farmable and copyable. There is no requirement that the underlying performance data stay private, and no cryptographic guarantee that a claimed track record is real rather than curated for the score.
- Even where scoring is rigorous, the actual spend still typically happens through a general-purpose wallet or smart account. The score informs a decision; it doesn't *constrain the transaction itself*. If underwriting logic has a bug, or a session key gets compromised, or an operator overrides caution, nothing on-chain stops the agent from spending past what it earned.

## What AgentKredit actually does differently

AgentKredit doesn't try to out-score Cred Protocol or replace ERC-8004. It closes the gap between score and spend, on two fronts:

**1. Proof instead of publication.** Instead of writing a plaintext history that anyone can read, copy, or reverse-engineer a farming strategy against, an agent proves a specific behavioral claim — "success rate ≥ 70% over 500 actions," "zero policy violations in 90 days" — with a zero-knowledge proof against a committed action log. The claim is verifiable on-chain; the strategy and raw history never leave the agent's own machine. This makes the Kai-Gritun-style attack meaningfully harder: there's no public score to farm, only a cryptographic claim that has to be true against a committed private log.

**2. The credit limit *is* the transaction guardrail, not a suggestion to it.** A verified claim doesn't just unlock a number a lender reads — it directly parameterizes an on-chain `PolicyVault`: hard per-transaction caps, a recipient whitelist, auto-revocation on violation, all enforced by the same contract that executes the spend, via a scoped ERC-7715/7710 session key. The agent can act with zero human-in-the-loop, but it is *structurally incapable* of spending outside what its proof earned — not "shouldn't," but "can't." That's the difference between an advisory score and enforced credit.

## Why this fits BOT Chain specifically

This isn't a generic idea ported over — it's built around what BOT Chain is actually for. BOT Chain's own PoSA design blends staking and DePIN compute mining, rewarding participants (human or machine) who behave honestly over a long horizon. AgentKredit takes that exact philosophy — trust earned through sustained, provable behavior — and applies it to the financial side of the same agents: a DePIN validator agent or an autonomous treasury manager operating on BOT Chain builds a track record it can *privately* prove and *autonomously* spend against, entirely within BOT Chain's own execution environment. It's infrastructure that makes BOT Chain's stated thesis — the agent economy needs financial rails — concretely usable, rather than a wallet-scoring dashboard bolted on after the fact.

## Who this is for

- **DeFi/trading agents** that need working capital between settlements without a human wiring funds each time.
- **DePIN node operators' agents** on BOT Chain that need to pay for compute, bandwidth, or data access autonomously, gated by their own uptime/honesty record.
- **Treasury or spend-management agents** (the same pattern as LedgerGuard's policy engine) that need enforced, not advisory, spending limits.
- **Any protocol** that wants to extend credit to an agent counterparty without exposing itself to a farmed or fabricated reputation.

## The honest impact claim

Not "the first agent credit score" — that ship sailed in January 2026. The honest, defensible claim is narrower and more useful: **the first implementation that makes an agent's credit limit a cryptographic property of the transaction itself, rather than a number a lender chooses to trust** — and the first version of that pattern built natively into a chain whose own consensus design already rewards exactly the kind of long-horizon honest behavior this protocol measures.

That's a smaller claim than "we invented agent trust." It's also one that survives a judge who's read the ERC-8004 news.
