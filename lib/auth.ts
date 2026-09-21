import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SESSION_COOKIE = "bus_tracking_session";

export type UserRole = "ADMIN" | "DRIVER" | "STUDENT";

export type SessionPayload = {
  sub: string;
  username: string;
  role: UserRole;
  studentId?: string | null;
  driverId?: string | null;
};

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("SESSION_SECRET is not configured.");
  }

  return new TextEncoder().encode(secret);
}

export async function createSessionToken(
  payload: SessionPayload
) {
  return new SignJWT({
    username: payload.username,
    role: payload.role,
    studentId: payload.studentId ?? null,
    driverId: payload.driverId ?? null,
  })
    .setProtectedHeader({
      alg: "HS256",
    })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecretKey());
}

export async function createSession(
  payload: SessionPayload
) {
  const token = await createSessionToken(payload);

  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();

  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(
      token,
      getSecretKey(),
      {
        algorithms: ["HS256"],
      }
    );

    if (
      typeof payload.sub !== "string" ||
      typeof payload.username !== "string" ||
      (payload.role !== "ADMIN" &&
        payload.role !== "DRIVER" &&
        payload.role !== "STUDENT")
    ) {
      return null;
    }

    return {
      sub: payload.sub,
      username: payload.username,
      role: payload.role,
      studentId:
        typeof payload.studentId === "string"
          ? payload.studentId
          : null,
      driverId:
        typeof payload.driverId === "string"
          ? payload.driverId
          : null,
    };
  } catch (error) {
    console.error("SESSION_VERIFY_ERROR:", error);
    return null;
  }
}

export async function clearSession() {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function requireSession() {
  const session = await getSession();

  if (!session) {
    throw new Error("UNAUTHORIZED");
  }

  return session;
}

export async function requireRole(role: UserRole) {
  const session = await requireSession();

  if (session.role !== role) {
    throw new Error("FORBIDDEN");
  }

  return session;
}
