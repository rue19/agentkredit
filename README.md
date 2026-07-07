# AgentKredit

**Reputation that spends itself, safely.**

On-chain credit enforcement infrastructure for autonomous AI agents on BOT Chain. Uses ZK-proofs (Groth16) to let agents prove behavioral claims without revealing private data, then converts reputation into undercollateralized credit lines with hard on-chain spending guardrails.

[![Solidity](https://img.shields.io/badge/Solidity-0.8.26-363636?logo=solidity)](https://soliditylang.org/)
[![Circom](https://img.shields.io/badge/Circuit-Circom_2.2.3-8B5CF6)](https://docs.circom.io/)
[![BOT Chain](https://img.shields.io/badge/Chain-BOT_Chain-00D4AA)](https://botchain.ai/)
[![Hardhat](https://img.shields.io/badge/Framework-Hardhat-FFDB1C?logo=hardhat)](https://hardhat.org/)
[![Tests](https://img.shields.io/badge/Tests-75_passing-22C55E)]()

---

## Table of Contents

- [What Is AgentKredit](#what-is-agentkredit)
- [Architecture Overview](#architecture-overview)
- [What's Built](#whats-built)
- [Contract Deep Dive](#contract-deep-dive)
- [ZK Circuits](#zk-circuits)
- [Off-Chain Services](#off-chain-services)
- [Quick Start](#quick-start)
- [Deployment](#deployment)
- [What's Remaining](#whats-remaining)
- [Tech Stack](#tech-stack)

---

## What Is AgentKredit

### The Problem

AI agents — trading bots, DePIN validators, treasury managers — need to spend money autonomously. Today they either hold raw private keys (catastrophic blast radius) or depend on humans to sign every transaction (defeats the purpose).

Existing reputation systems **score** agents. None **enforce** spending limits on-chain.

### The Solution

AgentKredit gives agents a portable, verifiable reputation that converts into **provably bounded credit lines**:

1. **Prove** behavioral claims ("success rate ≥ 70%") via ZK proofs — nothing private leaves the agent
2. **Earn** a reputation tier based on on-chain attestation history
3. **Borrow** undercollateralized credit backed by liquidity providers
4. **Spend** autonomously within hard on-chain limits — daily caps, recipient whitelists, session-scoped keys
5. **Repay** anyone can repay; scores decay without ongoing honest activity

Every unit of credit is autonomously usable but provably bounded. The agent can act without a human in the loop, but never outside its policy.

---

## Architecture Overview

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
│  - Event watcher + signer           │          │  - Witness generation         │
│  - Score computation worker          │          │  - Proof + public signal out  │
└───────────────────────────┬─────────┘          └───────────────┬───────────────┘
                            │ signed attestations                  │ proof + signals
┌───────────────────────────▼──────────────────────────────────────▼───────────────┐
│  ON-CHAIN LAYER — BOT CHAIN (EVM)                                                │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────────────────┐       │
│  │ AgentRegistry │  │ ReputationRegistry│  │ CreditLine                    │       │
│  │ identity+bond │  │ score, tiers      │  │ tiered limits, utilization   │       │
│  └──────────────┘  └──────────────────┘  └──────────────┬───────────────┘       │
│  ┌──────────────┐  ┌──────────────────┐                 │                        │
│  │ PolicyVault    │  │ SessionKeyManager │◄────────────────┘                      │
│  │ spend caps     │  │ scoped delegation │                                        │
│  │ whitelist      │  │ EIP-712 signed    │                                        │
│  └──────────────┘  └──────────────────┘                                         │
│  ┌──────────────┐  ┌──────────────────┐                                         │
│  │ LiquidityPool  │  │ ZKBehaviorVerifier│                                        │
│  │ ETH backing    │  │ Groth16 routing   │                                        │
│  └──────────────┘  └──────────────────┘                                         │
└─────────────────────────────────────────────────────────────────────────────────┘
                            │ events
┌───────────────────────────▼─────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                                              │
│  Dashboard (Next.js + wagmi/viem) — agent scores, live proofs, credit usage      │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow — End to End

1. **Agent acts** — executes trades, validates data, performs services on or off BOT Chain
2. **Attestation** — attesters observe outcomes, co-sign, and call `recordAttestation` → updates score + commitment root
3. **Proof generation** — agent runs ZK prover locally against private action log, producing a Groth16 proof
4. **Credit request** — agent calls `CreditLine.requestCreditLine()` with proof; contract verifies + grants tier-based limit
5. **Delegation** — operator grants a scoped session key matching the PolicyVault rule
6. **Autonomous execution** — agent calls `PolicyVault.executeSpend()` — checked against caps, whitelist, remaining credit
7. **Feedback loop** — execution events feed back to attestation oracle → score updated → loop closes

---

## What's Built

### Phase 1 — Trust Core ✅

| Component | Status | Description |
|-----------|--------|-------------|
| `AgentRegistry.sol` | ✅ | Identity + bond staking, deactivation, 7-day withdrawal cooldown |
| `ReputationRegistry.sol` | ✅ | EIP-712 attestations, score/tier system, Poseidon commitment root, score decay |
| Attestation Oracle | ✅ | Node.js service: event watcher, EIP-712 signer, CLI tool |
| Tests (22) | ✅ | 12 AgentRegistry + 10 ReputationRegistry |

### Phase 2 — ZK Proof Layer ✅

| Component | Status | Description |
|-----------|--------|-------------|
| 3 Circom circuits | ✅ | success-rate, zero-violations, action-count (Poseidon hash chain) |
| Trusted setup | ✅ | Groth16 with PTAU 16, Solidity verifiers exported |
| `ZKBehaviorVerifier.sol` | ✅ | Domain wrapper, nullifier replay protection, 3 claim types |
| ZK Prover Service | ✅ | Local proof generation, Poseidon hash chain builder, CLI |
| Tests (8) | ✅ | 4 ZK integration + circuit constraint verification |

### Phase 3 — Credit + Policy Enforcement ✅

| Component | Status | Description |
|-----------|--------|-------------|
| `LiquidityPool.sol` | ✅ | ETH pool, deposit/withdraw, authorized caller, utilization tracking |
| `SessionKeyManager.sol` | ✅ | EIP-712 scoped session keys, grant/revoke, nonce replay protection |
| `CreditLine.sol` | ✅ | Tier-based credit (1K/10K/100K BOT), drawdown, repay, 30-day expiry |
| `PolicyVault.sol` | ✅ | Daily limits, target/selector whitelists, ZK proof verification, credit drawdown |
| Tests (45) | ✅ | 14 LiquidityPool + 8 SessionKeyManager + 11 CreditLine + 7 PolicyVault + 1 E2E |
| Deploy scripts | ✅ | 7 scripts including unified `deploy-phase3.js` orchestrator |

### Phase 4 — Surface 🚧

| Component | Status | Description |
|-----------|--------|-------------|
| Event indexer | 🔲 | Listen to on-chain events, feed dashboard |
| Dashboard | 🔲 | Next.js + wagmi/viem: leaderboard, agent detail, live proof demo |
| Agent SDK | 🔲 | TypeScript/Python client for agents to interact with contracts |
| Testnet deployment | 🔲 | Deploy to BOT Chain Testnet (Chain ID 513100) |

---

## Contract Deep Dive

### AgentRegistry.sol

Identity anchor for every participating agent. Bonds provide Sybil resistance.

```solidity
struct Agent {
    address operator;      // EOA or smart account controlling the agent
    uint256 bondAmount;    // staked BOT
    uint64  createdAt;
    bool    active;
}

mapping(bytes32 agentId => Agent) public agents;

function registerAgent(bytes32 agentId) external payable;  // requires minBondAmount
function deactivateAgent(bytes32 agentId) external;         // operator or owner
function withdrawBond(bytes32 agentId) external;            // 7-day cooldown after deactivation
```

- `agentId` is a hash of the agent's public key/DID, not the operator's address — reputation survives key rotation
- Bond amount configurable by governance (default: 0.1 BOT)

---

### ReputationRegistry.sol

The core trust ledger. EIP-712 attestations from registered attesters, never self-reported.

```solidity
struct ReputationData {
    int256  score;              // can go negative
    uint256 totalActions;
    uint256 positiveActions;
    uint256 negativeActions;
    bytes32 commitmentRoot;     // Poseidon root over private action log
    uint64  lastUpdate;
}

function recordAttestation(
    bytes32 agentId,
    int256  scoreDelta,
    bytes32 newCommitmentRoot,
    bytes32 actionHash,
    bytes   calldata attesterSig
) external;  // only registered attesters with valid EIP-712 sig

function getScore(bytes32 agentId) external view returns (int256);
function getTier(bytes32 agentId) external view returns (uint8);  // 0/1/2/3
function decayInactiveScores(bytes32[] calldata agentIds) external;  // -5 per 30 days
```

**Tier thresholds:**

| Tier | Score Required | Credit Limit |
|------|---------------|--------------|
| 0 | 0 | None |
| 1 | ≥ 100 | 1,000 BOT |
| 2 | ≥ 500 | 10,000 BOT |
| 3 | ≥ 1,000 | 100,000 BOT |

- `commitmentRoot` is the Poseidon hash chain root over the agent's private action log — what ZK proofs verify against
- Score decay: -5 per 30 days of inactivity, forcing ongoing honest activity

---

### LiquidityPool.sol

ETH pool backing credit lines. Liquidity providers deposit; CreditLine locks/retracts funds.

```solidity
uint256 public totalDeposited;
uint256 public totalLent;
address public authorizedCaller;  // CreditLine address, set once

function deposit() external payable;              // LPs add ETH
function withdraw(uint256 amount) external;       // owner withdraws available
function provideLiquidity(uint256 amount) external;  // CreditLine only
function retractLiquidity(uint256 amount) external;   // CreditLine only
function getAvailableLiquidity() external view returns (uint256);
function getPoolUtilization() external view returns (uint256);  // basis points
```

---

### CreditLine.sol

On-chain credit lines backed by reputation tier and liquidity pool.

```solidity
struct Credit {
    uint256 totalCredit;    // granted amount
    uint256 drawdown;       // amount spent
    Status status;          // None/Active/Expired/Liquidated
    uint256 expiry;         // 30 days from grant
    uint256 lastProofTime;
}

function requestCreditLine(bytes32 agentId) external;  // checks tier + locks liquidity
function drawdown(bytes32 agentId, uint256 amount) external;  // PolicyVault only
function repay(bytes32 agentId, uint256 amount) external payable;  // anyone can repay
function verifyProof(bytes32 agentId, uint8 claimType, bytes calldata proof, bytes32[] calldata publicInputs) external returns (bool);
function getRemainingCredit(bytes32 agentId) external view returns (uint256);
function hasRemainingCredit(bytes32 agentId) external view returns (bool);
```

- `requestCreditLine` locks the full tier limit from LiquidityPool
- `drawdown` only callable by PolicyVault (not the agent directly)
- `repay` anyone can repay outstanding credit, releasing locked liquidity
- `verifyProof` fails → credit auto-liquidates

---

### SessionKeyManager.sol

Minimal scoped session key delegation. Agent gets a key that can only call PolicyVault.

```solidity
struct SessionKey {
    address signer;      // session key's public address
    bytes32 agentId;     // which agent this key belongs to
    uint256 maxAmount;   // max spend per transaction
    uint64  expiry;      // unix timestamp
    bool    active;      // revocable by owner
    uint256 nonce;       // replay protection
}

function grantSessionKey(bytes32 sessionId, address signer, bytes32 agentId, uint256 maxAmount, uint256 expiry, bytes calldata ownerSig) external;
function revokeSessionKey(bytes32 sessionId) external onlyOwner;
function validateSessionKey(bytes32 sessionId, bytes32 agentId, address target, bytes4 selector, uint256 amount, bytes calldata signature) external view returns (bool);
function isActiveSession(bytes32 sessionId) external view returns (bool);
```

- Owner signs grant via EIP-712; contract verifies on-chain
- Agent signs each spend call via EIP-712; PolicyVault validates
- Blast radius limited to PolicyVault.executeSpend only

---

### PolicyVault.sol

Where autonomy happens, inside guardrails.

```solidity
struct SpendPolicy {
    uint256 dailyLimit;        // max spend per day (UTC midnight reset)
    uint256 dailyUsed;
    uint256 lastResetDay;
    address[] allowedTargets;   // whitelisted contract addresses
    bytes4[] allowedSelectors;  // whitelisted function selectors
}

function setPolicy(bytes32 agentId, uint256 dailyLimit, address[] calldata allowedTargets, bytes4[] calldata allowedSelectors) external onlyOwner;

function executeSpend(
    bytes32 agentId,
    bytes32 sessionId,
    address target,
    bytes4 selector,
    uint256 amount,
    bytes calldata callData,
    bytes calldata sessionKeySig,
    uint8 claimType,
    bytes calldata proof,
    bytes32[] calldata publicInputs
) external payable;
```

**`executeSpend` checks in order:**
1. Session key is active (not revoked, not expired)
2. EIP-712 signature from session key signer is valid
3. Target address is in whitelist
4. Function selector is in whitelist
5. Daily limit not exceeded
6. ZK behavior proof verifies on-chain
7. Credit line has remaining capacity
8. Credit drawdown succeeds
9. ETH forwarded to target with callData

---

### ZKBehaviorVerifier.sol

Domain wrapper routing 3 claim types to auto-generated Groth16 verifiers.

```solidity
uint8 public constant CLAIM_SUCCESS_RATE = 1;
uint8 public constant CLAIM_ZERO_VIOLATIONS = 2;
uint8 public constant CLAIM_ACTION_COUNT = 3;

function verifyBehaviorClaim(
    bytes32 agentId, uint8 claimType,
    uint256[2] calldata pA, uint256[2][2] calldata pB, uint256[2] calldata pC,
    uint256[2] calldata publicSignals
) external;

function verifyClaim(bytes32 agentId, uint8 claimType, bytes calldata proof, bytes32[] calldata publicInputs) external returns (bool);
```

- Nullifier tracking: `(agentId, nullifierHash) => spent` — same proof can't be submitted twice
- `verifyClaim` is ABI-encoded wrapper called by CreditLine/PolicyVault
- `verifyBehaviorClaim` takes structured proof points, called directly in tests

---

## ZK Circuits

### Design: Poseidon Hash Chain

Original design used Merkle proofs per action (~1.1M constraints, infeasible for PTAU 16).

**Final design:** Poseidon hash chain — 100 actions hashed sequentially, ~52K constraints.

```
state_0 = Poseidon(secret, 0)
state_i = Poseidon(state_{i-1}, result_i)
commitmentRoot = state_100
```

All private data (action results, secret) stays off-chain. Only the final hash root is public.

### Circuit Constraints

| Circuit | File | Constraints | Public Inputs | Proves |
|---------|------|-------------|---------------|--------|
| `success-rate` | `circuits/success-rate.circom` | 52,355 | commitmentRoot, minSuccessCount | successCount ≥ threshold out of 100 actions |
| `zero-violations` | `circuits/zero-violations.circom` | 52,355 | commitmentRoot, actionCount | violationCount == 0 across 100 actions |
| `action-count` | `circuits/action-count.circom` | 55,891 | commitmentRoot, minActionCount | actionCount ≥ threshold (max 100) |

All fit within PTAU 16 limit (65,536 constraints).

### Trusted Setup

```bash
# Compile circuit
circom circuit.circom --r1cs --wasm -l node_modules -o build/

# Groth16 setup with PTAU 16
snarkjs groth16 setup circuit.r1cs circuits/pot16_final.ptau circuit_0000.zkey
snarkjs zkey contribute circuit_0000.zkey circuit_final.zkey
snarkjs zkey export solidityverifier circuit_final.zkey Verifier.sol
snarkjs zkey export verificationkey circuit_final.zkey verification_key.json
```

### Proof Format for Solidity

G2 point coordinates must be reversed:
```javascript
const pA = [proof.pi_a[0], proof.pi_a[1]];
const pB = [
  [proof.pi_b[0][1], proof.pi_b[0][0]],  // reversed
  [proof.pi_b[1][1], proof.pi_b[1][0]],  // reversed
];
const pC = [proof.pi_c[0], proof.pi_c[1]];
```

---

## Off-Chain Services

### Attestation Oracle

Listens for on-chain events, signs EIP-712 attestations, submits to ReputationRegistry.

```
services/attestation-oracle/
├── index.js            # Entry point: wires watcher → submitter
├── config.js           # Env config (RPC, keys, addresses, deltas)
├── attester.js         # EIP-712 signing, Poseidon root computation
├── watcher.js          # Polls AgentRegistry for events
├── submitter.js        # Computes deltas, signs, submits attestations
├── sign-attestation.js # CLI tool for manual attestation signing
└── abis/               # Contract ABIs
```

**Run:**
```bash
cd services/attestation-oracle
cp .env.example .env   # fill in keys + addresses
npm install
npm start              # starts event watcher loop
```

**CLI:**
```bash
node sign-attestation.js --agent-id 0x... --delta 10 --submit
```

### ZK Prover Service

Local proof generation — nothing private leaves the agent's machine.

```
services/zk-prover/
├── index.js       # CLI: --claim-type, --log, --threshold, --count
├── prover.js      # snarkjs Groth16 fullProve, Solidity proof formatting
└── action-log.js  # Poseidon hash chain builder via circomlibjs
```

**Run:**
```bash
cd services/zk-prover
npm install
node index.js --claim-type successRate --log actions.json --threshold 70 --count 100
```

---

## Quick Start

### Prerequisites

- Node.js ≥ 18
- circom 2.2.3 ([install guide](https://docs.circom.io/getting-started/installation/))
- Git

### Setup

```bash
git clone https://github.com/YOUR_USERNAME/agentkredit.git
cd agentkredit
npm install
```

### Compile & Test

```bash
npx hardhat compile
npx hardhat test
```

Expected: **75 tests passing** across 9 test files.

### Local Development

```bash
# Terminal 1: start local node
npx hardhat node

# Terminal 2: deploy to local
npx hardhat run scripts/deploy-phase3.js --network localhost
```

---

## Deployment

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DEPLOYER_PRIVATE_KEY` | Private key of deployer account | `0xabc...` |
| `REPUTATION_REGISTRY_ADDRESS` | Deployed ReputationRegistry (Phase 1) | `0xdef...` |
| `REPORT_GAS` | Enable gas reporting (optional) | `true` |

### BOT Chain Testnet

| Parameter | Value |
|-----------|-------|
| Chain ID | 513100 |
| RPC URL | `https://rpc.botchaintestnet.ai` |
| Gas Price | 1 gwei |
| Explorer | `https://explorer.botchaintestnet.ai` |
| Faucet | `https://faucet.botchain.ai/basic` (10 tBOT/day) |

```bash
# Deploy Phase 1 first (AgentRegistry + ReputationRegistry)
npx hardhat run scripts/deploy-agent-registry.js --network botchainTestnet
npx hardhat run scripts/deploy-reputation-registry.js --network botchainTestnet

# Set REPUTATION_REGISTRY_ADDRESS in .env

# Deploy Phase 3 (all credit + policy contracts)
npx hardhat run scripts/deploy-phase3.js --network botchainTestnet
```

### BOT Chain Mainnet

| Parameter | Value |
|-----------|-------|
| Chain ID | 1891 |
| RPC URL | `https://rpc.botchain.ai` |
| Gas Price | 1 gwei |

Same deploy commands, replace `--network botchainTestnet` with `--network botchainMainnet`.

### Deploy Order

```
Phase 1:
  1. AgentRegistry (0.1 BOT min bond)
  2. ReputationRegistry (initial attester + threshold)

Phase 3:
  3. LiquidityPool
  4. SessionKeyManager
  5. Groth16 Verifier (SuccessRate)
  6. Groth16 Verifier (ZeroViolations)
  7. Groth16 Verifier (ActionCount)
  8. ZKBehaviorVerifier (wraps 3 verifiers)
  9. CreditLine (links Pool + Reputation + ZK)
  10. PolicyVault (links SessionKey + Credit + Pool)
  11. Wire: LiquidityPool.setAuthorizedCaller → CreditLine
```

`deploy-phase3.js` handles steps 3–11 automatically.

---

## What's Remaining

### Phase 4 — Surface (Next)

| Task | Priority | Description |
|------|----------|-------------|
| Event indexer | High | Listen to ReputationRegistry, CreditLine, PolicyVault events; store in Postgres |
| Dashboard (Next.js) | High | Agent leaderboard by score/tier, credit utilization graphs, live proof verification demo |
| Agent SDK (TypeScript) | Medium | Client library: register, request credit, generate proof, execute spend |
| Testnet deployment | High | Deploy to BOT Chain Testnet, verify on explorer, test with faucet |
| Documentation | Medium | API reference for each contract, integration guide for agent developers |

### Future Enhancements

| Enhancement | Description |
|-------------|-------------|
| Bonded attester set | Replace single attester with staked/slashable attester committee (2-of-3 threshold) |
| ERC-4337 integration | Account abstraction for agent wallets, bundler-compatible session keys |
| Multi-chain reputation | Bridge reputation scores across EVM chains |
| Governance module | On-chain voting for tier thresholds, bond amounts, policy parameters |
| Insurance pool | Coverage for LP losses from agent defaults |
| AgentMesh fork | Full ERC-7715/7710 session key framework (blocked by GPL-3.0 license) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Contracts | Solidity 0.8.26, OpenZeppelin v5.6, Hardhat, EVM target: cancun |
| Circuits | Circom 2.2.3, Groth16 (snarkjs 0.7.6), Poseidon (circomlib), PTAU 16 |
| Off-chain | Node.js, ethers.js v6, EIP-712 typed data signing |
| Chain | BOT Chain (EVM PoSA) — Testnet (513100) + Mainnet (1891) |
| Testing | Hardhat Network, 75 tests, ZK proof generation (~7s each) |
| Frontend | Next.js + wagmi + viem (Phase 4) |
| Indexing | Event listener + Postgres (Phase 4) |

---

## Project Structure

```
agentkredit/
├── contracts/
│   ├── AgentRegistry.sol          # Identity + bond staking
│   ├── ReputationRegistry.sol     # EIP-712 attestations, score/tiers
│   ├── ZKBehaviorVerifier.sol     # Groth16 proof routing + nullifier
│   ├── CreditLine.sol             # Tier-based credit lines
│   ├── PolicyVault.sol            # Spending policy enforcement
│   ├── SessionKeyManager.sol      # Scoped session key delegation
│   ├── LiquidityPool.sol          # ETH pool backing credit
│   └── verifiers/
│       ├── SuccessRateVerifier.sol    # Auto-generated Groth16
│       ├── ZeroViolationsVerifier.sol # Auto-generated Groth16
│       └── ActionCountVerifier.sol    # Auto-generated Groth16
├── circuits/
│   ├── success-rate.circom        # Proves success threshold
│   ├── zero-violations.circom     # Proves zero violations
│   ├── action-count.circom        # Proves action count
│   ├── commitment.circom          # Poseidon commitment (utility)
│   ├── merkle.circom              # Poseidon Merkle tree (utility)
│   └── pot16_final.ptau           # Powers of Tau ceremony file
├── test/
│   ├── AgentRegistry.test.js
│   ├── ReputationRegistry.test.js
│   ├── AttestationOracle.test.js
│   ├── ZKBehaviorVerifier.test.js
│   ├── LiquidityPool.test.js
│   ├── SessionKeyManager.test.js
│   ├── CreditLine.test.js
│   ├── PolicyVault.test.js
│   └── E2ECreditFlow.test.js      # Full lifecycle integration test
├── scripts/
│   ├── deploy-agent-registry.js
│   ├── deploy-reputation-registry.js
│   ├── deploy-liquidity-pool.js
│   ├── deploy-session-key-manager.js
│   ├── deploy-credit-line.js
│   ├── deploy-policy-vault.js
│   └── deploy-phase3.js           # Unified Phase 3 orchestrator
├── services/
│   ├── attestation-oracle/        # Off-chain attestation service
│   └── zk-prover/                 # Local ZK proof generation
├── build/                         # Circuit compilation artifacts
├── hardhat.config.js
├── package.json
├── AgentKredit_Product_Description.md
└── AgentKredit_Architecture.md
```

---

## Security Considerations

- **Attester trust** — single attester for demo; production uses threshold signatures (2-of-3+), path to bonded/slashable set
- **Replay protection** — every attestation includes action hash; every proof has nullifier tracking; session keys have nonces
- **Sybil resistance** — AgentRegistry requires bond; fresh identity starts at tier 0
- **ZK soundness** — Groth16 with audited Poseidon hash; PTAU 16 ceremony; no novel cryptographic assumptions
- **Session key blast radius** — scoped strictly to PolicyVault.executeSpend; compromise can't exceed policy caps
- **Score gaming** — decay + threshold claims resist "one great trade" attack; ongoing activity required
- **Credit expiry** — 30-day TTL prevents stale credit from lingering

---

## License

MIT

---

Built for [BOT Chain](https://botchain.ai/) — where reputation is consensus.
