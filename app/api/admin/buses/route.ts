import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const createBusSchema = z.object({
  busId: z
    .string()
    .trim()
    .min(1, "Bus ID is required")
    .max(50, "Bus ID is too long"),

  busNumber: z
    .string()
    .trim()
    .min(1, "Bus number is required")
    .max(30, "Bus number is too long"),

  registration: z
    .string()
    .trim()
    .min(1, "Registration number is required")
    .max(30, "Registration number is too long"),

  status: z
    .enum([
      "WAITING",
      "RUNNING",
      "EMERGENCY",
      "OFFLINE",
      "INACTIVE",
    ])
    .default("WAITING"),
});

const updateBusSchema = createBusSchema.extend({
  id: z.string().min(1, "Bus ID is required"),
});

async function requireAdmin() {
  const session = await getSession();

  if (!session) {
    return {
      session: null,
      response: NextResponse.json(
        {
          success: false,
          message: "Authentication required.",
        },
        { status: 401 }
      ),
    };
  }

  if (session.role !== "ADMIN") {
    return {
      session: null,
      response: NextResponse.json(
        {
          success: false,
          message: "Admin access required.",
        },
        { status: 403 }
      ),
    };
  }

  return {
    session,
    response: null,
  };
}

export async function GET() {
  try {
    const auth = await requireAdmin();

    if (auth.response) {
      return auth.response;
    }

    const buses = await prisma.bus.findMany({
      orderBy: {
        busNumber: "asc",
      },
      include: {
        driverAssignments: {
          where: {
            active: true,
          },
          include: {
            driver: true,
          },
          take: 1,
        },
        studentAssignments: {
          where: {
            active: true,
          },
          select: {
            id: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      buses: buses.map((bus) => ({
        id: bus.id,
        busId: bus.busId,
        busNumber: bus.busNumber,
        registration: bus.registration,
        status: bus.status,
        driver: bus.driverAssignments[0]?.driver
          ? {
              driverId: bus.driverAssignments[0].driver.driverId,
              name: bus.driverAssignments[0].driver.name,
            }
          : null,
        studentCount: bus.studentAssignments.length,
        createdAt: bus.createdAt,
        updatedAt: bus.updatedAt,
      })),
    });
  } catch (error) {
    console.error("ADMIN_BUSES_GET_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to load buses.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();

    if (auth.response) {
      return auth.response;
    }

    const body = await request.json();

    const result = createBusSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: result.error.issues[0]?.message ?? "Invalid bus data.",
        },
        { status: 400 }
      );
    }

    const { busId, busNumber, registration, status } = result.data;

    const existingBus = await prisma.bus.findFirst({
      where: {
        OR: [
          {
            busId,
          },
          {
            registration,
          },
        ],
      },
      select: {
        busId: true,
        registration: true,
      },
    });

    if (existingBus) {
      if (existingBus.busId === busId) {
        return NextResponse.json(
          {
            success: false,
            message: "This Bus ID already exists.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          message: "This registration number already exists.",
        },
        { status: 409 }
      );
    }

    const bus = await prisma.bus.create({
      data: {
        busId,
        busNumber,
        registration,
        status,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Bus created successfully.",
        bus: {
          id: bus.id,
          busId: bus.busId,
          busNumber: bus.busNumber,
          registration: bus.registration,
          status: bus.status,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("ADMIN_BUSES_POST_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to create bus.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAdmin();

    if (auth.response) {
      return auth.response;
    }

    const body = await request.json();

    const result = updateBusSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: result.error.issues[0]?.message ?? "Invalid bus data.",
        },
        { status: 400 }
      );
    }

    const {
      id,
      busId,
      busNumber,
      registration,
      status,
    } = result.data;

    const existingBus = await prisma.bus.findUnique({
      where: {
        id,
      },
    });

    if (!existingBus) {
      return NextResponse.json(
        {
          success: false,
          message: "Bus not found.",
        },
        { status: 404 }
      );
    }

    const duplicateBus = await prisma.bus.findFirst({
      where: {
        OR: [
          {
            busId,
          },
          {
            registration,
          },
        ],
        NOT: {
          id,
        },
      },
      select: {
        busId: true,
        registration: true,
      },
    });

    if (duplicateBus) {
      if (duplicateBus.busId === busId) {
        return NextResponse.json(
          {
            success: false,
            message: "This Bus ID already exists.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          message: "This registration number already exists.",
        },
        { status: 409 }
      );
    }

    const bus = await prisma.bus.update({
      where: {
        id,
      },
      data: {
        busId,
        busNumber,
        registration,
        status,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Bus updated successfully.",
      bus: {
        id: bus.id,
        busId: bus.busId,
        busNumber: bus.busNumber,
        registration: bus.registration,
        status: bus.status,
      },
    });
  } catch (error) {
    console.error("ADMIN_BUSES_PUT_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to update bus.",
      },
      { status: 500 }
    );
  }
}