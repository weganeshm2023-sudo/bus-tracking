import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getOrCreateTodayTrip } from "@/lib/daily-trip";

export async function GET() {
  try {
    const session = await getSession();

    console.log("[DRIVER DASHBOARD] SESSION:", {
      userId: session?.sub,
      username: session?.username,
      role: session?.role,
      driverId: session?.driverId,
    });

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Login required.",
        },
        { status: 401 }
      );
    }

    if (session.role !== "DRIVER") {
      return NextResponse.json(
        {
          success: false,
          message: "Driver access required.",
        },
        { status: 403 }
      );
    }

    if (!session.driverId) {
      return NextResponse.json(
        {
          success: false,
          message: "Driver profile not found.",
        },
        { status: 404 }
      );
    }

    /*
     * session.driverId can be:
     *
     * 1. internal Driver.id
     * 2. public Driver.driverId
     */
    const driver = await prisma.driver.findFirst({
      where: {
        OR: [
          {
            id: session.driverId,
          },
          {
            driverId: session.driverId,
          },
        ],
      },

      include: {
        assignments: {
          where: {
            active: true,
          },

          include: {
            bus: true,
          },
        },
      },
    });

    if (!driver) {
      console.error(
        "[DRIVER DASHBOARD] DRIVER NOT FOUND:",
        {
          sessionDriverId: session.driverId,
          username: session.username,
        }
      );

      return NextResponse.json(
        {
          success: false,
          message: "Driver account not found.",
        },
        { status: 404 }
      );
    }

    /*
     * ---------------------------------------------------------
     * FIND DRIVER'S ACTIVE BUS
     * ---------------------------------------------------------
     */

    const activeAssignment =
      driver.assignments[0] ?? null;

    /*
     * ---------------------------------------------------------
     * FIND TODAY'S EXISTING TRIP
     * ---------------------------------------------------------
     *
     * We first look for today's trip directly.
     */

    let todayTrip = await prisma.trip.findFirst({
      where: {
        driverId: driver.id,

        tripDate: {
          not: null,
        },
      },

      orderBy: {
        createdAt: "desc",
      },

      include: {
        bus: true,

        route: {
          include: {
            stops: {
              orderBy: {
                sequence: "asc",
              },
            },
          },
        },
      },
    });

    /*
     * ---------------------------------------------------------
     * CREATE TODAY'S TRIP AUTOMATICALLY
     * ---------------------------------------------------------
     *
     * DriverBusAssignment contains the bus relation.
     * It does NOT contain route.
     *
     * Therefore route is taken from the driver's latest trip.
     */

    if (activeAssignment) {
      const latestTripForBus =
        await prisma.trip.findFirst({
          where: {
            driverId: driver.id,
            busId: activeAssignment.busId,
          },

          orderBy: {
            createdAt: "desc",
          },

          select: {
            routeId: true,
          },
        });

      if (latestTripForBus?.routeId) {
        todayTrip =
          await getOrCreateTodayTrip({
            busId: activeAssignment.busId,
            driverId: driver.id,
            routeId: latestTripForBus.routeId,
          }).then(async (trip) => {
            return prisma.trip.findUnique({
              where: {
                id: trip.id,
              },

              include: {
                bus: true,

                route: {
                  include: {
                    stops: {
                      orderBy: {
                        sequence: "asc",
                      },
                    },
                  },
                },
              },
            });
          });
      }
    }

    /*
     * ---------------------------------------------------------
     * BUILD RESPONSE
     * ---------------------------------------------------------
     */

    const assignments =
      driver.assignments.map(
        (assignment) => ({
          id: assignment.id,

          bus: {
            id: assignment.bus.id,
            busId: assignment.bus.busId,
            busNumber: assignment.bus.busNumber,
            registration:
              assignment.bus.registration,
            status: assignment.bus.status,
          },
        })
      );

    const trips = todayTrip
      ? [
          {
            id: todayTrip.id,
            tripId: todayTrip.tripId,
            tripDate: todayTrip.tripDate,
            status: todayTrip.status,
            startedAt: todayTrip.startedAt,
            completedAt:
              todayTrip.completedAt,

            bus: {
              id: todayTrip.bus.id,
              busId: todayTrip.bus.busId,
              busNumber:
                todayTrip.bus.busNumber,
              registration:
                todayTrip.bus.registration,
              status: todayTrip.bus.status,
            },

            route: {
              id: todayTrip.route.id,
              routeId:
                todayTrip.route.routeId,
              name: todayTrip.route.name,

              stops:
                todayTrip.route.stops.map(
                  (stop) => ({
                    id: stop.id,
                    stopId: stop.stopId,
                    name: stop.name,
                    latitude:
                      stop.latitude,
                    longitude:
                      stop.longitude,
                    sequence:
                      stop.sequence,
                  })
                ),
            },
          },
        ]
      : [];

    console.log(
      "[DRIVER DASHBOARD] DRIVER FOUND:",
      {
        id: driver.id,
        driverId: driver.driverId,
        name: driver.name,
        assignments:
          assignments.length,
        todayTrip:
          todayTrip?.tripId ?? null,
        todayStatus:
          todayTrip?.status ?? null,
      }
    );

    return NextResponse.json({
      success: true,

      driver: {
        id: driver.id,
        driverId: driver.driverId,
        name: driver.name,
      },

      assignments,

      trips,
    });
  } catch (error) {
    console.error(
      "DRIVER_DASHBOARD_ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Unable to load driver dashboard.",
      },
      { status: 500 }
    );
  }
}