import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

const createTripSchema = z.object({
  busId: z.string().min(1),
  driverId: z.string().min(1),
  routeId: z.string().min(1),
});

const updateTripSchema = z.object({
  id: z.string().min(1),
  status: z.enum([
    "SCHEDULED",
    "RUNNING",
    "COMPLETED",
    "CANCELLED",
  ]),
});

export async function GET() {
  try {
    await requireRole("ADMIN");

    const [trips, buses, drivers, routes] = await Promise.all([
      prisma.trip.findMany({
        orderBy: {
          createdAt: "desc",
        },
        include: {
          bus: true,
          driver: true,
          route: true,
        },
      }),

      prisma.bus.findMany({
        orderBy: {
          busNumber: "asc",
        },
        include: {
          driverAssignments: {
            where: {
              active: true,
            },
            include: {
              driver: {
                select: {
                  id: true,
                  driverId: true,
                  name: true,
                },
              },
            },
          },

          studentAssignments: {
            where: {
              active: true,
            },
            include: {
              route: {
                select: {
                  id: true,
                  routeId: true,
                  name: true,
                },
              },
            },
          },
        },
      }),

      prisma.driver.findMany({
        orderBy: {
          name: "asc",
        },
        include: {
          assignments: {
            where: {
              active: true,
            },
            include: {
              bus: {
                select: {
                  id: true,
                  busId: true,
                  busNumber: true,
                },
              },
            },
          },
        },
      }),

      prisma.route.findMany({
        orderBy: {
          name: "asc",
        },
        include: {
          stops: {
            orderBy: {
              sequence: "asc",
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      trips,
      buses,
      drivers,
      routes,
    });
  } catch (error) {
    console.error("ADMIN_TRIPS_GET_ERROR:", error);

    if (
      error instanceof Error &&
      error.message === "UNAUTHORIZED"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized.",
        },
        { status: 401 }
      );
    }

    if (
      error instanceof Error &&
      error.message === "FORBIDDEN"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Admin access required.",
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Unable to load trip data.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireRole("ADMIN");

    const body = await request.json();

    const parsed = createTripSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Bus, driver and route are required.",
        },
        { status: 400 }
      );
    }

    const { busId, driverId, routeId } = parsed.data;

    const bus = await prisma.bus.findUnique({
      where: {
        id: busId,
      },
      include: {
        driverAssignments: {
          where: {
            active: true,
          },
        },
      },
    });

    if (!bus) {
      return NextResponse.json(
        {
          success: false,
          message: "Selected bus was not found.",
        },
        { status: 404 }
      );
    }

    const driver = await prisma.driver.findUnique({
      where: {
        id: driverId,
      },
    });

    if (!driver) {
      return NextResponse.json(
        {
          success: false,
          message: "Selected driver was not found.",
        },
        { status: 404 }
      );
    }

    const route = await prisma.route.findUnique({
      where: {
        id: routeId,
      },
    });

    if (!route) {
      return NextResponse.json(
        {
          success: false,
          message: "Selected route was not found.",
        },
        { status: 404 }
      );
    }

    const driverAssignment =
      await prisma.driverBusAssignment.findFirst({
        where: {
          driverId,
          busId,
          active: true,
        },
      });

    if (!driverAssignment) {
      return NextResponse.json(
        {
          success: false,
          message:
            "This driver is not actively assigned to the selected bus.",
        },
        { status: 400 }
      );
    }

    const routeAssignment =
      await prisma.studentBusAssignment.findFirst({
        where: {
          busId,
          routeId,
          active: true,
        },
      });

    if (!routeAssignment) {
      return NextResponse.json(
        {
          success: false,
          message:
            "No active student assignment exists for this bus and route.",
        },
        { status: 400 }
      );
    }

    const existingTrip = await prisma.trip.findFirst({
      where: {
        busId,
        status: {
          in: ["SCHEDULED", "RUNNING"],
        },
      },
    });

    if (existingTrip) {
      return NextResponse.json(
        {
          success: false,
          message:
            "This bus already has a scheduled or running trip.",
        },
        { status: 409 }
      );
    }

    const tripId = `TRIP-${Math.random()
      .toString(36)
      .substring(2, 10)
      .toUpperCase()}`;

    const trip = await prisma.trip.create({
      data: {
        tripId,
        busId,
        driverId,
        routeId,
        status: "SCHEDULED",
      },
      include: {
        bus: true,
        driver: true,
        route: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Trip created successfully.",
        trip,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("ADMIN_TRIPS_POST_ERROR:", error);

    if (
      error instanceof Error &&
      error.message === "UNAUTHORIZED"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized.",
        },
        { status: 401 }
      );
    }

    if (
      error instanceof Error &&
      error.message === "FORBIDDEN"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Admin access required.",
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Unable to create trip.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    await requireRole("ADMIN");

    const body = await request.json();

    const parsed = updateTripSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Trip ID and valid status are required.",
        },
        { status: 400 }
      );
    }

    const { id, status } = parsed.data;

    const existingTrip = await prisma.trip.findUnique({
      where: {
        id,
      },
      include: {
        bus: true,
      },
    });

    if (!existingTrip) {
      return NextResponse.json(
        {
          success: false,
          message: "Trip not found.",
        },
        { status: 404 }
      );
    }

    const now = new Date();

    const data: {
      status: typeof status;
      startedAt?: Date | null;
      completedAt?: Date | null;
    } = {
      status,
    };

    if (status === "RUNNING") {
      data.startedAt = existingTrip.startedAt ?? now;
      data.completedAt = null;
    }

    if (
      status === "COMPLETED" ||
      status === "CANCELLED"
    ) {
      data.completedAt = now;
    }

    const trip = await prisma.trip.update({
      where: {
        id,
      },
      data,
      include: {
        bus: true,
        driver: true,
        route: true,
      },
    });

    let busStatus:
      | "WAITING"
      | "RUNNING"
      | "EMERGENCY"
      | "OFFLINE"
      | "INACTIVE" = "WAITING";

    if (status === "RUNNING") {
      busStatus = "RUNNING";
    }

    if (status === "COMPLETED") {
      busStatus = "WAITING";
    }

    if (status === "CANCELLED") {
      busStatus = "WAITING";
    }

    if (status !== "SCHEDULED") {
      await prisma.bus.update({
        where: {
          id: existingTrip.busId,
        },
        data: {
          status: busStatus,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message:
        status === "RUNNING"
          ? "Trip marked as running."
          : status === "COMPLETED"
          ? "Trip completed successfully."
          : status === "CANCELLED"
          ? "Trip cancelled successfully."
          : "Trip updated successfully.",
      trip,
    });
  } catch (error) {
    console.error("ADMIN_TRIPS_PUT_ERROR:", error);

    if (
      error instanceof Error &&
      error.message === "UNAUTHORIZED"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized.",
        },
        { status: 401 }
      );
    }

    if (
      error instanceof Error &&
      error.message === "FORBIDDEN"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Admin access required.",
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Unable to update trip.",
      },
      { status: 500 }
    );
  }
}