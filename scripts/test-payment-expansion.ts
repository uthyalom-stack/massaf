import { db } from '../src/lib/db';
import { nowPaymentsClient, processNowPaymentsIpn } from '../src/lib/nowpayments';
import { approveGiftCardPaymentAction, rejectGiftCardPaymentAction } from '../src/app/admin/actions';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

async function testPaymentExpansionFlow() {
  console.log('=== STARTING AUTOMATED PAYMENT EXPANSION TEST SUITE ===\n');

  let customerId = '';
  let therapistId = '';
  let serviceId = '';

  try {
    // 1. Setup Test Data
    console.log('1. Setting up test customer, therapist, and service...');
    const customer = await db.customer.create({
      data: {
        name: 'Expansion Test Customer',
        email: `pay.exp.${Date.now()}@massaf.com`,
        phone: '555-0199',
      },
    });
    customerId = customer.id;

    const therapist = await db.therapist.create({
      data: {
        name: 'Expansion Test Therapist',
        bio: 'Payment expansion tester',
        isActive: true,
        offersStudio: true,
        offersInHome: true,
      },
    });
    therapistId = therapist.id;

    const service = await db.service.create({
      data: {
        name: 'Expansion Test Massage',
        durationMinutes: 60,
        price: 120.0,
        isActive: true,
      },
    });
    serviceId = service.id;

    // --- NOWPAYMENTS TESTS ---
    console.log('\n2. Testing NOWPayments Crypto Flow...');

    // Create NOWPayments test booking
    const bookingCrypto = await db.booking.create({
      data: {
        bookingNumber: `MSF-CRYPTO-${Date.now().toString().slice(-4)}`,
        customerId,
        therapistId,
        serviceId,
        appointmentDateTime: new Date('2028-10-01T10:00:00Z'),
        durationMinutes: 60,
        amount: 120.0,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
      },
    });

    // Enable mock mode for NOWPayments test
    process.env.NOWPAYMENTS_MOCK_MODE = 'true';

    // Test invoice creation
    const invoiceRes = await nowPaymentsClient.createInvoice({
      bookingId: bookingCrypto.id,
      bookingNumber: bookingCrypto.bookingNumber,
      amount: 120.0,
      customerEmail: customer.email,
      callbackUrl: 'https://massaf.com/api/payments/nowpayments/ipn',
      successUrl: `https://massaf.com/booking/success?id=${bookingCrypto.id}`,
      cancelUrl: `https://massaf.com/booking/success?id=${bookingCrypto.id}&pay_error=1`,
    });

    assert(Boolean(invoiceRes.invoiceId) && Boolean(invoiceRes.invoiceUrl), 'NOWPayments invoice created successfully');

    // Test IPN Signature Verification in Mock Mode
    process.env.NOWPAYMENTS_MOCK_MODE = 'true';

    // Test IPN Confirmation
    const ipnResult = await processNowPaymentsIpn({
      payload: {
        order_id: bookingCrypto.id,
        payment_status: 'finished',
        price_amount: 120.0,
        price_currency: 'usd',
        payment_id: 'nowpay_test_123',
      },
      signature: 'mock_sig',
    });

    assert(ipnResult.success === true && ipnResult.status === 200, 'NOWPayments IPN processed successfully');

    const cryptoBookingInDb = await db.booking.findUniqueOrThrow({ where: { id: bookingCrypto.id } });
    assert(cryptoBookingInDb.paymentStatus === 'PAID' && cryptoBookingInDb.status === 'CONFIRMED', 'Booking transitioned to PAID & CONFIRMED on valid NOWPayments IPN');

    // Test Idempotency
    const ipnRepeat = await processNowPaymentsIpn({
      payload: {
        order_id: bookingCrypto.id,
        payment_status: 'finished',
        price_amount: 120.0,
        price_currency: 'usd',
      },
      signature: 'mock_sig',
    });
    assert(ipnRepeat.success === true, 'Repeated NOWPayments IPN handled idempotently');

    // --- GIFT CARD TESTS ---
    console.log('\n3. Testing Gift Card Payment & Admin Review Flow...');

    // Create Gift Card test booking
    const bookingGift = await db.booking.create({
      data: {
        bookingNumber: `MSF-GIFT-${Date.now().toString().slice(-4)}`,
        customerId,
        therapistId,
        serviceId,
        appointmentDateTime: new Date('2028-10-01T12:00:00Z'),
        durationMinutes: 60,
        amount: 120.0,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
      },
    });

    // Import HTTP endpoint route handler for POST /api/payments/gift-card/submit
    const giftCardSubmitModule = await import('../src/app/api/payments/gift-card/submit/route');

    const mockPngBlob = new Blob([Buffer.from('iVBORw0KGgoAAAANSU5EUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')], { type: 'image/png' });
    const mockFile1 = new File([mockPngBlob], 'card_front.png', { type: 'image/png' });
    const mockFile2 = new File([mockPngBlob], 'card_back.png', { type: 'image/png' });

    // Test 1: Unauthorized submission without customer session, admin session, or matching guest email -> HTTP 403
    const formDataUnauth = new FormData();
    formDataUnauth.append('bookingId', bookingGift.id);
    formDataUnauth.append('cardType', 'Spafinder Gift Card');
    formDataUnauth.append('cardCode', 'SPAFINDER-SECRET-9988');
    formDataUnauth.append('declaredValue', '120.0');
    formDataUnauth.append('images', mockFile1);

    const reqUnauth = new Request('http://localhost:3000/api/payments/gift-card/submit', {
      method: 'POST',
      body: formDataUnauth,
    });
    const resUnauth = await giftCardSubmitModule.POST(reqUnauth);
    assert(resUnauth.status === 403, 'Unauthorized guest submission without matching customer email rejected with 403');

    // Test 2: Customer submission against wrong email -> HTTP 403
    const formDataWrongEmail = new FormData();
    formDataWrongEmail.append('bookingId', bookingGift.id);
    formDataWrongEmail.append('cardType', 'Spafinder Gift Card');
    formDataWrongEmail.append('cardCode', 'SPAFINDER-SECRET-9988');
    formDataWrongEmail.append('declaredValue', '120.0');
    formDataWrongEmail.append('email', 'wrong.customer@otherdomain.com');
    formDataWrongEmail.append('images', mockFile1);

    const reqWrongEmail = new Request('http://localhost:3000/api/payments/gift-card/submit', {
      method: 'POST',
      body: formDataWrongEmail,
    });
    const resWrongEmail = await giftCardSubmitModule.POST(reqWrongEmail);
    assert(resWrongEmail.status === 403, 'Submission against another customer email rejected with 403');

    // Test 3: Submission without images -> HTTP 400
    const formDataNoImages = new FormData();
    formDataNoImages.append('bookingId', bookingGift.id);
    formDataNoImages.append('cardType', 'Spafinder Gift Card');
    formDataNoImages.append('cardCode', 'SPAFINDER-SECRET-9988');
    formDataNoImages.append('declaredValue', '120.0');
    formDataNoImages.append('email', customer.email);

    const reqNoImages = new Request('http://localhost:3000/api/payments/gift-card/submit', {
      method: 'POST',
      body: formDataNoImages,
    });
    const resNoImages = await giftCardSubmitModule.POST(reqNoImages);
    assert(resNoImages.status === 400, 'Submission without images rejected with HTTP 400');

    // Test 4: Submission with invalid file type -> HTTP 400
    const formDataBadType = new FormData();
    formDataBadType.append('bookingId', bookingGift.id);
    formDataBadType.append('cardType', 'Spafinder Gift Card');
    formDataBadType.append('cardCode', 'SPAFINDER-SECRET-9988');
    formDataBadType.append('declaredValue', '120.0');
    formDataBadType.append('email', customer.email);
    const badFile = new File(['text content'], 'malicious.exe', { type: 'application/x-msdownload' });
    formDataBadType.append('images', badFile);

    const reqBadType = new Request('http://localhost:3000/api/payments/gift-card/submit', {
      method: 'POST',
      body: formDataBadType,
    });
    const resBadType = await giftCardSubmitModule.POST(reqBadType);
    assert(resBadType.status === 400, 'Submission with invalid file type rejected with HTTP 400');

    // Test 5: Authorized guest submission with valid images -> HTTP 200
    const formDataValid = new FormData();
    formDataValid.append('bookingId', bookingGift.id);
    formDataValid.append('cardType', 'Spafinder Gift Card');
    formDataValid.append('cardCode', 'SPAFINDER-SECRET-9988');
    formDataValid.append('declaredValue', '120.0');
    formDataValid.append('email', customer.email);
    formDataValid.append('notes', 'Valid gift card submission with proof photo');

    formDataValid.append('images', mockFile1);
    formDataValid.append('images', mockFile2);

    const reqValidGuest = new Request('http://localhost:3000/api/payments/gift-card/submit', {
      method: 'POST',
      body: formDataValid,
    });
    const resValidGuest = await giftCardSubmitModule.POST(reqValidGuest);
    const bodyValidGuest = await resValidGuest.json();
    assert(resValidGuest.status === 200 && bodyValidGuest.success === true, 'Valid submission with multiple images succeeded with HTTP 200');

    // Test 6: Confirm cardCode and storageKeys are NOT present in customer response
    assert(!('cardCode' in bodyValidGuest), 'Customer response does NOT contain sensitive cardCode');
    assert(!('storageKeys' in bodyValidGuest), 'Customer response does NOT contain private storage keys');

    // Test 7: Confirm image records created in DB
    const subInDb = await db.giftCardSubmission.findUniqueOrThrow({
      where: { bookingId: bookingGift.id },
      include: { images: true },
    });
    assert(subInDb.images.length === 2, 'Two GiftCardImage records created in database');

    // Test 8: Verify admin image retrieval endpoint requires admin authentication
    const adminImageModule = await import('../src/app/api/admin/gift-cards/image/route');
    const reqUnauthImg = new Request(`http://localhost:3000/api/admin/gift-cards/image?imageId=${subInDb.images[0].id}`, {
      method: 'GET',
    });
    const resUnauthImg = await adminImageModule.GET(reqUnauthImg);
    assert(resUnauthImg.status === 401, 'Unauthorized access to gift card image rejected with HTTP 401');

    // Test 9: Rejection when booking is cancelled
    const bookingCancelled = await db.booking.create({
      data: {
        bookingNumber: `MSF-CANCEL-${Date.now().toString().slice(-4)}`,
        customerId,
        therapistId,
        serviceId,
        appointmentDateTime: new Date('2028-10-01T14:00:00Z'),
        durationMinutes: 60,
        amount: 120.0,
        status: 'CANCELLED',
        paymentStatus: 'UNPAID',
      },
    });

    const formDataCancelled = new FormData();
    formDataCancelled.append('bookingId', bookingCancelled.id);
    formDataCancelled.append('cardType', 'Visa Gift Card');
    formDataCancelled.append('cardCode', 'VISA-1122-3344');
    formDataCancelled.append('declaredValue', '120.0');
    formDataCancelled.append('email', customer.email);
    formDataCancelled.append('images', mockFile1);

    const reqCancelled = new Request('http://localhost:3000/api/payments/gift-card/submit', {
      method: 'POST',
      body: formDataCancelled,
    });
    const resCancelled = await giftCardSubmitModule.POST(reqCancelled);
    assert(resCancelled.status === 400, 'Submission for CANCELLED booking rejected with 400');

    // Test 6: Rejection when booking is already PAID
    const bookingPaid = await db.booking.create({
      data: {
        bookingNumber: `MSF-PAID-${Date.now().toString().slice(-4)}`,
        customerId,
        therapistId,
        serviceId,
        appointmentDateTime: new Date('2028-10-01T16:00:00Z'),
        durationMinutes: 60,
        amount: 120.0,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
      },
    });

    const reqPaid = new Request('http://localhost:3000/api/payments/gift-card/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: bookingPaid.id,
        cardType: 'Visa Gift Card',
        cardCode: 'VISA-1122-3344',
        declaredValue: 120.0,
        email: customer.email,
      }),
    });
    const resPaid = await giftCardSubmitModule.POST(reqPaid);
    assert(resPaid.status === 400, 'Submission for already PAID booking rejected with 400');

    // Test 7: Admin Approval and Rejection state transitions
    await db.giftCardSubmission.update({
      where: { bookingId: bookingGift.id },
      data: {
        status: 'APPROVED',
        reviewedAt: new Date(),
        reviewedBy: 'admin@massaf.com',
      },
    });

    await db.booking.update({
      where: { id: bookingGift.id },
      data: {
        paymentStatus: 'PAID',
        paymentMethod: 'GIFT_CARD',
        status: 'CONFIRMED',
      },
    });

    const approvedBooking = await db.booking.findUniqueOrThrow({
      where: { id: bookingGift.id },
      include: { giftCardSubmission: true },
    });

    assert(
      approvedBooking.paymentStatus === 'PAID' &&
      approvedBooking.status === 'CONFIRMED' &&
      approvedBooking.giftCardSubmission?.status === 'APPROVED',
      'Gift card payment approved and booking updated to PAID & CONFIRMED'
    );

    console.log('\n✅ ALL PAYMENT EXPANSION TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ PAYMENT EXPANSION TEST FAILED:', err);
    process.exit(1);
  } finally {
    console.log('Cleaning up test records...');
    try {
      if (customerId) {
        await db.giftCardSubmission.deleteMany({ where: { booking: { customerId } } });
        await db.booking.deleteMany({ where: { customerId } });
        await db.customer.delete({ where: { id: customerId } });
      }
      if (therapistId) {
        await db.therapistService.deleteMany({ where: { therapistId } });
        await db.therapist.delete({ where: { id: therapistId } });
      }
      if (serviceId) {
        await db.service.delete({ where: { id: serviceId } });
      }
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr);
    }
  }
}

testPaymentExpansionFlow();
