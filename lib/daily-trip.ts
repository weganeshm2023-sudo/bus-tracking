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
    year: Number(
      parts.find((p) => p.type === "year")?.value
    ),
    month: Number(
      parts.find((p) => p.type === "month")?.value
    ),
    day: Number(
      parts.find((p) => p.type === "day")?.value
    ),
  };
}

export function getTodayTripDate(date = new Date()): Date {
  const { year, month, day } =
    getIndiaDateParts(date);

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      0,
      0,
      0,
      0
    )
  );
}

function createTripPublicId() {
  const random = Math.random()
    .toString(36)
    .substring(2, 10)
    .toUpperCase();

  return `TRIP-${random}`;
}

/*
 * =========================================================
 * GET OR CREATE NEXT TODAY TRIP
 * =========================================================
 *
 * Rules:
 *
 * 1. If today's trip is RUNNING, return it.
 * 2. If today's trip is SCHEDULED, return it.
 * 3. If the latest today's trip is COMPLETED,
 *    automatically create the next SCHEDULED trip.
 * 4. CANCELLED trips do not block the next trip.
 * 5. Historical dates never affect today's trip.
 *
 * This allows:
 *
 * Trip 1 → START → STOP
 * Trip 2 → START → STOP
 * Trip 3 → START → STOP
 *
 * without waiting 24 hours.
 */

export async function getOrCreateTodayTrip({
  busId,
  driverId,
  routeId,
}: {
  busId: string;
  driverId: string;
  routeId: string;
}) {
  const tripDate =
    getTodayTripDate();

  /*
   * ---------------------------------------------------------
   * 1. Check for an already running trip.
   * ---------------------------------------------------------
   *
   * There must never be two RUNNING trips for the
   * same driver + bus + route at the same time.
   */
  const runningTrip =
    await prisma.trip.findFirst({
      where: {
        busId,
        driverId,
        routeId,
        tripDate,
        status: "RUNNING",
      },

      orderBy: {
        createdAt: "desc",
      },
    });

  if (runningTrip) {
    return runningTrip;
  }

  /*
   * ---------------------------------------------------------
   * 2. Check for today's latest scheduled trip.
   * ---------------------------------------------------------
   *
   * If one already exists, reuse it.
   */
  const scheduledTrip =
    await prisma.trip.findFirst({
      where: {
        busId,
        driverId,
        routeId,
        tripDate,
        status: "SCHEDULED",
      },

      orderBy: {
        createdAt: "desc",
      },
    });

  if (scheduledTrip) {
    return scheduledTrip;
  }

  /*
   * ---------------------------------------------------------
   * 3. Find the latest today's trip.
   * ---------------------------------------------------------
   *
   * If it is COMPLETED or CANCELLED, that trip is historical
   * for today's operations and must not block another trip.
   */
  const latestTodayTrip =
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

  /*
   * ---------------------------------------------------------
   * 4. Always create the next scheduled trip when there is
   *    no RUNNING/SCHEDULED trip.
   * ---------------------------------------------------------
   *
   * This is the important change.
   *
   * Old behavior:
   *
   * COMPLETED → return completed trip
   *
   * New behavior:
   *
   * COMPLETED → create new SCHEDULED trip
   */
  const trip =
    await prisma.trip.create({
      data: {
        tripId:
          createTripPublicId(),

        busId,
        driverId,
        routeId,

        tripDate,

        status:
          "SCHEDULED",
      },
    });

  console.log(
    "[DAILY TRIP] Created next trip:",
    {
      tripId: trip.tripId,
      busId,
      driverId,
      routeId,
      tripDate,
      previousTrip:
        latestTodayTrip?.tripId ??
        null,
      previousStatus:
        latestTodayTrip?.status ??
        null,
    }
  );

  return trip;
}