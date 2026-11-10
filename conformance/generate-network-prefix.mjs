#!/usr/bin/env node
/**
 * Network prefix vector generator (tv34).
 *
 *   node conformance/generate-network-prefix.mjs
 *
 * Each case is an attestation BIP-322 signed by disclosed burn key #1 for one
 * of its addresses: mainnet (bc1q, tv21's), testnet (tb1q, tb1p) or regtest
 * (bcrt1q). Its signature verifies. The message selects a network (SPEC §7.1
 * step 3): testnet or signet when its network value is exactly that, mainnet
 * otherwise, a value that whitespace pads or capitalises included. An address
 * of another network is bad_request, before network_testmode, so a mainnet
 * address under network: testnet is bad_request even where the verifier is not
 * in test mode. A case's test_mode says whether the verifier runs in test
 * mode; its reason is the first of bad_request and network_testmode it gives,
 * or null. A case's builder says whether a builder writes its extensions for
 * its address or refuses them: it writes no network value but mainnet, testnet
 * or signet, though a verifier reads any other as mainnet.
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
// Disclosed burn key #1 (generate-signatures.mjs). Never send bitcoin to any of its addresses.
const KEY = '0101010101010101010101010101010101010101010101010101010101010101';
const MAINNET = addressFromPrivateKey(KEY, 'p2wpkh', 'mainnet');
const TESTNET = addressFromPrivateKey(KEY, 'p2wpkh', 'testnet');
const TESTNET_TAPROOT = addressFromPrivateKey(KEY, 'p2tr', 'testnet');
const REGTEST = addressFromPrivateKey(KEY, 'p2wpkh', 'regtest');
const NONCE = '0011223344556677889900aabbccddee';
const ISSUED_AT = '2026-04-22T12:00:00Z';

const message = (address, extensions) =>
    [
        'orangecheck',
        'identities: github:conformance',
        `address: ${address}`,
        'purpose: portable reputation attestation (non-custodial)',
        `nonce: ${NONCE}`,
        `issued_at: ${ISSUED_AT}`,
        'ack: I attest control of this address and bind it to my identities.',
        ...Object.keys(extensions)
            .sort()
            .map((k) => `${k}: ${extensions[k]}`),
    ].join('\n') + '\n';

const net = (value) => ({ network: value });

// [name, address, extensions, test_mode, reason, builder]
const cases = [
    ['a mainnet address and no network line (control)', MAINNET, {}, false, null, 'writes'],
    ['a mainnet address under network: mainnet (control)', MAINNET, net('mainnet'), false, null, 'writes'],
    ['a testnet address under network: testnet (control)', TESTNET, net('testnet'), true, null, 'writes'],
    ['a testnet address under network: signet (control)', TESTNET, net('signet'), true, null, 'writes'],
    ['a testnet address under network: testnet, not in test mode', TESTNET, net('testnet'), false, 'network_testmode', 'writes'],
    ['a testnet address and no network line', TESTNET, {}, false, 'bad_request', 'refuses'],
    ['a testnet taproot address and no network line', TESTNET_TAPROOT, {}, false, 'bad_request', 'refuses'],
    ['a mainnet address under network: testnet', MAINNET, net('testnet'), true, 'bad_request', 'refuses'],
    ['a mainnet address under network: testnet, not in test mode', MAINNET, net('testnet'), false, 'bad_request', 'refuses'],
    ['a mainnet address under network: signet', MAINNET, net('signet'), true, 'bad_request', 'refuses'],
    ['a testnet address under a network value ending in a space', TESTNET, net('testnet '), true, 'bad_request', 'refuses'],
    ['a testnet address under network: Testnet', TESTNET, net('Testnet'), true, 'bad_request', 'refuses'],
    ['a regtest address under network: testnet', REGTEST, net('testnet'), true, 'bad_request', 'refuses'],
    ['a mainnet address under network: Mainnet, which selects mainnet', MAINNET, net('Mainnet'), false, null, 'refuses'],
].map(([name, address, extensions, test_mode, reason, builder]) => {
    const text = message(address, extensions);
    const signature = signMessage(address, text, KEY);
    if (!verifySignature(address, text, signature)) throw new Error(`${name}: self-verify failed`);
    return { name, address, extensions, test_mode, message: text, signature, reason, builder };
});

const vector = {
    id: 'tv34',
    category: 'network_prefix',
    description:
        "attestations validly BIP-322 signed by burn key #1 for its mainnet, testnet or regtest address (SPEC §7.1 step 3): the message selects testnet or signet only by that exact network value and mainnet otherwise, so each case's reason, with the verifier in test mode where test_mode says so, is bad_request for an address of another network, before network_testmode, network_testmode for a testnet address outside test mode, and null for the controls and for a mainnet address under any other network value; a case's builder says whether a builder writes its extensions for its address or refuses them, and it writes no network value but mainnet, testnet or signet",
    input: {
        identities: [{ protocol: 'github', identifier: 'conformance' }],
        scheme: 'bip322',
        nonce: NONCE,
        issued_at: ISSUED_AT,
        now: ISSUED_AT,
        cases,
    },
    expected: { signatures_valid: true },
};
writeFileSync(join(OUT_DIR, 'tv34.json'), JSON.stringify(vector, null, 2) + '\n', 'utf8');

const all = readdirSync(OUT_DIR)
    .filter((f) => f.startsWith('tv') && f.endsWith('.json'))
    .sort()
    .map((f) => {
        const v = JSON.parse(readFileSync(join(OUT_DIR, f), 'utf8'));
        return { id: v.id, category: v.category, description: v.description };
    });
writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(all, null, 2) + '\n', 'utf8');
console.log(`Wrote tv34 (${cases.length} cases) → ${OUT_DIR}`);
