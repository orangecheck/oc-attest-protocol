---
title: OC Attest — Bonds
status: Draft
version: 1.1.0-draft
last_updated: 2026-10-16
---

# Bonds **(normative)**

An attestation publishes an address and asks the world to read its balance. A
**bond** does the opposite. One unspent coin is pledged, privately, to back one
subject: an account, a key, an agent. The party that checks the bond learns
which coin it is. Everyone the subject later deals with learns only that a coin
of at least N sats, unspent for at least D days, stands behind them, plus a
number that is the same for the same coin at the same site and different
everywhere else.

The coin never moves. Nobody holds it. Spending it ends the bond.

Bonds are additive to OC Attest 1.0. Attestations, their ids and their
verification are unchanged.

## 1. Terminology

- **Coin.** One transaction output, named by its outpoint `<txid>:<vout>`,
  `txid` in the usual display (reversed) byte order, lowercase hex.
- **Holder.** Whoever controls the coin's address and can sign for it.
- **Subject.** What the coin backs. A string the holder chooses and signs, e.g.
  `did:oc:9f3c…`.
- **Registry.** A party that verifies bonds and remembers which coin backs which
  subject. orangecheck's auth host at `ochk.io` is one.
- **Audience.** A site or service that relies on a bond, identified by its
  origin (e.g. `https://example.com`).
- **Tip.** The chain tip a verifier evaluates against: height `H` and block
  hash.

## 2. Bond message

The holder signs exactly these eight lines, each ending in a single LF
(`0x0A`), the last one included. No other lines, no carriage returns, no
trailing spaces.

```
orangecheck-bond
address: <address>
outpoint: <txid>:<vout>
subject: <subject>
nonce: <32 lowercase hex>
issued_at: <YYYY-MM-DDTHH:MM:SSZ>
expires_at: <YYYY-MM-DDTHH:MM:SSZ>
ack: I pledge this coin to back this subject. It stays in my wallet.
```

- `address` is the coin's address, mainnet `bc1…`/`1…`/`3…`, or testnet,
  signet or regtest equivalents.
- `vout` is a decimal integer with no leading zeros.
- `subject` is 1 to 256 printable ASCII characters, no spaces.
- `issued_at` and `expires_at` bound the **signing window**, not the bond. A
  registry SHOULD issue windows of at most 10 minutes and MUST reject a message
  outside its window.
- The header line `orangecheck-bond` differs from `orangecheck` (attestations)
  and `orangecheck-auth` (sign-in challenges), so no signature for one can be
  replayed as another.

**Bond id.** `bond_id = lowercase_hex(SHA-256(UTF-8 bytes of the message))`.
The id commits to every field (family invariant 4).

**Signature.** BIP-322 simple by `address`, or a legacy BIP-137 signature when
`address` is P2PKH, base64-encoded, exactly as for attestations (SPEC §4).

## 3. Verification

To verify a bond at tip `H`, a verifier MUST:

1. Parse the message strictly per §2. Reject anything else as `bond_malformed`.
2. If it expects a particular subject, compare it byte for byte
   (`bond_subject_mismatch`).
3. At registration, reject a message outside its signing window
   (`bond_expired`, `bond_not_yet_valid`). A later re-check (step 6) ignores
   the window.
4. Verify the signature for `address` (`sig_invalid`).
5. Look up the coin. The output MUST exist (`coin_not_found`), its
   scriptPubKey MUST be `address`'s (`coin_address_mismatch`), it MUST be
   confirmed at some height `h` (`coin_unconfirmed`), and it MUST be unspent
   at `H` (`coin_spent`). A verifier SHOULD require
   `confirmations = H − h + 1 ≥ 6` (`coin_too_recent`).
6. **Re-check.** A bond lasts exactly as long as its coin is unspent. A
   registry MUST re-check the coin before vouching for it again, and MUST say
   when it last did (§5).

The result is `{ bond_id, subject, address, outpoint, sats, confirmed_height:
h, tip: { height: H, hash } }`. The coin's **age** is
`confirmations = H − h + 1` blocks; in days, `floor(confirmations / 144)`.

A bond is one coin. Value spread over several coins does not add up. A holder
who wants a larger bond consolidates first, and the age then restarts. That
is deliberate: age is the expensive part to fake.

## 4. One coin, one subject

A registry MUST NOT let one coin back two subjects at once, and in this
version a subject has at most one active bond in a registry. Releasing a bond
frees the coin for another subject.

## 5. What an audience sees: the bond claim

A registry that vouches for a subject to an audience (in a sign-in token, an
API response, a header) carries **floors**, not amounts:

```json
"oc_bond": {
  "v": 1,
  "sats_floor": 100000,
  "days_floor": 30,
  "height": 921044,
  "checked_at": 1792200000,
  "nullifier": "5b1d…64 hex…"
}
```

- `sats_floor` is the largest of `1000, 10000, 100000, 1000000, 10000000`
  that the coin's value meets, or `0` if none.
- `days_floor` is the largest of `7, 30, 90, 365` that the coin's age in days
  meets, or `0` if none.
- `height` and `checked_at` (unix seconds) say when the registry last found
  the coin unspent (§3.6). An audience decides how fresh it needs that to be.
- `nullifier` is §6's value for this audience.

The claim never carries the address, the outpoint, the exact amount or the
exact age. It is the registry's statement, so its trust anchor is the
registry, named by the token's issuer (family invariant 8). A holder who wants
an audience to check for itself discloses the bond message and signature to
that audience, which then verifies §3 against its own node (family invariant
5). That disclosure reveals the coin to that audience.

## 6. Nullifier

```
bond_nullifier = lowercase_hex(SHA-256(UTF-8(
    "orangecheck-bond-nullifier\n" || audience || "\n" || outpoint
)))
```

- The same coin at the same audience always gives the same nullifier: across
  subjects, across releases and re-bonds, across registries.
- Different audiences get unrelated values. Linking them needs the outpoint,
  which only the registry and audiences given a disclosure know.

**Slashing without custody.** An audience that bans a nullifier has banned the
coin. The holder can't get past the ban by making a new account or rebonding.
The only way is to move the coin. A moved coin is a new outpoint with a new
nullifier, but its age restarts at zero, so it falls back below every
`days_floor` until it ages again. Nothing is confiscated, and nobody holds
anything. The cost of abuse is time.

## 7. Why Bitcoin

Run the family's substitution test. Replace the coin with an Ed25519 key and
nothing is left. A key costs nothing, has no age and cannot be spent away.
Value, unspent age and a public spend that ends the bond only exist because
the coin is a Bitcoin output.

## 8. Privacy

| Party | Learns |
|---|---|
| Registry | address, outpoint, amount, age, subject |
| Audience (claim only) | floors, freshness, nullifier |
| Audience (with disclosure) | the bond message: address and outpoint |
| Chain observers | nothing; the signature is never published |

- Use a coin that holds nothing else of yours. Its address, amount and history
  are what the registry learns.
- Audiences can't link one holder across sites through the bond. A registry's
  own account identifiers are outside this specification.

## 9. Security considerations

- **Rental.** A holder can bond their coin to someone else's subject. They
  can only do it for one subject at a time (§4). If that subject abuses an
  audience, the ban falls on the holder's coin there (§6).
- **Fresh coins.** A coin minted for the purpose has no age and meets no
  `days_floor`. Splitting one large coin into many small ones restarts every
  piece's age.
- **Reorgs.** Require confirmations (§3.5). A claim's `height` lets an
  audience discount very recent checks.
- **Stale claims.** A coin can be spent right after a check. `checked_at`
  bounds how stale a claim is; an audience that needs certainty asks for a
  disclosure and checks the coin itself.
- **Replay.** The header, the subject and the signing window bind a signature
  to one bond. A registry SHOULD also remember nonces until they expire.
- **Registry honesty.** A registry could vouch for a coin it never checked.
  Disclosure (§5) lets any audience catch that. A future version adds a
  zero-knowledge method (§10) that removes the need to trust the registry
  without revealing the coin.

## 10. Future work (informative)

A `zk` method will let the holder prove "one taproot output in the set of
outputs worth at least N and older than D at tip H is mine". It uses curve-tree
membership proofs with a per-audience key image as the nullifier, so an
audience can verify a bond itself without learning the coin. The bond message,
floors and claim shape above are designed to carry it unchanged.

## 11. Test vectors

`test-vectors/tv24.json` to `tv27.json`: a bond message and its id, a
signature by a public test key, nullifiers for two audiences, and the floor
ladder.
