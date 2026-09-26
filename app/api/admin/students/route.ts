import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const locationFieldsSchema = z
  .object({
    locationName: z.string().trim().max(150).optional().default(""),
    address: z.string().trim().max(300).optional().default(""),
    latitude: z.string().trim().optional().default(""),
    longitude: z.string().trim().optional().default(""),
  })
  .superRefine((value, ctx) => {
    const hasLatitude = value.latitude.length > 0;
    const hasLongitude = value.longitude.length > 0;

    if (hasLatitude !== hasLongitude) {
      ctx.addIssue({
        code: "custom",
        path: ["latitude"],
        message: "Latitude and longitude must be provided together.",
      });

      return;
    }

    if (!hasLatitude && !hasLongitude) {
      return;
    }

    const latitude = Number(value.latitude);
    const longitude = Number(value.longitude);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      ctx.addIssue({
        code: "custom",
        path: ["latitude"],
        message: "Latitude must be between -90 and 90.",
      });
    }

    if (
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["longitude"],
        message: "Longitude must be between -180 and 180.",
      });
    }

    if (!value.locationName.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["locationName"],
        message: "Location name is required when coordinates are provided.",
      });
    }
  });

const createStudentSchema = z.object({
  studentId: z
    .string()
    .trim()
    .min(1, "Student ID is required")
    .max(50),
  name: z.string().trim().min(2, "Student name is required").max(100),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(50),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(100),
  locationName: z.string().trim().max(150).optional().default(""),
  address: z.string().trim().max(300).optional().default(""),
  latitude: z.string().trim().optional().default(""),
  longitude: z.string().trim().optional().default(""),
});

const updateStudentSchema = z.object({
  id: z.string().min(1),
  studentId: z.string().trim().min(1).max(50),
  name: z.string().trim().min(2).max(100),
  username: z.string().trim().min(3).max(50),
  password: z.string().max(100).optional(),
  locationName: z.string().trim().max(150).optional().default(""),
  address: z.string().trim().max(300).optional().default(""),
  latitude: z.string().trim().optional().default(""),
  longitude: z.string().trim().optional().default(""),
});

function validateLocationFields(
  data: {
    locationName?: string;
    address?: string;
    latitude?: string;
    longitude?: string;
  },
  ctx: z.RefinementCtx
) {
  const locationName = data.locationName?.trim() ?? "";
  const latitudeText = data.latitude?.trim() ?? "";
  const longitudeText = data.longitude?.trim() ?? "";

  const hasLatitude = latitudeText.length > 0;
  const hasLongitude = longitudeText.length > 0;

  if (hasLatitude !== hasLongitude) {
    ctx.addIssue({
      code: "custom",
      path: ["latitude"],
      message: "Latitude and longitude must be provided together.",
    });

    return;
  }

  if (!hasLatitude && !hasLongitude) {
    return;
  }

  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    ctx.addIssue({
      code: "custom",
      path: ["latitude"],
      message: "Latitude must be between -90 and 90.",
    });
  }

  if (
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["longitude"],
      message: "Longitude must be between -180 and 180.",
    });
  }

  if (!locationName) {
    ctx.addIssue({
      code: "custom",
      path: ["locationName"],
      message: "Location name is required when coordinates are provided.",
    });
  }
}

const createStudentValidationSchema = createStudentSchema.superRefine(
  (value, ctx) => {
    validateLocationFields(value, ctx);
  }
);

const updateStudentValidationSchema = updateStudentSchema.superRefine(
  (value, ctx) => {
    validateLocationFields(value, ctx);
  }
);

async function requireAdmin() {
  const session = await getSession();

  if (!session) {
    throw new Error("UNAUTHORIZED");
  }

  if (session.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }

  return session;
}

function getLocationData(data: {
  locationName?: string;
  address?: string;
  latitude?: string;
  longitude?: string;
}) {
  const locationName = data.locationName?.trim() ?? "";
  const address = data.address?.trim() ?? "";
  const latitudeText = data.latitude?.trim() ?? "";
  const longitudeText = data.longitude?.trim() ?? "";

  if (!latitudeText && !longitudeText) {
    return null;
  }

  return {
    name: locationName,
    address: address || null,
    latitude: Number(latitudeText),
    longitude: Number(longitudeText),
    active: true,
  };
}

function authErrorResponse(error: unknown, fallback: string) {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return NextResponse.json(
      {
        success: false,
        message: "Authentication required.",
      },
      { status: 401 }
    );
  }

  if (error instanceof Error && error.message === "FORBIDDEN") {
    return NextResponse.json(
      {
        success: false,
        message: "Administrator access required.",
      },
      { status: 403 }
    );
  }

  return NextResponse.json(
    {
      success: false,
      message: fallback,
    },
    { status: 500 }
  );
}

export async function GET() {
  try {
    await requireAdmin();

    const students = await prisma.student.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            createdAt: true,
          },
        },
        location: {
          select: {
            id: true,
            studentId: true,
            name: true,
            address: true,
            latitude: true,
            longitude: true,
            active: true,
            updatedAt: true,
          },
        },
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
                registration: true,
                status: true,
              },
            },
            route: {
              select: {
                id: true,
                routeId: true,
                name: true,
              },
            },
            stop: {
              select: {
                id: true,
                stopId: true,
                name: true,
                sequence: true,
              },
            },
          },
          take: 1,
        },
      },
    });

    return NextResponse.json({
      success: true,
      students,
    });
  } catch (error) {
    console.error("ADMIN_STUDENTS_GET_ERROR:", error);

    return authErrorResponse(error, "Unable to load students.");
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const body = await request.json();

    const result = createStudentValidationSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message:
            result.error.issues[0]?.message ?? "Invalid student data.",
        },
        { status: 400 }
      );
    }

    const {
      studentId,
      name,
      username,
      password,
      locationName,
      address,
      latitude,
      longitude,
    } = result.data;

    const existingStudent = await prisma.student.findUnique({
      where: {
        studentId,
      },
    });

    if (existingStudent) {
      return NextResponse.json(
        {
          success: false,
          message: "Student ID already exists.",
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
          message: "Username already exists.",
        },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const locationData = getLocationData({
      locationName,
      address,
      latitude,
      longitude,
    });

    const student = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          passwordHash,
          role: "STUDENT",
        },
      });

      return tx.student.create({
        data: {
          studentId,
          name,
          userId: user.id,
          ...(locationData
            ? {
                location: {
                  create: locationData,
                },
              }
            : {}),
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
          location: true,
        },
      });
    });

    return NextResponse.json(
      {
        success: true,
        message: locationData
          ? "Student and location created successfully."
          : "Student created successfully.",
        student,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("ADMIN_STUDENTS_POST_ERROR:", error);

    return authErrorResponse(error, "Unable to create student.");
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();

    const body = await request.json();

    const result = updateStudentValidationSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message:
            result.error.issues[0]?.message ?? "Invalid student data.",
        },
        { status: 400 }
      );
    }

    const {
      id,
      studentId,
      name,
      username,
      password,
      locationName,
      address,
      latitude,
      longitude,
    } = result.data;

    const currentStudent = await prisma.student.findUnique({
      where: {
        id,
      },
      include: {
        user: true,
        location: true,
      },
    });

    if (!currentStudent) {
      return NextResponse.json(
        {
          success: false,
          message: "Student not found.",
        },
        { status: 404 }
      );
    }

    const duplicateStudent = await prisma.student.findFirst({
      where: {
        studentId,
        NOT: {
          id,
        },
      },
    });

    if (duplicateStudent) {
      return NextResponse.json(
        {
          success: false,
          message: "Student ID already exists.",
        },
        { status: 409 }
      );
    }

    const duplicateUsername = await prisma.user.findFirst({
      where: {
        username,
        NOT: {
          id: currentStudent.userId,
        },
      },
    });

    if (duplicateUsername) {
      return NextResponse.json(
        {
          success: false,
          message: "Username already exists.",
        },
        { status: 409 }
      );
    }

    const passwordHash =
      password && password.trim().length > 0
        ? await bcrypt.hash(password, 12)
        : undefined;

    const locationData = getLocationData({
      locationName,
      address,
      latitude,
      longitude,
    });

    const student = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: {
          id: currentStudent.userId,
        },
        data: {
          username,
          ...(passwordHash ? { passwordHash } : {}),
        },
      });

      await tx.student.update({
        where: {
          id,
        },
        data: {
          studentId,
          name,
        },
      });

      if (locationData) {
        await tx.studentLocation.upsert({
          where: {
            studentId: id,
          },
          create: {
            studentId: id,
            ...locationData,
          },
          update: {
            name: locationData.name,
            address: locationData.address,
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            active: true,
          },
        });
      }

      return tx.student.findUniqueOrThrow({
        where: {
          id,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
          location: true,
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: locationData
        ? "Student and location updated successfully."
        : "Student updated successfully.",
      student,
    });
  } catch (error) {
    console.error("ADMIN_STUDENTS_PUT_ERROR:", error);

    return authErrorResponse(error, "Unable to update student.");
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();

    const body = await request.json();

    const id = typeof body?.id === "string" ? body.id : "";
    const deleteLocation = body?.deleteLocation === true;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          message: "Student ID is required.",
        },
        { status: 400 }
      );
    }

    const student = await prisma.student.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        userId: true,
        location: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json(
        {
          success: false,
          message: "Student not found.",
        },
        { status: 404 }
      );
    }

    if (deleteLocation) {
      if (!student.location) {
        return NextResponse.json({
          success: true,
          message: "Student has no saved location.",
        });
      }

      await prisma.studentLocation.delete({
        where: {
          studentId: id,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Student location removed successfully.",
      });
    }

    await prisma.user.delete({
      where: {
        id: student.userId,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Student deleted successfully.",
    });
  } catch (error) {
    console.error("ADMIN_STUDENTS_DELETE_ERROR:", error);

    return authErrorResponse(error, "Unable to delete student.");
  }
}