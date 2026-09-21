"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";

type DashboardData = {
  success: boolean;

  student: {
    id: string;
    studentId: string;
    name: string;
  };

  assignment: {
    id: string;

    bus: {
      id: string;
      busId: string;
      busNumber: string;
      registration: string;
      status: string;
    };

    route: {
      id: string;
      routeId: string;
      name: string;
    };

    stop: {
      id: string;
      stopId: string;
      name: string;
      latitude: number;
      longitude: number;
      sequence: number;
    };
  } | null;

  trip: {
    id: string;
    tripId: string;
    status: string;
    startedAt: string | null;
  } | null;

  latestLocation: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
    recordedAt: string;
  } | null;

  studentTripStatus: {
    status: string;
    boardedAt: string | null;
    missedAt: string | null;
  } | null;

  notifications: {
    id: string;
    type: string;
    title: string;
    message: string;
    tripId: string | null;
    read: boolean;
    createdAt: string;
  }[];
};

type LiveBusLocation = {
  tripId: string;
  busId: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  recordedAt?: string;
};

type StudentNotification = {
  id?: string;
  type: string;
  title: string;
  message: string;
  tripId?: string | null;
  createdAt?: string;
};

type StudentMapProps = {
  busLocation: LiveBusLocation | null;
  pickupStop: {
    id: string;
    stopId: string;
    name: string;
    latitude: number;
    longitude: number;
    sequence: number;
  };
  busNumber: string;
  registration: string;
  tripRunning: boolean;
};

const StudentMap = dynamic<StudentMapProps>(
  () => import("./StudentMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] w-full items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="text-4xl">🗺️</div>
          <p className="mt-3 text-sm text-slate-400">
            Loading live map...
          </p>
        </div>
      </div>
    ),
  }
);

function calculateDistanceMeters(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number
) {
  const earthRadius = 6371000;

  const dLat =
    ((latitude2 - latitude1) * Math.PI) / 180;

  const dLng =
    ((longitude2 - longitude1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((latitude1 * Math.PI) / 180) *
      Math.cos((latitude2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return (
    earthRadius *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}

function getGpsLevel(
  accuracy: number | null | undefined
) {
  if (accuracy == null) {
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

function isLocationStale(
  recordedAt: string | undefined,
  maxAgeMs = 60_000
) {
  if (!recordedAt) {
    return true;
  }

  const timestamp =
    new Date(recordedAt).getTime();

  if (!Number.isFinite(timestamp)) {
    return true;
  }

  return Date.now() - timestamp > maxAgeMs;
}

export default function StudentDashboardPage() {
  const router = useRouter();

  const socketRef =
    useRef<Socket | null>(null);

  const dataRef =
    useRef<DashboardData | null>(null);

  const [data, setData] =
    useState<DashboardData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [socketConnected, setSocketConnected] =
    useState(false);

  const [error, setError] =
    useState("");

  const [liveLocation, setLiveLocation] =
    useState<LiveBusLocation | null>(null);

  const [notifications, setNotifications] =
    useState<StudentNotification[]>([]);

  const [now, setNow] =
    useState(Date.now());

  /*
   * Keep dataRef synchronized.
   */
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  /*
   * Load dashboard.
   */
  const loadDashboard = useCallback(
    async () => {
      try {
        const response = await fetch(
          "/api/student/dashboard",
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          }
        );

        const result =
          await response.json();

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          router.replace("/student/login");
          return;
        }

        if (!response.ok || !result.success) {
          setError(
            result.message ||
              "Dashboard load failed."
          );
          return;
        }

        setData(result);

        setNotifications(
          result.notifications?.map(
            (item: StudentNotification) =>
              item
          ) ?? []
        );

        if (
          result.latestLocation &&
          result.trip &&
          result.assignment?.bus
        ) {
          setLiveLocation({
            tripId: result.trip.id,
            busId:
              result.assignment.bus.id,
            latitude:
              result.latestLocation.latitude,
            longitude:
              result.latestLocation.longitude,
            accuracy:
              result.latestLocation.accuracy,
            speed:
              result.latestLocation.speed,
            heading:
              result.latestLocation.heading,
            recordedAt:
              result.latestLocation.recordedAt,
          });
        } else {
          setLiveLocation(null);
        }
      } catch (err) {
        console.error(err);

        setError(
          "Unable to connect to server."
        );
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  /*
   * Refresh stale GPS status every 10 seconds.
   */
  useEffect(() => {
    const timer =
      window.setInterval(() => {
        setNow(Date.now());
      }, 10_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  /*
   * Socket.IO realtime connection.
   */
  useEffect(() => {
    let mounted = true;

    async function connectSocket() {
      try {
        const response = await fetch(
          "/api/auth/socket-token",
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          }
        );

        const result =
          await response.json();

        if (
          !response.ok ||
          !result.success
        ) {
          router.replace("/student/login");
          return;
        }

        if (!mounted) {
          return;
        }

        const socket = io(
          "http://127.0.0.1:4001",
          {
            transports: ["websocket"],
            auth: {
              token: result.token,
            },
          }
        );

        socketRef.current = socket;

        socket.on("connect", () => {
          if (mounted) {
            setSocketConnected(true);
          }
        });

        socket.on("disconnect", () => {
          if (mounted) {
            setSocketConnected(false);
          }
        });

        socket.on(
          "connect_error",
          (socketError) => {
            console.error(
              "Student Socket Error:",
              socketError
            );

            if (mounted) {
              setSocketConnected(false);
            }
          }
        );

        /*
         * Receive only the assigned bus location.
         */
        socket.on(
          "bus:location",
          (location: LiveBusLocation) => {
            if (!mounted) {
              return;
            }

            const current =
              dataRef.current;

            if (
              !current ||
              !current.assignment ||
              !current.trip
            ) {
              return;
            }

            const assignedBusId =
              current.assignment.bus.id;

            const currentTripId =
              current.trip.id;

            if (
              location.busId !==
                assignedBusId ||
              location.tripId !==
                currentTripId
            ) {
              return;
            }

            setLiveLocation(location);
          }
        );

        /*
         * Student proximity event.
         */
        socket.on(
          "student:bus-proximity",
          (payload: {
            tripId?: string;
            distanceMeters?: number;
            status?: string;
            notification?: StudentNotification;
          }) => {
            const current =
              dataRef.current;

            if (
              current?.trip &&
              payload.tripId &&
              payload.tripId !==
                current.trip.id
            ) {
              return;
            }

            if (payload.notification) {
              setNotifications(
                (currentNotifications) => {
                  const incoming =
                    payload.notification!;

                  if (
                    incoming.id &&
                    currentNotifications.some(
                      (item) =>
                        item.id ===
                        incoming.id
                    )
                  ) {
                    return currentNotifications;
                  }

                  return [
                    incoming,
                    ...currentNotifications,
                  ].slice(0, 20);
                }
              );
            }

            if (payload.status) {
              setData((currentData) => {
                if (!currentData) {
                  return currentData;
                }

                return {
                  ...currentData,
                  studentTripStatus: {
                    status:
                      payload.status!,
                    boardedAt:
                      currentData
                        .studentTripStatus
                        ?.boardedAt ??
                      null,
                    missedAt:
                      currentData
                        .studentTripStatus
                        ?.missedAt ??
                      null,
                  },
                };
              });
            }
          }
        );

        /*
         * General student notification.
         */
        socket.on(
          "student:notification",
          (
            notification: StudentNotification
          ) => {
            const current =
              dataRef.current;

            if (
              current?.trip &&
              notification.tripId &&
              notification.tripId !==
                current.trip.id
            ) {
              return;
            }

            setNotifications(
              (currentNotifications) => {
                if (
                  notification.id &&
                  currentNotifications.some(
                    (item) =>
                      item.id ===
                      notification.id
                  )
                ) {
                  return currentNotifications;
                }

                return [
                  notification,
                  ...currentNotifications,
                ].slice(0, 20);
              }
            );
          }
        );

        /*
         * Trip started.
         */
        socket.on(
          "trip:started",
          () => {
            loadDashboard();
          }
        );

        /*
         * Trip completed.
         */
        socket.on(
          "trip:completed",
          () => {
            setLiveLocation(null);
            loadDashboard();
          }
        );
      } catch (err) {
        console.error(
          "Socket connection failed:",
          err
        );
      }
    }

    connectSocket();

    return () => {
      mounted = false;

      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [loadDashboard, router]);

  /*
   * Logout.
   */
  async function logout() {
    await fetch(
      "/api/auth/logout",
      {
        method: "POST",
        credentials: "include",
      }
    );

    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    router.replace("/student/login");
    router.refresh();
  }

  /*
   * Loading.
   */
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <div className="text-4xl">
            🚌
          </div>

          <p className="mt-4 text-slate-400">
            Student dashboard loading...
          </p>
        </div>
      </main>
    );
  }

  /*
   * Error.
   */
  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="max-w-md rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center">
          <p className="text-red-300">
            {error}
          </p>

          <button
            type="button"
            onClick={loadDashboard}
            className="mt-4 rounded-xl bg-blue-600 px-5 py-2 text-white"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!data) {
    return null;
  }

  const assignment =
    data.assignment;

  if (!assignment) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <header className="border-b border-white/10 bg-slate-900/80">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-xl">
                🚌
              </div>

              <div>
                <h1 className="font-bold">
                  Student Bus Tracking
                </h1>

                <p className="text-xs text-slate-400">
                  Live tracking system
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={logout}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
            >
              Logout
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-4 py-8">
          <section className="mb-6">
            <p className="text-sm text-slate-400">
              Welcome
            </p>

            <h2 className="text-3xl font-bold">
              {data.student.name}
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Student ID:{" "}
              {data.student.studentId}
            </p>
          </section>

          <section className="rounded-3xl border border-yellow-500/20 bg-yellow-500/10 p-8">
            <h2 className="text-xl font-bold text-yellow-200">
              Bus assignment இல்லை
            </h2>

            <p className="mt-2 text-sm text-yellow-100/70">
              Admin இன்னும் உங்களுக்கு bus
              மற்றும் pickup stop assign
              செய்யவில்லை.
            </p>
          </section>
        </div>
      </main>
    );
  }

  /*
   * Correct latest-location fallback.
   */
  const currentBusLocation =
    liveLocation ??
    (data.latestLocation &&
    data.trip
      ? {
          tripId: data.trip.id,
          busId: assignment.bus.id,
          latitude:
            data.latestLocation.latitude,
          longitude:
            data.latestLocation.longitude,
          accuracy:
            data.latestLocation.accuracy,
          speed:
            data.latestLocation.speed,
          heading:
            data.latestLocation.heading,
          recordedAt:
            data.latestLocation.recordedAt,
        }
      : null);

  let distanceToStop:
    | number
    | null = null;

  if (
    currentBusLocation &&
    assignment.stop
  ) {
    distanceToStop =
      calculateDistanceMeters(
        currentBusLocation.latitude,
        currentBusLocation.longitude,
        assignment.stop.latitude,
        assignment.stop.longitude
      );
  }

  const distanceText =
    distanceToStop === null
      ? "—"
      : distanceToStop >= 1000
        ? `${(
            distanceToStop / 1000
          ).toFixed(2)} km`
        : `${Math.round(
            distanceToStop
          )} m`;

  const studentStatus =
    data.studentTripStatus
      ?.status ?? "WAITING";

  const isRunning =
    data.trip?.status === "RUNNING";

  const locationStale =
    currentBusLocation
      ? isLocationStale(
          currentBusLocation.recordedAt,
          60_000
        )
      : true;

  const gpsLevel =
    getGpsLevel(
      currentBusLocation?.accuracy
    );

  const withinOneKm =
    distanceToStop !== null &&
    distanceToStop <= 1000 &&
    isRunning &&
    !locationStale;

  /*
   * Avoid unused-variable warning while preserving
   * stale refresh behavior.
   */
  void now;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-xl">
              🚌
            </div>

            <div>
              <h1 className="font-bold">
                Student Bus Tracking
              </h1>

              <p className="text-xs text-slate-400">
                Live tracking system
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                socketConnected
                  ? "bg-emerald-500/10 text-emerald-300"
                  : "bg-red-500/10 text-red-300"
              }`}
            >
              {socketConnected
                ? "● Realtime Connected"
                : "● Realtime Offline"}
            </div>

            <button
              type="button"
              onClick={logout}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <section className="mb-6">
          <p className="text-sm text-slate-400">
            Welcome
          </p>

          <h2 className="text-3xl font-bold">
            {data.student.name}
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Student ID:{" "}
            {data.student.studentId}
          </p>
        </section>

        {/* Assignment cards */}
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-400">
              Assigned Bus
            </p>

            <p className="mt-2 text-3xl font-bold">
              {assignment.bus.busNumber}
            </p>

            <p className="mt-1 text-sm text-slate-500">
              {assignment.bus.registration}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-400">
              Route
            </p>

            <p className="mt-2 text-xl font-bold">
              {assignment.route.name}
            </p>

            <p className="mt-1 text-sm text-slate-500">
              {assignment.route.routeId}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-400">
              Pickup Stop
            </p>

            <p className="mt-2 text-xl font-bold">
              {assignment.stop.name}
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Stop{" "}
              {assignment.stop.sequence}
            </p>
          </div>
        </section>

        {/* Live Map */}
        <section className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <div className="flex flex-col gap-3 border-b border-white/10 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold">
                🗺️ Live Bus Map
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                உங்கள் assigned bus மட்டும்
                realtime-ல் காட்டப்படுகிறது.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  locationStale
                    ? "bg-amber-500/10 text-amber-300"
                    : "bg-emerald-500/10 text-emerald-300"
                }`}
              >
                {locationStale
                  ? "● GPS STALE"
                  : "● GPS LIVE"}
              </span>

              <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-300">
                Bus{" "}
                {assignment.bus.busNumber}
              </span>
            </div>
          </div>

          <div className="h-[420px] w-full">
            <StudentMap
              busLocation={
                currentBusLocation
              }
              pickupStop={
                assignment.stop
              }
              busNumber={
                assignment.bus.busNumber
              }
              registration={
                assignment.bus.registration
              }
              tripRunning={isRunning}
            />
          </div>

          {!currentBusLocation && (
            <div className="border-t border-yellow-400/10 bg-yellow-500/5 px-5 py-4 text-sm text-yellow-200">
              🚌 Bus location இன்னும்
              கிடைக்கவில்லை. Driver trip start
              செய்து GPS allow செய்ய வேண்டும்.
            </div>
          )}
        </section>

        {/* Proximity + Trip Status */}
        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div
            className={`rounded-3xl border p-6 ${
              withinOneKm
                ? "border-emerald-400/30 bg-emerald-500/10"
                : "border-white/10 bg-white/5"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">
                  Bus → Your Pickup Stop
                </p>

                <h2 className="mt-2 text-4xl font-bold">
                  {distanceText}
                </h2>
              </div>

              <div className="text-4xl">
                {withinOneKm
                  ? "🔔"
                  : "🚌"}
              </div>
            </div>

            {withinOneKm ? (
              <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                <p className="font-bold text-emerald-200">
                  Bus 1 KM-க்குள் வந்துவிட்டது!
                </p>

                <p className="mt-1 text-sm text-emerald-100/70">
                  உங்கள் pickup stop-க்கு
                  தயாராக இருங்கள்.
                </p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-400">
                {distanceToStop === null
                  ? "Bus location waiting..."
                  : distanceToStop <= 1000
                    ? "Bus 1 KM-க்குள் உள்ளது."
                    : "Bus இன்னும் 1 KM-க்கு மேல் தொலைவில் உள்ளது."}
              </p>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-900 p-4">
                <p className="text-xs text-slate-500">
                  GPS Status
                </p>

                <p
                  className={`mt-1 text-sm font-semibold ${
                    locationStale
                      ? "text-amber-300"
                      : gpsLevel === "GOOD"
                        ? "text-emerald-300"
                        : gpsLevel === "FAIR"
                          ? "text-yellow-300"
                          : "text-red-300"
                  }`}
                >
                  {locationStale
                    ? "STALE"
                    : gpsLevel}
                </p>
              </div>

              <div className="rounded-xl bg-slate-900 p-4">
                <p className="text-xs text-slate-500">
                  Accuracy
                </p>

                <p className="mt-1 text-sm">
                  {currentBusLocation?.accuracy !=
                  null
                    ? `${Math.round(
                        currentBusLocation.accuracy
                      )} m`
                    : "—"}
                </p>
              </div>

              <div className="rounded-xl bg-slate-900 p-4">
                <p className="text-xs text-slate-500">
                  Speed
                </p>

                <p className="mt-1 text-sm">
                  {currentBusLocation?.speed !=
                  null
                    ? `${currentBusLocation.speed.toFixed(
                        1
                      )} m/s`
                    : "—"}
                </p>
              </div>

              <div className="rounded-xl bg-slate-900 p-4">
                <p className="text-xs text-slate-500">
                  Last GPS
                </p>

                <p className="mt-1 text-sm">
                  {currentBusLocation
                    ? new Date(
                        currentBusLocation.recordedAt ??
                          ""
                      ).toLocaleTimeString(
                        "en-IN"
                      )
                    : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Student trip status */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <p className="text-sm text-slate-400">
              Your Trip Status
            </p>

            <div className="mt-4 rounded-2xl bg-slate-900 p-6 text-center">
              <div className="text-5xl">
                {studentStatus ===
                "BOARDED"
                  ? "🟢"
                  : studentStatus ===
                      "ARRIVED"
                    ? "📍"
                    : studentStatus ===
                        "APPROACHING"
                      ? "🚌"
                      : studentStatus ===
                          "MISSED"
                        ? "🔴"
                        : "⏳"}
              </div>

              <h2 className="mt-4 text-2xl font-bold">
                {studentStatus}
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                {studentStatus ===
                  "WAITING" &&
                  "Bus இன்னும் உங்கள் stop-க்கு வரவில்லை."}

                {studentStatus ===
                  "APPROACHING" &&
                  "Bus உங்கள் stop-ஐ நோக்கி வருகிறது."}

                {studentStatus ===
                  "ARRIVED" &&
                  "Bus உங்கள் stop அருகில் வந்துவிட்டது."}

                {studentStatus ===
                  "BOARDED" &&
                  "You are marked as boarded."}

                {studentStatus ===
                  "MISSED" &&
                  "Bus missed status."}

                {studentStatus ===
                  "ABSENT" &&
                  "Absent status."}
              </p>
            </div>

            <div className="mt-5 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
              <p className="font-semibold text-blue-200">
                Pickup Location
              </p>

              <p className="mt-1 text-sm text-blue-100/70">
                {assignment.stop.name}
              </p>

              <p className="mt-2 text-xs text-blue-100/50">
                {assignment.stop.latitude},{" "}
                {assignment.stop.longitude}
              </p>
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">
                Notifications
              </h2>

              <p className="text-sm text-slate-400">
                Bus proximity and trip
                updates
              </p>
            </div>

            <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs text-blue-300">
              {notifications.length}
            </span>
          </div>

          {notifications.length ===
          0 ? (
            <div className="mt-5 rounded-2xl bg-slate-900 p-6 text-center text-sm text-slate-500">
              No notifications yet.
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {notifications.map(
                (
                  notification,
                  index
                ) => (
                  <div
                    key={
                      notification.id ??
                      `${notification.type}-${notification.createdAt}-${index}`
                    }
                    className="rounded-2xl border border-white/5 bg-slate-900 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-xl">
                        {notification.type ===
                          "BUS_APPROACHING" &&
                          "🚌"}

                        {notification.type ===
                          "BUS_NEAR" &&
                          "🔔"}

                        {notification.type ===
                          "BUS_ARRIVING" &&
                          "📍"}

                        {![
                          "BUS_APPROACHING",
                          "BUS_NEAR",
                          "BUS_ARRIVING",
                        ].includes(
                          notification.type
                        ) && "🔔"}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {
                            notification.title
                          }
                        </p>

                        <p className="mt-1 text-sm text-slate-400">
                          {
                            notification.message
                          }
                        </p>

                        {notification.createdAt && (
                          <p className="mt-2 text-xs text-slate-600">
                            {new Date(
                              notification.createdAt
                            ).toLocaleString(
                              "en-IN"
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}