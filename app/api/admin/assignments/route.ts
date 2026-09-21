import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized.",
        },
        { status: 401 }
      );
    }

    if (session.role !== "ADMIN") {
      return NextResponse.json(
        {
          success: false,
          message: "Forbidden.",
        },
        { status: 403 }
      );
    }

    const [
      students,
      drivers,
      buses,
      routes,
      studentAssignments,
      driverAssignments,
    ] = await Promise.all([
      prisma.student.findMany({
        orderBy: {
          studentId: "asc",
        },
        select: {
          id: true,
          studentId: true,
          name: true,
        },
      }),

      prisma.driver.findMany({
        orderBy: {
          driverId: "asc",
        },
        select: {
          id: true,
          driverId: true,
          name: true,
        },
      }),

      prisma.bus.findMany({
        orderBy: {
          busNumber: "asc",
        },
        select: {
          id: true,
          busId: true,
          busNumber: true,
          registration: true,
          status: true,
        },
      }),

      prisma.route.findMany({
        orderBy: {
          routeId: "asc",
        },
        include: {
          stops: {
            orderBy: {
              sequence: "asc",
            },
            select: {
              id: true,
              stopId: true,
              name: true,
              latitude: true,
              longitude: true,
              sequence: true,
            },
          },
        },
      }),

      prisma.studentBusAssignment.findMany({
        where: {
          active: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        include: {
          student: {
            select: {
              id: true,
              studentId: true,
              name: true,
            },
          },

          bus: {
            select: {
              id: true,
              busId: true,
              busNumber: true,
              registration: true,
              status: true,
            },
          },

          route: {
            include: {
              stops: {
                orderBy: {
                  sequence: "asc",
                },
              },
            },
          },

          stop: true,
        },
      }),

      prisma.driverBusAssignment.findMany({
        where: {
          active: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        include: {
          driver: {
            select: {
              id: true,
              driverId: true,
              name: true,
            },
          },

          bus: {
            select: {
              id: true,
              busId: true,
              busNumber: true,
              registration: true,
              status: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      students,
      drivers,
      buses,
      routes,
      studentAssignments,
      driverAssignments,
    });
  } catch (error) {
    console.error("GET_ASSIGNMENTS_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to load assignment data.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized.",
        },
        { status: 401 }
      );
    }

    if (session.role !== "ADMIN") {
      return NextResponse.json(
        {
          success: false,
          message: "Forbidden.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const type = body?.type;

    if (type === "STUDENT") {
      const {
        studentId,
        busId,
        routeId,
        stopId,
      } = body;

      if (
        typeof studentId !== "string" ||
        typeof busId !== "string" ||
        typeof routeId !== "string" ||
        typeof stopId !== "string"
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Student, bus, route and stop are required.",
          },
          { status: 400 }
        );
      }

      const [student, bus, route, stop] =
        await Promise.all([
          prisma.student.findUnique({
            where: {
              id: studentId,
            },
          }),

          prisma.bus.findUnique({
            where: {
              id: busId,
            },
          }),

          prisma.route.findUnique({
            where: {
              id: routeId,
            },
          }),

          prisma.busStop.findUnique({
            where: {
              id: stopId,
            },
          }),
        ]);

      if (!student) {
        return NextResponse.json(
          {
            success: false,
            message: "Selected student was not found.",
          },
          { status: 404 }
        );
      }

      if (!bus) {
        return NextResponse.json(
          {
            success: false,
            message: "Selected bus was not found.",
          },
          { status: 404 }
        );
      }

      if (!route) {
        return NextResponse.json(
          {
            success: false,
            message: "Selected route was not found.",
          },
          { status: 404 }
        );
      }

      if (!stop) {
        return NextResponse.json(
          {
            success: false,
            message: "Selected stop was not found.",
          },
          { status: 404 }
        );
      }

      if (stop.routeId !== route.id) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Selected pickup stop does not belong to the selected route.",
          },
          { status: 400 }
        );
      }

      const existingAssignment =
        await prisma.studentBusAssignment.findFirst({
          where: {
            studentId: student.id,
            active: true,
          },
        });

      if (existingAssignment) {
        return NextResponse.json(
          {
            success: false,
            message:
              "This student already has an active bus assignment.",
          },
          { status: 409 }
        );
      }

      const assignment =
        await prisma.studentBusAssignment.create({
          data: {
            studentId: student.id,
            busId: bus.id,
            routeId: route.id,
            stopId: stop.id,
            active: true,
          },
        });

      return NextResponse.json({
        success: true,
        message: "Student assigned successfully.",
        assignment,
      });
    }

    if (type === "DRIVER") {
      const { driverId, busId } = body;

      if (
        typeof driverId !== "string" ||
        typeof busId !== "string"
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "Driver and bus are required.",
          },
          { status: 400 }
        );
      }

      const [driver, bus] = await Promise.all([
        prisma.driver.findUnique({
          where: {
            id: driverId,
          },
        }),

        prisma.bus.findUnique({
          where: {
            id: busId,
          },
        }),
      ]);

      if (!driver) {
        return NextResponse.json(
          {
            success: false,
            message: "Selected driver was not found.",
          },
          { status: 404 }
        );
      }

      if (!bus) {
        return NextResponse.json(
          {
            success: false,
            message: "Selected bus was not found.",
          },
          { status: 404 }
        );
      }

      const existingDriverAssignment =
        await prisma.driverBusAssignment.findFirst({
          where: {
            driverId: driver.id,
            active: true,
          },
        });

      if (existingDriverAssignment) {
        return NextResponse.json(
          {
            success: false,
            message:
              "This driver already has an active bus assignment.",
          },
          { status: 409 }
        );
      }

      const existingBusAssignment =
        await prisma.driverBusAssignment.findFirst({
          where: {
            busId: bus.id,
            active: true,
          },
        });

      if (existingBusAssignment) {
        return NextResponse.json(
          {
            success: false,
            message:
              "This bus already has an active driver assignment.",
          },
          { status: 409 }
        );
      }

      const assignment =
        await prisma.driverBusAssignment.create({
          data: {
            driverId: driver.id,
            busId: bus.id,
            active: true,
          },
        });

      return NextResponse.json({
        success: true,
        message: "Driver assigned successfully.",
        assignment,
      });
    }

    return NextResponse.json(
      {
        success: false,
        message: "Invalid assignment type.",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("POST_ASSIGNMENTS_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to create assignment.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized.",
        },
        { status: 401 }
      );
    }

    if (session.role !== "ADMIN") {
      return NextResponse.json(
        {
          success: false,
          message: "Forbidden.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const type = body?.type;
    const id = body?.id;

    if (
      (type !== "STUDENT" && type !== "DRIVER") ||
      typeof id !== "string"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid assignment request.",
        },
        { status: 400 }
      );
    }

    if (type === "STUDENT") {
      const assignment =
        await prisma.studentBusAssignment.findUnique({
          where: {
            id,
          },
        });

      if (!assignment) {
        return NextResponse.json(
          {
            success: false,
            message: "Student assignment was not found.",
          },
          { status: 404 }
        );
      }

      await prisma.studentBusAssignment.update({
        where: {
          id,
        },
        data: {
          active: false,
        },
      });

      return NextResponse.json({
        success: true,
        message:
          "Student assignment removed successfully.",
      });
    }

    const assignment =
      await prisma.driverBusAssignment.findUnique({
        where: {
          id,
        },
      });

    if (!assignment) {
      return NextResponse.json(
        {
          success: false,
          message: "Driver assignment was not found.",
        },
        { status: 404 }
      );
    }

    await prisma.driverBusAssignment.update({
      where: {
        id,
      },
      data: {
        active: false,
      },
    });

    return NextResponse.json({
      success: true,
      message:
        "Driver assignment removed successfully.",
    });
  } catch (error) {
    console.error("DELETE_ASSIGNMENTS_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to remove assignment.",
      },
      { status: 500 }
    );
  }
}