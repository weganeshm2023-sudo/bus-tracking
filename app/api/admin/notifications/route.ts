import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Login required.",
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

    const notifications =
      await prisma.notification.findMany({
        orderBy: {
          createdAt: "desc",
        },
        include: {
          student: {
            select: {
              id: true,
              studentId: true,
              name: true,
              active: true,
            },
          },
        },
        take: 500,
      });

    const formattedNotifications =
      notifications.map((notification) => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        tripId: notification.tripId,
        read: notification.read,
        createdAt: notification.createdAt.toISOString(),

        student: {
          id: notification.student.id,
          studentId: notification.student.studentId,
          name: notification.student.name,
          active: notification.student.active,
        },
      }));

    const unreadCount =
      formattedNotifications.filter(
        (notification) => !notification.read
      ).length;

    return NextResponse.json(
      {
        success: true,

        notifications: formattedNotifications,

        meta: {
          total: formattedNotifications.length,
          unread: unreadCount,
          read:
            formattedNotifications.length -
            unreadCount,
        },
      },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      }
    );
  } catch (error) {
    console.error(
      "[ADMIN NOTIFICATIONS] ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Unable to load notifications.",
      },
      { status: 500 }
    );
  }
}
