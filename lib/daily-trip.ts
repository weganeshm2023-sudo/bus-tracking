import { prisma } from "@/lib/prisma";

const INDIA_TIME_ZONE = "Asia/Kolkata";

function getIndiaDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);

  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
    day: Number(parts.find((p) => p.type === "day")?.value),
  };
}

export function getTodayTripDate(date = new Date()): Date {
  const { year, month, day } = getIndiaDateParts(date);

  return new Date(
    Date.UTC(year, month - 1, day, 0, 0, 0, 0),
  );
}

function createTripPublicId() {
  const random = Math.random()
    .toString(36)
    .substring(2, 10)
    .toUpperCase();

  return `TRIP-${random}`;
}

export async function getOrCreateTodayTrip({
  busId,
  driverId,
  routeId,
}: {
  busId: string;
  driverId: string;
  routeId: string;
}) {
  const tripDate = getTodayTripDate();

  /*
   * First check today's RUNNING/SCHEDULED trip.
   */
  const existingActiveTrip =
    await prisma.trip.findFirst({
      where: {
        busId,
        driverId,
        routeId,
        tripDate,
        status: {
          in: ["SCHEDULED", "RUNNING"],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

  if (existingActiveTrip) {
    return existingActiveTrip;
  }

  /*
   * If today's trip was already completed/cancelled,
   * do not create another daily trip.
   */
  const existingTodayTrip =
    await prisma.trip.findFirst({
      where: {
        busId,
        driverId,
        routeId,
        tripDate,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

  if (existingTodayTrip) {
    return existingTodayTrip;
  }

  /*
   * Create today's new trip.
   */
  const trip = await prisma.trip.create({
    data: {
      tripId: createTripPublicId(),
      busId,
      driverId,
      routeId,
      tripDate,
      status: "SCHEDULED",
    },
  });

  return trip;
}