import fs from "fs";
import path from "path";

type RawRecord = {
  case_id: string;
  type: string;
  open_date: string;
  neighbourhood?: string;
  ward?: string;
  geometry?: {
    type: string;
    coordinates: [number, number];
  };
};

type CleanRecord = {
  id: string;
  rawType: string;
  category: string;
  date: string;
  neighbourhood: string;
  ward?: string;
  lat: number;
  lng: number;
};

const CATEGORY_MAP: Record<string, string> = {
  "Dog or Cat Running at Large": "stray_roaming",
  "Dog/Cat/Other Pet Running at Large": "stray_roaming",
  "Pick Up Stray Dog": "stray_roaming",
  "Other Animals Running at Large": "stray_roaming",

  "Lost Dog": "lost_found",
  "Found Cat": "lost_found",
  "Found Licensed Dog": "lost_found",
  "Found Unlicensed Dog": "lost_found",

  "Sick or Injured Dog or Cat": "welfare_distress",
  "Sick or Injured Domestic Animal": "welfare_distress",
  "Abandoned Animal": "welfare_distress",
  "Abandoned Animal Report": "welfare_distress",
  "Outdoor unsheltered Dog Concern/Report": "welfare_distress",

  "Surrender Animal to Animal Services Inquiry": "surrender_capacity",
  "Surrender Inquiry": "surrender_capacity",
  "Too Many Cats/Dogs": "surrender_capacity",
  "Excess Animals": "surrender_capacity",

  "Dog or Cat Biting Complaint": "safety_complaint",
  "Vicious Dog": "safety_complaint",
  "Aggressive Cat": "safety_complaint",
};

function clean311() {
  const inputPath = path.join(
    process.cwd(),
    "data",
    "raw",
    "animal311.json"
  );

  const outputPath = path.join(
    process.cwd(),
    "data",
    "cleaned",
    "animal311-cleaned.json"
  );

  const rawData: RawRecord[] = JSON.parse(
    fs.readFileSync(inputPath, "utf-8")
  );

  const cleaned: CleanRecord[] = [];

  let skippedMissingLocation = 0;
  let skippedUnknownCategory = 0;

  for (const record of rawData) {
    const category = CATEGORY_MAP[record.type];

    if (!category) {
      skippedUnknownCategory++;
      continue;
    }

    if (
      !record.neighbourhood ||
      !record.geometry ||
      !record.geometry.coordinates
    ) {
      skippedMissingLocation++;
      continue;
    }

    const [lng, lat] = record.geometry.coordinates;

    cleaned.push({
      id: record.case_id,
      rawType: record.type,
      category,
      date: record.open_date.split("T")[0],
      neighbourhood: record.neighbourhood,
      ward: record.ward,
      lat,
      lng,
    });
  }

  fs.writeFileSync(
    outputPath,
    JSON.stringify(cleaned, null, 2),
    "utf-8"
  );

  console.log("Cleaning complete.");
  console.log(`Raw records: ${rawData.length}`);
  console.log(`Clean records: ${cleaned.length}`);
  console.log(`Missing location: ${skippedMissingLocation}`);
  console.log(`Unknown category: ${skippedUnknownCategory}`);
  console.log(`Saved to: ${outputPath}`);
}

clean311();