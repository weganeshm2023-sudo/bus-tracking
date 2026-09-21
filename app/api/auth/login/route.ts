import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  createSessionToken,
  type UserRole,
} from "@/lib/auth";

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
  role: z
    .enum(["ADMIN", "DRIVER", "STUDENT"])
    .optional(),
});

const SESSION_COOKIE = "bus_tracking_session";

export async function POST(request: Request) {
  const contentType =
    request.headers.get("content-type") || "";

  const isFormRequest =
    contentType.includes(
      "application/x-www-form-urlencoded"
    ) ||
    contentType.includes("multipart/form-data");

  try {
    let rawBody: {
      username?: unknown;
      password?: unknown;
      role?: unknown;
    };

    if (contentType.includes("application/json")) {
      rawBody = await request.json();
    } else {
      const formData = await request.formData();

      rawBody = {
        username: formData.get("username"),
        password: formData.get("password"),
        role: formData.get("role"),
      };
    }

    const result =
      loginSchema.safeParse(rawBody);

    if (!result.success) {
      if (isFormRequest) {
        return NextResponse.redirect(
          new URL(
            "/admin/login?error=invalid-input",
            request.url
          ),
          303
        );
      }

      return NextResponse.json(
        {
          success: false,
          message:
            "Username and password are required.",
        },
        { status: 400 }
      );
    }

    const {
      username,
      password,
      role,
    } = result.data;

    const user = await prisma.user.findUnique({
      where: {
        username,
      },
      include: {
        student: true,
        driver: true,
      },
    });

    if (!user) {
      if (isFormRequest) {
        return NextResponse.redirect(
          new URL(
            "/admin/login?error=invalid-credentials",
            request.url
          ),
          303
        );
      }

      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid username or password.",
        },
        { status: 401 }
      );
    }

    const passwordValid =
      await bcrypt.compare(
        password,
        user.passwordHash
      );

    if (!passwordValid) {
      if (isFormRequest) {
        return NextResponse.redirect(
          new URL(
            "/admin/login?error=invalid-credentials",
            request.url
          ),
          303
        );
      }

      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid username or password.",
        },
        { status: 401 }
      );
    }

    if (
      role &&
      user.role !== role
    ) {
      if (isFormRequest) {
        return NextResponse.redirect(
          new URL(
            "/admin/login?error=unauthorized",
            request.url
          ),
          303
        );
      }

      return NextResponse.json(
        {
          success: false,
          message:
            "You are not authorized to use this login portal.",
        },
        { status: 403 }
      );
    }

    /*
     * IMPORTANT:
     *
     * session.studentId must contain Student.id
     * session.driverId must contain Driver.id.
     *
     * The dashboard APIs use these values with
     * Prisma's primary-key lookup.
     */
    const sessionPayload = {
      sub: user.id,
      username: user.username,
      role: user.role as UserRole,

      studentId:
        user.student?.id ?? null,

      driverId:
        user.driver?.id ?? null,
    };

    const token =
      await createSessionToken(
        sessionPayload
      );

    /*
     * Form login
     */
    if (isFormRequest) {
      const redirectPath =
        user.role === "ADMIN"
          ? "/admin/dashboard"
          : user.role === "DRIVER"
            ? "/driver/dashboard"
            : "/";

      const response =
        NextResponse.redirect(
          new URL(
            redirectPath,
            request.url
          ),
          303
        );

      response.cookies.set({
        name: SESSION_COOKIE,
        value: token,
        httpOnly: true,
        secure:
          process.env.NODE_ENV ===
          "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });

      return response;
    }

    /*
     * JSON login
     */
    const response =
      NextResponse.json({
        success: true,
        message: "Login successful.",

        user: {
          id: user.id,
          username: user.username,
          role: user.role,

          studentId:
            user.student?.id ?? null,

          driverId:
            user.driver?.id ?? null,
        },
      });

    response.cookies.set({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true,
      secure:
        process.env.NODE_ENV ===
        "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error(
      "LOGIN_ERROR:",
      error
    );

    if (isFormRequest) {
      return NextResponse.redirect(
        new URL(
          "/admin/login?error=server-error",
          request.url
        ),
        303
      );
    }

    return NextResponse.json(
      {
        success: false,
        message:
          "Unable to process login request.",
      },
      { status: 500 }
    );
  }
}