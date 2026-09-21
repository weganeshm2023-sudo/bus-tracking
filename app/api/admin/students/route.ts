import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const createStudentSchema = z.object({
  studentId: z.string().trim().min(1, "Student ID is required").max(50),
  name: z.string().trim().min(2, "Student name is required").max(100),
  username: z.string().trim().min(3, "Username must be at least 3 characters").max(50),
  password: z.string().min(6, "Password must be at least 6 characters").max(100),
});

const updateStudentSchema = z.object({
  id: z.string().min(1),
  studentId: z.string().trim().min(1).max(50),
  name: z.string().trim().min(2).max(100),
  username: z.string().trim().min(3).max(50),
  password: z.string().max(100).optional(),
});

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

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { success: false, message: "Authentication required." },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { success: false, message: "Administrator access required." },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Unable to load students.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const body = await request.json();
    const result = createStudentSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: result.error.issues[0]?.message ?? "Invalid student data.",
        },
        { status: 400 }
      );
    }

    const { studentId, name, username, password } = result.data;

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
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });
    });

    return NextResponse.json(
      {
        success: true,
        message: "Student created successfully.",
        student,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("ADMIN_STUDENTS_POST_ERROR:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { success: false, message: "Authentication required." },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { success: false, message: "Administrator access required." },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Unable to create student.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();

    const body = await request.json();
    const result = updateStudentSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: result.error.issues[0]?.message ?? "Invalid student data.",
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
    } = result.data;

    const currentStudent = await prisma.student.findUnique({
      where: {
        id,
      },
      include: {
        user: true,
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

      return tx.student.update({
        where: {
          id,
        },
        data: {
          studentId,
          name,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Student updated successfully.",
      student,
    });
  } catch (error) {
    console.error("ADMIN_STUDENTS_PUT_ERROR:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { success: false, message: "Authentication required." },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { success: false, message: "Administrator access required." },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Unable to update student.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();

    const body = await request.json();

    const id = typeof body?.id === "string" ? body.id : "";

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

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { success: false, message: "Authentication required." },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { success: false, message: "Administrator access required." },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Unable to delete student.",
      },
      { status: 500 }
    );
  }
}