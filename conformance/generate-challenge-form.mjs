#!/usr/bin/env node
/**
 * Challenge-form vector generator (tv31).
 *
 *   node conformance/generate-challenge-form.mjs
 *
 * Each case is an orangecheck-auth challenge BIP-322 signed by disclosed burn
 * key #1 (tv21's address) that is not in its canonical form (SPEC Appendix
 * A.1). Its signature verifies, and a verifier answers malformed. The control
 * case is canonical and verifies at the vector's `now` with its expected
 * nonce, audience and purpose. The canonical text without its final LF is left
 * out: a reader MAY accept it, so no one answer is right.
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
const AUDIENCE = 'https://example.com';

const lines = [
    'orangecheck-auth',
    `address: ${ADDRESS}`,
    `nonce: ${NONCE}`,
    'issued_at: 2026-04-22T12:00:00Z',
    'expires_at: 2026-04-22T12:05:00Z',
    'ack: I authorize this session under the OrangeCheck auth challenge.',
    `audience: ${AUDIENCE}`,
    'purpose: login',
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
const LS = String.fromCharCode(0x2028);
const NEL = String.fromCharCode(0x85);
const elsewhere = replace('audience', 'audience: https://other.example');

const cases = [
    ['canonical (control)', canonical, null],
    ['a repeated audience line', elsewhere + `audience: ${AUDIENCE}\n`],
    ['a repeated audience line after blank lines', elsewhere + '\n'.repeat(40) + `audience: ${AUDIENCE}\n`],
    ['a repeated purpose line', replace('purpose', 'purpose: link') + 'purpose: login\n'],
    ['an extension line written twice', canonical + 'purpose: login\n'],
    ['a core line written twice', canonical + `nonce: ${NONCE}\n`],
    ['two trailing LFs', canonical + '\n'],
    ['no final LF, with a line added', canonical + 'Sign in to example.com'],
    ['CRLF line ends', canonical.replace(/\n/g, '\r\n')],
    ['a CR inside a value', replace('audience', `audience: ${AUDIENCE}\rpurpose: link`)],
    ['a blank line', text([...lines.slice(0, at('audience')), '', ...lines.slice(at('audience'))])],
    ['a line that is not key: value', canonical + 'Sign in to example.com\n'],
    ['core lines out of order', swap('address', 'nonce')],
    ['an extension among the core lines', swap('audience', 'ack')],
    ['extension keys out of order', swap('audience', 'purpose')],
    ['an extension key in capitals', replace('purpose', 'Purpose: login')],
    ['an extension with no value', canonical + 'memo: \n'],
    ['a time with milliseconds', replace('issued_at', 'issued_at: 2026-04-22T12:00:00.000Z')],
    ['a time with an offset', replace('expires_at', 'expires_at: 2026-04-22T12:05:00+00:00')],
    ['an issued_at in an extended year', replace('issued_at', 'issued_at: -000001-01-01T00:00:00Z')],
    ['an expires_at in an extended year', replace('expires_at', 'expires_at: +010000-01-01T00:00:00Z')],
    [
        'a line separator (U+2028) in the audience',
        replace('audience', `audience: ${AUDIENCE}${LS}audience: https://other.example`),
    ],
    [
        'a next line (U+0085) in an extension value',
        text([...lines.slice(0, at('purpose')), `memo: a${NEL}b`, ...lines.slice(at('purpose'))]),
    ],
].map(([name, message, reason = 'malformed']) => {
    const signature = signMessage(ADDRESS, message, KEY);
    if (!verifySignature(ADDRESS, message, signature)) throw new Error(`${name}: self-verify failed`);
    return { name, message, signature, reason };
});

const vector = {
    id: 'tv31',
    category: 'challenge_form',
    description:
        'orangecheck-auth challenges validly BIP-322 signed by burn key #1 that are not in their canonical form (SPEC Appendix A.1): each case\'s reason is malformed; the canonical control\'s is null',
    input: {
        address: ADDRESS,
        scheme: 'bip322',
        now: '2026-04-22T12:01:00Z',
        expected_nonce: NONCE,
        expected_audience: AUDIENCE,
        expected_purpose: 'login',
        cases,
    },
    expected: { signatures_valid: true },
};
// Every character outside printable ASCII is written as an escape, so no reader of the file sees a line break.
const BACKSLASH = String.fromCharCode(92);
const escaped = (json) =>
    json.replace(/[^\x20-\x7e\n]/g, (c) => `${BACKSLASH}u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
writeFileSync(join(OUT_DIR, 'tv31.json'), escaped(JSON.stringify(vector, null, 2)) + '\n', 'utf8');

const all = readdirSync(OUT_DIR)
    .filter((f) => f.startsWith('tv') && f.endsWith('.json'))
    .sort()
    .map((f) => {
        const v = JSON.parse(readFileSync(join(OUT_DIR, f), 'utf8'));
        return { id: v.id, category: v.category, description: v.description };
    });
writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(all, null, 2) + '\n', 'utf8');
console.log(`Wrote tv31 (${cases.length} cases) → ${OUT_DIR}`);
