#!/usr/bin/env node
/**
 * Value-as-written vector generator (tv33).
 *
 *   node conformance/generate-value-as-written.mjs
 *
 * Each case is an attestation BIP-322 signed by disclosed burn key #1 (tv21's
 * address) with one value that whitespace pads: a space, U+00A0, U+3000 or
 * U+FEFF before or after it (SPEC §2.2). Its signature verifies. A verifier
 * reads each value as written, so the padded value is not the one inside it:
 * a bond is bond_malformed, an aud is aud_mismatch against
 * input.expected_aud, an expires is expired, an identity or an issued_at is
 * decode_error, and an address is not input.address, which is bad_request
 * (SPEC §7.1 step 1.e). A reader that trims would take each one. The control
 * pads nothing and has no reason. A case's builder field says whether a
 * builder writes its identities and extensions as given or refuses them.
 *
 * Signs with @orangecheck/bip322 (deterministic, RFC 6979), resolved from an
 * oc-packages checkout next to this repository; set OC_SDK_NODE_MODULES to
 * use another.
 */

import { createRequire } from 'node:module';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDK_NODE_MODULES =
    process.env.OC_SDK_NODE_MODULES ?? join(__dirname, '..', '..', 'oc-packages', 'sdk', 'node_modules');
const require = createRequire(join(SDK_NODE_MODULES, '_.js'));
const { addressFromPrivateKey, signMessage, verifySignature } = require('@orangecheck/bip322');

const OUT_DIR = join(__dirname, 'vectors');
// Disclosed burn key #1 (generate-signatures.mjs). Never send bitcoin to its address.
const KEY = '0101010101010101010101010101010101010101010101010101010101010101';
const ADDRESS = addressFromPrivateKey(KEY, 'p2wpkh');
const NONCE = '0011223344556677889900aabbccddee';
const ISSUED_AT = '2026-04-22T12:00:00Z';
const AUD = 'https://example.com';

const message = (identities, extensions, core) =>
    [
        'orangecheck',
        `identities: ${identities.map((b) => `${b.protocol}:${b.identifier}`).join(',')}`,
        `address: ${core.address ?? ADDRESS}`,
        'purpose: portable reputation attestation (non-custodial)',
        `nonce: ${NONCE}`,
        `issued_at: ${core.issued_at ?? ISSUED_AT}`,
        'ack: I attest control of this address and bind it to my identities.',
        ...Object.keys(extensions)
            .sort()
            .map((k) => `${k}: ${extensions[k]}`),
    ].join('\n') + '\n';

const IDENTITIES = [{ protocol: 'github', identifier: 'conformance' }];
const EXPIRES = '2030-01-01T00:00:00Z';
const EXTENSIONS = { aud: AUD, expires: EXPIRES };
const char = (code) => String.fromCharCode(code);
const SPACE = 0x20;
const NBSP = 0xa0;
const IDEOGRAPHIC_SPACE = 0x3000;
const BOM = 0xfeff;
const with_ = (key, value) => ({ ...EXTENSIONS, [key]: value });

// builder: what a builder does with the case's identities and extensions, where it is held to one.
const cases = [
    ['nothing padded (control)', IDENTITIES, with_('bond', '5000'), null, 'writes'],
    ['a bond ending in a space', IDENTITIES, with_('bond', `5000${char(SPACE)}`), 'bond_malformed', 'refuses'],
    ['a bond starting with a space', IDENTITIES, with_('bond', `${char(SPACE)}5000`), 'bond_malformed', 'refuses'],
    ['a bond ending in U+3000', IDENTITIES, with_('bond', `5000${char(IDEOGRAPHIC_SPACE)}`), 'bond_malformed', 'refuses'],
    ['an aud ending in a space', IDENTITIES, with_('aud', `${AUD}${char(SPACE)}`), 'aud_mismatch', 'writes'],
    ['an aud ending in U+00A0', IDENTITIES, with_('aud', `${AUD}${char(NBSP)}`), 'aud_mismatch', 'writes'],
    ['an aud starting with U+FEFF', IDENTITIES, with_('aud', `${char(BOM)}${AUD}`), 'aud_mismatch', 'writes'],
    ['an expires ending in a space', IDENTITIES, with_('expires', `${EXPIRES}${char(SPACE)}`), 'expired', 'writes'],
    ['an expires ending in U+00A0', IDENTITIES, with_('expires', `${EXPIRES}${char(NBSP)}`), 'expired', 'writes'],
    [
        'an identity ending in a space',
        [{ protocol: 'github', identifier: `conformance${char(SPACE)}` }],
        EXTENSIONS,
        'decode_error',
        'refuses',
    ],
    ['an issued_at ending in a space', IDENTITIES, EXTENSIONS, 'decode_error', null, { issued_at: `${ISSUED_AT}${char(SPACE)}` }],
    ['an address ending in a space', IDENTITIES, EXTENSIONS, 'bad_request', null, { address: `${ADDRESS}${char(SPACE)}` }],
].map(([name, identities, extensions, reason, builder, core = {}]) => {
    const text = message(identities, extensions, core);
    const signature = signMessage(ADDRESS, text, KEY);
    if (!verifySignature(ADDRESS, text, signature)) throw new Error(`${name}: self-verify failed`);
    return { name, identities, extensions, ...core, message: text, signature, reason, ...(builder ? { builder } : {}) };
});

const vector = {
    id: 'tv33',
    category: 'value_as_written',
    description:
        "attestations validly BIP-322 signed by burn key #1 with one value that whitespace pads (SPEC §2.2): a verifier reads each value as written, at input.now and against input.expected_aud, so each case's reason is the code its padded value gives (bond_malformed, aud_mismatch, expired, decode_error for an identity or an issued_at, bad_request for an address that is not input.address), and the control's is null; a case's builder says whether a builder writes its identities and extensions as given or refuses them",
    input: {
        address: ADDRESS,
        scheme: 'bip322',
        nonce: NONCE,
        issued_at: ISSUED_AT,
        now: ISSUED_AT,
        expected_aud: AUD,
        cases,
    },
    expected: { signatures_valid: true },
};
// Every character outside printable ASCII is written as an escape, so no reader of the file sees a line break.
const BACKSLASH = String.fromCharCode(92);
const escaped = (json) =>
    json.replace(/[^\x20-\x7e\n]/g, (c) => `${BACKSLASH}u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
writeFileSync(join(OUT_DIR, 'tv33.json'), escaped(JSON.stringify(vector, null, 2)) + '\n', 'utf8');

const all = readdirSync(OUT_DIR)
    .filter((f) => f.startsWith('tv') && f.endsWith('.json'))
    .sort()
    .map((f) => {
        const v = JSON.parse(readFileSync(join(OUT_DIR, f), 'utf8'));
        return { id: v.id, category: v.category, description: v.description };
    });
writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(all, null, 2) + '\n', 'utf8');
console.log(`Wrote tv33 (${cases.length} cases) → ${OUT_DIR}`);
