import fs from "fs";
import path from "path";

const BASE_URL = "https://data.winnipeg.ca/resource/u7f6-5326.json";

const TYPES = [
  "Dog or Cat Running at Large",
  "Dog/Cat/Other Pet Running at Large",
  "Pick Up Stray Dog",
  "Lost Dog",
  "Found Cat",
  "Found Licensed Dog",
  "Found Unlicensed Dog",
  "Sick or Injured Dog or Cat",
  "Sick or Injured Domestic Animal",
  "Surrender Animal to Animal Services Inquiry",
  "Surrender Inquiry",
  "Abandoned Animal",
  "Abandoned Animal Report",
  "Too Many Cats/Dogs",
  "Excess Animals",
  "Outdoor unsheltered Dog Concern/Report",
  "Dog or Cat Biting Complaint",
  "Vicious Dog",
  "Aggressive Cat",
  "Other Animals Running at Large",
];

const BATCH_SIZE = 50000;

async function download311() {
  const allRecords: any[] = [];
  let offset = 0;

  while (true) {
    const typeList = TYPES.map((type) => `'${type.replace(/'/g, "''")}'`).join(",");

    const where = `
      reason = 'Animal Services Agency'
      AND open_date >= '2024-01-01T00:00:00'
      AND type IN (${typeList})
    `;

    const url = new URL(BASE_URL);

    url.searchParams.set(
      "$select",
      "case_id,type,open_date,neighbourhood,ward,geometry"
    );

    url.searchParams.set("$where", where);
    url.searchParams.set("$limit", BATCH_SIZE.toString());
    url.searchParams.set("$offset", offset.toString());
    url.searchParams.set("$order", "open_date ASC");

    console.log(`Downloading rows ${offset} - ${offset + BATCH_SIZE}...`);

    const response = await fetch(url.toString());

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Request failed: ${response.status}\n${text}`);
    }

    const records = await response.json();

    allRecords.push(...records);

    console.log(`Downloaded ${records.length} rows`);

    if (records.length < BATCH_SIZE) {
      break;
    }

    offset += BATCH_SIZE;
  }

  const outputPath = path.join(
    process.cwd(),
    "data",
    "raw",
    "animal311.json"
  );

  fs.writeFileSync(
    outputPath,
    JSON.stringify(allRecords, null, 2),
    "utf-8"
  );

  console.log(`\nDone.`);
  console.log(`Total records: ${allRecords.length}`);
  console.log(`Saved to: ${outputPath}`);
}

download311().catch((error) => {
  console.error(error);
  process.exit(1);
});