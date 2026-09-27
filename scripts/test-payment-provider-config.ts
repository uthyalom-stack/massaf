import { db } from '../src/lib/db';
import { PaymentService } from '../src/lib/payments/service';
import { SystemPaymentSettings } from '../src/lib/payments/types';

async function runTests() {
  console.log('--- STARTING PAYMENT PROVIDER SYSTEM & CONFIGURATION TESTS ---');

  // Save original DB settings row so we can restore it at the end
  const originalSettingsRow = await db.siteContent.findUnique({
    where: { key: 'payment_provider_settings_v1' },
  });

  try {
    // -------------------------------------------------------------
    // Test 4: Default Provider Initial State
    // -------------------------------------------------------------
    console.log('\n[Test 4] Verifying Gift Card is initial default provider...');
    // Delete settings row temporarily to test initial defaults
    await db.siteContent.deleteMany({ where: { key: 'payment_provider_settings_v1' } });

    const initialSettings = await PaymentService.getSettings();
    if (initialSettings.defaultProviderId !== 'giftcard') {
      throw new Error(`Expected initial defaultProviderId to be 'giftcard', got '${initialSettings.defaultProviderId}'`);
    }

    const availableInit = await PaymentService.getAvailableCustomerProviders();
    const defaultOpt = availableInit.find((p) => p.isDefault);
    if (!defaultOpt || defaultOpt.id !== 'giftcard') {
      throw new Error(`Expected Gift Card to be marked isDefault=true, got '${defaultOpt?.id}'`);
    }

    const paylioOpt = availableInit.find((p) => p.id === 'paylio');
    if (paylioOpt && paylioOpt.isDefault) {
      throw new Error('PayLio must NOT be default provider initially.');
    }
    console.log('✓ Test 4 passed: Gift Card is the initial default provider.');

    // -------------------------------------------------------------
    // Test 1: Disable NOWPayments
    // -------------------------------------------------------------
    console.log('\n[Test 1] Testing NOWPayments Disable...');
    // Enable NOWPayments first
    const settingsWithNowEnabled: SystemPaymentSettings = {
      defaultProviderId: 'giftcard',
      providers: {
        ...initialSettings.providers,
        nowpayments: { id: 'nowpayments', enabled: true, priority: 3 },
      },
    };
    await PaymentService.updateSettings(settingsWithNowEnabled);

    // Disable NOWPayments
    const settingsWithNowDisabled: SystemPaymentSettings = {
      defaultProviderId: 'giftcard',
      providers: {
        ...initialSettings.providers,
        nowpayments: { id: 'nowpayments', enabled: false, priority: 3 },
      },
    };
    const updateRes1 = await PaymentService.updateSettings(settingsWithNowDisabled);
    if (!updateRes1.success) {
      throw new Error(`Failed to update settings: ${updateRes1.error}`);
    }

    const providersAfterDisable = await PaymentService.getAvailableCustomerProviders();
    const hasNowpaymentsDisabled = providersAfterDisable.some((p) => p.id === 'nowpayments');
    if (hasNowpaymentsDisabled) {
      throw new Error('NOWPayments is still present in available providers after being disabled!');
    }
    console.log('✓ Test 1 passed: Disabling NOWPayments removes it from available customer providers.');

    // -------------------------------------------------------------
    // Test 2: Re-enable NOWPayments
    // -------------------------------------------------------------
    console.log('\n[Test 2] Testing NOWPayments Re-enable...');
    // Set API key environment variable for test
    process.env.NOWPAYMENTS_API_KEY = 'test_nowpay_key';
    process.env.NOWPAYMENTS_IPN_SECRET = 'test_nowpay_secret';

    const updateRes2 = await PaymentService.updateSettings(settingsWithNowEnabled);
    if (!updateRes2.success) {
      throw new Error(`Failed to re-enable NOWPayments: ${updateRes2.error}`);
    }

    const providersAfterReenable = await PaymentService.getAvailableCustomerProviders();
    const hasNowpaymentsEnabled = providersAfterReenable.some((p) => p.id === 'nowpayments');
    if (!hasNowpaymentsEnabled) {
      throw new Error('NOWPayments did not return to available providers after re-enabling!');
    }
    console.log('✓ Test 2 passed: Re-enabling NOWPayments brings it back to customer providers.');

    // -------------------------------------------------------------
    // Test 3: Paymegate Provider
    // -------------------------------------------------------------
    console.log('\n[Test 3] Testing Paymegate Provider...');
    process.env.PAYMEGATE_API_KEY = 'test_paymegate_key';
    process.env.PAYMEGATE_WEBHOOK_SECRET = 'test_paymegate_secret';

    const currentSettings3 = await PaymentService.getSettings();
    const settingsWithPaymegateEnabled: SystemPaymentSettings = {
      ...currentSettings3,
      providers: {
        ...currentSettings3.providers,
        paymegate: { id: 'paymegate', enabled: true, priority: 1 },
      },
    };
    await PaymentService.updateSettings(settingsWithPaymegateEnabled);

    const providersWithPaymegate = await PaymentService.getAvailableCustomerProviders();
    const hasPaymegate = providersWithPaymegate.some((p) => p.id === 'paymegate');
    if (!hasPaymegate) {
      throw new Error('Paymegate did not appear when configured and enabled!');
    }

    // Disable Paymegate
    const settingsWithPaymegateDisabled: SystemPaymentSettings = {
      ...currentSettings3,
      providers: {
        ...currentSettings3.providers,
        paymegate: { id: 'paymegate', enabled: false, priority: 1 },
      },
    };
    await PaymentService.updateSettings(settingsWithPaymegateDisabled);

    const providersWithoutPaymegate = await PaymentService.getAvailableCustomerProviders();
    if (providersWithoutPaymegate.some((p) => p.id === 'paymegate')) {
      throw new Error('Paymegate is still present after disabling!');
    }
    console.log('✓ Test 3 passed: Paymegate appears when enabled/configured and disappears when disabled.');

    // -------------------------------------------------------------
    // Test 5: Disable Default Provider Rejection
    // -------------------------------------------------------------
    console.log('\n[Test 5] Testing Default Provider Disable Rejection...');
    const invalidDisableDefaultSettings: SystemPaymentSettings = {
      defaultProviderId: 'giftcard',
      providers: {
        ...currentSettings3.providers,
        giftcard: { id: 'giftcard', enabled: false, priority: 8 },
      },
    };

    const invalidRes = await PaymentService.updateSettings(invalidDisableDefaultSettings);
    if (invalidRes.success) {
      throw new Error('System allowed disabling the default provider without selecting a new default!');
    }

    const settingsAfterRejectedUpdate = await PaymentService.getSettings();
    if (settingsAfterRejectedUpdate.defaultProviderId !== 'giftcard') {
      throw new Error(`System silently changed default provider to '${settingsAfterRejectedUpdate.defaultProviderId}'!`);
    }
    console.log('✓ Test 5 passed: Disabling current default provider without choosing another default is rejected.');

    // -------------------------------------------------------------
    // Test 6: Provider API Freshness
    // -------------------------------------------------------------
    console.log('\n[Test 6] Testing Provider API Freshness...');
    const settingsTest6: SystemPaymentSettings = {
      defaultProviderId: 'giftcard',
      providers: {
        ...currentSettings3.providers,
        nowpayments: { id: 'nowpayments', enabled: false, priority: 3 },
      },
    };
    await PaymentService.updateSettings(settingsTest6);

    const freshProviders = await PaymentService.getAvailableCustomerProviders();
    if (freshProviders.some((p) => p.id === 'nowpayments')) {
      throw new Error('Stale provider settings returned after update!');
    }
    console.log('✓ Test 6 passed: Provider availability returns fresh state immediately.');

    // -------------------------------------------------------------
    // Test 7: Unimplemented Providers
    // -------------------------------------------------------------
    console.log('\n[Test 7] Testing Unimplemented Provider Isolation (Norpo / BTCPay)...');
    const settingsUnimplemented: SystemPaymentSettings = {
      defaultProviderId: 'giftcard',
      providers: {
        ...currentSettings3.providers,
        norpo: { id: 'norpo', enabled: true, priority: 2 },
        btcpay: { id: 'btcpay', enabled: true, priority: 4 },
      },
    };
    await PaymentService.updateSettings(settingsUnimplemented);

    const availableProvidersUnimp = await PaymentService.getAvailableCustomerProviders();
    if (availableProvidersUnimp.some((p) => p.id === 'norpo' || p.id === 'btcpay')) {
      throw new Error('Unimplemented provider appeared in customer checkout!');
    }
    console.log('✓ Test 7 passed: Unimplemented providers never appear in customer checkout even if enabled.');

    // -------------------------------------------------------------
    // Test 8: Real Paymegate Order & Webhook Flow
    // -------------------------------------------------------------
    console.log('\n[Test 8] Testing Real Paymegate Order Creation & Webhook Reconciliation...');
    const { PaymegateAdapter } = await import('../src/lib/payments/adapters/paymegate');
    const paymegateAdapter = new PaymegateAdapter();

    process.env.PAYMEGATE_API_KEY = 'test_key';
    process.env.PAYMEGATE_WEBHOOK_SECRET = 'test_secret';
    process.env.PAYMEGATE_MOCK_MODE = 'true';

    // Setup a test customer & booking in DB
    const testCustomer = await db.customer.upsert({
      where: { email: 'paymegate_test@massaf.com' },
      update: {},
      create: {
        name: 'Paymegate Tester',
        email: 'paymegate_test@massaf.com',
        phone: '555-0199',
        isTest: true,
      },
    });

    let testService = await db.service.findFirst({ where: { isActive: true } });
    let createdTestService = false;
    if (!testService) {
      testService = await db.service.create({
        data: {
          name: 'Test Massage Service',
          description: 'Automated test service',
          durationMinutes: 60,
          price: 120.0,
          isActive: true,
        },
      });
      createdTestService = true;
    }

    const testBooking = await db.booking.create({
      data: {
        bookingNumber: `PMG-${Date.now()}`,
        customerId: testCustomer.id,
        serviceId: testService.id,
        appointmentDateTime: new Date(),
        durationMinutes: 60,
        amount: 120.0,
        paymentStatus: 'UNPAID',
        status: 'PENDING',
        isTest: true,
      },
    });

    // Create payment
    const createRes = await paymegateAdapter.createPayment({
      bookingId: testBooking.id,
      bookingNumber: testBooking.bookingNumber,
      amount: testBooking.amount,
      currency: 'USD',
      customerEmail: testCustomer.email,
      customerName: testCustomer.name,
      callbackUrl: 'https://massaf.com/callback',
      successUrl: 'https://massaf.com/success',
      cancelUrl: 'https://massaf.com/cancel',
    });

    if (!createRes.success || !createRes.checkoutUrl) {
      throw new Error(`Paymegate createPayment failed: ${createRes.error}`);
    }

    // Simulate Webhook order.paid
    const webhookRes = await paymegateAdapter.handleWebhook({
      headers: { 'x-paymegate-signature': 'test_secret' },
      body: {
        type: 'order.paid',
        status: 'PAID',
        externalId: testBooking.id,
        amount: testBooking.amount,
        orderUUID: createRes.providerPaymentId,
      },
    });

    if (!webhookRes.success) {
      throw new Error(`Paymegate handleWebhook failed: ${webhookRes.error}`);
    }

    const updatedBooking = await db.booking.findUnique({ where: { id: testBooking.id } });
    if (updatedBooking?.paymentStatus !== 'PAID' || updatedBooking?.status !== 'CONFIRMED') {
      throw new Error(`Booking status mismatch after webhook! paymentStatus=${updatedBooking?.paymentStatus}, status=${updatedBooking?.status}`);
    }

    // Cleanup test booking
    await db.booking.delete({ where: { id: testBooking.id } });
    await db.customer.delete({ where: { id: testCustomer.id } });

    console.log('✓ Test 8 passed: Paymegate order creation and webhook reconciliation verified successfully.');

    console.log('\n=== ALL PAYMENT PROVIDER SYSTEM TESTS PASSED SUCCESSFULLY! ===\n');
  } finally {
    // Restore original DB settings
    if (originalSettingsRow) {
      await db.siteContent.upsert({
        where: { key: 'payment_provider_settings_v1' },
        update: { content: originalSettingsRow.content },
        create: { key: 'payment_provider_settings_v1', title: originalSettingsRow.title, content: originalSettingsRow.content },
      });
    }
  }
}

runTests().catch((err) => {
  console.error('\n❌ PAYMENT PROVIDER TEST FAILED:', err);
  process.exit(1);
});
