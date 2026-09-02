import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

async function main() {
  const inputPath = path.join(
    process.cwd(),
    "data",
    "cleaned",
    "animal311-cleaned.json"
  );

  const records: CleanRecord[] = JSON.parse(
    fs.readFileSync(inputPath, "utf-8")
  );

  console.log(`Loaded ${records.length} cleaned records.`);

  const BATCH_SIZE = 500;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    await prisma.report.createMany({
      data: batch.map((record) => ({
        id: record.id,
        rawType: record.rawType,
        category: record.category,
        date: new Date(record.date),
        neighbourhood: record.neighbourhood,
        ward: record.ward ?? null,
        lat: record.lat,
        lng: record.lng,
      })),
      skipDuplicates: true,
    });

    console.log(
      `Inserted batch ${i + 1} - ${Math.min(i + BATCH_SIZE, records.length)}`
    );
  }

  const total = await prisma.report.count();

  console.log("\nSeeding complete.");
  console.log(`Total reports now in database: ${total}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });