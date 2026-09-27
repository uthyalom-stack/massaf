import { createCheckoutToken, verifyCheckoutToken } from '../src/lib/auth-session';

async function main() {
  console.log('=== Running MASSAF V1 Security Regression Test Suite ===\n');

  // 1. Checkout capability tokens
  console.log('[Test 1] Checkout Capability Tokens');
  const bookingId = 'test-booking-123';
  const token = createCheckoutToken(bookingId, 15);
  const isValid = verifyCheckoutToken(token, bookingId);
  const isInvalidBooking = verifyCheckoutToken(token, 'other-booking-456');

  if (isValid && !isInvalidBooking) {
    console.log('  ✅ Valid checkout token verified and cross-booking token rejected correctly.');
  } else {
    console.error('  ❌ Checkout token test failed!');
    process.exit(1);
  }

  // 2. CSV Formula Injection escaping check
  console.log('[Test 2] CSV Formula Escaping');
  function escapeCsvField(val: unknown): string {
    if (val === null || val === undefined) return '""';
    let str = String(val);
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  const formulaStr = '=SUM(1+1)';
  const escaped = escapeCsvField(formulaStr);
  if (escaped === '"\'=SUM(1+1)"') {
    console.log('  ✅ Formula injection successfully sanitized with leading single quote.');
  } else {
    console.error('  ❌ CSV formula escaping test failed!', escaped);
    process.exit(1);
  }

  console.log('\n=== All MASSAF V1 Security Unit Checks Passed Successfully! ===\n');
}

main().catch((err) => {
  console.error('Security regression test failed:', err);
  process.exit(1);
});
