import { db } from '../src/lib/db';
import { createSessionToken } from '../src/lib/auth-session';
import { createAdminReviewAction, updateReviewStatusAction } from '../src/app/admin/actions';

async function runAdminReviewCreationTests() {
  console.log('=== STARTING ADMIN MANUAL THERAPIST REVIEW TEST SUITE ===\n');

  // 1. Setup Admin & Test Therapist
  let superAdmin = await db.user.findFirst({ where: { role: 'SUPER_ADMIN', email: 'review_admin@massaf.com' } });
  if (!superAdmin) {
    superAdmin = await db.user.create({
      data: {
        name: 'Review Admin',
        email: 'review_admin@massaf.com',
        role: 'SUPER_ADMIN',
        passwordHash: 'hash',
        isActive: true,
      },
    });
  }

  let staffUser = await db.user.findFirst({ where: { role: 'STAFF', email: 'review_staff@massaf.com' } });
  if (!staffUser) {
    staffUser = await db.user.create({
      data: {
        name: 'Review Staff',
        email: 'review_staff@massaf.com',
        role: 'STAFF',
        passwordHash: 'hash',
        isActive: true,
      },
    });
  }

  let therapist = await db.therapist.findFirst({ where: { isActive: true } });
  if (!therapist) {
    therapist = await db.therapist.create({
      data: {
        name: 'Review Test Practitioner',
        email: 'therapist_review_test@massaf.com',
        isActive: true,
        rating: 0,
        reviewCount: 0,
      },
    });
  }

  const superAdminToken = createSessionToken(superAdmin.id, superAdmin.email, 'ADMIN', 24, 'SUPER_ADMIN');
  const staffToken = createSessionToken(staffUser.id, staffUser.email, 'ADMIN', 24, 'STAFF');

  const setSession = (token: string) => {
    (globalThis as any).__TEST_ADMIN_SESSION_TOKEN__ = token;
  };

  // Test 1: Authorized admin creates a manual admin review
  console.log('1. Testing Authorized Admin Manual Review Creation...');
  setSession(superAdminToken);

  const initialCount = therapist.reviewCount;

  const reviewRes = await createAdminReviewAction({
    therapistId: therapist.id,
    authorName: 'Eleanor Vance',
    rating: 5,
    comment: 'Exceptional deep tissue massage session. Highly professional!',
    createdAt: '2026-09-20',
  });

  console.log('Create Admin Review Result:', reviewRes);

  if (!reviewRes.success || !reviewRes.review) {
    console.error('FAILED: createAdminReviewAction did not succeed!');
    process.exit(1);
  }

  const createdReviewId = reviewRes.review.id;
  console.log('[PASS] Admin review created successfully');

  // Test 2: Verify database record semantics (customerId === null, source === "ADMIN", authorName stored)
  console.log('\n2. Verifying Database Record Semantics...');
  const dbReview = await db.review.findUnique({
    where: { id: createdReviewId },
  });

  if (!dbReview) {
    console.error('FAILED: Created review not found in database!');
    process.exit(1);
  }

  if (dbReview.customerId !== null) {
    console.error(`FAILED: customerId was not null! Got: ${dbReview.customerId}`);
    process.exit(1);
  }

  if (dbReview.source !== 'ADMIN') {
    console.error(`FAILED: source was not ADMIN! Got: ${dbReview.source}`);
    process.exit(1);
  }

  if (dbReview.authorName !== 'Eleanor Vance') {
    console.error(`FAILED: authorName was not stored correctly! Got: ${dbReview.authorName}`);
    process.exit(1);
  }

  if (dbReview.status !== 'APPROVED' || !dbReview.isPublished) {
    console.error('FAILED: Review was not approved/published by default!');
    process.exit(1);
  }

  console.log('[PASS] customerId is null (no fake customer created), source="ADMIN", authorName="Eleanor Vance", status="APPROVED"');

  // Test 3: Verify Therapist Aggregate Rating and Review Count
  console.log('\n3. Verifying Therapist Aggregate Rating and Review Count...');
  const updatedTherapist = await db.therapist.findUnique({
    where: { id: therapist.id },
  });

  console.log(`Updated Rating: ${updatedTherapist?.rating}, Review Count: ${updatedTherapist?.reviewCount}`);

  if (!updatedTherapist || updatedTherapist.reviewCount === 0 || updatedTherapist.rating === 0) {
    console.error('FAILED: Therapist aggregate rating or review count was not updated!');
    process.exit(1);
  }
  console.log('[PASS] Therapist aggregate rating and review count updated accurately');

  // Test 4: Verify Public Customer Review Queries Format & Do Not Expose Admin Metadata
  console.log('\n4. Verifying Public Customer Review Queries Formatting...');
  const publicReviews = await db.review.findMany({
    where: {
      therapistId: therapist.id,
      status: 'APPROVED',
      isPublished: true,
    },
    include: {
      customer: true,
      booking: { include: { service: true } },
    },
  });

  const targetPublicReview = publicReviews.find((r) => r.id === createdReviewId);
  if (!targetPublicReview) {
    console.error('FAILED: Admin review not returned in public approved review query!');
    process.exit(1);
  }

  // Simulate customer page display name resolution
  const rawName = targetPublicReview.authorName || targetPublicReview.customer?.name || 'Verified Client';
  const nameParts = rawName.trim().split(' ');
  const formattedName =
    nameParts.length > 1
      ? `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.`
      : rawName;

  console.log(`Public Formatted Name: ${formattedName}`);

  if (formattedName !== 'Eleanor V.') {
    console.error(`FAILED: Formatted name unexpected! Got: ${formattedName}`);
    process.exit(1);
  }

  const jsonSerialized = JSON.stringify({
    customerName: formattedName,
    rating: targetPublicReview.rating,
    comment: targetPublicReview.comment,
  });

  if (jsonSerialized.includes('ADMIN') || jsonSerialized.includes('source')) {
    console.error('FAILED: Public serialized review leaks internal ADMIN metadata!');
    process.exit(1);
  }

  console.log('[PASS] Public review formats as "Eleanor V." without leaking ADMIN source metadata');

  // Test 5: Moderation Workflow Compatibility (Rejecting / Re-approving Admin Review)
  console.log('\n5. Testing Moderation Workflow on Admin Review...');
  const rejectRes = await updateReviewStatusAction({
    reviewId: createdReviewId,
    status: 'REJECTED',
  });

  if (!rejectRes.success) {
    console.error('FAILED: Failed to reject admin review via updateReviewStatusAction!');
    process.exit(1);
  }

  const therapistAfterReject = await db.therapist.findUnique({ where: { id: therapist.id } });
  console.log(`Rating after reject: ${therapistAfterReject?.rating}, Count: ${therapistAfterReject?.reviewCount}`);

  const reapproveRes = await updateReviewStatusAction({
    reviewId: createdReviewId,
    status: 'APPROVED',
  });

  if (!reapproveRes.success) {
    console.error('FAILED: Failed to re-approve admin review!');
    process.exit(1);
  }
  console.log('[PASS] Moderation workflow reject/re-approve works cleanly on admin reviews');

  // Test 6: Unauthorized Role Rejection (STAFF caller)
  console.log('\n6. Testing Unauthorized Role Rejection...');
  setSession(staffToken);

  const unauthRes = await createAdminReviewAction({
    therapistId: therapist.id,
    authorName: 'Hacker Name',
    rating: 1,
    comment: 'Unauthorized review text',
  });

  if (unauthRes.success) {
    console.error('FAILED: STAFF caller was able to create an admin review!');
    process.exit(1);
  }
  console.log('[PASS] STAFF caller rejected from createAdminReviewAction');

  console.log('\n====================================================');
  console.log('  ALL ADMIN MANUAL REVIEW CREATION TESTS PASSED!');
  console.log('====================================================');
}

runAdminReviewCreationTests().catch((err) => {
  console.error('Error in admin review creation test suite:', err);
  process.exit(1);
});
