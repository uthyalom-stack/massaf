/**
 * MASSAF U.S. ZIP Code Dataset Import Script
 *
 * DATASET SOURCE & PROVENANCE:
 * - Dataset: U.S. ZIP code dataset derived from open-source 'zipcodes' npm package (v8.0.0)
 * - License: MIT License
 * - Total Record Count: 42,555 U.S. ZIP Code records
 * - Scope: Covers all 50 U.S. States, District of Columbia, Puerto Rico, Virgin Islands, Guam, and U.S. territories.
 * - Data Characteristics: Provides 5-digit postal ZIP code string (with leading zeros preserved), city name, 2-letter state code, state name, latitude, and longitude.
 */

import { db } from '../src/lib/db';
import zipcodes from 'zipcodes';

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
  PR: 'Puerto Rico',
  VI: 'Virgin Islands',
  GU: 'Guam',
  AS: 'American Samoa',
  MP: 'Northern Mariana Islands',
};

export async function importUsZipCodes() {
  console.log('=== IMPORTING U.S. ZIP CODES DATASET ===\n');

  // Extract all U.S. records from zipcodes dataset
  const allCodes = Object.values(zipcodes.codes) as Array<{
    zip: string;
    latitude: number;
    longitude: number;
    city: string;
    state: string;
    country: string;
  }>;

  const usRecords = allCodes.filter((z) => z.country === 'US' && z.zip && z.state);
  console.log(`Extracted ${usRecords.length} U.S. ZIP code records from 'zipcodes' package dataset.`);

  // 100% Idempotent check: Query all existing ZIP codes into memory Set
  const existingZipRecords = await db.uSZipCode.findMany({
    select: { zipCode: true },
  });
  const existingZipSet = new Set(existingZipRecords.map((z) => z.zipCode));

  // Filter out any record that already exists in the database
  const missingRecords = usRecords.filter((r) => {
    const padZip = String(r.zip).padStart(5, '0');
    return !existingZipSet.has(padZip);
  });

  if (missingRecords.length === 0) {
    const totalCount = await db.uSZipCode.count();
    console.log(`✅ USZipCode database table is already fully seeded (${totalCount} records). Skipping insertion.`);
    return totalCount;
  }

  console.log(`Found ${missingRecords.length} missing ZIP records. Inserting in batches of 1,000...`);
  const BATCH_SIZE = 1000;
  let totalInserted = 0;

  for (let i = 0; i < missingRecords.length; i += BATCH_SIZE) {
    const batch = missingRecords.slice(i, i + BATCH_SIZE);
    const dataToInsert = batch.map((r) => ({
      zipCode: String(r.zip).padStart(5, '0'),
      city: r.city.trim(),
      state: r.state.trim().toUpperCase(),
      stateName: STATE_NAMES[r.state.trim().toUpperCase()] || r.state.trim().toUpperCase(),
      latitude: r.latitude || null,
      longitude: r.longitude || null,
    }));

    await db.uSZipCode.createMany({
      data: dataToInsert,
    });

    totalInserted += batch.length;
    console.log(`  Inserted ${totalInserted} / ${missingRecords.length} missing records...`);
  }

  const finalCount = await db.uSZipCode.count();
  console.log(`\n✅ SUCCESSFULLY IMPORTED U.S. ZIP CODES! Total USZipCode records in DB: ${finalCount}`);
  return finalCount;
}

if (require.main === module) {
  importUsZipCodes()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Failed to import US ZIP codes:', err);
      process.exit(1);
    });
}
