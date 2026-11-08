# Changelog

All notable, normative-surface changes to **OC Attest** — the protocol and
its conformance vectors. SDK / package changelogs live in
[`oc-packages`](https://github.com/orangecheck/oc-packages) per package.

This file follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
conventions. The protocol uses [Semantic Versioning](https://semver.org/) at
the spec level: a MINOR bump is wire-compatible; a MAJOR bump invalidates
existing attestations.

---

## [Unreleased]

### Added

- **`BOND.md` — bonds (1.1, draft).** A third wire format, `orangecheck-bond`: one unspent coin backs one subject, signed once with BIP-322. A relying party sees floors (`1000`…`10000000` sats, `7`…`365` days) and a nullifier the registry keys with its own secret, so the relying party can't search the chain for the coin. One coin backs one subject at a time, and a coin released by one subject backs another only once every claim that carried it has expired. A coin banned at an audience stays banned until it moves, and moving it restarts its age. Signing windows are capped at an hour. Additive: attestations and their ids are unchanged. Vectors `tv24`–`tv28`. Reference implementation: `@orangecheck/sdk` 1.13.0.

- **`LIFECYCLE.md`** — normative companion document specifying what a publisher MAY do to an attestation after publication. Reaffirms `NIP_ORANGECHECK.md` §Revocation's "no explicit revocation event" stance and clarifies the §Revocation §2 wording ambiguity around "parameterised replacement": because the d-tag *is* the `attestation_id` (line 61), same-d replacement is structurally impossible — two distinct attestations from the same address coexist as separate canonical events under their own `(pubkey, kind, d)` coordinates. The only protocol-level primitives are `expires_at` (forward-looking commitment, set at sign time) and bond withdrawal via UTXO spend (the de-facto exit; verifier sees it on next live check). Reaffirms that dashboard-local hide flags and NIP-09 deletion-request events have no protocol force, and gives implementers a compliance summary distinguishing honest from dishonest "revoke" UI affordances. No protocol changes; clarification only.

### Changed

- **§7.1 step 1: a message that is not in canonical form is `decode_error`, however validly signed.** Step 1 now says each check in full: LF line ends with no CR and one trailing LF; the header and core lines in order with nothing among them; lowercase extension keys, sorted, each with a value (§2.2 says an empty one is left out, as `tv15` writes it); identities written sorted, as §2.1.1 writes them. §2.1's example with no bindings now ends in the one space its rule gives it. Vector `tv30`: 20 such messages, each validly BIP-322 signed by burn key #1, and a canonical control; `conformance/generate-canonical-form.mjs` regenerates it. Every message the reference builder writes is unchanged. Reference implementation: `@orangecheck/sdk` 1.25.0.
- **A `dns:` binding is proven by one file.** README.md, PROTOCOL.md, NIP_ORANGECHECK.md, INTEGRATION.md and `registry/extensions.md` offered a DNS TXT record (`_orangecheck.<domain>`, or `orangecheck=<id>`) and a `.well-known/orangecheck.json` file as ways to prove a domain. No verifier reads either: the reference SDK and attest.ochk.io read only `https://<domain>/.well-known/orangecheck.txt`, and anyone who published a TXT record could never be verified. Every document now names that file as the one method. `registry/extensions.md` also says NIP-05 is a `/.well-known/nostr.json` lookup, not a TXT record. Informative text only; no message, id or signature change.
- **PROTOCOL.md's header agrees with SPEC.md.** It said "status: Draft, version: v0" beside SPEC.md's Stable 1.0, so a reader could take the overview's status for the spec's. It now says it is the informative design and rationale for SPEC.md 1.0, and that SPEC.md governs where they differ.
- **§6.1 and §6.2 erratum: an attestation is found by address through its `t` tag.** §6.1's example event carried an `addr` tag, `sats`, `days`, `score` and `v` tags, several identities in one `i` tag and a Unix `expires`, and §6.2 queried `#addr`. Relays index single-letter tags only, so that query never matched, and the reference SDK and attest.ochk.io do not publish that shape. §6.1 now shows the event they publish, as `NIP_ORANGECHECK.md` defines it, and §6.2 queries `#t`. No message, id or signature change.
- **SECURITY.md §4 obligation 7 and §3: "not shared" needs a read a flood could not cut off.** A verifier refuses with `stake_unread` unless the read floor of relays (those asked, less 2, plus 1) finished reading the address with a short page and none was cut off; the holder writes the other attestation, so no write quorum is assumed. §3 names the residual: an attestation held only on a relay that is silent for a check stays unseen by it. Reference implementation: `@orangecheck/sdk` 1.18.3.
- **§2.2, §7 step 5.a and §9: a `bond:` value is base-10 ASCII digits of at most 2^53 - 1; any other value fails as `bond_malformed`** (new Bond code). Vector `tv29`.
- **§6.1 rule 5: a service key vouches for delivery only, not for the claims.** A service-key publisher MAY decline envelopes it will not carry, such as bindings with no proof scheme. The reference broadcaster at attest.ochk.io builds the event from the signed message alone and carries `dns:`, `github:`, `x:` and `twitter:` bindings, at most 8 of up to 128 characters each.
- **§5.3: signed fields.** Only `message` and `signature` are signed; the envelope's `address`, `identities`, `issued_at`, `expires_at` and `message_b64url` are copies. A verifier reads those fields from the message and does not use, sort by or return the envelope's copies. Where copies of one id carry different signatures, only a signature that verifies counts. SECURITY.md §4 obligations 6 and 7 and NIP_ORANGECHECK.md invariant 6 say the same. Reference implementation: `@orangecheck/sdk` 1.15.0.
- **§7.2 (new): choosing among attestations.** A verifier answering with one attestation for an address or identity orders candidates by the signed `issued_at`, skips any dated more than two minutes ahead of its clock, and takes the first whose signature verifies.
- **§2.2 and §7 step 7: an `expires:` that is not an RFC-3339 date-time is rejected as `expired`.**
- **§2.2 and §7.1.i: a message that repeats any key is rejected with `decode_error`.** NIP_ORANGECHECK.md discovery follows.
- **§7.2: a lookup reads every event a relay holds for the subject,** paging past the relay's limit up to a stated bound, and lets the signatures choose. Reference implementation: `@orangecheck/sdk` 1.16.2 (2,000 events per relay).
- **§7.2: each event is verified under NIP-01 before relay answers are merged.** A verifier drops an event whose `id` or `sig` fails before it merges or deduplicates what relays returned, so a relay serving junk under another event's id cannot displace that attestation.
- **§6.1 rule 4: replacement is relay behaviour, not a reader rule.** `attestation_id` leaves out the signature, so a newer copy under one id can carry a junk one; a reader considers each copy and takes the first whose signature verifies (§7.2 step 4).
- **§6.1 rule 6: a publisher reports an attestation as published only once two relays serve it back.** It keeps publishing until at least two of the relays verifiers ask, each asked alone, serve back a copy whose signature verifies (every one, when they ask fewer than two). Verifiers MUST NOT assume it: SECURITY.md §4 obligation 7 still reads the stake from the read floor, since a holder can write to one relay alone.
- **§7 step 7 and §9: a signed `issued_at` more than two minutes ahead of the verifier's clock is rejected as `not_yet_valid`** (new Policy code), and §7.1.g names `decode_error` for an `issued_at` that is not RFC-3339. Reference implementation: `@orangecheck/sdk` 1.16.1.

- **§7 step 5.d: amount and age are paired.** A verifier enforcing a minimum amount and a minimum age counts the oldest coins first until they cover the amount, and ages that set by its youngest coin. Taking the single oldest coin let old dust lend its age to a fresh deposit. Reference implementation: `@orangecheck/sdk` 1.12.0 `check()`.

- **§9: when a result is `ok`.** `ok` requires a valid signature, a confirmed bond and no policy code, so a zero or pending bond gives `ok: false` with `sig_ok_*` and `bond_zero` / `bond_pending`. This states the rule the reference SDK already applied, and removes an ambiguity that let two verifiers disagree.
- **Verifier obligations 6 and 7** (SECURITY.md §4). A verifier takes the subject from the signed message, not relay tags, and holds one bond to one identity per protocol, refusing with `stake_shared`. §3 already stated the second rule ("the bond doesn't multiply"); §4 now makes it a verifier duty. Reference implementation: `@orangecheck/sdk` 1.7.0.
- **`NIP_ORANGECHECK.md` discovery corrected.** Relays index single-letter tags only, so the documented `#address` filter never matched. By-address discovery is `#t`, the `t` tags are now in the event structure, `#t: ["oc-attest"]` enumerates attestations, and `nostr:` identities are matched in npub or hex form. The SDK and attest.ochk.io already published `t` tags; this brings the document into line.

- **Identity protocol `twitter:` renamed to `x:`** (§2.1.1, `registry/extensions.md`). `x:@username` is the registered handle for the platform (rebranded from Twitter). Wire-compatible: legacy `twitter:` bindings remain valid and verifiers SHOULD treat them as `x:`. Existing conformance vectors (`tv03`, `tv09`) keep their `twitter:` messages + ids as legacy fixtures.

## [1.0] — 2026-04-25

Spec is now stable. The protocol shipped earlier; this release marks the
explicit guarantee that the canonical-message format, the BIP-322 signing
rules, the sats-bonded / days-unspent semantics, and the `/api/check`
response shape are FROZEN at v1. Future MINOR versions add fields without
breaking existing verifiers; future MAJOR versions require coordinated
upgrade.

### Added

- `LICENSE` (MIT — matches the rest of the OrangeCheck family).
- `SECURITY.md` — verifier-facing threat model, the family-pattern
  per-protocol security doc.
- `WHY.md` — symlink to `VISION.md` so the protocol repo follows the family
  file layout.
- `test-vectors/` — symlink to `conformance/vectors/`, also for family-shape
  parity.

### Changed

- README + integration docs now link the docs.ochk.io umbrella as the
  reader's first stop instead of the per-subdomain attest.ochk.io site.

## [0.2] — 2026-04-12

### Added

- `conformance/v0.2/` — real BIP-322 signature vectors (replacing the v0.1
  smoke-test stubs). Reference implementations in `oc-packages/sdk` (TS)
  and `oc-packages/sdk-py` (Python) are required to round-trip every vector
  on every CI run.
- `conformance/generate-signatures.mjs` — deterministic harness for
  regenerating vectors when the canonical-message format changes.

### Changed

- Canonical-message field order frozen: `address` → `sats_bonded` →
  `days_unspent` → `attested_handles` → `nonce` → `issued_at` →
  `expires_at` → `attestation_id`. The `id` is the SHA-256 of the
  RFC-8785-canonicalised payload, computed AFTER signing.

## [0.1] — 2026-03-04

Initial public draft.

### Added

- `PROTOCOL.md`, `SPEC.md`, `README.md`, `INTEGRATION.md`, `VISION.md`,
  `NIP_ORANGECHECK.md` — the first complete description of the protocol.
- `conformance/v0.1/` — placeholder smoke-test vectors.
- `examples/` — minimal worked examples for sign + verify against a forum
  gate, an airdrop allowlist, and a Nostr relay.
- `registry/` — handle-prefix registry (`github:`, `nostr:`, `email:`,
  `ens:`, `twitter:`, `web:`).
