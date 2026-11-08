#!/usr/bin/env node
/**
 * Canonical-form vector generator (tv30).
 *
 *   node conformance/generate-canonical-form.mjs
 *
 * Each case is a message BIP-322 signed by disclosed burn key #1 (tv21's
 * address) that is not an attestation in canonical form (SPEC §7.1 step 1).
 * Its signature verifies, and a verifier answers decode_error. The control
 * case is canonical and does not.
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

const lines = [
    'orangecheck',
    'identities: github:conformance',
    `address: ${ADDRESS}`,
    'purpose: portable reputation attestation (non-custodial)',
    'nonce: 0011223344556677889900aabbccddee',
    'issued_at: 2026-04-22T12:00:00Z',
    'ack: I attest control of this address and bind it to my identities.',
    'aud: https://example.com',
    'expires: 2030-01-01T00:00:00Z',
];
const text = (ls) => ls.join('\n') + '\n';
const at = (key) => lines.findIndex((l) => l === key || l.startsWith(`${key}:`));
const replace = (key, line) => text(lines.map((l, i) => (i === at(key) ? line : l)));
const swap = (a, b) => {
    const ls = [...lines];
    [ls[at(a)], ls[at(b)]] = [ls[at(b)], ls[at(a)]];
    return text(ls);
};
const canonical = text(lines);

const cases = [
    ['canonical (control)', canonical, null],
    ['no trailing LF (1.b)', canonical.slice(0, -1)],
    ['two trailing LFs (1.b)', canonical + '\n'],
    ['CRLF line ends (1.b)', canonical.replace(/\n/g, '\r\n')],
    ['a CR inside a value (1.b)', replace('aud', 'aud: https://example.com\rnetwork: testnet')],
    ['another header line (1.c)', replace('orangecheck', 'OrangeCheck')],
    ['another purpose (1.c)', replace('purpose', 'purpose: sign in to example.com')],
    ['another ack (1.c)', replace('ack', 'ack: I agree.')],
    ['a core line missing (1.c)', text(lines.filter((_, i) => i !== at('nonce')))],
    ['core lines out of order (1.c)', swap('address', 'identities')],
    ['an extension among the core lines (1.c)', swap('aud', 'ack')],
    ['a blank line (1.c)', text([...lines.slice(0, at('aud')), '', ...lines.slice(at('aud'))])],
    ['extension keys out of order (1.d)', swap('aud', 'expires')],
    ['an extension key in capitals (1.d)', replace('aud', 'AUD: https://example.com')],
    ['an extension with no value (1.d)', replace('expires', 'expires: ')],
    ['a nonce in capitals (1.f)', replace('nonce', 'nonce: 0011223344556677889900AABBCCDDEE')],
    ['a nonce of 16 hex (1.f)', replace('nonce', 'nonce: 0011223344556677')],
    ['identities that do not parse (1.h)', replace('identities', 'identities: GitHub:conformance')],
    ['identities out of order (1.h)', replace('identities', 'identities: github:conformance,dns:example.com')],
    ['a key signed twice (1.i)', text([...lines, 'network: mainnet', 'network: testnet'])],
    [
        'signed text that carries attestation lines in no attestation form',
        text(['Sign in to example.com', 'identities: github:conformance', `address: ${ADDRESS}`, 'issued_at: 2026-04-22T12:00:00Z']),
    ],
].map(([name, message, reason = 'decode_error']) => {
    const signature = signMessage(ADDRESS, message, KEY);
    if (!verifySignature(ADDRESS, message, signature)) throw new Error(`${name}: self-verify failed`);
    return { name, message, signature, reason };
});

const vector = {
    id: 'tv30',
    category: 'canonical_form',
    description:
        'messages validly BIP-322 signed by burn key #1 that are not attestations in canonical form (SPEC §7.1 step 1): each case\'s reason is decode_error; the canonical control\'s is null',
    input: { address: ADDRESS, scheme: 'bip322', cases },
    expected: { signatures_valid: true },
};
writeFileSync(join(OUT_DIR, 'tv30.json'), JSON.stringify(vector, null, 2) + '\n', 'utf8');

const all = readdirSync(OUT_DIR)
    .filter((f) => f.startsWith('tv') && f.endsWith('.json'))
    .sort()
    .map((f) => {
        const v = JSON.parse(readFileSync(join(OUT_DIR, f), 'utf8'));
        return { id: v.id, category: v.category, description: v.description };
    });
writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(all, null, 2) + '\n', 'utf8');
console.log(`Wrote tv30 (${cases.length} cases) → ${OUT_DIR}`);
