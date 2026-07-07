pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

// Poseidon Merkle tree inclusion proof checker
// Verifies that `leaf` is in the tree rooted at `root`
// with the given path elements and indices
template MerkleTreeChecker(depth) {
    signal input leaf;
    signal input root;
    signal input pathElements[depth];
    signal input pathIndices[depth];

    component hashers[depth];
    signal levelHashes[depth + 1];

    levelHashes[0] <== leaf;

    for (var i = 0; i < depth; i++) {
        // Constrain pathIndices[i] to be 0 or 1
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        hashers[i] = Poseidon(2);

        // If pathIndex is 0: hash(current, pathElement)
        // If pathIndex is 1: hash(pathElement, current)
        // This is done via multiplexing without branching
        hashers[i].inputs[0] <== levelHashes[i] + pathIndices[i] * (pathElements[i] - levelHashes[i]);
        hashers[i].inputs[1] <== pathElements[i] + pathIndices[i] * (levelHashes[i] - pathElements[i]);

        levelHashes[i + 1] <== hashers[i].out;
    }

    root === levelHashes[depth];
}
