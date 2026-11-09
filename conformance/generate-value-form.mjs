#!/usr/bin/env node
/**
 * Value-form vector generator (tv32).
 *
 *   node conformance/generate-value-form.mjs
 *
 * Each case is an attestation BIP-322 signed by disclosed burn key #1 (tv21's
 * address) with one value that is not one line (SPEC §2.2): it holds a C0
 * control character, DEL, U+0085, U+2028 or U+2029. Its signature verifies, a
 * verifier answers decode_error, and a builder given its identities and
 * extensions refuses to write it. A case with `address` or `issued_at` holds
 * that core value, signed in place of the input's, and a builder is given it
 * too; it ends in the character, where a reader that trims the value would
 * drop it and take the message. The control case holds a value outside
 * ASCII; a builder writes it byte for byte and a verifier does not answer
 * decode_error. A lone surrogate is left out: JSON cannot carry one portably
 * (RFC 8259 §8.2), so a UTF-16 implementation tests it on its own.
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
const EXTENSIONS = { aud: 'https://example.com', expires: '2030-01-01T00:00:00Z' };
const char = (code) => String.fromCharCode(code);
const inAud = (code) => ({ ...EXTENSIONS, aud: `https://example.com${char(code)}network: testnet` });
// A core value ends in the character, where a reader that trims would drop it and read the value it signs.
const endsCore = (key, code) => ({ [key]: `${key === 'address' ? ADDRESS : ISSUED_AT}${char(code)}` });

const cases = [
    ['a value outside ASCII (control)', IDENTITIES, { ...EXTENSIONS, scope: `web:caf${char(0xe9)}.example` }, null],
    ['an aud holding U+0000', IDENTITIES, inAud(0x00)],
    ['an aud holding a tab', IDENTITIES, inAud(0x09)],
    ['an aud holding U+000B', IDENTITIES, inAud(0x0b)],
    ['an aud holding U+000C', IDENTITIES, inAud(0x0c)],
    ['an aud holding U+001B', IDENTITIES, inAud(0x1b)],
    ['an aud holding U+001F', IDENTITIES, inAud(0x1f)],
    ['an aud holding DEL', IDENTITIES, inAud(0x7f)],
    ['an aud holding U+0085', IDENTITIES, inAud(0x85)],
    ['an aud holding U+2028', IDENTITIES, inAud(0x2028)],
    ['an aud holding U+2029', IDENTITIES, inAud(0x2029)],
    ['a scope holding U+2028', IDENTITIES, { ...EXTENSIONS, scope: `x:@alice${char(0x2028)}network: testnet` }],
    [
        'an identity holding U+2028',
        [{ protocol: 'github', identifier: `conformance${char(0x2028)}address: bc1qother` }],
        EXTENSIONS,
    ],
    ['an address ending in a tab', IDENTITIES, EXTENSIONS, 'decode_error', endsCore('address', 0x09)],
    ['an address ending in U+2028', IDENTITIES, EXTENSIONS, 'decode_error', endsCore('address', 0x2028)],
    ['an issued_at ending in a tab', IDENTITIES, EXTENSIONS, 'decode_error', endsCore('issued_at', 0x09)],
    ['an issued_at ending in U+2028', IDENTITIES, EXTENSIONS, 'decode_error', endsCore('issued_at', 0x2028)],
].map(([name, identities, extensions, reason = 'decode_error', core = {}]) => {
    const text = message(identities, extensions, core);
    const signature = signMessage(ADDRESS, text, KEY);
    if (!verifySignature(ADDRESS, text, signature)) throw new Error(`${name}: self-verify failed`);
    return { name, identities, extensions, ...core, message: text, signature, reason };
});

const vector = {
    id: 'tv32',
    category: 'value_form',
    description:
        "attestations validly BIP-322 signed by burn key #1 with a value that is not one line (SPEC §2.2): each case's reason is decode_error and a builder refuses its identities and extensions, with its address or issued_at when the case gives one; the control holds a value outside ASCII, which a builder writes and a verifier takes",
    input: { address: ADDRESS, scheme: 'bip322', nonce: NONCE, issued_at: ISSUED_AT, cases },
    expected: { signatures_valid: true },
};
// Every character outside printable ASCII is written as an escape, so no reader of the file sees a line break.
const BACKSLASH = String.fromCharCode(92);
const escaped = (json) =>
    json.replace(/[^\x20-\x7e\n]/g, (c) => `${BACKSLASH}u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
writeFileSync(join(OUT_DIR, 'tv32.json'), escaped(JSON.stringify(vector, null, 2)) + '\n', 'utf8');

const all = readdirSync(OUT_DIR)
    .filter((f) => f.startsWith('tv') && f.endsWith('.json'))
    .sort()
    .map((f) => {
        const v = JSON.parse(readFileSync(join(OUT_DIR, f), 'utf8'));
        return { id: v.id, category: v.category, description: v.description };
    });
writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(all, null, 2) + '\n', 'utf8');
console.log(`Wrote tv32 (${cases.length} cases) → ${OUT_DIR}`);
