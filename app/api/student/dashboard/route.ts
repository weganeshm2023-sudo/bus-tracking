import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized",
        },
        { status: 401 }
      );
    }

    if (session.role !== "STUDENT") {
      return NextResponse.json(
        {
          success: false,
          message: "Student access required",
        },
        { status: 403 }
      );
    }

    const student = await prisma.student.findFirst({
      where: {
        OR: [
          {
            id: session.studentId ?? undefined,
          },
          {
            studentId: session.studentId ?? undefined,
          },
          {
            userId: session.sub,
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
            route: true,
            stop: true,
          },

          orderBy: {
            createdAt: "desc",
          },

          take: 1,
        },

        notifications: {
          orderBy: {
            createdAt: "desc",
          },

          take: 20,
        },

        location: true,
      },
    });

    if (!student) {
      return NextResponse.json(
        {
          success: false,
          message: "Student account not found",
        },
        { status: 404 }
      );
    }

    /*
     * ---------------------------------------------------------
     * COLLEGE MAIN LOCATION
     * ---------------------------------------------------------
     *
     * There should be exactly one main college location.
     * The Prisma schema uses id = "main".
     *
     * This is independent from the student's pickup location.
     */
    const collegeLocation =
      await prisma.collegeLocation.findUnique({
        where: {
          id: "main",
        },
      });

    const assignment =
      student.assignments[0] ?? null;

    let activeTrip = null;
    let latestLocation = null;
    let studentTripStatus = null;

    if (assignment) {
      activeTrip =
        await prisma.trip.findFirst({
          where: {
            busId: assignment.busId,
            routeId: assignment.routeId,
            status: "RUNNING",
          },

          orderBy: {
            startedAt: "desc",
          },
        });

      if (activeTrip) {
        latestLocation =
          await prisma.liveLocation.findFirst({
            where: {
              tripId: activeTrip.id,
            },

            orderBy: {
              recordedAt: "desc",
            },
          });

        studentTripStatus =
          await prisma.studentTripStatus.findUnique(
            {
              where: {
                tripId_studentId: {
                  tripId: activeTrip.id,
                  studentId: student.id,
                },
              },
            }
          );
      }
    }

    return NextResponse.json(
      {
        success: true,

        student: {
          id: student.id,

          studentId:
            student.studentId,

          name: student.name,

          /*
           * Tamil voice name.
           *
           * Example:
           * name      = annamalai
           * voiceName = அண்ணாமலை
           *
           * If voiceName is empty/null,
           * fallback to normal student name.
           */
          voiceName:
            student.voiceName?.trim() ||
            student.name,
        },

        /*
         * -----------------------------------------------------
         * INDIVIDUAL STUDENT LOCATION
         * -----------------------------------------------------
         *
         * This is optional.
         *
         * If a StudentLocation exists, the frontend can use it
         * as the student's actual pickup/current location.
         *
         * If it does not exist, frontend must continue using
         * assignment.stop as the fallback.
         */
        studentLocation:
          student.location
            ? {
                id:
                  student.location.id,

                studentId:
                  student.location.studentId,

                name:
                  student.location.name,

                address:
                  student.location.address,

                latitude:
                  student.location.latitude,

                longitude:
                  student.location.longitude,

                active:
                  student.location.active,

                updatedAt:
                  student.location.updatedAt,
              }
            : null,

        /*
         * -----------------------------------------------------
         * COLLEGE MAIN LOCATION
         * -----------------------------------------------------
         *
         * Separate from BusStop and StudentLocation.
         *
         * id is expected to be "main".
         */
        collegeLocation:
          collegeLocation
            ? {
                id:
                  collegeLocation.id,

                name:
                  collegeLocation.name,

                address:
                  collegeLocation.address,

                latitude:
                  collegeLocation.latitude,

                longitude:
                  collegeLocation.longitude,

                active:
                  collegeLocation.active,

                updatedAt:
                  collegeLocation.updatedAt,
              }
            : null,

        assignment: assignment
          ? {
              id: assignment.id,

              bus: {
                id: assignment.bus.id,

                busId:
                  assignment.bus.busId,

                busNumber:
                  assignment.bus.busNumber,

                registration:
                  assignment.bus.registration,

                status:
                  assignment.bus.status,
              },

              route: {
                id: assignment.route.id,

                routeId:
                  assignment.route.routeId,

                name:
                  assignment.route.name,
              },

              /*
               * Existing BusStop data is intentionally preserved.
               *
               * This remains the fallback pickup location when
               * studentLocation is not configured.
               */
              stop: {
                id: assignment.stop.id,

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
            }
          : null,

        trip: activeTrip
          ? {
              id: activeTrip.id,

              tripId:
                activeTrip.tripId,

              status:
                activeTrip.status,

              startedAt:
                activeTrip.startedAt,
            }
          : null,

        latestLocation:
          latestLocation
            ? {
                latitude:
                  latestLocation.latitude,

                longitude:
                  latestLocation.longitude,

                accuracy:
                  latestLocation.accuracy,

                speed:
                  latestLocation.speed,

                heading:
                  latestLocation.heading,

                recordedAt:
                  latestLocation.recordedAt,
              }
            : null,

        studentTripStatus:
          studentTripStatus
            ? {
                status:
                  studentTripStatus.status,

                boardedAt:
                  studentTripStatus.boardedAt,

                missedAt:
                  studentTripStatus.missedAt,
              }
            : null,

        notifications:
          student.notifications.map(
            (notification) => ({
              id: notification.id,

              type:
                notification.type,

              title:
                notification.title,

              message:
                notification.message,

              tripId:
                notification.tripId,

              read:
                notification.read,

              createdAt:
                notification.createdAt,
            })
          ),
      },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error(
      "STUDENT_DASHBOARD_ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Unable to load student dashboard",
      },
      { status: 500 }
    );
  }
}