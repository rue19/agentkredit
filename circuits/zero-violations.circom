pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

// Proves: "zero policy violations across N actions"
// using Poseidon hash chain
//
// commitmentRoot = Poseidon(...Poseidon(Poseidon(secret, 0), v1), v2)..., vN)
// where v_i = 0 for no violation, 1 for violation
//
// Public inputs:
//   commitmentRoot - final hash chain state
//   actionCount - number of actions (must match N at compile time)
//
// Private inputs:
//   secret - agent's private seed
//   violationFlags[N] - 1 if violation, 0 otherwise

template ZeroViolationsProof(N) {
    signal input commitmentRoot;
    signal input actionCount;

    signal input secret;
    signal input violationFlags[N];

    // Boolean constraint
    for (var i = 0; i < N; i++) {
        violationFlags[i] * (violationFlags[i] - 1) === 0;
    }

    // Build hash chain
    component hashers[N + 1];
    signal states[N + 1];

    hashers[0] = Poseidon(2);
    hashers[0].inputs[0] <== secret;
    hashers[0].inputs[1] <== 0;
    states[0] <== hashers[0].out;

    for (var i = 0; i < N; i++) {
        hashers[i + 1] = Poseidon(2);
        hashers[i + 1].inputs[0] <== states[i];
        hashers[i + 1].inputs[1] <== violationFlags[i];
        states[i + 1] <== hashers[i + 1].out;
    }

    // Final state must match commitment root
    states[N] === commitmentRoot;

    // Count violations
    var violationCount = 0;
    for (var i = 0; i < N; i++) {
        violationCount += violationFlags[i];
    }

    // Assert violationCount <= 0 (i.e., == 0 since sum >= 0)
    component leq = LessEqThan(32);
    leq.in[0] <== violationCount;
    leq.in[1] <== 0;
    leq.out === 1;
}

// 100 actions
component main {public [commitmentRoot, actionCount]} = ZeroViolationsProof(100);
