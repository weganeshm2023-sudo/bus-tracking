import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { SignJWT } from "jose";

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Session not available. Please login again.",
        },
        { status: 401 }
      );
    }

    if (
      session.role !== "ADMIN" &&
      session.role !== "DRIVER" &&
      session.role !== "STUDENT"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Socket access denied.",
        },
        { status: 403 }
      );
    }

    const secret = process.env.SESSION_SECRET;

    if (!secret) {
      console.error(
        "[SOCKET TOKEN] SESSION_SECRET missing"
      );

      return NextResponse.json(
        {
          success: false,
          message: "SESSION_SECRET is not configured.",
        },
        { status: 500 }
      );
    }

    const secretKey = new TextEncoder().encode(
      secret
    );

    const token = await new SignJWT({
      username: session.username,
      role: session.role,
      studentId: session.studentId ?? null,
      driverId: session.driverId ?? null,
      socket: true,
    })
      .setProtectedHeader({
        alg: "HS256",
      })
      .setSubject(session.sub)
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(secretKey);

    console.log(
      "[SOCKET TOKEN] Token created:",
      {
        username: session.username,
        role: session.role,
      }
    );

    return NextResponse.json({
      success: true,
      token,
      role: session.role,
    });
  } catch (error) {
    console.error(
      "[SOCKET TOKEN ERROR]",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Unable to create socket token.",
      },
      { status: 500 }
    );
  }
}