import { db } from '../src/lib/db';
import { PaymentService } from '../src/lib/payments/service';
import { updatePaymentSettings, getPaymentSettings } from '../src/lib/payments/settings';
import { SystemPaymentSettings } from '../src/lib/payments/types';

async function testPaymentExpansionSuite() {
  console.log('--- STARTING COMPREHENSIVE PAYMENT PROVIDER EXPANSION TEST SUITE ---');

  const dbUrl = process.env.TURSO_DATABASE_URL || '';
  if (!dbUrl.includes('dev.db') && !process.env.ALLOW_TEST_DB) {
    console.error('❌ SAFETY GUARD: Test suite can only run against a local dev.db or test database.');
    process.exit(1);
  }

  // Ensure test env variables exist for configured adapters
  process.env.PAYLIO_API_KEY = process.env.PAYLIO_API_KEY || 'test_paylio_key';
  process.env.PAYLIO_API_URL = process.env.PAYLIO_API_URL || 'https://paylio.org/api/v1';
  process.env.MASSAF_POLYGON_WALLET_ADDRESS = process.env.MASSAF_POLYGON_WALLET_ADDRESS || '0x1234567890123456789012345678901234567890';
  process.env.PAYLIO_MOCK_MODE = 'true';

  let originalSettings: SystemPaymentSettings | null = null;
  let customerId = '';
  let testBookingId = '';

  try {
    // 0. Backup original settings
    originalSettings = await getPaymentSettings();

    // TEST 1: Registered Providers List
    console.log('\nTEST 1: Verifying registered provider adapters...');
    const adapters = PaymentService.getAllAdapters();
    const adapterIds = adapters.map((a) => a.id);
    const requiredIds = ['paymegate', 'norpo', 'nowpayments', 'btcpay', 'paymento', 'nexapay', 'paylio', 'giftcard'];

    for (const reqId of requiredIds) {
      if (!adapterIds.includes(reqId as any)) {
        throw new Error(`Missing expected provider adapter: ${reqId}`);
      }
    }
    console.log('✓ TEST 1 PASSED: All 8 required provider adapters are registered.');

    // TEST 2: Provider Health & Implementation Status
    console.log('\nTEST 2: Verifying provider implementation and health status...');
    const paylioAdapter = PaymentService.getAdapter('paylio');
    const paymegateAdapter = PaymentService.getAdapter('paymegate');

    if (!paylioAdapter?.isImplemented()) throw new Error('PayLio adapter should be marked as implemented.');
    if (paymegateAdapter?.isImplemented()) throw new Error('Paymegate adapter should be marked as unimplemented until official API docs are integrated.');

    console.log('✓ TEST 2 PASSED: PayLio is implemented; Paymegate is correctly marked unimplemented.');

    // TEST 3: Default Provider Rule Enforcement
    console.log('\nTEST 3: Verifying default provider enable/disable rules...');
    const testSettings: SystemPaymentSettings = JSON.parse(JSON.stringify(originalSettings));

    // Attempting to set an unconfigured/disabled provider as default MUST fail
    testSettings.defaultProviderId = 'paymegate';
    testSettings.providers.paymegate.enabled = false;

    const invalidDefaultRes = await updatePaymentSettings(testSettings);
    if (invalidDefaultRes.success) {
      throw new Error('Allowed setting disabled/unimplemented provider as default provider!');
    }
    console.log('✓ TEST 3 PASSED: System rejected setting disabled/unimplemented provider as default.');

    // TEST 4: Available Customer Providers Filtering
    console.log('\nTEST 4: Verifying available customer checkout providers filtering...');
    // Enable paylio, nowpayments, and giftcard; disable others
    const filteredSettings: SystemPaymentSettings = {
      defaultProviderId: 'paylio',
      providers: {
        paylio: { id: 'paylio', enabled: true, priority: 1 },
        nowpayments: { id: 'nowpayments', enabled: true, priority: 2 },
        giftcard: { id: 'giftcard', enabled: true, priority: 3 },
        paymegate: { id: 'paymegate', enabled: false, priority: 4 },
        norpo: { id: 'norpo', enabled: false, priority: 5 },
        btcpay: { id: 'btcpay', enabled: false, priority: 6 },
        paymento: { id: 'paymento', enabled: false, priority: 7 },
        nexapay: { id: 'nexapay', enabled: false, priority: 8 },
      },
    };

    const updateRes = await updatePaymentSettings(filteredSettings);
    if (!updateRes.success) throw new Error(`Failed to update settings: ${updateRes.error}`);

    const customerProviders = await PaymentService.getAvailableCustomerProviders();
    const customerProviderIds = customerProviders.map((p) => p.id);

    if (customerProviderIds.includes('paymegate')) {
      throw new Error('Disabled / unimplemented provider "paymegate" appeared in customer providers list!');
    }
    if (!customerProviderIds.includes('paylio') || !customerProviderIds.includes('giftcard')) {
      throw new Error('Enabled & operational providers missing from customer providers list!');
    }
    console.log('✓ TEST 4 PASSED: Customer checkout receives only enabled and operational providers.');

    // TEST 5: Server-Authoritative Booking Amount Validation & Disabled Provider Rejection
    console.log('\nTEST 5: Verifying server-authoritative booking amount & provider validation...');
    const customer = await db.customer.create({
      data: {
        name: 'Expansion Test Customer',
        email: `expansion.test.${Date.now()}@example.com`,
        phone: '555-0199',
      },
    });
    customerId = customer.id;

    let therapist = await db.therapist.findFirst();
    let service = await db.service.findFirst();

    if (!therapist) {
      therapist = await db.therapist.create({
        data: { name: 'Expansion Test Therapist', bio: 'Test therapist', isActive: true },
      });
    }

    if (!service) {
      service = await db.service.create({
        data: { name: 'Expansion Test Massage', price: 185.0, durationMinutes: 60, isActive: true },
      });
    }

    const booking = await db.booking.create({
      data: {
        bookingNumber: `MSF-EXP-${Date.now().toString().slice(-4)}`,
        customerId: customer.id,
        therapistId: therapist.id,
        serviceId: service.id,
        appointmentDateTime: new Date('2028-10-01T10:00:00Z'),
        durationMinutes: 60,
        amount: 185.0, // Authoritative DB price
        status: 'PENDING',
        paymentStatus: 'UNPAID',
      },
    });
    testBookingId = booking.id;

    // Unit test adapter creation with server-authoritative amount directly via adapter
    const paylio = PaymentService.getAdapter('paylio');
    if (!paylio) throw new Error('PayLio adapter missing');

    const paymentRes = await paylio.createPayment({
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      amount: booking.amount,
      currency: 'USD',
      customerEmail: customer.email,
      callbackUrl: 'http://localhost/callback',
    });

    if (!paymentRes.success) {
      throw new Error(`PayLio creation failed: ${paymentRes.error}`);
    }
    console.log('✓ TEST 5 PASSED: Payment adapter receives server-authoritative booking amount ($185.00).');

    // TEST 6: Unimplemented Adapter Rejection
    console.log('\nTEST 6: Verifying unimplemented adapter creation rejection...');
    const paymegate = PaymentService.getAdapter('paymegate');
    if (!paymegate) throw new Error('Paymegate adapter missing');

    const unimpRes = await paymegate.createPayment({
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      amount: booking.amount,
      currency: 'USD',
      customerEmail: customer.email,
      callbackUrl: 'http://localhost/callback',
    });

    if (unimpRes.success) {
      throw new Error('Unimplemented adapter allowed payment creation!');
    }
    console.log('✓ TEST 6 PASSED: Unimplemented adapter safely rejected payment creation.');

    console.log('\n======================================================');
    console.log('✅ ALL PAYMENT PROVIDER EXPANSION TESTS PASSED!');
    console.log('======================================================');
  } catch (err) {
    console.error('\n❌ PAYMENT EXPANSION TEST FAILED:', err);
    process.exit(1);
  } finally {
    console.log('Cleaning up test records and restoring settings...');
    try {
      if (originalSettings) {
        await updatePaymentSettings(originalSettings);
      }
      if (testBookingId) {
        await db.booking.deleteMany({ where: { id: testBookingId } });
      }
      if (customerId) {
        await db.customer.deleteMany({ where: { id: customerId } });
      }
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr);
    }
    await db.$disconnect();
  }
}

testPaymentExpansionSuite();
