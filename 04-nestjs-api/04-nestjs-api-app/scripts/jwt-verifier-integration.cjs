const assert = require('node:assert/strict');
const { JoseJwtVerifier } = require('../dist/src/security/jwt-verifier.js');

const loadJose = () => import('jose');

async function main() {
  const jose = await loadJose();
  const verifier = new JoseJwtVerifier();
  const secret = 'local-test-secret-that-is-long-enough';
  const hsToken = await new jose.SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'HS256' }).setSubject('user-hs256').setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(secret));
  assert.equal((await verifier.verify(hsToken, secret)).sub, 'user-hs256');

  const { privateKey, publicKey } = await jose.generateKeyPair('ES256');
  const publicJwk = await jose.exportJWK(publicKey);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: 'test-es256' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const esToken = await new jose.SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'ES256', kid: 'test-es256' }).setSubject('user-es256').setIssuedAt().setExpirationTime('5m').sign(privateKey);
    assert.equal((await verifier.verify(esToken, { jwksUrl: 'https://jwks.test.example/auth/v1/.well-known/jwks.json' })).sub, 'user-es256');
    await assert.rejects(() => verifier.verify(hsToken, { jwksUrl: 'https://jwks.test.example/auth/v1/.well-known/jwks.json' }));
  } finally {
    globalThis.fetch = previousFetch;
  }
  const noSub = await new jose.SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(secret));
  await assert.rejects(() => verifier.verify(noSub, secret), /JWT subject is missing/);
  console.log('JWT verifier integration checks passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
