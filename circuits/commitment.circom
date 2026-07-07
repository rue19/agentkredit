pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

// Computes Poseidon commitment: Poseidon(actionId, result, secret, blinding)
template CommitmentHasher() {
    signal input actionId;
    signal input result;
    signal input secret;
    signal input blinding;
    signal output commitment;

    component hasher = Poseidon(4);
    hasher.inputs[0] <== actionId;
    hasher.inputs[1] <== result;
    hasher.inputs[2] <== secret;
    hasher.inputs[3] <== blinding;

    commitment <== hasher.out;
}
