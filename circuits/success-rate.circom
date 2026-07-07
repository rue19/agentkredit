pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

// Proves: "successCount >= minSuccessCount out of N actions"
// using a Poseidon hash chain instead of individual Merkle proofs
//
// Data model:
//   state_0 = Poseidon(secret, 0)           -- initial state
//   state_i = Poseidon(state_{i-1}, result_i) -- each action
//   commitmentRoot = state_N                  -- final state stored on-chain
//
// Public inputs:
//   commitmentRoot - final hash chain state (stored in ReputationRegistry)
//   minSuccessCount - threshold to prove
//
// Private inputs:
//   secret - agent's private seed
//   results[N] - 1 for success, 0 for failure

template SuccessRateProof(N) {
    signal input commitmentRoot;
    signal input minSuccessCount;

    signal input secret;
    signal input results[N];

    // Boolean constraint: results[i] in {0, 1}
    for (var i = 0; i < N; i++) {
        results[i] * (results[i] - 1) === 0;
    }

    // Build hash chain
    component hashers[N + 1];
    signal states[N + 1];

    // state_0 = Poseidon(secret, 0)
    hashers[0] = Poseidon(2);
    hashers[0].inputs[0] <== secret;
    hashers[0].inputs[1] <== 0;
    states[0] <== hashers[0].out;

    // state_i = Poseidon(state_{i-1}, result_i)
    for (var i = 0; i < N; i++) {
        hashers[i + 1] = Poseidon(2);
        hashers[i + 1].inputs[0] <== states[i];
        hashers[i + 1].inputs[1] <== results[i];
        states[i + 1] <== hashers[i + 1].out;
    }

    // Final state must match commitment root
    states[N] === commitmentRoot;

    // Count successes
    var successCount = 0;
    for (var i = 0; i < N; i++) {
        successCount += results[i];
    }

    // Range check: successCount >= minSuccessCount
    component geq = GreaterEqThan(32);
    geq.in[0] <== successCount;
    geq.in[1] <== minSuccessCount;
    geq.out === 1;
}

// 100 actions
component main {public [commitmentRoot, minSuccessCount]} = SuccessRateProof(100);
