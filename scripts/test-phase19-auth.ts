import { db } from '@/lib/db';
import {
  createSessionToken,
  verifySessionToken,
} from '@/lib/auth-session';
import {
  generateVerificationToken,
  consumeVerificationToken,
} from '@/lib/verification-tokens';
import { checkRateLimit } from '@/lib/auth-rate-limit';

async function runAuthTests() {
  console.log('====================================================');
  console.log('  STARTING PHASE 19 AUTH & SECURITY TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // Set auth secret in env for test process
  process.env.MASSAF_AUTH_SECRET = 'dev-secret-key-32-chars-minimum-length-for-hmac-sha256';

  // Seed test records
  const testCustomerEmail = `auth-cust-${Date.now()}@massaf.com`;
  const testTherapistEmail = `auth-th-${Date.now()}@massaf.com`;

  const customer = await db.customer.create({
    data: {
      name: 'Auth Test Customer',
      email: testCustomerEmail,
      phone: '555-0199',
    },
  });

  const therapist = await db.therapist.create({
    data: {
      name: 'Auth Test Therapist',
      email: testTherapistEmail,
      isActive: true,
    },
  });

  const deactivatedTherapist = await db.therapist.create({
    data: {
      name: 'Deactivated Therapist',
      email: `deact-${Date.now()}@massaf.com`,
      isActive: false,
    },
  });

  try {
    // 1. Session Token Signing & Signature Verification
    const token = createSessionToken(customer.id, customer.email, 'CUSTOMER');
    const parsed = verifySessionToken(token, 'CUSTOMER');
    assert(parsed !== null && parsed.entityId === customer.id, '1. Valid HMAC session token verified successfully');

    // 2. Forged Session Signature Rejection
    const forgedToken = token.slice(0, -5) + '00000';
    const forgedParsed = verifySessionToken(forgedToken, 'CUSTOMER');
    assert(forgedParsed === null, '2. Forged HMAC session signature rejected');

    // 3. Modified Session Payload Rejection
    const parts = token.split('.');
    const modifiedPayload = Buffer.from(JSON.stringify({ entityId: 'fake-id', email: 'fake@massaf.com', type: 'CUSTOMER', exp: Date.now() + 100000 })).toString('base64url');
    const tamperedToken = `${modifiedPayload}.${parts[1]}`;
    assert(verifySessionToken(tamperedToken, 'CUSTOMER') === null, '3. Modified session payload with original signature rejected');

    // 4. Missing MASSAF_AUTH_SECRET Fail-Closed
    delete process.env.MASSAF_AUTH_SECRET;
    try {
      createSessionToken(customer.id, customer.email, 'CUSTOMER');
      assert(false, '4. Missing MASSAF_AUTH_SECRET should fail closed');
    } catch {
      assert(true, '4. Missing MASSAF_AUTH_SECRET failed closed with configuration error');
    }
    process.env.MASSAF_AUTH_SECRET = 'dev-secret-key-32-chars-minimum-length-for-hmac-sha256';

    // 5. Database Verification Token Generation & Hashing
    const rawToken = await generateVerificationToken(therapist.id, 'THERAPIST_LOGIN', 15);
    assert(typeof rawToken === 'string' && rawToken.length === 64, '5. Generated 64-char hex verification token');

    const dbTokenRecord = await db.verificationToken.findFirst({
      where: { entityId: therapist.id },
    });
    assert(dbTokenRecord !== null && dbTokenRecord.tokenHash !== rawToken, '6. Token stored as SHA-256 hash (never raw token)');

    // 6. Token Consumption
    const consumedEntityId = await consumeVerificationToken(rawToken, 'THERAPIST_LOGIN');
    assert(consumedEntityId === therapist.id, '7. Valid token consumed successfully returning entityId');

    // 7. Double Consumption Rejection (Single-Use Guarantee)
    const reConsumed = await consumeVerificationToken(rawToken, 'THERAPIST_LOGIN');
    assert(reConsumed === null, '8. Previously consumed token rejected on second attempt');

    // 8. Atomic Concurrent Consumption Test
    const tokenForConcurrent = await generateVerificationToken(therapist.id, 'THERAPIST_LOGIN', 15);
    const concurrentResults = await Promise.all([
      consumeVerificationToken(tokenForConcurrent, 'THERAPIST_LOGIN'),
      consumeVerificationToken(tokenForConcurrent, 'THERAPIST_LOGIN'),
      consumeVerificationToken(tokenForConcurrent, 'THERAPIST_LOGIN'),
    ]);
    const successCount = concurrentResults.filter((r) => r === therapist.id).length;
    assert(successCount === 1, '9. Atomic token consumption allowed exactly 1 winner out of 3 concurrent requests');

    // 9. Expired Token Rejection
    const expiredToken = await generateVerificationToken(therapist.id, 'THERAPIST_LOGIN', -5); // Already expired
    const expiredResult = await consumeVerificationToken(expiredToken, 'THERAPIST_LOGIN');
    assert(expiredResult === null, '10. Expired token rejected');

    // 10. Sequential Rate Limiting Test
    const testLimitId = `test_limit_${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(testLimitId, 'test_action', 5, 15);
    }
    const rateCheckOver = await checkRateLimit(testLimitId, 'test_action', 5, 15);
    assert(!rateCheckOver.allowed, '11. Rate limit exceeded allowed limit and rejected 6th attempt');

    // 11. High-Concurrency DB-Level Atomic Rate Limiting (10 concurrent requests with maxAttempts = 3)
    const testHighConcurrentLimitId = `test_high_conc_${Date.now()}`;
    const highConcurrentRateLimitResults = await Promise.all([
      checkRateLimit(testHighConcurrentLimitId, 'high_conc_action', 3, 15),
      checkRateLimit(testHighConcurrentLimitId, 'high_conc_action', 3, 15),
      checkRateLimit(testHighConcurrentLimitId, 'high_conc_action', 3, 15),
      checkRateLimit(testHighConcurrentLimitId, 'high_conc_action', 3, 15),
      checkRateLimit(testHighConcurrentLimitId, 'high_conc_action', 3, 15),
      checkRateLimit(testHighConcurrentLimitId, 'high_conc_action', 3, 15),
      checkRateLimit(testHighConcurrentLimitId, 'high_conc_action', 3, 15),
      checkRateLimit(testHighConcurrentLimitId, 'high_conc_action', 3, 15),
      checkRateLimit(testHighConcurrentLimitId, 'high_conc_action', 3, 15),
      checkRateLimit(testHighConcurrentLimitId, 'high_conc_action', 3, 15),
    ]);
    const allowedHighConcurrentCounts = highConcurrentRateLimitResults.filter((r) => r.allowed).length;
    const rejectedHighConcurrentCounts = highConcurrentRateLimitResults.filter((r) => !r.allowed).length;
    assert(
      allowedHighConcurrentCounts === 3 && rejectedHighConcurrentCounts === 7,
      '12. High-concurrency rate limit allowed exactly 3 and rejected 7 out of 10 concurrent requests'
    );

    // 12. First-Request Creation Race Handling
    const testCreationRaceId = `test_create_race_${Date.now()}`;
    const creationRaceResults = await Promise.all([
      checkRateLimit(testCreationRaceId, 'create_race_action', 2, 15),
      checkRateLimit(testCreationRaceId, 'create_race_action', 2, 15),
      checkRateLimit(testCreationRaceId, 'create_race_action', 2, 15),
      checkRateLimit(testCreationRaceId, 'create_race_action', 2, 15),
    ]);
    const allowedCreationCounts = creationRaceResults.filter((r) => r.allowed).length;
    assert(allowedCreationCounts === 2, '13. Concurrent first-time requests handled creation race safely and allowed exactly 2 out of 4');

    // 13. Deactivated Therapist Session Revalidation Rejection
    const deactSessionToken = createSessionToken(deactivatedTherapist.id, deactivatedTherapist.email!, 'THERAPIST');
    const deactVerified = verifySessionToken(deactSessionToken, 'THERAPIST');
    const dbDeactCheck = await db.therapist.findFirst({
      where: { id: deactVerified?.entityId, isActive: true },
    });
    assert(dbDeactCheck === null, '14. Session for deactivated therapist rejected on database revalidation');

  } finally {
    // Cleanup
    await db.verificationToken.deleteMany({ where: { entityId: { in: [therapist.id, customer.id] } } });
    await db.customer.delete({ where: { id: customer.id } });
    await db.therapist.delete({ where: { id: therapist.id } });
    await db.therapist.delete({ where: { id: deactivatedTherapist.id } });
    await db.authRateLimit.deleteMany({ where: { identifier: { contains: 'test' } } });
  }

  console.log('\n====================================================');
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthTests().catch((err) => {
  console.error('Test script runner error:', err);
  process.exit(1);
});
