# AgentKredit — System Architecture

**On-chain credit and reputation infrastructure for autonomous AI agents, built on BOT Chain.**

---

## 1. Design goals

1. Give AI agents a **portable, verifiable reputation** that isn't tied to a single app or a human's balance sheet.
2. Let agents **prove behavioral claims** ("success rate ≥ 70%", "zero policy violations in 90 days") without leaking their strategy or private data.
3. Convert that reputation into **undercollateralized, tiered credit lines** with hard on-chain spending guardrails.
4. Make every unit of credit **autonomously usable but provably bounded** — the agent can act without a human in the loop, but never outside its policy.
5. Stay **native to BOT Chain's own thesis**: PoSA (stake + DePIN compute) rewards long, honest track records — AgentKredit is that idea applied to financial trust instead of block validation.

---

## 2. High-level layers

```
┌─────────────────────────────────────────────────────────────────┐
│  AGENT LAYER                                                     │
│  AI agents (trading bots, DePIN node agents, treasury managers)  │
│  + AgentKredit SDK (TypeScript/Python client)                    │
└───────────────────────────┬───────────────────────────────────┬──┘
                            │ action logs                        │ proof requests
┌───────────────────────────▼─────────┐          ┌───────────────▼──────────────┐
│  OFF-CHAIN SERVICE LAYER            │          │  ZK PROVER SERVICE            │
│  - Attestation Oracle (attesters)   │          │  - Circom circuits (Groth16)  │
│  - Indexer / event listener         │          │  - Witness generation         │
│  - Score computation worker          │          │  - Proof + public signal out  │
└───────────────────────────┬─────────┘          └───────────────┬───────────────┘
                            │ signed attestations                  │ proof + signals
┌───────────────────────────▼──────────────────────────────────────▼───────────────┐
│  ON-CHAIN LAYER — BOT CHAIN (EVM)                                                  │
│  ┌─────────────────────┐  ┌───────────────────┐  ┌────────────────────────────┐  │
│  │ ReputationRegistry   │  │ ZKBehaviorVerifier│  │ CreditLine                  │  │
│  │ score, commitment root│  │ Groth16 verifier  │  │ tiered limits, utilization │  │
│  └─────────────────────┘  └───────────────────┘  └────────────┬───────────────┘  │
│  ┌─────────────────────┐  ┌───────────────────┐               │                  │
│  │ PolicyVault           │  │ SessionKeyManager │◄──────────────┘                  │
│  │ spend caps, whitelist │  │ ERC-7715/7710      │                                  │
│  │ auto-revoke           │  │ scoped delegation  │                                  │
│  └─────────────────────┘  └───────────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
                            │ events
┌───────────────────────────▼─────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                                              │
│  Dashboard (Next.js + wagmi/viem) — agent scores, live proofs, credit usage      │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. On-chain contracts

### 3.1 `AgentRegistry.sol`
Identity anchor for every participating agent.

```solidity
struct Agent {
    address operator;        // EOA or smart account that controls the agent
    uint256 bondAmount;       // staked BOT, sybil resistance
    uint64  createdAt;
    bool    active;
}
mapping(bytes32 agentId => Agent) public agents;

function registerAgent(bytes32 agentId, uint256 bondAmount) external payable;
function deactivateAgent(bytes32 agentId) external; // operator or governance
```
`agentId` is a hash of the agent's public key / DID, not the operator's address — this lets an agent's reputation follow it even if operational keys rotate.

### 3.2 `ReputationRegistry.sol`
The core trust ledger.

```solidity
struct ReputationData {
    int256  score;              // fixed-point, can go negative
    uint256 totalActions;
    uint256 positiveActions;
    uint256 negativeActions;
    bytes32 commitmentRoot;      // Poseidon root over the agent's private action log
    uint64  lastUpdate;
}
mapping(bytes32 agentId => ReputationData) public reputations;

// only callable by a registered attester (see 4.1) with a valid EIP-712 signature
function recordAttestation(
    bytes32 agentId,
    int256  scoreDelta,
    bytes32 newCommitmentRoot,
    bytes32 actionHash,
    bytes   calldata attesterSig
) external;

function getScore(bytes32 agentId) external view returns (int256);
function getTier(bytes32 agentId) external view returns (uint8); // derived from score
```
- Score updates are append-only and signed by a threshold set of attesters (see §4), never posted directly by the agent, to prevent self-attestation fraud.
- `commitmentRoot` is what the ZK circuit will later prove membership/threshold claims against — it's the on-chain anchor for private off-chain data.
- **Score decay**: a keeper function reduces `score` slightly for agents with no attestations in N days, so reputation must be maintained, not just accumulated once.

### 3.3 `ZKBehaviorVerifier.sol`
Auto-generated Groth16 verifier (from `snarkjs`), wrapped with a thin domain-specific layer.

```solidity
function verifyBehaviorClaim(
    bytes32 agentId,
    uint8   claimType,      // e.g. 1 = successRate>=X, 2 = zeroViolations
    uint256 threshold,
    uint256[8] calldata proof,
    uint256[] calldata publicSignals
) external view returns (bool);
```
`publicSignals` includes the agent's current `commitmentRoot` (must match `ReputationRegistry`), the claimed threshold, and the claim type — so a proof can't be replayed against a different agent or a stale root.

### 3.4 `CreditLine.sol`
Turns a verified claim + score tier into spendable capacity.

```solidity
struct Line {
    uint8   tier;
    uint256 limit;
    uint256 used;
    uint64  expiresAt;
}
mapping(bytes32 agentId => Line) public lines;

function requestCreditLine(
    bytes32 agentId,
    uint8 claimType,
    uint256 threshold,
    uint256[8] calldata proof,
    uint256[] calldata publicSignals,
    uint256 requestedAmount
) external returns (uint256 grantedLimit);

function drawdown(bytes32 agentId, uint256 amount) external; // called by PolicyVault only
function repay(bytes32 agentId, uint256 amount) external;
```
- Calls `ZKBehaviorVerifier` + reads `ReputationRegistry.getTier()` before granting.
- Backed by a simple `LiquidityPool.sol` (testnet: faucet-seeded; production: LP-deposited) — kept intentionally separate so lending economics can evolve without touching the trust logic.

### 3.5 `PolicyVault.sol`
Where autonomy actually happens, inside guardrails.

```solidity
struct PolicyRule {
    uint256 maxPerTx;
    uint256 maxPerDay;
    address[] allowedRecipients;
    uint32  violationCount;
    bool    revoked;
}
mapping(bytes32 agentId => PolicyRule) public policies;

function executeSpend(bytes32 agentId, address to, uint256 amount, bytes calldata data) external;
// checks: policy limits, recipient whitelist, credit line availability
// on violation attempt: increments violationCount, may auto-revoke, emits event
// consumed by ReputationRegistry keeper as a *negative* attestation trigger
```

### 3.6 `SessionKeyManager` (ERC-7715 / ERC-7710)
Not a new contract from scratch — reuse the delegation pattern from AgentMesh. The agent's operating key is granted a **scoped session key** whose permissions are exactly the `PolicyVault` rule for that agent, so the agent can call `executeSpend` autonomously without ever holding unscoped signing power.

---

## 4. Off-chain services

### 4.1 Attestation Oracle
- A small set of attesters (start with 1–3 for demo, designed to extend to a bonded/staked attester set later) observe agent activity — either by watching on-chain events directly (self-verifying) or ingesting agent-submitted execution receipts (signed transaction results) — and co-sign a `recordAttestation` call.
- Threshold signature (e.g. 2-of-3) so no single attester can arbitrarily inflate or destroy a score.
- Stateless where possible: it recomputes the new commitment root from the growing action log rather than trusting the agent's self-report.

### 4.2 ZK Prover Service
- Circuit written in Circom, compiled to Groth16 (directly reusing the CRCS circuit patterns — Poseidon commitments, threshold logic).
- Private inputs: the agent's full action log (wins/losses, spend records) + Merkle/Poseidon path.
- Public inputs: claim type, threshold, expected commitment root.
- Runs as a local or agent-side service — the agent (or its operator) generates the proof itself; nothing private ever leaves their machine.

### 4.3 Indexer
- Listens to `ReputationRegistry`, `CreditLine`, and `PolicyVault` events.
- Feeds the dashboard with score history, credit utilization, and violation events without needing to re-query the chain per view.

### 4.4 Dashboard
- Next.js + wagmi/viem.
- Views: agent leaderboard by score/tier, individual agent detail (score history graph, active credit line, policy rules), live proof verification demo (paste/verify a claim in the UI).

---

## 5. Data flow — end to end

1. **Agent acts.** A DeFi agent executes trades, or a DePIN agent validates data, on or off BOT Chain.
2. **Attestation.** Attesters observe the outcome, co-sign, and call `recordAttestation` — updating `score` and `commitmentRoot` in `ReputationRegistry`.
3. **Proof generation.** When the agent wants credit, it (or its operator) runs the ZK Prover locally against its private action log, producing a proof that a threshold claim is true relative to the on-chain `commitmentRoot`.
4. **Credit request.** The agent calls `CreditLine.requestCreditLine()` with the proof. The contract verifies the proof via `ZKBehaviorVerifier` and cross-checks the agent's tier from `ReputationRegistry`, then grants a limit.
5. **Delegation.** The agent's operator grants a scoped ERC-7715/7710 session key matching the `PolicyVault` rule tied to that credit line.
6. **Autonomous execution.** The agent calls `PolicyVault.executeSpend()` directly — no human signs off — but every call is checked against caps, whitelist, and remaining credit.
7. **Feedback loop.** Each execution (successful or violating) emits an event; the attestation oracle picks it up and posts a new attestation, closing the loop and keeping the score current.

---

## 6. Data model summary

| Entity | Key fields | Lives in |
|---|---|---|
| Agent | `agentId`, `operator`, `bondAmount` | `AgentRegistry` |
| ReputationData | `score`, `commitmentRoot`, `totalActions` | `ReputationRegistry` |
| CreditLine | `tier`, `limit`, `used`, `expiresAt` | `CreditLine` |
| PolicyRule | `maxPerTx`, `maxPerDay`, `allowedRecipients`, `violationCount` | `PolicyVault` |
| Action log (private) | raw win/loss/spend records, Merkle path | off-chain, agent-held |

---

## 7. Security considerations

- **Attester trust minimization** — threshold signatures now, path to a bonded/slashable attester set later (mirrors BOT Chain's own PoSA slashing model).
- **Replay protection** — every attestation and proof submission includes a nonce/action hash; the verifier contract rejects reused proofs.
- **Sybil resistance** — `AgentRegistry` requires a bond; a fresh agent identity starts at tier zero regardless of claims.
- **ZK soundness** — reuse the already-audited-in-practice CRCS Groth16 circuit pattern rather than a novel circuit design, to reduce the highest-risk surface.
- **Session key blast radius** — scoped strictly to `PolicyVault.executeSpend`, never a general-purpose key; compromise of a session key can't exceed the policy's own caps.
- **Score gaming** — score decay + threshold claims (not raw score alone) resist the "one great trade" attack; a single stale high score decays without ongoing honest activity.

---

## 8. Tech stack

| Layer | Tech |
|---|---|
| Contracts | Solidity, Hardhat/Foundry, deployed to BOT Chain (EVM) |
| ZK | Circom, snarkjs, Groth16, Poseidon (circomlib) — reused from CRCS |
| Delegation | ERC-7715 / ERC-7710 session keys — reused from AgentMesh |
| Off-chain services | Node.js/TypeScript, EIP-712 signing |
| Indexing | Event listener + Postgres (or a lightweight subgraph-style indexer) |
| Frontend | Next.js, wagmi, viem |

---

## 9. Suggested build phasing

**Phase 1 — Trust core:** `AgentRegistry` + `ReputationRegistry` + attestation oracle, seeded with real testnet activity.
**Phase 2 — Proof layer:** one Circom circuit + `ZKBehaviorVerifier`, proving a single claim type end-to-end.
**Phase 3 — Credit + policy:** `CreditLine` + `PolicyVault` + session key delegation, wired to Phase 1–2.
**Phase 4 — Surface:** dashboard + indexer to make the whole loop visible and demoable.

Each phase is independently demoable, which matters for judging "product completeness" even if later phases are thinner than earlier ones.
