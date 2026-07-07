pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

// Proves: "agent has performed at least minActionCount actions"
// using Poseidon hash chain
//
// Public inputs:
//   commitmentRoot - final hash chain state
//   minActionCount - minimum actions to prove
//
// Private inputs:
//   secret - agent's private seed
//   actionCount - actual number of actions

template ActionCountProof(N) {
    signal input commitmentRoot;
    signal input minActionCount;

    signal input secret;
    signal input actionCount;

    // actionCount must be <= N
    component leqN = LessEqThan(32);
    leqN.in[0] <== actionCount;
    leqN.in[1] <== N;
    leqN.out === 1;

    // Build hash chain
    component hashers[N + 1];
    signal states[N + 1];

    hashers[0] = Poseidon(2);
    hashers[0].inputs[0] <== secret;
    hashers[0].inputs[1] <== 0;
    states[0] <== hashers[0].out;

    // Pre-allocate LessThan components (can't declare in loop in circom 2.1.6)
    component lt[N];
    signal isReal[N];

    for (var i = 0; i < N; i++) {
        lt[i] = LessThan(32);
        lt[i].in[0] <== i;
        lt[i].in[1] <== actionCount;
        isReal[i] <== lt[i].out;

        hashers[i + 1] = Poseidon(2);
        hashers[i + 1].inputs[0] <== states[i];
        hashers[i + 1].inputs[1] <== isReal[i];
        states[i + 1] <== hashers[i + 1].out;
    }

    states[N] === commitmentRoot;

    // Assert actionCount >= minActionCount
    component geq = GreaterEqThan(32);
    geq.in[0] <== actionCount;
    geq.in[1] <== minActionCount;
    geq.out === 1;
}

// 100 max actions
component main {public [commitmentRoot, minActionCount]} = ActionCountProof(100);
