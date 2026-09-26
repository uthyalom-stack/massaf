import { db } from '../src/lib/db';
import {
  parseAndPreviewTherapistCsv,
  parseAvailabilityScheduleString,
} from '../src/lib/therapist-import';
import { executeTherapistCsvImportAction } from '../src/app/admin/actions';

async function runPermissiveCsvImportTests() {
  console.log('=== RUNNING PERMISSIVE CSV THERAPIST IMPORT TEST SUITE ===\n');

  process.env.MASSAF_AUTH_SECRET = 'test-secret-123456789012345678901234567890';
  process.env.TURSO_DATABASE_URL = 'file:./prisma/dev.db';

  let admin = await db.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true } });
  if (!admin) {
    admin = await db.user.create({
      data: {
        email: 'csv_test_admin@massaf.com',
        name: 'CSV Test Admin',
        role: 'SUPER_ADMIN',
        isActive: true,
      },
    });
  }

  const { createSessionToken } = await import('../src/lib/auth-session');
  const token = createSessionToken(admin.id, admin.email, 'ADMIN', 24, admin.role);
  (globalThis as any).__TEST_ADMIN_SESSION_TOKEN__ = token;

  const createdTherapistIds: string[] = [];

  try {
    // 1. Name only imports successfully
    console.log('Test 1: Name only imports successfully...');
    const csv1 = `Full Name\nJane Doe Only Name`;
    const preview1 = await parseAndPreviewTherapistCsv(csv1);
    if (preview1.rows[0].errors.length > 0 || preview1.rows[0].classification === 'INVALID') {
      throw new Error(`Name only should be valid, got errors: ${preview1.rows[0].errors.join(', ')}`);
    }
    const exec1 = await executeTherapistCsvImportAction({
      rows: [{ ...preview1.rows[0], actionChoice: 'CREATE' }],
    });
    if (!exec1.success || exec1.report?.createdCount !== 1) {
      throw new Error(`Execution failed for name-only row: ${JSON.stringify(exec1)}`);
    }
    const created1 = await db.therapist.findFirst({ where: { name: 'Jane Doe Only Name' } });
    if (!created1) throw new Error('Therapist record not found in DB for Test 1');
    createdTherapistIds.push(created1.id);
    console.log('[PASS] Name only imported successfully\n');

    // 2. Name + email imports successfully
    console.log('Test 2: Name + email imports successfully...');
    const csv2 = `Full Name,Email\nJane Doe Email,jane.email@test.com`;
    const preview2 = await parseAndPreviewTherapistCsv(csv2);
    if (preview2.rows[0].errors.length > 0) throw new Error('Name + email should be valid');
    const exec2 = await executeTherapistCsvImportAction({
      rows: [{ ...preview2.rows[0], actionChoice: 'CREATE' }],
    });
    if (!exec2.success || exec2.report?.createdCount !== 1) throw new Error('Execution failed for Test 2');
    const created2 = await db.therapist.findFirst({ where: { name: 'Jane Doe Email' } });
    if (!created2) throw new Error('Therapist record not found in DB for Test 2');
    createdTherapistIds.push(created2.id);
    console.log('[PASS] Name + email imported successfully\n');

    // 3. Name + phone imports successfully
    console.log('Test 3: Name + phone imports successfully...');
    const csv3 = `Full Name,Phone\nJane Doe Phone,+15551112222`;
    const preview3 = await parseAndPreviewTherapistCsv(csv3);
    if (preview3.rows[0].errors.length > 0) throw new Error('Name + phone should be valid');
    const exec3 = await executeTherapistCsvImportAction({
      rows: [{ ...preview3.rows[0], actionChoice: 'CREATE' }],
    });
    if (!exec3.success || exec3.report?.createdCount !== 1) throw new Error('Execution failed for Test 3');
    const created3 = await db.therapist.findFirst({ where: { name: 'Jane Doe Phone' } });
    if (!created3) throw new Error('Therapist record not found in DB for Test 3');
    createdTherapistIds.push(created3.id);
    console.log('[PASS] Name + phone imported successfully\n');

    // 4. Missing email does not fail
    console.log('Test 4: Missing email does not fail...');
    const csv4 = `Full Name,Phone,Bio\nJane Doe No Email,+15553334444,Some Bio`;
    const preview4 = await parseAndPreviewTherapistCsv(csv4);
    if (preview4.rows[0].email !== null) throw new Error('Email should be null');
    const exec4 = await executeTherapistCsvImportAction({
      rows: [{ ...preview4.rows[0], actionChoice: 'CREATE' }],
    });
    if (!exec4.success || exec4.report?.createdCount !== 1) throw new Error('Execution failed for Test 4');
    const created4 = await db.therapist.findFirst({ where: { name: 'Jane Doe No Email' } });
    if (!created4) throw new Error('Therapist record not found in DB for Test 4');
    createdTherapistIds.push(created4.id);
    console.log('[PASS] Missing email does not fail\n');

    // 5. Missing phone does not fail
    console.log('Test 5: Missing phone does not fail...');
    const csv5 = `Full Name,Email,Bio\nJane Doe No Phone,jane.nophone@test.com,Some Bio`;
    const preview5 = await parseAndPreviewTherapistCsv(csv5);
    if (preview5.rows[0].phone !== null) throw new Error('Phone should be null');
    const exec5 = await executeTherapistCsvImportAction({
      rows: [{ ...preview5.rows[0], actionChoice: 'CREATE' }],
    });
    if (!exec5.success || exec5.report?.createdCount !== 1) throw new Error('Execution failed for Test 5');
    const created5 = await db.therapist.findFirst({ where: { name: 'Jane Doe No Phone' } });
    if (!created5) throw new Error('Therapist record not found in DB for Test 5');
    createdTherapistIds.push(created5.id);
    console.log('[PASS] Missing phone does not fail\n');

    // 6. Missing availability does not fail
    console.log('Test 6: Missing availability does not fail...');
    const csv6 = `Full Name,Email\nJane Doe No Availability,jane.noavail@test.com`;
    const preview6 = await parseAndPreviewTherapistCsv(csv6);
    if (preview6.rows[0].parsedAvailabilities.length !== 0) throw new Error('Availability should be empty');
    const exec6 = await executeTherapistCsvImportAction({
      rows: [{ ...preview6.rows[0], actionChoice: 'CREATE' }],
    });
    if (!exec6.success || exec6.report?.createdCount !== 1) throw new Error('Execution failed for Test 6');
    const created6 = await db.therapist.findFirst({ where: { name: 'Jane Doe No Availability' } });
    if (!created6) throw new Error('Therapist record not found in DB for Test 6');
    createdTherapistIds.push(created6.id);
    console.log('[PASS] Missing availability does not fail\n');

    // 7. Missing services does not fail
    console.log('Test 7: Missing services does not fail...');
    const csv7 = `Full Name,Email\nJane Doe No Services,jane.noservices@test.com`;
    const preview7 = await parseAndPreviewTherapistCsv(csv7);
    if (preview7.rows[0].matchedServiceIds.length !== 0) throw new Error('Matched services should be empty');
    const exec7 = await executeTherapistCsvImportAction({
      rows: [{ ...preview7.rows[0], actionChoice: 'CREATE' }],
    });
    if (!exec7.success || exec7.report?.createdCount !== 1) throw new Error('Execution failed for Test 7');
    const created7 = await db.therapist.findFirst({ where: { name: 'Jane Doe No Services' } });
    if (!created7) throw new Error('Therapist record not found in DB for Test 7');
    createdTherapistIds.push(created7.id);
    console.log('[PASS] Missing services does not fail\n');

    // 8. Empty Services field does not produce an "unmatched service(s): 0" error
    console.log('Test 8: Empty Services field does not produce "unmatched service(s): 0" error...');
    const csv8 = `Full Name,Services\nJane Doe Empty Service,`;
    const preview8 = await parseAndPreviewTherapistCsv(csv8);
    if (preview8.rows[0].unmatchedServices.length !== 0) {
      throw new Error(`Unmatched services should be empty, got: ${JSON.stringify(preview8.rows[0].unmatchedServices)}`);
    }
    const exec8 = await executeTherapistCsvImportAction({
      rows: [{ ...preview8.rows[0], actionChoice: 'CREATE' }],
    });
    if (!exec8.success || exec8.report?.createdCount !== 1) {
      throw new Error(`Execution failed for empty service field: ${JSON.stringify(exec8)}`);
    }
    const created8 = await db.therapist.findFirst({ where: { name: 'Jane Doe Empty Service' } });
    if (!created8) throw new Error('Therapist record not found in DB for Test 8');
    createdTherapistIds.push(created8.id);
    console.log('[PASS] Empty Services field handled correctly without errors\n');

    // 9. Unknown service does not prevent therapist creation
    console.log('Test 9: Unknown service does not prevent therapist creation...');
    const csv9 = `Full Name,Services\nJane Doe Unknown Service,Nonexistent Magical Massage`;
    const preview9 = await parseAndPreviewTherapistCsv(csv9);
    const exec9 = await executeTherapistCsvImportAction({
      rows: [{ ...preview9.rows[0], actionChoice: 'CREATE' }],
    });
    if (!exec9.success || exec9.report?.createdCount !== 1) {
      throw new Error(`Unknown service should not prevent therapist creation, got: ${JSON.stringify(exec9)}`);
    }
    const created9 = await db.therapist.findFirst({ where: { name: 'Jane Doe Unknown Service' } });
    if (!created9) throw new Error('Therapist record not found in DB for Test 9');
    createdTherapistIds.push(created9.id);
    console.log('[PASS] Unknown service ignored and therapist created successfully\n');

    // 10. Duplicate email values across multiple CSV rows are allowed
    console.log('Test 10: Duplicate email values across multiple CSV rows are allowed...');
    const csv10 = `Full Name,Email\nDup Email 1,shared.email@test.com\nDup Email 2,shared.email@test.com`;
    const preview10 = await parseAndPreviewTherapistCsv(csv10);
    const exec10 = await executeTherapistCsvImportAction({
      rows: preview10.rows.map((r) => ({ ...r, actionChoice: 'CREATE' as const })),
    });
    if (!exec10.success || exec10.report?.createdCount !== 2) {
      throw new Error(`Expected 2 created therapists for duplicate email test, got: ${JSON.stringify(exec10)}`);
    }
    const created10A = await db.therapist.findFirst({ where: { name: 'Dup Email 1' } });
    const created10B = await db.therapist.findFirst({ where: { name: 'Dup Email 2' } });
    if (!created10A || !created10B) throw new Error('Therapist records not found in DB for Test 10');
    createdTherapistIds.push(created10A.id, created10B.id);
    console.log('[PASS] Duplicate email values across CSV rows successfully created\n');

    // 11. Duplicate phone values across multiple CSV rows are allowed
    console.log('Test 11: Duplicate phone values across multiple CSV rows are allowed...');
    const csv11 = `Full Name,Phone\nDup Phone 1,+15559990000\nDup Phone 2,+15559990000`;
    const preview11 = await parseAndPreviewTherapistCsv(csv11);
    const exec11 = await executeTherapistCsvImportAction({
      rows: preview11.rows.map((r) => ({ ...r, actionChoice: 'CREATE' as const })),
    });
    if (!exec11.success || exec11.report?.createdCount !== 2) {
      throw new Error(`Expected 2 created therapists for duplicate phone test, got: ${JSON.stringify(exec11)}`);
    }
    const created11A = await db.therapist.findFirst({ where: { name: 'Dup Phone 1' } });
    const created11B = await db.therapist.findFirst({ where: { name: 'Dup Phone 2' } });
    if (!created11A || !created11B) throw new Error('Therapist records not found in DB for Test 11');
    createdTherapistIds.push(created11A.id, created11B.id);
    console.log('[PASS] Duplicate phone values across CSV rows successfully created\n');

    // 12. A row with no name is rejected
    console.log('Test 12: A row with no name is rejected...');
    const csv12 = `Full Name,Email\n,noname@test.com`;
    const preview12 = await parseAndPreviewTherapistCsv(csv12);
    if (preview12.rows[0].classification !== 'INVALID' || preview12.rows[0].errors.length === 0) {
      throw new Error('Row with missing name must be classified as INVALID');
    }
    const exec12 = await executeTherapistCsvImportAction({
      rows: [{ ...preview12.rows[0], actionChoice: 'CREATE' }],
    });
    if (exec12.report?.createdCount !== 0) {
      throw new Error('Missing name row must not be created');
    }
    console.log('[PASS] Row with no name correctly rejected\n');

  } finally {
    // Cleanup
    if (createdTherapistIds.length > 0) {
      await db.therapistService.deleteMany({ where: { therapistId: { in: createdTherapistIds } } });
      await db.therapistAvailability.deleteMany({ where: { therapistId: { in: createdTherapistIds } } });
      await db.therapistPhoto.deleteMany({ where: { therapistId: { in: createdTherapistIds } } });
      await db.therapist.deleteMany({ where: { id: { in: createdTherapistIds } } });
    }
  }

  console.log('====================================================');
  console.log('  ALL PERMISSIVE CSV IMPORT TESTS PASSED!');
  console.log('====================================================');
}

runPermissiveCsvImportTests().catch((err) => {
  console.error('\nError running permissive CSV import test suite:', err);
  process.exit(1);
});
