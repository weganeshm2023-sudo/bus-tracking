import "dotenv/config";

import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is missing. Check D:\\bus-tracking\\.env",
  );
}

const DATABASE_URL = databaseUrl;

const pool = new Pool({
  connectionString: DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
});

function getIndiaDate(value: Date): Date {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(value);

  const year = Number(
    parts.find((p) => p.type === "year")?.value,
  );

  const month = Number(
    parts.find((p) => p.type === "month")?.value,
  );

  const day = Number(
    parts.find((p) => p.type === "day")?.value,
  );

  return new Date(
    Date.UTC(year, month - 1, day, 0, 0, 0, 0),
  );
}

async function main() {
  console.log("========================================");
  console.log("Trip Date Backfill");
  console.log("Timezone: Asia/Kolkata");
  console.log("========================================");
  console.log("");

  console.log(
    "DATABASE_URL loaded:",
    DATABASE_URL.replace(
      /:\/\/([^:]+):([^@]+)@/,
      "://$1:****@",
    ),
  );

  console.log("");

  const trips = await prisma.trip.findMany({
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      tripId: true,
      status: true,
      startedAt: true,
      createdAt: true,
      tripDate: true,
    },
  });

  console.log(`Found ${trips.length} trip(s).`);
  console.log("");

  let updated = 0;
  let skipped = 0;

  for (const trip of trips) {
    if (trip.tripDate) {
      console.log(
        `[SKIP] ${trip.tripId} already has tripDate: ${trip.tripDate.toISOString()}`,
      );

      skipped++;
      continue;
    }

    const sourceDate =
      trip.startedAt ?? trip.createdAt;

    const tripDate =
      getIndiaDate(sourceDate);

    await prisma.trip.update({
      where: {
        id: trip.id,
      },
      data: {
        tripDate,
      },
    });

    console.log(
      `[UPDATE] ${trip.tripId} | ${trip.status} | ${sourceDate.toISOString()} -> ${tripDate.toISOString()}`,
    );

    updated++;
  }

  console.log("");
  console.log("========================================");
  console.log("Backfill completed");
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log("========================================");
}

main()
  .catch((error) => {
    console.error("");
    console.error("BACKFILL FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });