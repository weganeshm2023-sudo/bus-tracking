import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const createRouteSchema = z.object({
  routeId: z.string().trim().min(1).max(50),
  name: z.string().trim().min(2).max(150),
});

const updateRouteSchema = createRouteSchema.extend({
  id: z.string().min(1),
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

    const routes = await prisma.route.findMany({
      orderBy: {
        routeId: "asc",
      },
      include: {
        stops: {
          orderBy: {
            sequence: "asc",
          },
        },
        _count: {
          select: {
            assignments: true,
            trips: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      routes: routes.map((route) => ({
        id: route.id,
        routeId: route.routeId,
        name: route.name,
        stops: route.stops.map((stop) => ({
          id: stop.id,
          stopId: stop.stopId,
          name: stop.name,
          latitude: stop.latitude,
          longitude: stop.longitude,
          sequence: stop.sequence,
        })),
        stopCount: route.stops.length,
        assignmentCount: route._count.assignments,
        tripCount: route._count.trips,
        createdAt: route.createdAt,
        updatedAt: route.updatedAt,
      })),
    });
  } catch (error) {
    console.error("ADMIN_ROUTES_GET_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to load routes.",
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

    const result = createRouteSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message:
            result.error.issues[0]?.message ??
            "Invalid route data.",
        },
        { status: 400 }
      );
    }

    const { routeId, name } = result.data;

    const existingRoute = await prisma.route.findUnique({
      where: {
        routeId,
      },
    });

    if (existingRoute) {
      return NextResponse.json(
        {
          success: false,
          message: "This Route ID already exists.",
        },
        { status: 409 }
      );
    }

    const route = await prisma.route.create({
      data: {
        routeId,
        name,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Route created successfully.",
        route: {
          id: route.id,
          routeId: route.routeId,
          name: route.name,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("ADMIN_ROUTES_POST_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to create route.",
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

    const result = updateRouteSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message:
            result.error.issues[0]?.message ??
            "Invalid route data.",
        },
        { status: 400 }
      );
    }

    const {
      id,
      routeId,
      name,
    } = result.data;

    const existingRoute = await prisma.route.findUnique({
      where: {
        id,
      },
    });

    if (!existingRoute) {
      return NextResponse.json(
        {
          success: false,
          message: "Route not found.",
        },
        { status: 404 }
      );
    }

    const duplicateRoute = await prisma.route.findFirst({
      where: {
        routeId,
        NOT: {
          id,
        },
      },
    });

    if (duplicateRoute) {
      return NextResponse.json(
        {
          success: false,
          message: "This Route ID already exists.",
        },
        { status: 409 }
      );
    }

    const route = await prisma.route.update({
      where: {
        id,
      },
      data: {
        routeId,
        name,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Route updated successfully.",
      route: {
        id: route.id,
        routeId: route.routeId,
        name: route.name,
      },
    });
  } catch (error) {
    console.error("ADMIN_ROUTES_PUT_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to update route.",
      },
      { status: 500 }
    );
  }
}