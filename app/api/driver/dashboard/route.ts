import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getOrCreateTodayTrip } from "@/lib/daily-trip";

export const dynamic = "force-dynamic";

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
     * session.driverId may be:
     *
     * 1. Driver.id
     * 2. Driver.driverId
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
     * ACTIVE DRIVER -> BUS
     * ---------------------------------------------------------
     */

    const activeAssignment =
      driver.assignments[0] ?? null;

    /*
     * ---------------------------------------------------------
     * FIND LATEST TRIP FOR ASSIGNED BUS
     * ---------------------------------------------------------
     */

    let todayTrip = null;

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
        const createdTrip =
          await getOrCreateTodayTrip({
            busId: activeAssignment.busId,
            driverId: driver.id,
            routeId: latestTripForBus.routeId,
          });

        todayTrip =
          await prisma.trip.findUnique({
            where: {
              id: createdTrip.id,
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
      }
    }

    /*
     * ---------------------------------------------------------
     * ACTIVE DRIVER ASSIGNMENTS
     * ---------------------------------------------------------
     */

    const assignments =
      driver.assignments.map(
        (assignment) => ({
          id: assignment.id,

          bus: {
            id: assignment.bus.id,
            busId: assignment.bus.busId,
            busNumber:
              assignment.bus.busNumber,
            registration:
              assignment.bus.registration,
            status:
              assignment.bus.status,
          },
        })
      );

    /*
     * ---------------------------------------------------------
     * STUDENTS ASSIGNED TO DRIVER BUS
     * ---------------------------------------------------------
     */

    let students: Array<{
      assignmentId: string;
      student: {
        id: string;
        studentId: string;
        name: string;
      };
      bus: {
        id: string;
        busId: string;
        busNumber: string;
        registration: string;
      };
      route: {
        id: string;
        routeId: string;
        name: string;
      };
      pickupStop: {
        id: string;
        stopId: string;
        name: string;
        latitude: number;
        longitude: number;
        sequence: number;
      };
      studentLocation: {
        id: string;
        name: string;
        address: string | null;
        latitude: number;
        longitude: number;
      } | null;
    }> = [];

    if (activeAssignment) {
      const studentAssignments =
        await prisma.studentBusAssignment.findMany({
          where: {
            busId: activeAssignment.busId,
            active: true,
          },

          orderBy: {
            createdAt: "asc",
          },

          include: {
            student: true,
            bus: true,
            route: true,
            stop: true,
          },
        });

      /*
       * StudentLocation is queried separately.
       *
       * This avoids depending on whether the generated
       * Prisma Client exposes the relation name on Student.
       */
      const studentIds =
        studentAssignments.map(
          (item) => item.studentId
        );

      const locations =
        studentIds.length > 0
          ? await prisma.studentLocation.findMany({
              where: {
                studentId: {
                  in: studentIds,
                },
                active: true,
              },
            })
          : [];

      const locationMap =
        new Map(
          locations.map(
            (location) => [
              location.studentId,
              location,
            ]
          )
        );

      students =
        studentAssignments.map(
          (assignment) => {
            const location =
              locationMap.get(
                assignment.studentId
              );

            return {
              assignmentId:
                assignment.id,

              student: {
                id:
                  assignment.student.id,

                studentId:
                  assignment.student.studentId,

                name:
                  assignment.student.name,
              },

              bus: {
                id:
                  assignment.bus.id,

                busId:
                  assignment.bus.busId,

                busNumber:
                  assignment.bus.busNumber,

                registration:
                  assignment.bus.registration,
              },

              route: {
                id:
                  assignment.route.id,

                routeId:
                  assignment.route.routeId,

                name:
                  assignment.route.name,
              },

              pickupStop: {
                id:
                  assignment.stop.id,

                stopId:
                  assignment.stop.stopId,

                name:
                  assignment.stop.name,

                latitude:
                  assignment.stop.latitude,

                longitude:
                  assignment.stop.longitude,

                sequence:
                  assignment.stop.sequence,
              },

              /*
               * If a personal StudentLocation exists,
               * use it for the student marker.
               *
               * Pickup stop remains available separately.
               */
              studentLocation:
                location
                  ? {
                      id:
                        location.id,

                      name:
                        location.name,

                      address:
                        location.address,

                      latitude:
                        location.latitude,

                      longitude:
                        location.longitude,
                    }
                  : null,
            };
          }
        );
    }

    /*
     * ---------------------------------------------------------
     * TODAY TRIP
     * ---------------------------------------------------------
     */

    const trips = todayTrip
      ? [
          {
            id:
              todayTrip.id,

            tripId:
              todayTrip.tripId,

            tripDate:
              todayTrip.tripDate,

            status:
              todayTrip.status,

            startedAt:
              todayTrip.startedAt,

            completedAt:
              todayTrip.completedAt,

            bus: {
              id:
                todayTrip.bus.id,

              busId:
                todayTrip.bus.busId,

              busNumber:
                todayTrip.bus.busNumber,

              registration:
                todayTrip.bus.registration,

              status:
                todayTrip.bus.status,
            },

            route: {
              id:
                todayTrip.route.id,

              routeId:
                todayTrip.route.routeId,

              name:
                todayTrip.route.name,

              stops:
                todayTrip.route.stops.map(
                  (stop) => ({
                    id:
                      stop.id,

                    stopId:
                      stop.stopId,

                    name:
                      stop.name,

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
      "[DRIVER DASHBOARD] READY:",
      {
        driverId:
          driver.driverId,

        bus:
          activeAssignment?.bus
            ?.busNumber ?? null,

        students:
          students.length,

        trip:
          todayTrip?.tripId ?? null,

        status:
          todayTrip?.status ?? null,
      }
    );

    return NextResponse.json({
      success: true,

      driver: {
        id:
          driver.id,

        driverId:
          driver.driverId,

        name:
          driver.name,
      },

      assignments,

      trips,

      students,
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