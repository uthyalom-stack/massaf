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
  console.log('=== IMPORTING OFFICIAL USPS U.S. ZIP CODES DATASET ===\n');

  // Extract all U.S. records from zipcodes dataset (MIT License)
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

  // Check how many records already exist in USZipCode table
  const existingCount = await db.uSZipCode.count();
  if (existingCount >= usRecords.length) {
    console.log(`✅ USZipCode table already fully seeded (${existingCount} records). Skipping import.`);
    return existingCount;
  }

  console.log('Inserting ZIP records in batches of 1,000...');
  const BATCH_SIZE = 1000;
  let totalInserted = 0;

  for (let i = 0; i < usRecords.length; i += BATCH_SIZE) {
    const batch = usRecords.slice(i, i + BATCH_SIZE);
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
    if (totalInserted % 5000 === 0 || totalInserted === usRecords.length) {
      console.log(`  Processed ${totalInserted} / ${usRecords.length} records...`);
    }
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
