"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { io, Socket } from "socket.io-client";

type TripStatus =
  | "SCHEDULED"
  | "RUNNING"
  | "COMPLETED"
  | "CANCELLED"
  | "BOARDING"
  | "IN_PROGRESS"
  | string;

type Driver = {
  id?: string;
  driverId?: string;
  name?: string;
  username?: string;
};

type Bus = {
  id?: string;
  busId?: string;
  busNumber?: string;
  registration?: string;
  status?: string;
};

type Route = {
  id?: string;
  routeId?: string;
  name?: string;
  origin?: string;
  destination?: string;
};

type Trip = {
  id?: string;
  tripId?: string;
  status?: TripStatus;
  busId?: string;
  routeId?: string;
  driverId?: string;
  travelDate?: string;
  tripDate?: string;
  departureTime?: string;
  arrivalTime?: string;
  startedAt?: string | null;
  completedAt?: string | null;

  bus?: Bus;
  route?: Route;
};

type Assignment = {
  id?: string;
  bus?: Bus;
  route?: Route;
  busId?: string;
  routeId?: string;
};

type GPSLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  recordedAt?: string;
};

type DashboardData = {
  driver?: Driver;
  assignment?: Assignment | null;
  driverAssignment?: Assignment | null;

  trips?: Trip[];
  assignedTrips?: Trip[];

  activeTrip?: Trip | null;
  runningTrip?: Trip | null;
};

type SocketLocationSuccess = {
  success?: boolean;
  tripId?: string;
  busId?: string;
  recordedAt?: string;
  message?: string;
};

type TrackingError = {
  message?: string;
};

const SOCKET_URL = "http://127.0.0.1:4001";

const GPS_MAX_ACCURACY = 1000;
const GPS_REFRESH_INTERVAL = 15_000;
const GPS_STALE_AFTER = 60_000;

const SOCKET_RECONNECT_CHECK = 5_000;
const SOCKET_RECONNECT_DELAY = 1_000;
const SOCKET_RECONNECT_DELAY_MAX = 5_000;

const GPS_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 30_000,
};

function formatDateTime(value?: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function formatTime(value?: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function gpsLevel(accuracy: number | null) {
  if (accuracy === null || !Number.isFinite(accuracy)) {
    return "UNKNOWN";
  }

  if (accuracy <= 50) {
    return "GOOD";
  }

  if (accuracy <= 200) {
    return "FAIR";
  }

  return "POOR";
}

function gpsLevelClass(level: string) {
  switch (level) {
    case "GOOD":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";

    case "FAIR":
      return "bg-amber-500/10 text-amber-400 border-amber-500/20";

    case "POOR":
      return "bg-red-500/10 text-red-400 border-red-500/20";

    default:
      return "bg-slate-500/10 text-slate-400 border-slate-500/20";
  }
}

function isValidCoordinate(
  latitude: number,
  longitude: number,
) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function normalizeTrip(trip: any): Trip {
  return {
    ...trip,

    tripId:
      typeof trip?.tripId === "string"
        ? trip.tripId
        : typeof trip?.id === "string"
          ? trip.id
          : undefined,

    status:
      typeof trip?.status === "string"
        ? trip.status
        : "SCHEDULED",

    bus: trip?.bus
      ? {
          ...trip.bus,
        }
      : undefined,

    route: trip?.route
      ? {
          ...trip.route,
        }
      : undefined,
  };
}

function normalizeDashboardResponse(
  result: any,
): DashboardData {
  const rawTrips = Array.isArray(result?.trips)
    ? result.trips
    : Array.isArray(result?.assignedTrips)
      ? result.assignedTrips
      : [];

  const trips = rawTrips.map(normalizeTrip);

  const assignment =
    result?.assignment ??
    result?.driverAssignment ??
    result?.activeAssignment ??
    null;

  const activeTrip =
    result?.activeTrip ??
    result?.runningTrip ??
    trips.find(
      (trip: Trip) => trip.status === "RUNNING",
    ) ??
    null;

  return {
    driver: result?.driver ?? result?.user ?? undefined,

    assignment,

    driverAssignment:
      result?.driverAssignment ??
      assignment ??
      null,

    trips,

    assignedTrips: trips,

    activeTrip: activeTrip
      ? normalizeTrip(activeTrip)
      : null,

    runningTrip:
      activeTrip &&
      normalizeTrip(activeTrip).status === "RUNNING"
        ? normalizeTrip(activeTrip)
        : null,
  };
}

export default function DriverDashboardPage() {
  /* =========================================================
     BASIC STATE
  ========================================================= */

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [message, setMessage] = useState("");

  const [dashboard, setDashboard] =
    useState<DashboardData | null>(null);

  const [selectedTripId, setSelectedTripId] =
    useState("");

  const [socketConnected, setSocketConnected] =
    useState(false);

  const [socketStatus, setSocketStatus] =
    useState("CONNECTING");

  const [gpsStatus, setGpsStatus] =
    useState("Searching GPS...");

  const [gpsError, setGpsError] =
    useState("");

  const [gpsLocation, setGpsLocation] =
    useState<GPSLocation | null>(null);

  const [lastValidGPS, setLastValidGPS] =
    useState<string | null>(null);

  const [sendingGPS, setSendingGPS] =
    useState(false);

  const [startingTrip, setStartingTrip] =
    useState(false);

  const [stoppingTrip, setStoppingTrip] =
    useState(false);

  const [lastSocketSuccess, setLastSocketSuccess] =
    useState<string | null>(null);

  const [now, setNow] = useState(Date.now());

  /* =========================================================
     REFS
  ========================================================= */

  const socketRef =
    useRef<Socket | null>(null);

  const socketTokenRef =
    useRef<string | null>(null);

  const watchIdRef =
    useRef<number | null>(null);

  const gpsIntervalRef =
    useRef<ReturnType<typeof setInterval> | null>(
      null,
    );

  const gpsRestartTimerRef =
    useRef<number | null>(null);

  const socketReconnectTimerRef =
    useRef<number | null>(null);

  const latestGPSRef =
    useRef<GPSLocation | null>(null);

  const gpsSendingRef =
    useRef(false);

  const mountedRef =
    useRef(false);

  const pageActiveRef =
    useRef(true);

  const connectingRef =
    useRef(false);

  const startingGPSRef =
    useRef(false);

  const selectedTripIdRef =
    useRef("");

  const dashboardRef =
    useRef<DashboardData | null>(null);

  /* =========================================================
     DERIVED VALUES
  ========================================================= */

  const trips = useMemo(() => {
    return (
      dashboard?.trips ??
      dashboard?.assignedTrips ??
      []
    );
  }, [dashboard]);

  const selectedTrip = useMemo(() => {
    if (selectedTripId) {
      const exact = trips.find(
        (trip) =>
          trip.tripId === selectedTripId ||
          trip.id === selectedTripId,
      );

      if (exact) {
        return exact;
      }
    }

    return (
      dashboard?.activeTrip ??
      dashboard?.runningTrip ??
      trips.find(
        (trip) => trip.status === "RUNNING",
      ) ??
      trips[0] ??
      null
    );
  }, [
    dashboard,
    selectedTripId,
    trips,
  ]);

  const selectedTripStatus =
    selectedTrip?.status ?? "—";

  const selectedBus =
    selectedTrip?.bus ??
    dashboard?.assignment?.bus ??
    dashboard?.driverAssignment?.bus ??
    null;

  const selectedRoute =
    selectedTrip?.route ??
    dashboard?.assignment?.route ??
    dashboard?.driverAssignment?.route ??
    null;

  const gpsAccuracy =
    gpsLocation?.accuracy ?? null;

  const currentGpsLevel =
    gpsLevel(gpsAccuracy);

  const gpsIsStale =
    gpsLocation?.recordedAt
      ? now -
          new Date(
            gpsLocation.recordedAt,
          ).getTime() >
        GPS_STALE_AFTER
      : true;

  /* =========================================================
     KEEP REFS UPDATED
  ========================================================= */

  useEffect(() => {
    selectedTripIdRef.current =
      selectedTrip?.tripId ??
      selectedTrip?.id ??
      selectedTripId ??
      "";
  }, [
    selectedTrip,
    selectedTripId,
  ]);

  useEffect(() => {
    dashboardRef.current =
      dashboard;
  }, [dashboard]);

  /* =========================================================
     LOAD DRIVER DASHBOARD
  ========================================================= */

  const loadDashboard = useCallback(
    async () => {
      if (!mountedRef.current) {
        return;
      }

      try {
        setError("");

        const response = await fetch(
          "/api/driver/dashboard",
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
            },
          },
        );

        const result =
          await response.json();

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          window.location.href =
            "/driver/login";

          return;
        }

        if (
          !response.ok ||
          !result?.success
        ) {
          throw new Error(
            result?.message ||
              "Unable to load driver dashboard.",
          );
        }

        if (!mountedRef.current) {
          return;
        }

        const normalized =
          normalizeDashboardResponse(
            result,
          );

        dashboardRef.current =
          normalized;

        setDashboard(
          normalized,
        );

        const defaultTrip =
          normalized.activeTrip ??
          normalized.runningTrip ??
          normalized.trips?.find(
            (trip) =>
              trip.status === "RUNNING",
          ) ??
          normalized.trips?.[0] ??
          null;

        if (
          defaultTrip &&
          !selectedTripIdRef.current
        ) {
          const id =
            defaultTrip.tripId ??
            defaultTrip.id ??
            "";

          setSelectedTripId(id);

          selectedTripIdRef.current =
            id;
        }
      } catch (error) {
        console.error(
          "DRIVER_DASHBOARD_LOAD_ERROR:",
          error,
        );

        if (!mountedRef.current) {
          return;
        }

        setError(
          error instanceof Error
            ? error.message
            : "Unable to load dashboard.",
        );
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  /* =========================================================
     FETCH SOCKET TOKEN
  ========================================================= */

  const getSocketToken =
    useCallback(async () => {
      try {
        const response =
          await fetch(
            "/api/auth/socket-token",
            {
              method: "GET",
              credentials: "include",
              cache: "no-store",
              headers: {
                "Cache-Control": "no-cache",
              },
            },
          );

        const result =
          await response.json();

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          window.location.href =
            "/driver/login";

          return null;
        }

        if (
          !response.ok ||
          !result?.success
        ) {
          throw new Error(
            result?.message ||
              "Unable to create socket token.",
          );
        }

        const token =
          result?.token ??
          result?.accessToken ??
          result?.data?.token ??
          null;

        if (
          typeof token !== "string" ||
          !token
        ) {
          throw new Error(
            "Socket token was not returned by the server.",
          );
        }

        socketTokenRef.current =
          token;

        console.log(
          "[SOCKET TOKEN] Fresh token created.",
        );

        return token;
      } catch (error) {
        console.error(
          "SOCKET_TOKEN_ERROR:",
          error,
        );

        if (mountedRef.current) {
          setSocketStatus(
            "TOKEN ERROR",
          );

          setError(
            error instanceof Error
              ? error.message
              : "Unable to connect realtime tracking.",
          );
        }

        return null;
      }
    }, []);

  /* =========================================================
     STOP GPS
  ========================================================= */

  const stopGPS =
    useCallback(() => {
      if (
        typeof navigator !==
          "undefined" &&
        navigator.geolocation &&
        watchIdRef.current !== null
      ) {
        try {
          navigator.geolocation.clearWatch(
            watchIdRef.current,
          );
        } catch {
          // ignore cleanup errors
        }

        watchIdRef.current =
          null;
      }

      if (
        gpsIntervalRef.current
      ) {
        clearInterval(
          gpsIntervalRef.current,
        );

        gpsIntervalRef.current =
          null;
      }

      if (
        gpsRestartTimerRef.current
      ) {
        clearTimeout(
          gpsRestartTimerRef.current,
        );

        gpsRestartTimerRef.current =
          null;
      }

      startingGPSRef.current =
        false;

      console.log(
        "[GPS] GPS watcher stopped.",
      );
    }, []);

  /* =========================================================
     SEND GPS LOCATION
  ========================================================= */

  const sendGPSLocation =
    useCallback(
      async (
        location: GPSLocation,
      ) => {
        latestGPSRef.current =
          location;

        if (!mountedRef.current) {
          return;
        }

        if (!isValidCoordinate(
          location.latitude,
          location.longitude,
        )) {
          console.error(
            "[GPS] Invalid coordinates:",
            location,
          );

          setGpsError(
            "GPS coordinates are invalid.",
          );

          return;
        }

        if (
          !Number.isFinite(
            location.accuracy,
          ) ||
          location.accuracy <= 0
        ) {
          console.warn(
            "[GPS] Invalid accuracy:",
            location.accuracy,
          );

          setGpsError(
            "GPS accuracy value is invalid.",
          );

          return;
        }

        if (
          location.accuracy >
          GPS_MAX_ACCURACY
        ) {
          console.warn(
            "[GPS] Accuracy too poor:",
            location.accuracy,
          );

          setGpsStatus(
            `Poor GPS (${Math.round(
              location.accuracy,
            )}m)`,
          );

          setGpsError(
            "GPS accuracy is too poor. Waiting for a better signal.",
          );

          return;
        }

        setGpsError("");

        setGpsLocation(
          location,
        );

        const recordedAt =
          location.recordedAt ??
          new Date().toISOString();

        setLastValidGPS(
          recordedAt,
        );

        setGpsStatus(
          `GPS ${gpsLevel(
            location.accuracy,
          )}`,
        );

        const socket =
          socketRef.current;

        /*
         * Important:
         *
         * Do not emit when socket is missing,
         * disconnected, closing or destroyed.
         *
         * latestGPSRef keeps the location so
         * reconnectSocket() can resend it.
         */
        if (
          !socket ||
          !socket.connected
        ) {
          console.warn(
            "[GPS] Socket unavailable. Latest GPS retained.",
          );

          setSendingGPS(false);

          return;
        }

        if (
          gpsSendingRef.current
        ) {
          console.log(
            "[GPS] Previous send still processing. Latest GPS retained.",
          );

          return;
        }

        gpsSendingRef.current =
          true;

        setSendingGPS(true);

        try {
          socket.emit(
            "driver:location",
            {
              latitude:
                location.latitude,

              longitude:
                location.longitude,

              accuracy:
                location.accuracy,

              speed:
                location.speed,

              heading:
                location.heading,
            },
          );

          console.log(
            "[GPS] Valid location sent:",
            {
              latitude:
                location.latitude,

              longitude:
                location.longitude,

              accuracy:
                location.accuracy,

              speed:
                location.speed,

              heading:
                location.heading,
            },
          );
        } catch (error) {
          console.error(
            "[GPS] Socket emit failed:",
            error,
          );
        } finally {
          gpsSendingRef.current =
            false;

          if (mountedRef.current) {
            setSendingGPS(false);
          }
        }
      },
      [],
    );

  /* =========================================================
     RESEND LATEST GPS
  ========================================================= */

  const resendLatestGPS =
    useCallback(() => {
      if (
        !mountedRef.current ||
        !pageActiveRef.current
      ) {
        return;
      }

      const latest =
        latestGPSRef.current;

      const socket =
        socketRef.current;

      if (
        !latest ||
        !socket ||
        !socket.connected
      ) {
        return;
      }

      console.log(
        "[GPS] Socket connected. Resending latest GPS...",
      );

      void sendGPSLocation(
        latest,
      );
    }, [
      sendGPSLocation,
    ]);

  /* =========================================================
     GPS SUCCESS
  ========================================================= */

  const handleGPSSuccess =
    useCallback(
      (
        position: GeolocationPosition,
      ) => {
        if (
          !mountedRef.current ||
          !pageActiveRef.current
        ) {
          return;
        }

        const latitude =
          position.coords.latitude;

        const longitude =
          position.coords.longitude;

        const accuracy =
          position.coords.accuracy;

        const speed =
          Number.isFinite(
            position.coords.speed,
          )
            ? position.coords.speed
            : null;

        const heading =
          Number.isFinite(
            position.coords.heading,
          )
            ? position.coords.heading
            : null;

        const location: GPSLocation =
          {
            latitude,
            longitude,
            accuracy,
            speed,
            heading,
            recordedAt:
              new Date().toISOString(),
          };

        void sendGPSLocation(
          location,
        );
      },
      [sendGPSLocation],
    );

  /* =========================================================
     GPS ERROR
  ========================================================= */

  const handleGPSError =
    useCallback(
      (
        error: GeolocationPositionError,
      ) => {
        if (
          !mountedRef.current ||
          !pageActiveRef.current
        ) {
          return;
        }

        console.error(
          "[GPS ERROR]",
          {
            code: error.code,
            message:
              error.message,
          },
        );

        if (
          error.code ===
          error.PERMISSION_DENIED
        ) {
          setGpsStatus(
            "Permission denied",
          );

          setGpsError(
            "Browser location permission is denied. Please allow Location access for 127.0.0.1.",
          );

          return;
        }

        if (
          error.code ===
          error.POSITION_UNAVAILABLE
        ) {
          setGpsStatus(
            "GPS unavailable",
          );

          setGpsError(
            "GPS position is currently unavailable. Retrying...",
          );

          return;
        }

        if (
          error.code ===
          error.TIMEOUT
        ) {
          setGpsStatus(
            "GPS timeout",
          );

          setGpsError(
            "GPS request timed out. Retrying...",
          );

          return;
        }

        setGpsStatus(
          "GPS error",
        );

        setGpsError(
          error.message ||
            "Unable to read GPS location.",
        );
      },
      [],
    );

  /* =========================================================
     START GPS WATCHER
  ========================================================= */

  const startGPS =
    useCallback(() => {
      if (
        !mountedRef.current ||
        !pageActiveRef.current
      ) {
        return;
      }

      if (
        typeof navigator ===
          "undefined" ||
        !navigator.geolocation
      ) {
        setGpsStatus(
          "GPS unsupported",
        );

        setGpsError(
          "This browser does not support geolocation.",
        );

        return;
      }

      const currentTrip =
        dashboardRef.current?.activeTrip ??
        dashboardRef.current?.runningTrip ??
        dashboardRef.current?.trips?.find(
          (trip) =>
            (
              trip.tripId ??
              trip.id
            ) ===
            selectedTripIdRef.current,
        ) ??
        null;

      /*
       * Only track GPS while a trip is RUNNING.
       */
      if (
        !currentTrip ||
        currentTrip.status !==
          "RUNNING"
      ) {
        console.log(
          "[GPS] Not starting watcher because selected trip is not RUNNING.",
        );

        return;
      }

      /*
       * Prevent duplicate GPS watcher.
       */
      if (
        startingGPSRef.current
      ) {
        return;
      }

      if (
        watchIdRef.current !== null
      ) {
        /*
         * Watcher already active.
         *
         * Do not create another one.
         */
        return;
      }

      startingGPSRef.current =
        true;

      setGpsStatus(
        "Searching GPS...",
      );

      setGpsError("");

      console.log(
        "[GPS] Starting GPS watcher...",
      );

      try {
        const watchId =
          navigator.geolocation.watchPosition(
            handleGPSSuccess,
            handleGPSError,
            GPS_OPTIONS,
          );

        watchIdRef.current =
          watchId;

        /*
         * Fresh GPS every 15 seconds.
         */
        gpsIntervalRef.current =
          setInterval(() => {
            if (
              !mountedRef.current ||
              !pageActiveRef.current
            ) {
              return;
            }

            navigator.geolocation.getCurrentPosition(
              handleGPSSuccess,
              handleGPSError,
              GPS_OPTIONS,
            );
          }, GPS_REFRESH_INTERVAL);

        /*
         * Immediate GPS request.
         */
        navigator.geolocation.getCurrentPosition(
          handleGPSSuccess,
          handleGPSError,
          GPS_OPTIONS,
        );

        console.log(
          "[GPS] Watcher ACTIVE:",
          watchId,
        );
      } catch (error) {
        console.error(
          "[GPS] Unable to start watcher:",
          error,
        );

        watchIdRef.current =
          null;

        setGpsStatus(
          "GPS error",
        );

        setGpsError(
          "Unable to start GPS tracking.",
        );
      } finally {
        startingGPSRef.current =
          false;
      }
    }, [
      handleGPSError,
      handleGPSSuccess,
    ]);

  /* =========================================================
     DISCONNECT SOCKET SAFELY
  ========================================================= */

  const disconnectSocket =
    useCallback(
      (
        reason = "manual",
      ) => {
        const socket =
          socketRef.current;

        if (!socket) {
          return;
        }

        console.log(
          `[DRIVER SOCKET] Disconnecting: ${reason}`,
        );

        try {
          socket.removeAllListeners();

          socket.io.removeAllListeners();

          if (
            socket.connected ||
            socket.active
          ) {
            socket.disconnect();
          }
        } catch (error) {
          console.warn(
            "[DRIVER SOCKET] Cleanup warning:",
            error,
          );
        }

        socketRef.current =
          null;

        if (mountedRef.current) {
          setSocketConnected(
            false,
          );

          setSocketStatus(
            "DISCONNECTED",
          );
        }
      },
      [],
    );

  /* =========================================================
     CREATE SOCKET
  ========================================================= */

  const connectSocket =
    useCallback(
      async (
        forceNew = false,
      ) => {
        if (
          !mountedRef.current ||
          !pageActiveRef.current
        ) {
          return;
        }

        if (
          connectingRef.current
        ) {
          return;
        }

        const existing =
          socketRef.current;

        /*
         * Existing healthy connection.
         */
        if (
          !forceNew &&
          existing &&
          existing.connected
        ) {
          setSocketConnected(
            true,
          );

          setSocketStatus(
            "ONLINE",
          );

          resendLatestGPS();

          return;
        }

        connectingRef.current =
          true;

        setSocketStatus(
          "CONNECTING",
        );

        try {
          let token =
            socketTokenRef.current;

          /*
           * Always request a fresh token when
           * forceNew is true.
           */
          if (
            forceNew ||
            !token
          ) {
            token =
              await getSocketToken();
          }

          if (
            !token ||
            !mountedRef.current
          ) {
            return;
          }

          /*
           * Remove old socket before creating
           * a completely fresh connection.
           */
          if (
            socketRef.current
          ) {
            try {
              socketRef.current.removeAllListeners();

              socketRef.current.io.removeAllListeners();

              socketRef.current.disconnect();
            } catch {
              // ignore cleanup error
            }

            socketRef.current =
              null;
          }

          const socket =
            io(SOCKET_URL, {
              transports: [
                "websocket",
                "polling",
              ],

              auth: {
                token,
              },

              withCredentials:
                true,

              autoConnect:
                true,

              reconnection:
                true,

              reconnectionAttempts:
                Infinity,

              reconnectionDelay:
                SOCKET_RECONNECT_DELAY,

              reconnectionDelayMax:
                SOCKET_RECONNECT_DELAY_MAX,

              timeout: 10_000,
            });

          socketRef.current =
            socket;

          socket.on(
            "connect",
            () => {
              if (
                !mountedRef.current ||
                socketRef.current !==
                  socket
              ) {
                return;
              }

              console.log(
                "[DRIVER SOCKET] Connected:",
                socket.id,
              );

              setSocketConnected(
                true,
              );

              setSocketStatus(
                "ONLINE",
              );

              setError("");

              /*
               * Immediately send latest GPS.
               */
              window.setTimeout(() => {
                if (
                  mountedRef.current &&
                  pageActiveRef.current &&
                  socketRef.current ===
                    socket &&
                  socket.connected
                ) {
                  resendLatestGPS();
                }
              }, 150);
            },
          );

          socket.on(
            "disconnect",
            (reason) => {
              if (
                socketRef.current !==
                socket
              ) {
                return;
              }

              console.warn(
                "[DRIVER SOCKET] Disconnected:",
                reason,
              );

              setSocketConnected(
                false,
              );

              if (
                pageActiveRef.current
              ) {
                setSocketStatus(
                  "RECONNECTING",
                );
              }

              /*
               * IMPORTANT:
               *
               * GPS watcher is NOT stopped.
               *
               * Latest GPS stays in latestGPSRef.
               */
            },
          );

          socket.on(
            "connect_error",
            (error) => {
              if (
                socketRef.current !==
                socket
              ) {
                return;
              }

              console.error(
                "[DRIVER SOCKET] Connect error:",
                error,
              );

              setSocketConnected(
                false,
              );

              setSocketStatus(
                "RECONNECTING",
              );

              /*
               * The old socket's token may be expired.
               *
               * Stop Socket.IO's automatic reconnect for
               * this socket because it would keep using
               * the old auth token.
               */
              socket.io.reconnection(false);

              socketTokenRef.current =
                null;

              try {
                socket.removeAllListeners();

                socket.io.removeAllListeners();

                socket.disconnect();
              } catch {
                // ignore
              }

              if (
                socketRef.current ===
                socket
              ) {
                socketRef.current =
                  null;
              }

              /*
               * Fresh token + fresh socket.
               */
              if (
                mountedRef.current &&
                pageActiveRef.current
              ) {
                if (
                  socketReconnectTimerRef.current
                ) {
                  clearTimeout(
                    socketReconnectTimerRef.current,
                  );
                }

                socketReconnectTimerRef.current =
                  window.setTimeout(() => {
                    socketReconnectTimerRef.current =
                      null;

                    if (
                      mountedRef.current &&
                      pageActiveRef.current
                    ) {
                      void connectSocket(
                        true,
                      );
                    }
                  }, 1500);
              }
            },
          );

          socket.io.on(
            "reconnect_attempt",
            (attempt) => {
              if (
                socketRef.current !==
                socket
              ) {
                return;
              }

              console.log(
                "[DRIVER SOCKET] Reconnect attempt:",
                attempt,
              );

              setSocketStatus(
                `RECONNECTING ${attempt}`,
              );
            },
          );

          socket.io.on(
            "reconnect",
            (attempt) => {
              if (
                socketRef.current !==
                socket
              ) {
                return;
              }

              console.log(
                "[DRIVER SOCKET] Reconnected:",
                attempt,
              );

              setSocketConnected(
                true,
              );

              setSocketStatus(
                "ONLINE",
              );

              window.setTimeout(() => {
                if (
                  mountedRef.current &&
                  socket.connected
                ) {
                  resendLatestGPS();
                }
              }, 150);
            },
          );

          socket.io.on(
            "reconnect_error",
            (error) => {
              console.error(
                "[DRIVER SOCKET] Reconnect error:",
                error,
              );
            },
          );

          socket.on(
            "driver:location:success",
            (
              result: SocketLocationSuccess,
            ) => {
              if (
                socketRef.current !==
                socket
              ) {
                return;
              }

              console.log(
                "[GPS SUCCESS]",
                result,
              );

              if (
                result?.recordedAt
              ) {
                setLastSocketSuccess(
                  result.recordedAt,
                );
              }

              setGpsError("");
            },
          );

          socket.on(
            "tracking:error",
            (
              result: TrackingError,
            ) => {
              if (
                socketRef.current !==
                socket
              ) {
                return;
              }

              console.error(
                "[TRACKING ERROR]",
                result,
              );

              if (
                result?.message
              ) {
                setError(
                  result.message,
                );
              }
            },
          );

          socket.on(
            "trip:started",
            (payload: any) => {
              console.log(
                "[TRIP STARTED EVENT]",
                payload,
              );

              setMessage(
                "Trip started successfully.",
              );

              void loadDashboard();

              window.setTimeout(() => {
                if (
                  mountedRef.current
                ) {
                  setMessage("");
                }
              }, 3000);
            },
          );

          socket.on(
            "trip:completed",
            (payload: any) => {
              console.log(
                "[TRIP COMPLETED EVENT]",
                payload,
              );

              setMessage(
                "Trip completed.",
              );

              stopGPS();

              void loadDashboard();

              window.setTimeout(() => {
                if (
                  mountedRef.current
                ) {
                  setMessage("");
                }
              }, 3000);
            },
          );
        } catch (error) {
          console.error(
            "[DRIVER SOCKET] Setup error:",
            error,
          );

          if (mountedRef.current) {
            setSocketConnected(
              false,
            );

            setSocketStatus(
              "ERROR",
            );
          }
        } finally {
          connectingRef.current =
            false;
        }
      },
      [
        getSocketToken,
        loadDashboard,
        resendLatestGPS,
        stopGPS,
      ],
    );

  /* =========================================================
     START TRIP
  ========================================================= */

  const startTrip =
    useCallback(async () => {
      const tripId =
        selectedTrip?.tripId ??
        selectedTrip?.id ??
        "";

      if (!tripId) {
        setError(
          "Please select a trip first.",
        );

        return;
      }

      let socket =
        socketRef.current;

      if (
        !socket ||
        !socket.connected
      ) {
        setError(
          "Realtime connection is reconnecting. Please wait a moment.",
        );

        await connectSocket();

        socket =
          socketRef.current;

        if (
          !socket ||
          !socket.connected
        ) {
          return;
        }
      }

      setStartingTrip(true);
      setError("");
      setMessage("");

      try {
        await new Promise<void>(
          (resolve) => {
            socket!.emit(
              "driver:start-trip",
              {
                tripId,
              },
              (
                response: any,
              ) => {
                console.log(
                  "[START TRIP ACK]",
                  response,
                );

                if (
                  !response?.success
                ) {
                  setError(
                    response?.message ||
                      "Unable to start trip.",
                  );

                  resolve();
                  return;
                }

                setMessage(
                  "Trip started successfully.",
                );

                /*
                 * Refresh dashboard first.
                 */
                void loadDashboard();

                /*
                 * Start GPS after server accepted
                 * the trip.
                 */
                window.setTimeout(() => {
                  if (
                    mountedRef.current
                  ) {
                    startGPS();
                  }
                }, 500);

                window.setTimeout(() => {
                  if (
                    mountedRef.current
                  ) {
                    setMessage("");
                  }
                }, 3000);

                resolve();
              },
            );
          },
        );
      } catch (error) {
        console.error(
          "START_TRIP_CLIENT_ERROR:",
          error,
        );

        setError(
          "Unable to start trip.",
        );
      } finally {
        if (mountedRef.current) {
          setStartingTrip(false);
        }
      }
    }, [
      connectSocket,
      loadDashboard,
      selectedTrip,
      startGPS,
    ]);

  /* =========================================================
     STOP TRIP
  ========================================================= */

  const stopTrip =
    useCallback(async () => {
      const tripId =
        selectedTrip?.tripId ??
        selectedTrip?.id ??
        "";

      if (!tripId) {
        setError(
          "No trip selected.",
        );

        return;
      }

      const confirmed =
        window.confirm(
          "Stop this trip now?",
        );

      if (!confirmed) {
        return;
      }

      const socket =
        socketRef.current;

      if (
        !socket ||
        !socket.connected
      ) {
        setError(
          "Realtime connection is not ready.",
        );

        return;
      }

      setStoppingTrip(true);
      setError("");
      setMessage("");

      try {
        await new Promise<void>(
          (resolve) => {
            socket.emit(
              "driver:stop-trip",
              {
                tripId,
              },
              (
                response: any,
              ) => {
                console.log(
                  "[STOP TRIP ACK]",
                  response,
                );

                if (
                  !response?.success
                ) {
                  setError(
                    response?.message ||
                      "Unable to complete trip.",
                  );

                  resolve();
                  return;
                }

                setMessage(
                  "Trip completed successfully.",
                );

                stopGPS();

                void loadDashboard();

                window.setTimeout(() => {
                  if (
                    mountedRef.current
                  ) {
                    setMessage("");
                  }
                }, 3000);

                resolve();
              },
            );
          },
        );
      } catch (error) {
        console.error(
          "STOP_TRIP_CLIENT_ERROR:",
          error,
        );

        setError(
          "Unable to complete trip.",
        );
      } finally {
        if (mountedRef.current) {
          setStoppingTrip(false);
        }
      }
    }, [
      loadDashboard,
      selectedTrip,
      stopGPS,
    ]);

  /* =========================================================
     INITIAL PAGE SETUP
  ========================================================= */

  useEffect(() => {
    mountedRef.current =
      true;

    pageActiveRef.current =
      true;

    void loadDashboard();

    void connectSocket();

    return () => {
      mountedRef.current =
        false;

      pageActiveRef.current =
        false;

      if (
        socketReconnectTimerRef.current
      ) {
        clearTimeout(
          socketReconnectTimerRef.current,
        );

        socketReconnectTimerRef.current =
          null;
      }

      stopGPS();

      const socket =
        socketRef.current;

      if (socket) {
        try {
          socket.removeAllListeners();

          socket.io.removeAllListeners();

          socket.disconnect();
        } catch {
          // ignore cleanup error
        }
      }

      socketRef.current =
        null;

      socketTokenRef.current =
        null;

      connectingRef.current =
        false;
    };
  }, [
    connectSocket,
    loadDashboard,
    stopGPS,
  ]);

  /* =========================================================
     START GPS WHEN RUNNING TRIP IS AVAILABLE
  ========================================================= */

  useEffect(() => {
    if (
      !selectedTrip ||
      selectedTrip.status !==
        "RUNNING"
    ) {
      return;
    }

    const timer =
      window.setTimeout(() => {
        if (
          mountedRef.current &&
          pageActiveRef.current
        ) {
          startGPS();
        }
      }, 500);

    return () => {
      window.clearTimeout(
        timer,
      );
    };
  }, [
    selectedTrip?.tripId,
    selectedTrip?.id,
    selectedTrip?.status,
    startGPS,
  ]);

  /* =========================================================
     BFCache + PAGE LIFECYCLE
  ========================================================= */

  useEffect(() => {
    const handlePageHide =
      (event: PageTransitionEvent) => {
        console.log(
          "[PAGE] pagehide",
          {
            persisted:
              event.persisted,
          },
        );

        pageActiveRef.current =
          false;

        /*
         * Stop GPS watcher while page is frozen.
         * It will be restarted on pageshow.
         */
        stopGPS();

        /*
         * Disconnect Socket.IO cleanly.
         *
         * This prevents the browser from leaving a
         * stale websocket in CLOSING/CLOSED state.
         */
        const socket =
          socketRef.current;

        if (socket) {
          try {
            socket.removeAllListeners();

            socket.io.removeAllListeners();

            socket.disconnect();
          } catch {
            // ignore
          }
        }

        socketRef.current =
          null;

        setSocketConnected(
          false,
        );

        setSocketStatus(
          "PAUSED",
        );
      };

    const handlePageShow =
      (event: PageTransitionEvent) => {
        console.log(
          "[PAGE] pageshow",
          {
            persisted:
              event.persisted,
          },
        );

        pageActiveRef.current =
          true;

        if (
          !mountedRef.current
        ) {
          return;
        }

        window.setTimeout(() => {
          if (
            !mountedRef.current ||
            !pageActiveRef.current
          ) {
            return;
          }

          console.log(
            "[PAGE] Restoring realtime tracking...",
          );

          void connectSocket(
            true,
          );

          void loadDashboard();

          if (
            selectedTripIdRef.current
          ) {
            window.setTimeout(() => {
              if (
                mountedRef.current &&
                pageActiveRef.current
              ) {
                startGPS();
              }
            }, 400);
          }
        }, 150);
      };

    const handleVisibility =
      () => {
        const visible =
          document.visibilityState ===
          "visible";

        pageActiveRef.current =
          visible;

        if (!visible) {
          console.log(
            "[PAGE] visibility hidden",
          );

          return;
        }

        console.log(
          "[PAGE] visibility restored",
        );

        if (
          !mountedRef.current
        ) {
          return;
        }

        window.setTimeout(() => {
          if (
            !mountedRef.current ||
            !pageActiveRef.current
          ) {
            return;
          }

          const socket =
            socketRef.current;

          if (
            !socket ||
            !socket.connected
          ) {
            void connectSocket(
              true,
            );
          } else {
            resendLatestGPS();
          }

          void loadDashboard();

          if (
            selectedTripIdRef.current
          ) {
            startGPS();
          }
        }, 150);
      };

    window.addEventListener(
      "pagehide",
      handlePageHide,
    );

    window.addEventListener(
      "pageshow",
      handlePageShow,
    );

    document.addEventListener(
      "visibilitychange",
      handleVisibility,
    );

    return () => {
      window.removeEventListener(
        "pagehide",
        handlePageHide,
      );

      window.removeEventListener(
        "pageshow",
        handlePageShow,
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibility,
      );
    };
  }, [
    connectSocket,
    loadDashboard,
    resendLatestGPS,
    startGPS,
    stopGPS,
  ]);

  /* =========================================================
     CLOCK FOR STALE STATUS
  ========================================================= */

  useEffect(() => {
    const timer =
      window.setInterval(() => {
        if (mountedRef.current) {
          setNow(Date.now());
        }
      }, 5000);

    return () => {
      window.clearInterval(
        timer,
      );
    };
  }, []);

  /* =========================================================
     AUTO RECONNECT SAFETY TIMER
  ========================================================= */

  useEffect(() => {
    const timer =
      window.setInterval(() => {
        if (
          !mountedRef.current ||
          !pageActiveRef.current
        ) {
          return;
        }

        const socket =
          socketRef.current;

        if (
          !socket ||
          !socket.connected
        ) {
          void connectSocket(
            true,
          );
        }
      }, SOCKET_RECONNECT_CHECK);

    return () => {
      window.clearInterval(
        timer,
      );
    };
  }, [
    connectSocket,
  ]);

  /* =========================================================
     UI HELPERS
  ========================================================= */

  const driverName =
    dashboard?.driver?.name ??
    dashboard?.driver?.username ??
    "Driver";

  const driverId =
    dashboard?.driver?.driverId ??
    dashboard?.driver?.id ??
    "—";

  const busNumber =
    selectedBus?.busNumber ??
    "—";

  const busId =
    selectedBus?.busId ??
    selectedBus?.id ??
    "—";

  const registration =
    selectedBus?.registration ??
    "—";

  const routeName =
    selectedRoute?.name ??
    "—";

  const routeId =
    selectedRoute?.routeId ??
    selectedRoute?.id ??
    "—";

  const tripDisplayId =
    selectedTrip?.tripId ??
    selectedTrip?.id ??
    "—";

  const canStart =
    Boolean(
      selectedTrip &&
        selectedTrip.status ===
          "SCHEDULED",
    );

  const canStop =
    Boolean(
      selectedTrip &&
        selectedTrip.status ===
          "RUNNING",
    );

  const statusLabel =
    selectedTripStatus;

  const lastGPSDisplay =
    lastValidGPS ??
    gpsLocation?.recordedAt ??
    null;

  /* =========================================================
     LOADING
  ========================================================= */

  if (loading) {
    return (
      <main className="min-h-screen bg-[#070b18] text-white">
        <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-8 py-10 text-center shadow-2xl">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-cyan-400" />

            <p className="text-lg font-bold">
              Loading Driver Dashboard
            </p>

            <p className="mt-2 text-sm text-slate-400">
              Realtime tracking connection
              starting...
            </p>
          </div>
        </div>
      </main>
    );
  }

  /* =========================================================
     PAGE
  ========================================================= */

  return (
    <main className="min-h-screen bg-[#070b18] text-slate-100">
      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070b18]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400">
              Driver Operations
            </p>

            <h1 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">
              Driver Dashboard
            </h1>
          </div>

          <div
            className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${
              socketConnected
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                : "border-amber-500/20 bg-amber-500/10 text-amber-400"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                socketConnected
                  ? "bg-emerald-400"
                  : "animate-pulse bg-amber-400"
              }`}
            />

            {socketConnected
              ? "Realtime Connected"
              : socketStatus}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* ERROR */}
        {error && (
          <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-300">
            <div className="font-bold">
              Tracking Error
            </div>

            <div className="mt-1">
              {error}
            </div>
          </div>
        )}

        {/* SUCCESS */}
        {message && (
          <div className="mb-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-300">
            {message}
          </div>
        )}

        {/* DRIVER / ASSIGNMENT */}
        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-xl">
            <p className="text-xs font-medium text-slate-500">
              Driver
            </p>

            <p className="mt-2 text-lg font-black">
              {driverName}
            </p>

            <p className="mt-1 text-xs text-slate-400">
              Driver ID: {driverId}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-xl">
            <p className="text-xs font-medium text-slate-500">
              Assigned Bus
            </p>

            <p className="mt-2 text-lg font-black">
              Bus {busNumber}
            </p>

            <p className="mt-1 text-xs text-slate-400">
              {registration}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-xl">
            <p className="text-xs font-medium text-slate-500">
              Route
            </p>

            <p className="mt-2 text-lg font-black">
              {routeName}
            </p>

            <p className="mt-1 text-xs text-slate-400">
              {routeId}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-xl">
            <p className="text-xs font-medium text-slate-500">
              Assigned Trips
            </p>

            <p className="mt-2 text-2xl font-black">
              {trips.length}
            </p>

            <p className="mt-1 text-xs text-slate-400">
              Available trips
            </p>
          </div>
        </section>

        {/* TRIP SELECTION */}
        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-400">
                Current Trip
              </p>

              <label className="mt-3 block text-sm font-semibold text-slate-300">
                Select assigned trip
              </label>

              <select
                value={
                  selectedTripId
                }
                onChange={(event) => {
                  const value =
                    event.target.value;

                  setSelectedTripId(
                    value,
                  );

                  selectedTripIdRef.current =
                    value;

                  const trip =
                    trips.find(
                      (item) =>
                        item.tripId ===
                          value ||
                        item.id === value,
                    );

                  if (
                    trip?.status ===
                    "RUNNING"
                  ) {
                    startGPS();
                  } else {
                    stopGPS();
                  }
                }}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-cyan-400/50"
              >
                <option value="">
                  Select trip
                </option>

                {trips.map(
                  (trip) => {
                    const id =
                      trip.tripId ??
                      trip.id ??
                      "";

                    return (
                      <option
                        key={id}
                        value={id}
                      >
                        {id} — Bus{" "}
                        {trip.bus
                          ?.busNumber ??
                          busNumber}{" "}
                        —{" "}
                        {trip.route
                          ?.name ??
                          routeName}{" "}
                        —{" "}
                        {trip.status}
                      </option>
                    );
                  },
                )}
              </select>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() =>
                  void loadDashboard()
                }
                className="rounded-xl border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/[0.09]"
              >
                Refresh
              </button>

              {canStart && (
                <button
                  type="button"
                  onClick={() =>
                    void startTrip()
                  }
                  disabled={
                    startingTrip
                  }
                  className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {startingTrip
                    ? "Starting..."
                    : "Start Trip"}
                </button>
              )}

              {canStop && (
                <button
                  type="button"
                  onClick={() =>
                    void stopTrip()
                  }
                  disabled={
                    stoppingTrip
                  }
                  className="rounded-xl bg-red-500 px-5 py-3 text-sm font-black text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {stoppingTrip
                    ? "Stopping..."
                    : "Stop Trip"}
                </button>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <p className="text-xs text-slate-500">
                Trip
              </p>

              <p className="mt-1 break-all text-sm font-bold">
                {tripDisplayId}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <p className="text-xs text-slate-500">
                Bus
              </p>

              <p className="mt-1 text-sm font-bold">
                {busNumber}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <p className="text-xs text-slate-500">
                Route
              </p>

              <p className="mt-1 text-sm font-bold">
                {routeName}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <p className="text-xs text-slate-500">
                Status
              </p>

              <p
                className={`mt-1 text-sm font-black ${
                  statusLabel ===
                  "RUNNING"
                    ? "text-emerald-400"
                    : statusLabel ===
                        "COMPLETED"
                      ? "text-slate-400"
                      : "text-amber-400"
                }`}
              >
                {statusLabel}
              </p>
            </div>
          </div>
        </section>

        {/* GPS */}
        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-400">
                GPS Tracking
              </p>

              <h2 className="mt-1 text-xl font-black">
                Live Location
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Driver GPS location is
                continuously sent to the
                realtime tracking server.
              </p>
            </div>

            <div
              className={`rounded-full border px-4 py-2 text-xs font-black ${gpsLevelClass(
                currentGpsLevel,
              )}`}
            >
              {gpsIsStale
                ? "GPS STALE"
                : gpsStatus}
            </div>
          </div>

          {gpsError && (
            <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              {gpsError}
            </div>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-[#0b1020] p-5">
              <p className="text-xs text-slate-500">
                GPS Status
              </p>

              <p
                className={`mt-2 text-lg font-black ${
                  currentGpsLevel ===
                  "GOOD"
                    ? "text-emerald-400"
                    : currentGpsLevel ===
                        "FAIR"
                      ? "text-amber-400"
                      : currentGpsLevel ===
                          "POOR"
                        ? "text-red-400"
                        : "text-slate-300"
                }`}
              >
                {gpsIsStale
                  ? "STALE"
                  : gpsStatus}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {sendingGPS
                  ? "Sending location..."
                  : socketConnected
                    ? "Realtime ready"
                    : "Waiting for socket..."}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0b1020] p-5">
              <p className="text-xs text-slate-500">
                Latitude
              </p>

              <p className="mt-2 text-lg font-black">
                {gpsLocation
                  ? gpsLocation.latitude.toFixed(
                      6,
                    )
                  : "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0b1020] p-5">
              <p className="text-xs text-slate-500">
                Longitude
              </p>

              <p className="mt-2 text-lg font-black">
                {gpsLocation
                  ? gpsLocation.longitude.toFixed(
                      6,
                    )
                  : "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0b1020] p-5">
              <p className="text-xs text-slate-500">
                Accuracy
              </p>

              <p className="mt-2 text-lg font-black">
                {gpsLocation
                  ? `${gpsLocation.accuracy.toFixed(
                      1,
                    )} m`
                  : "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0b1020] p-5">
              <p className="text-xs text-slate-500">
                Speed
              </p>

              <p className="mt-2 text-lg font-black">
                {gpsLocation?.speed !==
                  null &&
                gpsLocation?.speed !==
                  undefined
                  ? `${(
                      gpsLocation.speed *
                      3.6
                    ).toFixed(1)} km/h`
                  : "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0b1020] p-5">
              <p className="text-xs text-slate-500">
                Heading
              </p>

              <p className="mt-2 text-lg font-black">
                {gpsLocation?.heading !==
                  null &&
                gpsLocation?.heading !==
                  undefined
                  ? `${gpsLocation.heading.toFixed(
                      0,
                    )}°`
                  : "—"}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <p className="text-xs text-slate-500">
                Last Valid GPS
              </p>

              <p className="mt-1 text-sm font-bold">
                {lastGPSDisplay
                  ? formatDateTime(
                      lastGPSDisplay,
                    )
                  : "Waiting..."}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <p className="text-xs text-slate-500">
                Last Server ACK
              </p>

              <p className="mt-1 text-sm font-bold">
                {lastSocketSuccess
                  ? formatDateTime(
                      lastSocketSuccess,
                    )
                  : "Waiting..."}
              </p>
            </div>
          </div>
        </section>

        {/* CONNECTION INFO */}
        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Socket Connection
            </p>

            <div className="mt-3 flex items-center gap-3">
              <span
                className={`h-3 w-3 rounded-full ${
                  socketConnected
                    ? "bg-emerald-400"
                    : "animate-pulse bg-amber-400"
                }`}
              />

              <span className="text-lg font-black">
                {socketConnected
                  ? "ONLINE"
                  : socketStatus}
              </span>
            </div>

            <p className="mt-2 text-xs text-slate-500">
              Server: {SOCKET_URL}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              GPS Stream
            </p>

            <p className="mt-3 text-lg font-black text-cyan-400">
              {watchIdRef.current !==
              null
                ? "ACTIVE"
                : "STOPPED"}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              Fresh GPS request every{" "}
              {GPS_REFRESH_INTERVAL /
                1000}
              s
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              GPS Rules
            </p>

            <div className="mt-3 space-y-1 text-xs">
              <p className="text-emerald-400">
                GOOD ≤ 50m
              </p>

              <p className="text-amber-400">
                FAIR ≤ 200m
              </p>

              <p className="text-red-400">
                POOR &gt; 200m
              </p>

              <p className="text-slate-500">
                Reject &gt; 1000m
              </p>
            </div>
          </div>
        </section>

        {/* DEBUG INFO */}
        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                Realtime Diagnostics
              </p>

              <p className="mt-1 text-sm text-slate-400">
                BFCache/reconnect protection is
                active.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                void connectSocket(
                  true,
                );

                if (
                  selectedTripIdRef.current
                ) {
                  window.setTimeout(
                    () => {
                      startGPS();
                    },
                    500,
                  );
                }
              }}
              className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-xs font-black text-cyan-300 hover:bg-cyan-500/20"
            >
              Reconnect Tracking
            </button>
          </div>

          <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
            <div className="rounded-xl bg-black/20 p-3">
              <span className="text-slate-500">
                Socket
              </span>

              <span className="ml-2 font-bold">
                {socketConnected
                  ? "CONNECTED"
                  : "DISCONNECTED"}
              </span>
            </div>

            <div className="rounded-xl bg-black/20 p-3">
              <span className="text-slate-500">
                GPS watcher
              </span>

              <span className="ml-2 font-bold">
                {watchIdRef.current !==
                null
                  ? "ACTIVE"
                  : "STOPPED"}
              </span>
            </div>

            <div className="rounded-xl bg-black/20 p-3">
              <span className="text-slate-500">
                Selected trip
              </span>

              <span className="ml-2 font-bold">
                {tripDisplayId}
              </span>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="pb-8 pt-8 text-center text-xs text-slate-600">
          Bus Tracking • Driver realtime GPS
          operations
        </footer>
      </div>
    </main>
  );
}
