import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    /*
     * --------------------------------------------------
     * ADMIN AUTHENTICATION
     * --------------------------------------------------
     */
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Login required.",
        },
        { status: 401 }
      );
    }

    if (session.role !== "ADMIN") {
      return NextResponse.json(
        {
          success: false,
          message: "Admin access required.",
        },
        { status: 403 }
      );
    }

    /*
     * --------------------------------------------------
     * GET CURRENTLY RUNNING TRIPS
     * --------------------------------------------------
     *
     * First get the running trips explicitly.
     * This makes the active-trip condition easier
     * to debug and avoids depending only on the
     * nested relation filter.
     */
    const runningTrips =
      await prisma.trip.findMany({
        where: {
          status: "RUNNING",
        },
        select: {
          id: true,
          tripId: true,
          busId: true,
          status: true,
        },
      });

    console.log(
      "[ADMIN LIVE TRACKING] Running trips:",
      runningTrips
    );

    if (runningTrips.length === 0) {
      console.log(
        "[ADMIN LIVE TRACKING] No RUNNING trips found."
      );

      return NextResponse.json(
        {
          success: true,
          buses: [],
        },
        {
          headers: {
            "Cache-Control":
              "no-store, no-cache, must-revalidate",
          },
        }
      );
    }

    const runningTripIds =
      runningTrips.map(
        (trip) => trip.id
      );

    /*
     * --------------------------------------------------
     * GET GPS LOCATIONS
     * --------------------------------------------------
     *
     * Fetch recent GPS records belonging only to
     * currently running trips.
     */
    const locations =
      await prisma.liveLocation.findMany({
        where: {
          tripId: {
            in: runningTripIds,
          },
        },

        orderBy: {
          recordedAt: "desc",
        },

        include: {
          bus: true,
          trip: true,
        },

        take: 500,
      });

    console.log(
      "[ADMIN LIVE TRACKING] GPS records found:",
      locations.length
    );

    /*
     * --------------------------------------------------
     * LATEST LOCATION PER BUS
     * --------------------------------------------------
     *
     * Since records are ordered newest first,
     * the first record for a bus is its latest GPS.
     */
    const latestByBus =
      new Map<
        string,
        (typeof locations)[number]
      >();

    for (const location of locations) {
      if (
        !location.busId ||
        !location.bus
      ) {
        continue;
      }

      if (
        !latestByBus.has(
          location.busId
        )
      ) {
        latestByBus.set(
          location.busId,
          location
        );
      }
    }

    /*
     * --------------------------------------------------
     * FORMAT FOR ADMIN FRONTEND
     * --------------------------------------------------
     */
    const buses = Array.from(
      latestByBus.values()
    )
      .filter((location) => {
        return (
          Number.isFinite(
            location.latitude
          ) &&
          Number.isFinite(
            location.longitude
          )
        );
      })
      .map((location) => ({
        busId: location.bus.busId,

        busNumber:
          location.bus.busNumber,

        registration:
          location.bus.registration,

        tripId:
          location.trip.id,

        tripCode:
          location.trip.tripId,

        latitude:
          Number(location.latitude),

        longitude:
          Number(location.longitude),

        accuracy:
          location.accuracy != null
            ? Number(location.accuracy)
            : null,

        speed:
          location.speed != null
            ? Number(location.speed)
            : null,

        heading:
          location.heading != null
            ? Number(location.heading)
            : null,

        recordedAt:
          location.recordedAt.toISOString(),
      }));

    /*
     * --------------------------------------------------
     * DEBUG LOG
     * --------------------------------------------------
     */
    console.log(
      "[ADMIN LIVE TRACKING] Active buses:",
      buses.map((bus) => ({
        busId: bus.busId,
        busNumber: bus.busNumber,
        tripId: bus.tripId,
        tripCode: bus.tripCode,
        latitude: bus.latitude,
        longitude: bus.longitude,
        accuracy: bus.accuracy,
        recordedAt: bus.recordedAt,
      }))
    );

    return NextResponse.json(
      {
        success: true,
        buses,
        meta: {
          runningTrips:
            runningTrips.length,

          gpsRecords:
            locations.length,

          liveBuses:
            buses.length,
        },
      },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      }
    );
  } catch (error) {
    console.error(
      "[ADMIN LIVE TRACKING] ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Unable to load live bus locations.",
      },
      { status: 500 }
    );
  }
}