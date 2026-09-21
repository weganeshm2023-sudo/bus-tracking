import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const createDriverSchema = z.object({
  driverId: z.string().trim().min(1).max(50),
  name: z.string().trim().min(2).max(100),
  username: z.string().trim().min(3).max(50),
  password: z.string().min(8).max(100),
});

const updateDriverSchema = z.object({
  id: z.string().min(1),
  driverId: z.string().trim().min(1).max(50),
  name: z.string().trim().min(2).max(100),
  username: z.string().trim().min(3).max(50),
  password: z.string().max(100).optional(),
});

async function requireAdmin() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      {
        success: false,
        message: "Authentication required.",
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

  return null;
}

export async function GET() {
  try {
    const authError = await requireAdmin();

    if (authError) {
      return authError;
    }

    const drivers = await prisma.driver.findMany({
      orderBy: {
        driverId: "asc",
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
          take: 1,
        },
      },
    });

    return NextResponse.json({
      success: true,
      drivers: drivers.map((driver) => ({
        id: driver.id,
        driverId: driver.driverId,
        name: driver.name,
        username: driver.user.username,
        assignedBus: driver.assignments[0]?.bus
          ? {
              id: driver.assignments[0].bus.id,
              busId: driver.assignments[0].bus.busId,
              busNumber: driver.assignments[0].bus.busNumber,
              registration: driver.assignments[0].bus.registration,
            }
          : null,
        createdAt: driver.createdAt,
        updatedAt: driver.updatedAt,
      })),
    });
  } catch (error) {
    console.error("ADMIN_DRIVERS_GET_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to load drivers.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const authError = await requireAdmin();

    if (authError) {
      return authError;
    }

    const body = await request.json();

    const result = createDriverSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message:
            result.error.issues[0]?.message ??
            "Invalid driver data.",
        },
        { status: 400 }
      );
    }

    const {
      driverId,
      name,
      username,
      password,
    } = result.data;

    const existingDriver = await prisma.driver.findUnique({
      where: {
        driverId,
      },
    });

    if (existingDriver) {
      return NextResponse.json(
        {
          success: false,
          message: "This Driver ID already exists.",
        },
        { status: 409 }
      );
    }

    const existingUsername = await prisma.user.findUnique({
      where: {
        username,
      },
    });

    if (existingUsername) {
      return NextResponse.json(
        {
          success: false,
          message: "This username is already in use.",
        },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const driver = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          passwordHash,
          role: "DRIVER",
        },
      });

      return tx.driver.create({
        data: {
          driverId,
          name,
          userId: user.id,
        },
        include: {
          user: {
            select: {
              username: true,
            },
          },
        },
      });
    });

    return NextResponse.json(
      {
        success: true,
        message: "Driver created successfully.",
        driver: {
          id: driver.id,
          driverId: driver.driverId,
          name: driver.name,
          username: driver.user.username,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("ADMIN_DRIVERS_POST_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to create driver.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const authError = await requireAdmin();

    if (authError) {
      return authError;
    }

    const body = await request.json();

    const result = updateDriverSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message:
            result.error.issues[0]?.message ??
            "Invalid driver data.",
        },
        { status: 400 }
      );
    }

    const {
      id,
      driverId,
      name,
      username,
      password,
    } = result.data;

    const existingDriver = await prisma.driver.findUnique({
      where: {
        id,
      },
      include: {
        user: true,
      },
    });

    if (!existingDriver) {
      return NextResponse.json(
        {
          success: false,
          message: "Driver not found.",
        },
        { status: 404 }
      );
    }

    const duplicateDriver = await prisma.driver.findFirst({
      where: {
        driverId,
        NOT: {
          id,
        },
      },
    });

    if (duplicateDriver) {
      return NextResponse.json(
        {
          success: false,
          message: "This Driver ID already exists.",
        },
        { status: 409 }
      );
    }

    const duplicateUsername = await prisma.user.findFirst({
      where: {
        username,
        NOT: {
          id: existingDriver.userId,
        },
      },
    });

    if (duplicateUsername) {
      return NextResponse.json(
        {
          success: false,
          message: "This username is already in use.",
        },
        { status: 409 }
      );
    }

    const updatedDriver = await prisma.$transaction(async (tx) => {
      const userUpdateData: {
        username: string;
        passwordHash?: string;
      } = {
        username,
      };

      if (password && password.trim()) {
        userUpdateData.passwordHash = await bcrypt.hash(
          password,
          12
        );
      }

      await tx.user.update({
        where: {
          id: existingDriver.userId,
        },
        data: userUpdateData,
      });

      return tx.driver.update({
        where: {
          id,
        },
        data: {
          driverId,
          name,
        },
        include: {
          user: {
            select: {
              username: true,
            },
          },
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Driver updated successfully.",
      driver: {
        id: updatedDriver.id,
        driverId: updatedDriver.driverId,
        name: updatedDriver.name,
        username: updatedDriver.user.username,
      },
    });
  } catch (error) {
    console.error("ADMIN_DRIVERS_PUT_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to update driver.",
      },
      { status: 500 }
    );
  }
}