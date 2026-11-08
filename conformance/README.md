# OrangeCheck Conformance Vectors

Machine-readable test vectors any OCP implementation must pass.

Each file in `vectors/` is a JSON document with a fixed schema (below). Implementations — TypeScript, Python, Rust, Swift, Go, whatever comes next — load these files in their test suite and assert the expected output matches. If your implementation disagrees with a vector, one of the two is wrong. Open an issue.

## Scope of this vector set (v0)

This vector set covers:

| Area | Vectors | What it pins down |
|---|---|---|
| Canonical message format | `tv01`–`tv04` | Byte-for-byte canonical text the signer sees. |
| Identity list ordering / escaping | `tv05`–`tv07` | Lexicographic sort; rejection of unsafe characters. |
| Attestation ID derivation | `tv08`–`tv09` | `sha256(canonical_message_bytes)` → 64-hex, lowercase. |
| `score_v0` reference algorithm | `tv10`–`tv13` | Exact output of the published formula. |
| Extension sorting + `bond` semantics | `tv14`–`tv16` | Lex sort of ext keys; bond surplus ignored. |
| Error / rejection cases | `tv17`–`tv20` | Inputs an implementation MUST refuse. |
| **BIP-322 signature verification** | `tv21`–`tv23` | Real signatures over canonical messages, plus a tamper-detection negative. |
| Bonds ([BOND.md](../BOND.md)) | `tv24`–`tv28` | The bond message and its id (`tv24`), signatures inside and outside the signing window (`tv25`–`tv26`), keyed nullifiers for two audiences (`tv27`), and the floors an audience sees (`tv28`). |
| `bond:` extension values | `tv29` | Which `bond:` values give an amount, and which are `bond_malformed`. |
| Canonical form (SPEC §7.1 step 1) | `tv30` | Messages validly signed by burn key #1 that are not attestations in canonical form, each `decode_error`, and a canonical control that is not. |

The signature vectors (`tv21`–`tv23`) use **disclosed burn keys** — private keys published inside `conformance/generate-signatures.mjs` that are never to be used for real funds. They exist only so the vector set stays deterministically reproducible. A new implementation proves its BIP-322 verifier is correct by making `tv21` + `tv22` verify and `tv23` fail.

## Vector schema

```jsonc
{
  "id": "tv01",
  "category": "canonical_message",
  "description": "bare address, no identities, no extensions",
  "input": {
    // inputs specific to the category — see per-category schemas below
  },
  "expected": {
    // what a conforming implementation must produce (or reject)
  }
}
```

### Category: `canonical_message`

```jsonc
{
  "input": {
    "address": "bc1q...",
    "identities": [{ "protocol": "github", "identifier": "alice" }],
    "extensions": { "bond": "1000000" },
    // Fixed nonce + issued_at so output is deterministic
    "nonce": "0011223344556677889900aabbccddee",
    "issued_at": "2026-04-22T12:00:00Z"
  },
  "expected": {
    // Byte-for-byte canonical message. Includes trailing \n.
    "message": "orangecheck\nidentities: github:alice\n..."
  }
}
```

### Category: `attestation_id`

```jsonc
{
  "input": { "message": "orangecheck\n..." },
  "expected": { "attestation_id": "<64-char lowercase hex>" }
}
```

### Category: `identities_format`

```jsonc
{
  "input": { "identities": [{ "protocol": "...", "identifier": "..." }, ...] },
  "expected": { "formatted": "protocol1:id1,protocol2:id2" }
}
```

### Category: `score_v0`

```jsonc
{
  "input": { "sats_bonded": 100000, "days_unspent": 30 },
  "expected": { "score_v0": 23.04 }
}
```

### Category: `reject`

```jsonc
{
  "input": { "identities": [{ "protocol": "github", "identifier": "alice\nevil" }] },
  "expected": { "rejects": true, "reason_contains": "newline" }
}
```

### Category: `bip322_signature`

```jsonc
{
  "input": {
    "address": "bc1q...",
    "message": "orangecheck\n...",
    "signature": "<base64 BIP-322 signature>",
    "scheme": "bip322"
  },
  "expected": { "valid": true }   // or false, for negative vectors
}
```


### Category: `bond_extension`

```jsonc
{
  "input": { "values": ["100000", "5000abc", "..."] },
  "expected": { "bonds": [100000, null, "..."] }
}
```

`bonds[i]` is the amount the `bond:` value `values[i]` gives, or `null` when SPEC §2.2 does not allow it and a verifier fails the attestation with `bond_malformed`. A signer refuses to write a value whose answer is `null`.

### Category: `canonical_form`

```jsonc
{
  "input": {
    "address": "bc1q...",            // burn key #1, as tv21
    "scheme": "bip322",
    "cases": [
      { "name": "canonical (control)", "message": "orangecheck\n...", "signature": "<base64>", "reason": null },
      { "name": "no trailing LF (1.b)", "message": "orangecheck\n...", "signature": "<base64>", "reason": "decode_error" }
    ]
  },
  "expected": { "signatures_valid": true }
}
```

Every case's signature verifies for `address`. A verifier answers `reason`: `decode_error` for each message that is not an attestation in canonical form (SPEC §7.1 step 1), before any chain read, and does not for the control. `conformance/generate-canonical-form.mjs` regenerates the vector byte for byte.

## Running the vectors

### TypeScript (`@orangecheck/sdk` >= 0.1.4)

In [oc-packages](https://github.com/orangecheck/oc-packages), which vendors a copy of `vectors/` under `sdk/src/__tests__/vectors/`:

```bash
cd sdk
yarn test            # vitest, including src/__tests__/conformance.test.ts
```

### Python (`orangecheck` >= 0.1.2)

In oc-packages, with its own copy under `sdk-py/tests/vectors/`:

```bash
cd sdk-py
pytest tests/test_conformance.py
```

### Your implementation

Read the vectors/ files, run each through the appropriate entry point, assert `expected` matches (exactly — no "close enough" on byte-level canonical outputs). Report results in [github.com/orangecheck/oc-attest-protocol/issues](https://github.com/orangecheck/oc-attest-protocol/issues).

## Changelog

- **v0 (2026-04-22)** — Initial format + ID + scoring + error-case vectors (`tv01`–`tv20`).
- **v0.2 (2026-04-22)** — Added `bip322_signature` category (`tv21`–`tv23`): real P2WPKH + P2TR signatures and a tamper-detection negative, generated by `generate-signatures.mjs` using disclosed burn keys.
- **2026-10-16** — Added the bond vectors `tv24`–`tv28` with [BOND.md](../BOND.md) (draft): message and id, signatures and their window, keyed nullifiers, floors.
- **2026-10-24** — Added `bond_extension` (`tv29`): which `bond:` values give an amount and which are `bond_malformed` (SPEC §2.2).
