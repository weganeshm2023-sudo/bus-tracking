import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

const locationSchema = z.object({
  tripId: z.string().min(1),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  accuracy: z.number().finite().nonnegative().optional().nullable(),
  speed: z.number().finite().nonnegative().optional().nullable(),
  heading: z.number().finite().optional().nullable(),
});

const actionSchema = z.object({
  action: z.enum(["START", "END", "EMERGENCY"]),
  tripId: z.string().min(1).optional(),
  latitude: z.number().finite().optional(),
  longitude: z.number().finite().optional(),
});

function authError(error: unknown) {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return NextResponse.json(
      {
        success: false,
        message: "Unauthorized.",
      },
      { status: 401 }
    );
  }

  if (error instanceof Error && error.message === "FORBIDDEN") {
    return NextResponse.json(
      {
        success: false,
        message: "Driver access required.",
      },
      { status: 403 }
    );
  }

  return null;
}

async function getDriverContext() {
  const session = await requireRole("DRIVER");

  if (!session.driverId) {
    throw new Error("FORBIDDEN");
  }

  const driver = await prisma.driver.findUnique({
    where: {
      driverId: session.driverId,
    },
    include: {
      user: {
        select: {
          username: true,
        },
      },
      assignments: {
        where: {
          active: true,
        },
        include: {
          bus: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!driver) {
    throw new Error("FORBIDDEN");
  }

  const activeAssignment = driver.assignments[0] ?? null;

  if (!activeAssignment) {
    return {
      session,
      driver,
      assignment: null,
      trip: null,
      location: null,
    };
  }

  /*
   * Find the active trip by DRIVER first.
   *
   * This prevents another driver's trip on the same bus
   * from being selected accidentally.
   */
  const trip = await prisma.trip.findFirst({
    where: {
      driverId: driver.id,
      status: {
        in: ["SCHEDULED", "RUNNING"],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      bus: true,
      driver: true,
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
   * Security check:
   * The trip bus must be the driver's currently assigned bus.
   */
  const authorizedTrip =
    trip && trip.busId === activeAssignment.busId ? trip : null;

  let location = null;

  if (authorizedTrip) {
    location = await prisma.liveLocation.findFirst({
      where: {
        tripId: authorizedTrip.id,
      },
      orderBy: {
        recordedAt: "desc",
      },
    });
  }

  return {
    session,
    driver,
    assignment: activeAssignment,
    trip: authorizedTrip,
    location,
  };
}

export async function GET() {
  try {
    const context = await getDriverContext();

    return NextResponse.json({
      success: true,

      driver: {
        id: context.driver.id,
        driverId: context.driver.driverId,
        name: context.driver.name,
        username: context.driver.user.username,
      },

      assignment: context.assignment
        ? {
            id: context.assignment.id,
            bus: {
              id: context.assignment.bus.id,
              busId: context.assignment.bus.busId,
              busNumber: context.assignment.bus.busNumber,
              registration: context.assignment.bus.registration,
              status: context.assignment.bus.status,
            },
          }
        : null,

      trip: context.trip
        ? {
            id: context.trip.id,
            tripId: context.trip.tripId,
            status: context.trip.status,
            startedAt: context.trip.startedAt,
            completedAt: context.trip.completedAt,

            bus: {
              id: context.trip.bus.id,
              busId: context.trip.bus.busId,
              busNumber: context.trip.bus.busNumber,
              registration: context.trip.bus.registration,
              status: context.trip.bus.status,
            },

            route: {
              id: context.trip.route.id,
              routeId: context.trip.route.routeId,
              name: context.trip.route.name,
              stops: context.trip.route.stops,
            },
          }
        : null,

      location: context.location
        ? {
            latitude: context.location.latitude,
            longitude: context.location.longitude,
            accuracy: context.location.accuracy,
            speed: context.location.speed,
            heading: context.location.heading,
            recordedAt: context.location.recordedAt,
          }
        : null,
    });
  } catch (error) {
    console.error("DRIVER_TRIP_GET_ERROR:", error);

    const response = authError(error);

    if (response) {
      return response;
    }

    return NextResponse.json(
      {
        success: false,
        message: "Unable to load driver trip data.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireRole("DRIVER");

    if (!session.driverId) {
      throw new Error("FORBIDDEN");
    }

    const body = await request.json();

    /*
     * GPS LOCATION UPDATE
     */
    const locationResult = locationSchema.safeParse(body);

    if (locationResult.success) {
      const {
        tripId,
        latitude,
        longitude,
        accuracy,
        speed,
        heading,
      } = locationResult.data;

      const driver = await prisma.driver.findUnique({
        where: {
          driverId: session.driverId,
        },
        include: {
          assignments: {
            where: {
              active: true,
            },
          },
        },
      });

      if (!driver) {
        throw new Error("FORBIDDEN");
      }

      const assignment = driver.assignments[0];

      if (!assignment) {
        return NextResponse.json(
          {
            success: false,
            message: "No active bus assignment found.",
          },
          { status: 400 }
        );
      }

      const trip = await prisma.trip.findUnique({
        where: {
          id: tripId,
        },
      });

      if (!trip) {
        return NextResponse.json(
          {
            success: false,
            message: "Trip not found.",
          },
          { status: 404 }
        );
      }

      if (trip.driverId !== driver.id) {
        return NextResponse.json(
          {
            success: false,
            message: "This trip is not assigned to you.",
          },
          { status: 403 }
        );
      }

      if (trip.busId !== assignment.busId) {
        return NextResponse.json(
          {
            success: false,
            message: "This trip is not for your assigned bus.",
          },
          { status: 403 }
        );
      }

      if (trip.status !== "RUNNING") {
        return NextResponse.json(
          {
            success: false,
            message: "GPS can only be sent while the trip is running.",
          },
          { status: 400 }
        );
      }

      const location = await prisma.liveLocation.create({
        data: {
          tripId: trip.id,
          busId: trip.busId,
          latitude,
          longitude,
          accuracy: accuracy ?? null,
          speed: speed ?? null,
          heading: heading ?? null,
          recordedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        message: "GPS location saved.",
        location: {
          id: location.id,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          speed: location.speed,
          heading: location.heading,
          recordedAt: location.recordedAt,
        },
      });
    }

    /*
     * DRIVER ACTION
     */
    const actionResult = actionSchema.safeParse(body);

    if (!actionResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid driver request.",
        },
        { status: 400 }
      );
    }

    const {
      action,
      tripId,
      latitude,
      longitude,
    } = actionResult.data;

    const driver = await prisma.driver.findUnique({
      where: {
        driverId: session.driverId,
      },
      include: {
        assignments: {
          where: {
            active: true,
          },
        },
      },
    });

    if (!driver) {
      throw new Error("FORBIDDEN");
    }

    const assignment = driver.assignments[0];

    if (!assignment) {
      return NextResponse.json(
        {
          success: false,
          message: "No active bus assignment found.",
        },
        { status: 400 }
      );
    }

    /*
     * Find the requested trip or the driver's current trip.
     */
    let trip = null;

    if (tripId) {
      trip = await prisma.trip.findUnique({
        where: {
          id: tripId,
        },
      });
    } else {
      trip = await prisma.trip.findFirst({
        where: {
          driverId: driver.id,
          busId: assignment.busId,
          status: {
            in: ["SCHEDULED", "RUNNING"],
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    }

    if (!trip) {
      return NextResponse.json(
        {
          success: false,
          message: "No active trip found for your assigned bus.",
        },
        { status: 404 }
      );
    }

    if (trip.driverId !== driver.id) {
      return NextResponse.json(
        {
          success: false,
          message: "This trip is not assigned to you.",
        },
        { status: 403 }
      );
    }

    if (trip.busId !== assignment.busId) {
      return NextResponse.json(
        {
          success: false,
          message: "This trip is not for your assigned bus.",
        },
        { status: 403 }
      );
    }

    /*
     * START BUS
     */
    if (action === "START") {
      if (trip.status !== "SCHEDULED") {
        return NextResponse.json(
          {
            success: false,
            message: "This trip is already running or completed.",
          },
          { status: 400 }
        );
      }

      const now = new Date();

      const updated = await prisma.$transaction(async (tx) => {
        const updatedTrip = await tx.trip.update({
          where: {
            id: trip!.id,
          },
          data: {
            status: "RUNNING",
            startedAt: trip!.startedAt ?? now,
            completedAt: null,
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

        await tx.bus.update({
          where: {
            id: trip!.busId,
          },
          data: {
            status: "RUNNING",
          },
        });

        return updatedTrip;
      });

      return NextResponse.json({
        success: true,
        message: "Bus started successfully.",
        trip: updated,
      });
    }

    /*
     * END BUS
     */
    if (action === "END") {
      if (trip.status !== "RUNNING") {
        return NextResponse.json(
          {
            success: false,
            message: "This trip is not currently running.",
          },
          { status: 400 }
        );
      }

      const now = new Date();

      const updated = await prisma.$transaction(async (tx) => {
        const updatedTrip = await tx.trip.update({
          where: {
            id: trip!.id,
          },
          data: {
            status: "COMPLETED",
            completedAt: now,
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

        await tx.bus.update({
          where: {
            id: trip!.busId,
          },
          data: {
            status: "WAITING",
          },
        });

        return updatedTrip;
      });

      return NextResponse.json({
        success: true,
        message: "Bus trip completed successfully.",
        trip: updated,
      });
    }

    /*
     * EMERGENCY
     */
    if (action === "EMERGENCY") {
      if (trip.status !== "RUNNING") {
        return NextResponse.json(
          {
            success: false,
            message:
              "Emergency can only be triggered during a running trip.",
          },
          { status: 400 }
        );
      }

      const emergency = await prisma.emergency.create({
        data: {
          tripId: trip.id,
          busId: trip.busId,
          driverId: driver.id,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          status: "ACTIVE",
          message: "Emergency reported by driver.",
        },
      });

      await prisma.bus.update({
        where: {
          id: trip.busId,
        },
        data: {
          status: "EMERGENCY",
        },
      });

      return NextResponse.json({
        success: true,
        message: "Emergency reported successfully.",
        emergency,
      });
    }

    return NextResponse.json(
      {
        success: false,
        message: "Unsupported action.",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("DRIVER_TRIP_POST_ERROR:", error);

    const response = authError(error);

    if (response) {
      return response;
    }

    return NextResponse.json(
      {
        success: false,
        message: "Unable to process driver request.",
      },
      { status: 500 }
    );
  }
}