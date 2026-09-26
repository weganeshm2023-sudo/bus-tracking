import "dotenv/config";

import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { jwtVerify } from "jose";

import { prisma } from "@/lib/prisma";
import {
  getOrCreateTodayTrip,
  getTodayTripDate,
} from "@/lib/daily-trip";

/* =========================================================
   SERVER CONFIGURATION
========================================================= */

const PORT = Number(
  process.env.PORT || 4001
);

const JWT_ALGORITHM = "HS256";

/*
 * Local development origins.
 *
 * FRONTEND_URL will be added automatically
 * when running in production on Render.
 *
 * Example:
 * FRONTEND_URL=https://your-next-app.onrender.com
 */
const allowedOrigins = [
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  ...(process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL]
    : []),
];

const sessionSecret =
  process.env.SESSION_SECRET;

if (!sessionSecret) {
  throw new Error(
    "SESSION_SECRET is missing. Check D:\\bus-tracking\\.env"
  );
}

const JWT_SECRET =
  new TextEncoder().encode(
    sessionSecret
  );

/* =========================================================
   TYPES
========================================================= */

type Role =
  | "ADMIN"
  | "DRIVER"
  | "STUDENT";

type SocketSession = {
  sub: string;
  username: string;
  role: Role;
  studentId?: string | null;
  driverId?: string | null;
};

type AckResponse = {
  success: boolean;
  message?: string;
  tripId?: string;
  busId?: string;
  startedAt?: string;
  completedAt?: string;
};

type SocketAck = (
  response: AckResponse
) => void;

type DriverLocationData = {
  latitude?: unknown;
  longitude?: unknown;
  accuracy?: unknown;
  speed?: unknown;
  heading?: unknown;
};

type TripRequestData = {
  tripId?: unknown;
};

/* =========================================================
   HTTP SERVER
========================================================= */

const httpServer =
  http.createServer();

/* =========================================================
   SOCKET.IO
========================================================= */

const io =
  new SocketIOServer(
    httpServer,
    {
      cors: {
        origin: allowedOrigins,
        credentials: true,
      },

      transports: [
        "websocket",
        "polling",
      ],
    }
  );

/* =========================================================
   HELPERS
========================================================= */

function normalizeNumber(
  value: unknown
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === "string") {
    const parsed =
      Number(value);

    if (
      Number.isFinite(parsed)
    ) {
      return parsed;
    }
  }

  return null;
}

function calculateDistanceMeters(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number
): number {
  const earthRadius =
    6371000;

  const lat1 =
    (latitude1 * Math.PI) /
    180;

  const lat2 =
    (latitude2 * Math.PI) /
    180;

  const deltaLat =
    ((latitude2 - latitude1) *
      Math.PI) /
    180;

  const deltaLng =
    ((longitude2 - longitude1) *
      Math.PI) /
    180;

  const a =
    Math.sin(deltaLat / 2) *
      Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadius * c;
}

function getProximityType(
  distanceMeters: number
) {
  if (distanceMeters <= 100) {
    return {
      status:
        "ARRIVED" as const,

      notificationType:
        "BUS_ARRIVING" as const,

      message:
        "Your bus has reached your pickup stop.",
    };
  }

  if (distanceMeters <= 500) {
    return {
      status:
        "APPROACHING" as const,

      notificationType:
        "BUS_NEAR" as const,

      message:
        "Your bus is very near your pickup stop.",
    };
  }

  if (distanceMeters <= 1000) {
    return {
      status:
        "APPROACHING" as const,

      notificationType:
        "BUS_APPROACHING" as const,

      message:
        "Your bus is approaching your pickup stop.",
    };
  }

  return null;
}

function isValidCoordinates(
  latitude: number,
  longitude: number
) {
  return (
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/* =========================================================
   FIND DRIVER
========================================================= */

async function findDriver(
  driverIdentifier: string
) {
  return prisma.driver.findFirst({
    where: {
      OR: [
        {
          id: driverIdentifier,
        },
        {
          driverId:
            driverIdentifier,
        },
      ],
    },
  });
}

/* =========================================================
   FIND TRIP BY ID
========================================================= */

async function findTripByIdentifier(
  identifier: string
) {
  const byPublicId =
    await prisma.trip.findUnique({
      where: {
        tripId: identifier,
      },
    });

  if (byPublicId) {
    return byPublicId;
  }

  return prisma.trip.findUnique({
    where: {
      id: identifier,
    },
  });
}

/* =========================================================
   GET / CREATE TODAY'S DRIVER TRIP
========================================================= */

async function resolveTodayTripForDriver(
  driverId: string,
  busId: string
) {
  const todayTripDate =
    getTodayTripDate();

  /*
   * First find today's trip.
   */
  const todayTrip =
    await prisma.trip.findFirst({
      where: {
        driverId,
        busId,
        tripDate:
          todayTripDate,
      },

      orderBy: {
        createdAt: "desc",
      },
    });

  if (todayTrip) {
    return todayTrip;
  }

  /*
   * Find the latest historical trip for
   * this driver + bus so that we can reuse
   * its route for today's automatic trip.
   */
  const latestTrip =
    await prisma.trip.findFirst({
      where: {
        driverId,
        busId,
      },

      orderBy: [
        {
          tripDate:
            "desc",
        },
        {
          createdAt:
            "desc",
        },
      ],

      select: {
        routeId: true,
      },
    });

  if (!latestTrip?.routeId) {
    return null;
  }

  return getOrCreateTodayTrip({
    busId,
    driverId,
    routeId:
      latestTrip.routeId,
  });
}

/* =========================================================
   STUDENT PROXIMITY
========================================================= */

async function processStudentProximity({
  tripId,
  busId,
  latitude,
  longitude,
}: {
  tripId: string;
  busId: string;
  latitude: number;
  longitude: number;
}) {
  try {
    const assignments =
      await prisma.studentBusAssignment.findMany(
        {
          where: {
            busId,
            active: true,
          },

          include: {
            student: true,
            route: true,
            stop: true,
          },
        }
      );

    if (assignments.length === 0) {
      return;
    }

    for (const assignment of assignments) {
      if (!assignment.stop) {
        continue;
      }

      const stopLatitude =
        normalizeNumber(
          assignment.stop.latitude
        );

      const stopLongitude =
        normalizeNumber(
          assignment.stop.longitude
        );

      if (
        stopLatitude === null ||
        stopLongitude === null
      ) {
        continue;
      }

      const distanceMeters =
        calculateDistanceMeters(
          latitude,
          longitude,
          stopLatitude,
          stopLongitude
        );

      const proximity =
        getProximityType(
          distanceMeters
        );

      if (!proximity) {
        continue;
      }

      /*
       * Preserve final student states.
       */
      const existingStatus =
        await prisma.studentTripStatus.findFirst(
          {
            where: {
              tripId,
              studentId:
                assignment.studentId,
            },
          }
        );

      if (
        existingStatus?.status ===
          "BOARDED" ||
        existingStatus?.status ===
          "MISSED" ||
        existingStatus?.status ===
          "ABSENT"
      ) {
        continue;
      }

      /*
       * Once ARRIVED, don't downgrade it to
       * APPROACHING if another GPS update moves away.
       */
      if (
        existingStatus?.status ===
          "ARRIVED" &&
        proximity.status ===
          "APPROACHING"
      ) {
        continue;
      }

      const studentStatus =
        await prisma.studentTripStatus.upsert(
          {
            where: {
              tripId_studentId: {
                tripId,
                studentId:
                  assignment.studentId,
              },
            },

            create: {
              tripId,
              studentId:
                assignment.studentId,
              stopId:
                assignment.stopId,
              status:
                proximity.status,
            },

            update: {
              stopId:
                assignment.stopId,
              status:
                proximity.status,
            },
          }
        );

      const notificationExists =
        await prisma.notification.findFirst(
          {
            where: {
              studentId:
                assignment.studentId,

              tripId,

              type:
                proximity.notificationType,
            },
          }
        );

      if (!notificationExists) {
        const notification =
          await prisma.notification.create(
            {
              data: {
                studentId:
                  assignment.studentId,

                tripId,

                type:
                  proximity.notificationType,

                title:
                  proximity.notificationType ===
                  "BUS_ARRIVING"
                    ? "Bus Arrived"
                    : proximity.notificationType ===
                      "BUS_NEAR"
                    ? "Bus Nearby"
                    : "Bus Approaching",

                message:
                  proximity.message,
              },
            }
          );

        io.to(
          `student:${assignment.studentId}`
        ).emit(
          "student:notification",
          {
            id:
              notification.id,

            tripId,

            type:
              proximity.notificationType,

            title:
              notification.title,

            message:
              notification.message,

            createdAt:
              notification.createdAt.toISOString(),
          }
        );
      }

      const proximityPayload = {
        tripId,

        studentId:
          assignment.studentId,

        studentPublicId:
          assignment.student.studentId,

        busId,

        routeId:
          assignment.route.routeId,

        stopId:
          assignment.stop.stopId,

        stopName:
          assignment.stop.name,

        distanceMeters:
          Math.round(
            distanceMeters
          ),

        status:
          studentStatus.status,

        notificationType:
          proximity.notificationType,

        message:
          proximity.message,
      };

      io.to(
        `student:${assignment.studentId}`
      ).emit(
        "student:bus-proximity",
        proximityPayload
      );

      console.log(
        `[PROXIMITY] Student=${assignment.student.studentId} | Stop=${assignment.stop.name} | Distance=${Math.round(
          distanceMeters
        )}m | Status=${proximity.status}`
      );
    }
  } catch (error) {
    console.error(
      "STUDENT_PROXIMITY_ERROR:",
      error
    );
  }
}

/* =========================================================
   SOCKET AUTHENTICATION
========================================================= */

io.use(
  async (socket, next) => {
    try {
      const token =
        typeof socket.handshake
          .auth?.token === "string"
          ? socket.handshake.auth
              .token
          : "";

      if (!token) {
        return next(
          new Error("UNAUTHORIZED")
        );
      }

      const { payload } =
        await jwtVerify(
          token,
          JWT_SECRET,
          {
            algorithms: [
              JWT_ALGORITHM,
            ],
          }
        );

      const role =
        typeof payload.role ===
        "string"
          ? payload.role
          : "";

      if (
        role !== "ADMIN" &&
        role !== "DRIVER" &&
        role !== "STUDENT"
      ) {
        return next(
          new Error("UNAUTHORIZED")
        );
      }

      const session:
        SocketSession = {
        sub:
          typeof payload.sub ===
          "string"
            ? payload.sub
            : "",

        username:
          typeof payload.username ===
          "string"
            ? payload.username
            : "",

        role,

        studentId:
          typeof payload.studentId ===
          "string"
            ? payload.studentId
            : null,

        driverId:
          typeof payload.driverId ===
          "string"
            ? payload.driverId
            : null,
      };

      if (!session.sub) {
        return next(
          new Error("UNAUTHORIZED")
        );
      }

      socket.data.session =
        session;

      next();
    } catch (error) {
      console.error(
        "[SOCKET AUTH ERROR]",
        error
      );

      next(
        new Error("UNAUTHORIZED")
      );
    }
  }
);

/* =========================================================
   CONNECTION
========================================================= */

io.on(
  "connection",
  (socket) => {
    const session =
      socket.data
        .session as SocketSession;

    console.log(
      `[SOCKET] Connected | username=${session.username} | role=${session.role} | driverId=${session.driverId ?? "-"} | studentId=${session.studentId ?? "-"}`
    );

    /*
     * Common rooms
     */
    if (
      session.role ===
      "ADMIN"
    ) {
      socket.join(
        "admins"
      );
    }

    if (session.driverId) {
      socket.join(
        `driver:${session.driverId}`
      );
    }

    if (session.studentId) {
      socket.join(
        `student:${session.studentId}`
      );
    }

    /* =======================================================
       JOIN ADMIN ROOM
    ======================================================= */

    socket.on(
      "admin:join",
      () => {
        if (
          session.role !==
          "ADMIN"
        ) {
          return;
        }

        socket.join(
          "admins"
        );

        socket.emit(
          "admin:joined",
          {
            success: true,
          }
        );
      }
    );

    /* =======================================================
       JOIN DRIVER ROOM
    ======================================================= */

    socket.on(
      "driver:join",
      () => {
        if (
          session.role !==
          "DRIVER"
        ) {
          return;
        }

        if (session.driverId) {
          socket.join(
            `driver:${session.driverId}`
          );
        }

        socket.emit(
          "driver:joined",
          {
            success: true,
          }
        );
      }
    );

    /* =======================================================
       JOIN STUDENT ROOM
    ======================================================= */

    socket.on(
      "student:join",
      () => {
        if (
          session.role !==
          "STUDENT"
        ) {
          return;
        }

        if (session.studentId) {
          socket.join(
            `student:${session.studentId}`
          );
        }

        socket.emit(
          "student:joined",
          {
            success: true,
          }
        );
      }
    );

    /* =======================================================
       DRIVER LOCATION
    ======================================================= */

    socket.on(
      "driver:location",
      async (
        data: DriverLocationData
      ) => {
        if (
          session.role !==
          "DRIVER"
        ) {
          socket.emit(
            "tracking:error",
            {
              message:
                "Only drivers can send GPS locations.",
            }
          );

          return;
        }

        if (!session.driverId) {
          socket.emit(
            "tracking:error",
            {
              message:
                "Driver profile not found.",
            }
          );

          return;
        }

        try {
          const latitude =
            normalizeNumber(
              data?.latitude
            );

          const longitude =
            normalizeNumber(
              data?.longitude
            );

          const accuracy =
            normalizeNumber(
              data?.accuracy
            );

          const speed =
            normalizeNumber(
              data?.speed
            );

          const heading =
            normalizeNumber(
              data?.heading
            );

          if (
            latitude === null ||
            longitude === null
          ) {
            socket.emit(
              "tracking:error",
              {
                message:
                  "GPS coordinates are required.",
              }
            );

            return;
          }

          if (
            !isValidCoordinates(
              latitude,
              longitude
            )
          ) {
            socket.emit(
              "tracking:error",
              {
                message:
                  "GPS coordinates are outside valid range.",
              }
            );

            return;
          }

          const driver =
            await findDriver(
              session.driverId
            );

          if (!driver) {
            console.error(
              `[GPS] Driver not found: ${session.driverId}`
            );

            socket.emit(
              "tracking:error",
              {
                message:
                  "Driver account not found.",
              }
            );

            return;
          }

          const assignment =
            await prisma.driverBusAssignment.findFirst(
              {
                where: {
                  driverId:
                    driver.id,

                  active: true,
                },

                include: {
                  bus: true,
                },
              }
            );

          if (!assignment) {
            socket.emit(
              "tracking:error",
              {
                message:
                  "No active bus assignment found.",
              }
            );

            return;
          }

          /*
           * GPS must always belong to today's
           * RUNNING trip.
           */
          const todayTripDate =
            getTodayTripDate();

          const trip =
            await prisma.trip.findFirst(
              {
                where: {
                  driverId:
                    driver.id,

                  busId:
                    assignment.busId,

                  tripDate:
                    todayTripDate,

                  status:
                    "RUNNING",
                },

                orderBy: {
                  createdAt:
                    "desc",
                },
              }
            );

          if (!trip) {
            socket.emit(
              "tracking:error",
              {
                message:
                  "No running trip found for today. Start today's trip first.",
              }
            );

            return;
          }

          const recordedAt =
            new Date();

          await prisma.liveLocation.create(
            {
              data: {
                tripId:
                  trip.id,

                busId:
                  assignment.busId,

                latitude,
                longitude,

                accuracy,
                speed,
                heading,

                recordedAt,
              },
            }
          );

          await prisma.bus.update(
            {
              where: {
                id:
                  assignment.busId,
              },

              data: {
                status:
                  "RUNNING",
              },
            }
          );

          const livePayload = {
            tripId:
              trip.tripId,

            busId:
              assignment.bus.busId,

            busNumber:
              assignment.bus
                .busNumber,

            latitude,
            longitude,

            accuracy,
            speed,
            heading,

            recordedAt:
              recordedAt.toISOString(),
          };

          /*
           * Admin live tracking.
           */
          io.to(
            "admins"
          ).emit(
            "bus:location",
            livePayload
          );

          /*
           * Student live tracking.
           */
          io.emit(
            "bus:location",
            livePayload
          );

          /*
           * Student proximity.
           */
          await processStudentProximity(
            {
              tripId:
                trip.id,

              busId:
                assignment.busId,

              latitude,
              longitude,
            }
          );

          socket.emit(
            "driver:location:success",
            {
              success: true,

              tripId:
                trip.tripId,

              busId:
                assignment.bus
                  .busId,

              recordedAt:
                recordedAt.toISOString(),
            }
          );

          console.log(
            `[GPS] ${assignment.bus.busNumber} -> ${latitude}, ${longitude}`
          );
        } catch (error) {
          console.error(
            "DRIVER_LOCATION_ERROR:",
            error
          );

          socket.emit(
            "tracking:error",
            {
              message:
                "Unable to save GPS location.",
            }
          );
        }
      }
    );

    /* =======================================================
       DRIVER START TRIP
    ======================================================= */

    socket.on(
      "driver:start-trip",
      async (
        data: TripRequestData,
        ack?: SocketAck
      ) => {
        const reply = (
          response: AckResponse
        ) => {
          if (
            typeof ack ===
            "function"
          ) {
            ack(response);
          }

          if (
            !response.success
          ) {
            socket.emit(
              "tracking:error",
              {
                message:
                  response.message ||
                  "Unable to start trip.",
              }
            );
          }
        };

        if (
          session.role !==
          "DRIVER"
        ) {
          reply({
            success: false,
            message:
              "Only drivers can start trips.",
          });

          return;
        }

        if (!session.driverId) {
          reply({
            success: false,
            message:
              "Driver profile not found.",
          });

          return;
        }

        try {
          const driver =
            await findDriver(
              session.driverId
            );

          if (!driver) {
            reply({
              success: false,
              message:
                "Driver account not found.",
            });

            return;
          }

          const assignment =
            await prisma.driverBusAssignment.findFirst(
              {
                where: {
                  driverId:
                    driver.id,

                  active: true,
                },

                include: {
                  bus: true,
                },
              }
            );

          if (!assignment) {
            reply({
              success: false,
              message:
                "No active bus assignment found.",
            });

            return;
          }

          /*
           * Daily-trip logic:
           *
           * If dashboard sends tripId, validate it.
           * If no tripId is sent, automatically
           * resolve today's trip.
           */
          const requestedTripId =
            typeof data?.tripId ===
            "string"
              ? data.tripId.trim()
              : "";

          let trip = null;

          if (requestedTripId) {
            trip =
              await findTripByIdentifier(
                requestedTripId
              );
          }

          /*
           * If no requested trip or trip not found,
           * resolve today's trip automatically.
           */
          if (!trip) {
            trip =
              await resolveTodayTripForDriver(
                driver.id,
                assignment.busId
              );
          }

          if (!trip) {
            reply({
              success: false,
              message:
                "Today's trip could not be created. Please make sure this bus has a route assigned.",
            });

            return;
          }

          /*
           * Safety validation.
           */
          if (
            trip.driverId !==
              driver.id ||
            trip.busId !==
              assignment.busId
          ) {
            reply({
              success: false,
              message:
                "This trip is not assigned to this driver.",
            });

            return;
          }

          /*
           * Never allow an old day's trip to
           * accidentally start today.
           */
          const todayTripDate =
            getTodayTripDate();

          if (
            !trip.tripDate ||
            trip.tripDate.getTime() !==
              todayTripDate.getTime()
          ) {
            reply({
              success: false,
              message:
                "Only today's trip can be started.",
            });

            return;
          }

          /*
           * Already running.
           */
          if (
            trip.status ===
            "RUNNING"
          ) {
            const startedAt =
              trip.startedAt ||
              new Date();

            const response:
              AckResponse = {
              success: true,

              tripId:
                trip.tripId,

              busId:
                assignment.bus
                  .busId,

              startedAt:
                startedAt.toISOString(),
            };

            reply(response);

            socket.emit(
              "driver:start-trip:success",
              response
            );

            return;
          }

          /*
           * Only scheduled trip can start.
           */
          if (
            trip.status !==
            "SCHEDULED"
          ) {
            reply({
              success: false,
              message:
                `Trip status is ${trip.status}. Only today's SCHEDULED trip can be started.`,
            });

            return;
          }

          const startedAt =
            new Date();

          const updatedTrip =
            await prisma.trip.update(
              {
                where: {
                  id:
                    trip.id,
                },

                data: {
                  status:
                    "RUNNING",

                  startedAt,
                },
              }
            );

          await prisma.bus.update(
            {
              where: {
                id:
                  assignment.busId,
              },

              data: {
                status:
                  "RUNNING",
              },
            }
          );

          const response:
            AckResponse = {
            success: true,

            tripId:
              updatedTrip.tripId,

            busId:
              assignment.bus
                .busId,

            startedAt:
              startedAt.toISOString(),
          };

          reply(response);

          socket.emit(
            "driver:start-trip:success",
            response
          );

          const tripStartedPayload =
            {
              tripId:
                updatedTrip.tripId,

              busId:
                assignment.bus
                  .busId,

              busNumber:
                assignment.bus
                  .busNumber,

              startedAt:
                startedAt.toISOString(),
            };

          io.to(
            "admins"
          ).emit(
            "trip:started",
            tripStartedPayload
          );

          io.to(
            `driver:${session.driverId}`
          ).emit(
            "trip:started",
            tripStartedPayload
          );

          console.log(
            `[TRIP STARTED] ${updatedTrip.tripId} | Driver=${driver.driverId} | Bus=${assignment.bus.busNumber}`
          );
        } catch (error) {
          console.error(
            "START_TRIP_ERROR:",
            error
          );

          reply({
            success: false,
            message:
              "Unable to start trip.",
          });
        }
      }
    );

    /* =======================================================
       DRIVER STOP TRIP
    ======================================================= */

    socket.on(
      "driver:stop-trip",
      async (
        data: TripRequestData,
        ack?: SocketAck
      ) => {
        const reply = (
          response: AckResponse
        ) => {
          if (
            typeof ack ===
            "function"
          ) {
            ack(response);
          }

          if (
            !response.success
          ) {
            socket.emit(
              "tracking:error",
              {
                message:
                  response.message ||
                  "Unable to complete trip.",
              }
            );
          }
        };

        if (
          session.role !==
          "DRIVER"
        ) {
          reply({
            success: false,
            message:
              "Only drivers can stop trips.",
          });

          return;
        }

        if (!session.driverId) {
          reply({
            success: false,
            message:
              "Driver profile not found.",
          });

          return;
        }

        try {
          const driver =
            await findDriver(
              session.driverId
            );

          if (!driver) {
            reply({
              success: false,
              message:
                "Driver account not found.",
            });

            return;
          }

          const assignment =
            await prisma.driverBusAssignment.findFirst(
              {
                where: {
                  driverId:
                    driver.id,

                  active: true,
                },

                include: {
                  bus: true,
                },
              }
            );

          if (!assignment) {
            reply({
              success: false,
              message:
                "No active bus assignment found.",
            });

            return;
          }

          const requestedTripId =
            typeof data?.tripId ===
            "string"
              ? data.tripId.trim()
              : "";

          let trip = null;

          if (requestedTripId) {
            trip =
              await findTripByIdentifier(
                requestedTripId
              );
          }

          /*
           * If no tripId was supplied,
           * automatically resolve today's trip.
           */
          if (!trip) {
            trip =
              await resolveTodayTripForDriver(
                driver.id,
                assignment.busId
              );
          }

          if (!trip) {
            reply({
              success: false,
              message:
                "Today's trip was not found.",
            });

            return;
          }

          if (
            trip.driverId !==
            driver.id
          ) {
            reply({
              success: false,
              message:
                "This trip does not belong to this driver.",
            });

            return;
          }

          if (
            trip.busId !==
            assignment.busId
          ) {
            reply({
              success: false,
              message:
                "This trip does not belong to the assigned bus.",
            });

            return;
          }

          /*
           * Never stop a historical trip through
           * today's driver control.
           */
          const todayTripDate =
            getTodayTripDate();

          if (
            !trip.tripDate ||
            trip.tripDate.getTime() !==
              todayTripDate.getTime()
          ) {
            reply({
              success: false,
              message:
                "Only today's trip can be stopped.",
            });

            return;
          }

          if (
            trip.status !==
            "RUNNING"
          ) {
            reply({
              success: false,
              message:
                `Trip is currently ${trip.status}.`,
            });

            return;
          }

          const completedAt =
            new Date();

          const updatedTrip =
            await prisma.trip.update(
              {
                where: {
                  id:
                    trip.id,
                },

                data: {
                  status:
                    "COMPLETED",

                  completedAt,
                },
              }
            );

          await prisma.bus.update(
            {
              where: {
                id:
                  assignment.busId,
              },

              data: {
                status:
                  "WAITING",
              },
            }
          );

          const response:
            AckResponse = {
            success: true,

            tripId:
              updatedTrip.tripId,

            completedAt:
              completedAt.toISOString(),
          };

          reply(response);

          socket.emit(
            "driver:stop-trip:success",
            response
          );

          const tripCompletedPayload =
            {
              tripId:
                updatedTrip.tripId,

              busId:
                assignment.bus
                  .busId,

              busNumber:
                assignment.bus
                  .busNumber,

              completedAt:
                completedAt.toISOString(),
            };

          io.to(
            "admins"
          ).emit(
            "trip:completed",
            tripCompletedPayload
          );

          io.to(
            `driver:${session.driverId}`
          ).emit(
            "trip:completed",
            tripCompletedPayload
          );

          console.log(
            `[TRIP COMPLETED] ${updatedTrip.tripId} | Driver=${driver.driverId} | Bus=${assignment.bus.busNumber}`
          );
        } catch (error) {
          console.error(
            "STOP_TRIP_ERROR:",
            error
          );

          reply({
            success: false,
            message:
              "Unable to complete trip.",
          });
        }
      }
    );

    /* =======================================================
       DISCONNECT
    ======================================================= */

    socket.on(
      "disconnect",
      (reason) => {
        console.log(
          `[SOCKET] ${session.username} disconnected | reason=${reason}`
        );
      }
    );
  }
);

/* =========================================================
   START SERVER
========================================================= */

httpServer.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log("");
    console.log(
      "=========================================="
    );
    console.log(
      " Bus Tracking Socket.IO Server"
    );
    console.log(
      "=========================================="
    );
    console.log(
      ` Port: ${PORT}`
    );
    console.log(
      " Host: 0.0.0.0"
    );
    console.log(
      ` Allowed Origins: ${allowedOrigins.join(
        ", "
      )}`
    );
    console.log(
      " Database: PostgreSQL"
    );
    console.log(
      " Authentication: JWT token + session cookie"
    );
    console.log(
      " Driver ID: public + internal ID supported"
    );
    console.log(
      " Socket ACK: enabled"
    );
    console.log(
      " GPS Tracking: enabled"
    );
    console.log(
      " Daily Trips: enabled"
    );
    console.log(
      " Student Proximity: enabled"
    );
    console.log(
      " Status: READY"
    );
    console.log(
      "=========================================="
    );
    console.log("");
  }
);

/* =========================================================
   SHUTDOWN
========================================================= */

async function shutdown() {
  console.log(
    "\nShutting down Socket.IO server..."
  );

  try {
    await prisma.$disconnect();
  } catch (error) {
    console.error(
      "PRISMA_DISCONNECT_ERROR:",
      error
    );
  }

  httpServer.close(() => {
    process.exit(0);
  });
}

process.on(
  "SIGINT",
  shutdown
);

process.on(
  "SIGTERM",
  shutdown
);