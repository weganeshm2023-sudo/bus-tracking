import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    routeId: string;
  }>;
};

function isValidNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

export async function GET(
  request: Request,
  context: RouteContext
) {
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

    const { routeId } = await context.params;

    const route = await prisma.route.findUnique({
      where: {
        id: routeId,
      },
      select: {
        id: true,
        routeId: true,
        name: true,
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
            routeId: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!route) {
      return NextResponse.json(
        {
          success: false,
          message: "Route not found.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      route,
      stops: route.stops,
    });
  } catch (error) {
    console.error("GET_ROUTE_STOPS_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to load route stops.",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: RouteContext
) {
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

    const { routeId } = await context.params;

    const body = await request.json();

    const stopId =
      typeof body?.stopId === "string"
        ? body.stopId.trim()
        : "";

    const name =
      typeof body?.name === "string"
        ? body.name.trim()
        : "";

    const sequence =
      typeof body?.sequence === "number"
        ? body.sequence
        : Number(body?.sequence);

    const latitude =
      typeof body?.latitude === "number"
        ? body.latitude
        : Number(body?.latitude);

    const longitude =
      typeof body?.longitude === "number"
        ? body.longitude
        : Number(body?.longitude);

    if (!stopId) {
      return NextResponse.json(
        {
          success: false,
          message: "Stop ID is required.",
        },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          message: "Stop name is required.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(sequence) ||
      sequence < 1
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Sequence must be a whole number greater than 0.",
        },
        { status: 400 }
      );
    }

    if (
      !isValidNumber(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Latitude must be between -90 and 90.",
        },
        { status: 400 }
      );
    }

    if (
      !isValidNumber(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Longitude must be between -180 and 180.",
        },
        { status: 400 }
      );
    }

    const route = await prisma.route.findUnique({
      where: {
        id: routeId,
      },
      select: {
        id: true,
        routeId: true,
        name: true,
      },
    });

    if (!route) {
      return NextResponse.json(
        {
          success: false,
          message: "Route not found.",
        },
        { status: 404 }
      );
    }

    const existingStopId =
      await prisma.busStop.findUnique({
        where: {
          stopId,
        },
      });

    if (existingStopId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "This Stop ID already exists.",
        },
        { status: 409 }
      );
    }

    const existingSequence =
      await prisma.busStop.findFirst({
        where: {
          routeId: route.id,
          sequence,
        },
      });

    if (existingSequence) {
      return NextResponse.json(
        {
          success: false,
          message:
            "This sequence number already exists on this route.",
        },
        { status: 409 }
      );
    }

    const stop = await prisma.busStop.create({
      data: {
        stopId,
        name,
        latitude,
        longitude,
        sequence,
        routeId: route.id,
      },
      select: {
        id: true,
        stopId: true,
        name: true,
        latitude: true,
        longitude: true,
        sequence: true,
        routeId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Stop created successfully.",
        stop,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("CREATE_ROUTE_STOP_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to create stop.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  context: RouteContext
) {
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

    const { routeId } = await context.params;

    const body = await request.json();

    const stopRecordId =
      typeof body?.id === "string"
        ? body.id.trim()
        : "";

    const stopId =
      typeof body?.stopId === "string"
        ? body.stopId.trim()
        : "";

    const name =
      typeof body?.name === "string"
        ? body.name.trim()
        : "";

    const sequence =
      typeof body?.sequence === "number"
        ? body.sequence
        : Number(body?.sequence);

    const latitude =
      typeof body?.latitude === "number"
        ? body.latitude
        : Number(body?.latitude);

    const longitude =
      typeof body?.longitude === "number"
        ? body.longitude
        : Number(body?.longitude);

    if (!stopRecordId) {
      return NextResponse.json(
        {
          success: false,
          message: "Stop ID is missing.",
        },
        { status: 400 }
      );
    }

    if (!stopId || !name) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Stop ID and stop name are required.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(sequence) ||
      sequence < 1
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Sequence must be a whole number greater than 0.",
        },
        { status: 400 }
      );
    }

    if (
      !isValidNumber(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Latitude must be between -90 and 90.",
        },
        { status: 400 }
      );
    }

    if (
      !isValidNumber(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Longitude must be between -180 and 180.",
        },
        { status: 400 }
      );
    }

    const route = await prisma.route.findUnique({
      where: {
        id: routeId,
      },
      select: {
        id: true,
      },
    });

    if (!route) {
      return NextResponse.json(
        {
          success: false,
          message: "Route not found.",
        },
        { status: 404 }
      );
    }

    const existingStop =
      await prisma.busStop.findUnique({
        where: {
          id: stopRecordId,
        },
      });

    if (!existingStop) {
      return NextResponse.json(
        {
          success: false,
          message: "Stop not found.",
        },
        { status: 404 }
      );
    }

    if (existingStop.routeId !== route.id) {
      return NextResponse.json(
        {
          success: false,
          message:
            "This stop does not belong to the selected route.",
        },
        { status: 400 }
      );
    }

    const duplicateStopId =
      await prisma.busStop.findFirst({
        where: {
          stopId,
          NOT: {
            id: stopRecordId,
          },
        },
      });

    if (duplicateStopId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "This Stop ID already exists.",
        },
        { status: 409 }
      );
    }

    const duplicateSequence =
      await prisma.busStop.findFirst({
        where: {
          routeId: route.id,
          sequence,
          NOT: {
            id: stopRecordId,
          },
        },
      });

    if (duplicateSequence) {
      return NextResponse.json(
        {
          success: false,
          message:
            "This sequence number already exists on this route.",
        },
        { status: 409 }
      );
    }

    const stop = await prisma.busStop.update({
      where: {
        id: stopRecordId,
      },
      data: {
        stopId,
        name,
        latitude,
        longitude,
        sequence,
      },
      select: {
        id: true,
        stopId: true,
        name: true,
        latitude: true,
        longitude: true,
        sequence: true,
        routeId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Stop updated successfully.",
      stop,
    });
  } catch (error) {
    console.error("UPDATE_ROUTE_STOP_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to update stop.",
      },
      { status: 500 }
    );
  }
}