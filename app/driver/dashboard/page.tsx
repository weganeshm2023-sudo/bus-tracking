"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

type DriverData = {
  id: string;
  driverId: string;
  name: string;
  phone?: string | null;
  username?: string;
};

type Trip = {
  id: string;
  tripId: string;
  status:
    | "SCHEDULED"
    | "RUNNING"
    | "COMPLETED"
    | "CANCELLED";
  bus?: {
    id?: string;
    busId?: string;
    busNumber?: string;
  } | null;
  route?: {
    id?: string;
    routeId?: string;
    name?: string;
    routeName?: string;
    origin?: string;
    destination?: string;
  } | null;
  scheduledAt?: string | null;
  startTime?: string | null;
  endTime?: string | null;
};

type DashboardResponse = {
  success: boolean;
  message?: string;
  driver?: DriverData;
  trips?: Trip[];
  assignments?: unknown[];
};

type SocketTokenResponse = {
  success: boolean;
  token?: string;
  message?: string;
};

type StartTripResponse = {
  success?: boolean;
  message?: string;
  tripId?: string;
  busId?: string;
  startedAt?: string;
};

type StopTripResponse = {
  success?: boolean;
  message?: string;
  tripId?: string;
  completedAt?: string;
};

type GpsStatus =
  | "OFFLINE"
  | "SEARCHING"
  | "GOOD"
  | "FAIR"
  | "POOR";

export default function DriverDashboardPage() {
  const socketRef = useRef<Socket | null>(null);

  const watchIdRef = useRef<number | null>(null);

  const currentTripRef = useRef<Trip | null>(null);

  const startTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const gpsRetryTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastValidPositionRef =
    useRef<GeolocationPosition | null>(null);

  const [driver, setDriver] =
    useState<DriverData | null>(null);

  const [trips, setTrips] =
    useState<Trip[]>([]);

  const [selectedTripId, setSelectedTripId] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [starting, setStarting] =
    useState(false);

  const [tracking, setTracking] =
    useState(false);

  const [socketConnected, setSocketConnected] =
    useState(false);

  const [latitude, setLatitude] =
    useState<number | null>(null);

  const [longitude, setLongitude] =
    useState<number | null>(null);

  const [speed, setSpeed] =
    useState<number | null>(null);

  const [accuracy, setAccuracy] =
    useState<number | null>(null);

  const [heading, setHeading] =
    useState<number | null>(null);

  const [gpsStatus, setGpsStatus] =
    useState<GpsStatus>("OFFLINE");

  const [lastGpsTime, setLastGpsTime] =
    useState<Date | null>(null);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  /*
   * ==========================================================
   * LOAD DRIVER DASHBOARD
   * ==========================================================
   */

  useEffect(() => {
    loadDashboard();

    return () => {
      stopGpsTracking();

      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }

      if (gpsRetryTimeoutRef.current) {
        clearTimeout(gpsRetryTimeoutRef.current);
        gpsRetryTimeoutRef.current = null;
      }

      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  async function loadDashboard() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        "/api/driver/dashboard",
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        }
      );

      const data =
        (await response.json()) as DashboardResponse;

      if (!response.ok || !data.success) {
        setError(
          data.message ||
            "Driver dashboard-ஐ load செய்ய முடியவில்லை."
        );

        setLoading(false);
        return;
      }

      setDriver(data.driver || null);

      const loadedTrips =
        Array.isArray(data.trips)
          ? data.trips
          : [];

      setTrips(loadedTrips);

      const runningTrip =
        loadedTrips.find(
          (trip) =>
            trip.status === "RUNNING"
        );

      if (runningTrip) {
        setSelectedTripId(
          runningTrip.id
        );

        currentTripRef.current =
          runningTrip;

        setTracking(true);

        await connectSocket();

        await startGpsTracking(
          runningTrip
        );
      }

      setLoading(false);
    } catch (err) {
      console.error(
        "DRIVER_DASHBOARD_ERROR:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Dashboard load failed."
      );

      setLoading(false);
    }
  }

  /*
   * ==========================================================
   * SOCKET.IO
   * ==========================================================
   */

  async function connectSocket(): Promise<Socket> {
    if (
      socketRef.current?.connected
    ) {
      return socketRef.current;
    }

    const tokenResponse =
      await fetch(
        "/api/auth/socket-token",
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        }
      );

    const tokenData =
      (await tokenResponse.json()) as SocketTokenResponse;

    if (
      !tokenResponse.ok ||
      !tokenData.success ||
      !tokenData.token
    ) {
      throw new Error(
        tokenData.message ||
          "Socket authentication token கிடைக்கவில்லை."
      );
    }

    const socket =
      io("http://127.0.0.1:4001", {
        auth: {
          token: tokenData.token,
        },
        transports: [
          "polling",
          "websocket",
        ],
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });

    socketRef.current = socket;

    socket.on(
      "connect",
      () => {
        console.log(
          "[DRIVER SOCKET] Connected:",
          socket.id
        );

        setSocketConnected(true);
        setError("");
      }
    );

    socket.on(
      "disconnect",
      (reason) => {
        console.log(
          "[DRIVER SOCKET] Disconnected:",
          reason
        );

        setSocketConnected(false);
      }
    );

    socket.on(
      "connect_error",
      (socketError) => {
        console.error(
          "[DRIVER SOCKET] Connection error:",
          socketError
        );

        setSocketConnected(false);

        setError(
          `Realtime connection failed: ${socketError.message}`
        );
      }
    );

    socket.on(
      "connection:ready",
      (data) => {
        console.log(
          "[DRIVER SOCKET] Ready:",
          data
        );

        setSocketConnected(true);
      }
    );

    socket.on(
      "tracking:error",
      (data) => {
        console.error(
          "[DRIVER SOCKET] Tracking error:",
          data
        );

        if (data?.message) {
          setError(data.message);
        }

        setStarting(false);
      }
    );

    socket.on(
      "driver:location:success",
      (data) => {
        console.log(
          "[GPS SUCCESS]",
          data
        );
      }
    );

    if (!socket.connected) {
      await new Promise<void>(
        (resolve, reject) => {
          const timeout =
            setTimeout(() => {
              reject(
                new Error(
                  "Realtime server connection timeout."
                )
              );
            }, 10000);

          socket.once(
            "connect",
            () => {
              clearTimeout(timeout);
              resolve();
            }
          );

          socket.once(
            "connect_error",
            (err) => {
              clearTimeout(timeout);
              reject(err);
            }
          );
        }
      );
    }

    return socket;
  }

  /*
   * ==========================================================
   * START TRIP
   * ==========================================================
   */

  async function startTrip() {
    const trip =
      trips.find(
        (item) =>
          item.id ===
          selectedTripId
      );

    if (!trip) {
      setError(
        "முதலில் ஒரு பயணத்தை தேர்வு செய்யுங்கள்."
      );

      return;
    }

    if (
      trip.status === "RUNNING"
    ) {
      currentTripRef.current =
        trip;

      setTracking(true);

      await startGpsTracking(
        trip
      );

      return;
    }

    if (
      trip.status !== "SCHEDULED"
    ) {
      setError(
        `இந்த trip தற்போது ${trip.status} நிலையில் உள்ளது.`
      );

      return;
    }

    try {
      setStarting(true);
      setError("");
      setMessage("");

      const socket =
        await connectSocket();

      const response =
        await new Promise<StartTripResponse>(
          (resolve) => {
            let completed = false;

            const finish = (
              result: StartTripResponse
            ) => {
              if (completed) {
                return;
              }

              completed = true;

              if (
                startTimeoutRef.current
              ) {
                clearTimeout(
                  startTimeoutRef.current
                );

                startTimeoutRef.current =
                  null;
              }

              resolve(result);
            };

            socket.emit(
              "driver:start-trip",
              {
                tripId:
                  trip.tripId,
              },
              (
                ackResponse: StartTripResponse
              ) => {
                console.log(
                  "[START TRIP ACK]",
                  ackResponse
                );

                finish(
                  ackResponse || {
                    success: false,
                    message:
                      "Empty server response.",
                  }
                );
              }
            );

            startTimeoutRef.current =
              setTimeout(() => {
                finish({
                  success: false,
                  message:
                    "Server-ல் இருந்து response வரவில்லை.",
                });
              }, 10000);
          }
        );

      console.log(
        "[START TRIP RESPONSE]",
        response
      );

      if (
        !response?.success
      ) {
        setError(
          response?.message ||
            "பயணத்தை தொடங்க முடியவில்லை."
        );

        setStarting(false);

        return;
      }

      const updatedTrip: Trip = {
        ...trip,
        status: "RUNNING",
      };

      currentTripRef.current =
        updatedTrip;

      setTrips(
        (previous) =>
          previous.map(
            (item) =>
              item.id === trip.id
                ? updatedTrip
                : item
          )
      );

      setSelectedTripId(
        trip.id
      );

      setMessage(
        "பயணம் தொடங்கப்பட்டது. GPS கண்காணிப்பு ஆரம்பமாகிறது."
      );

      setStarting(false);
      setTracking(true);

      await startGpsTracking(
        updatedTrip
      );
    } catch (err) {
      console.error(
        "START_TRIP_CLIENT_ERROR:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "பயணத்தை தொடங்க முடியவில்லை."
      );

      setStarting(false);
    }
  }

  /*
   * ==========================================================
   * GPS STATUS
   * ==========================================================
   */

  function getGpsStatus(
    gpsAccuracy: number | null
  ): GpsStatus {
    if (gpsAccuracy === null) {
      return "SEARCHING";
    }

    if (gpsAccuracy <= 50) {
      return "GOOD";
    }

    if (gpsAccuracy <= 200) {
      return "FAIR";
    }

    return "POOR";
  }

  function getGpsStatusText() {
    switch (gpsStatus) {
      case "GOOD":
        return "Good GPS";

      case "FAIR":
        return "Fair GPS";

      case "POOR":
        return "Poor GPS";

      case "SEARCHING":
        return "Searching GPS...";

      default:
        return "GPS Offline";
    }
  }

  function getGpsStatusClasses() {
    switch (gpsStatus) {
      case "GOOD":
        return {
          box: "border-emerald-200 bg-emerald-50",
          dot: "bg-emerald-500",
          text: "text-emerald-700",
        };

      case "FAIR":
        return {
          box: "border-amber-200 bg-amber-50",
          dot: "bg-amber-500",
          text: "text-amber-700",
        };

      case "POOR":
        return {
          box: "border-red-200 bg-red-50",
          dot: "bg-red-500",
          text: "text-red-700",
        };

      case "SEARCHING":
        return {
          box: "border-blue-200 bg-blue-50",
          dot: "bg-blue-500",
          text: "text-blue-700",
        };

      default:
        return {
          box: "border-slate-200 bg-slate-50",
          dot: "bg-slate-400",
          text: "text-slate-600",
        };
    }
  }

  /*
   * ==========================================================
   * GPS TRACKING
   * ==========================================================
   */

  async function startGpsTracking(
    trip: Trip
  ) {
    if (
      !navigator.geolocation
    ) {
      setError(
        "இந்த browser GPS location-ஐ support செய்யவில்லை."
      );

      setGpsStatus("OFFLINE");
      setTracking(false);

      return;
    }

    try {
      const socket =
        await connectSocket();

      if (!socket.connected) {
        setError(
          "Realtime server connected இல்லை."
        );

        setGpsStatus("OFFLINE");
        setTracking(false);

        return;
      }

      currentTripRef.current =
        trip;

      setTracking(true);
      setGpsStatus("SEARCHING");

      setError("");

      /*
       * Clear old watcher.
       */
      if (
        watchIdRef.current !== null
      ) {
        navigator.geolocation.clearWatch(
          watchIdRef.current
        );

        watchIdRef.current =
          null;
      }

      /*
       * Clear pending retry.
       */
      if (
        gpsRetryTimeoutRef.current
      ) {
        clearTimeout(
          gpsRetryTimeoutRef.current
        );

        gpsRetryTimeoutRef.current =
          null;
      }

      /*
       * Request browser/device GPS.
       */
      const watchId =
        navigator.geolocation.watchPosition(
          (position) => {
            const {
              latitude:
                currentLatitude,

              longitude:
                currentLongitude,

              accuracy:
                currentAccuracy,

              speed:
                currentSpeed,

              heading:
                currentHeading,
            } = position.coords;

            /*
             * Validate coordinates.
             */
            if (
              !Number.isFinite(
                currentLatitude
              ) ||
              !Number.isFinite(
                currentLongitude
              ) ||
              currentLatitude < -90 ||
              currentLatitude > 90 ||
              currentLongitude < -180 ||
              currentLongitude > 180
            ) {
              console.warn(
                "[GPS] Invalid coordinates:",
                position.coords
              );

              setGpsStatus(
                "SEARCHING"
              );

              return;
            }

            /*
             * Accuracy.
             */
            const gpsAccuracy =
              Number.isFinite(
                currentAccuracy
              ) &&
              currentAccuracy >= 0
                ? currentAccuracy
                : null;

            /*
             * Speed m/s -> km/h.
             */
            const speedKmh =
              currentSpeed != null &&
              Number.isFinite(
                currentSpeed
              ) &&
              currentSpeed >= 0
                ? currentSpeed * 3.6
                : null;

            /*
             * Heading.
             */
            const validHeading =
              currentHeading != null &&
              Number.isFinite(
                currentHeading
              ) &&
              currentHeading >= 0 &&
              currentHeading <= 360
                ? currentHeading
                : null;

            /*
             * Always show current accuracy.
             */
            setAccuracy(
              gpsAccuracy
            );

            /*
             * --------------------------------------------------
             * Reject extremely inaccurate readings.
             *
             * Example:
             * 50000m = 50km
             *
             * Do NOT send this coordinate.
             * --------------------------------------------------
             */
            if (
              gpsAccuracy !== null &&
              gpsAccuracy > 1000
            ) {
              console.warn(
                `[GPS] Poor accuracy: ${gpsAccuracy.toFixed(
                  1
                )}m`
              );

              setGpsStatus(
                "POOR"
              );

              setError(
                `GPS accuracy மிகவும் குறைவாக உள்ளது (${gpsAccuracy.toFixed(
                  0
                )}m). Mobile GPS signal-க்காக காத்திருக்கிறது.`
              );

              return;
            }

            /*
             * Valid GPS reading.
             */
            lastValidPositionRef.current =
              position;

            setLatitude(
              currentLatitude
            );

            setLongitude(
              currentLongitude
            );

            setSpeed(
              speedKmh
            );

            setHeading(
              validHeading
            );

            setAccuracy(
              gpsAccuracy
            );

            setGpsStatus(
              getGpsStatus(
                gpsAccuracy
              )
            );

            setLastGpsTime(
              new Date()
            );

            /*
             * Remove old poor GPS error.
             */
            setError(
              (previous) =>
                previous.startsWith(
                  "GPS accuracy மிகவும் குறைவாக உள்ளது"
                )
                  ? ""
                  : previous
            );

            /*
             * Send realtime location.
             */
            socket.emit(
              "driver:location",
              {
                latitude:
                  currentLatitude,

                longitude:
                  currentLongitude,

                accuracy:
                  gpsAccuracy,

                speed:
                  speedKmh,

                heading:
                  validHeading,
              }
            );

            console.log(
              "[GPS] Valid location sent:",
              {
                latitude:
                  currentLatitude,

                longitude:
                  currentLongitude,

                accuracy:
                  gpsAccuracy,

                speed:
                  speedKmh,

                heading:
                  validHeading,
              }
            );
          },

          /*
           * GPS ERROR
           */
          (geoError) => {
            console.error(
              "[GPS ERROR]",
              geoError
            );

            if (
              geoError.code ===
              geoError.PERMISSION_DENIED
            ) {
              setGpsStatus(
                "OFFLINE"
              );

              setError(
                "GPS permission மறுக்கப்பட்டுள்ளது. Browser-ல் Location permission-ஐ Allow செய்யுங்கள்."
              );

              return;
            }

            if (
              geoError.code ===
              geoError.POSITION_UNAVAILABLE
            ) {
              setGpsStatus(
                "SEARCHING"
              );

              setError(
                "GPS signal கிடைக்கவில்லை. Mobile Location/GPS ON செய்து open area-ல் முயற்சி செய்யுங்கள்."
              );

              return;
            }

            if (
              geoError.code ===
              geoError.TIMEOUT
            ) {
              setGpsStatus(
                "SEARCHING"
              );

              setError(
                "GPS reading பெற timeout ஏற்பட்டது. மீண்டும் முயற்சிக்கிறது..."
              );

              return;
            }

            setGpsStatus(
              "SEARCHING"
            );

            setError(
              "GPS location கிடைக்கவில்லை. மீண்டும் முயற்சிக்கிறது..."
            );
          },

          /*
           * GPS OPTIONS
           */
          {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 30000,
          }
        );

      watchIdRef.current =
        watchId;
    } catch (err) {
      console.error(
        "START_GPS_ERROR:",
        err
      );

      setGpsStatus("OFFLINE");
      setTracking(false);

      setError(
        err instanceof Error
          ? err.message
          : "GPS tracking start செய்ய முடியவில்லை."
      );
    }
  }

  /*
   * ==========================================================
   * STOP GPS
   * ==========================================================
   */

  function stopGpsTracking() {
    if (
      watchIdRef.current !== null
    ) {
      navigator.geolocation?.clearWatch(
        watchIdRef.current
      );

      watchIdRef.current =
        null;
    }

    if (
      gpsRetryTimeoutRef.current
    ) {
      clearTimeout(
        gpsRetryTimeoutRef.current
      );

      gpsRetryTimeoutRef.current =
        null;
    }

    setTracking(false);
    setGpsStatus("OFFLINE");
  }

  /*
   * ==========================================================
   * STOP TRIP
   * ==========================================================
   */

  async function stopTrip() {
    const trip =
      currentTripRef.current;

    if (!trip) {
      setError(
        "Running trip இல்லை."
      );

      return;
    }

    try {
      setStarting(true);
      setError("");
      setMessage("");

      stopGpsTracking();

      const socket =
        await connectSocket();

      const response =
        await new Promise<StopTripResponse>(
          (resolve) => {
            let completed = false;

            const finish = (
              result: StopTripResponse
            ) => {
              if (completed) {
                return;
              }

              completed = true;

              resolve(result);
            };

            socket.emit(
              "driver:stop-trip",
              {
                tripId:
                  trip.tripId,
              },
              (
                ackResponse: StopTripResponse
              ) => {
                console.log(
                  "[STOP TRIP ACK]",
                  ackResponse
                );

                finish(
                  ackResponse || {
                    success: false,
                    message:
                      "Empty server response.",
                  }
                );
              }
            );

            setTimeout(() => {
              finish({
                success: false,
                message:
                  "Server response timeout.",
              });
            }, 10000);
          }
        );

      if (
        !response?.success
      ) {
        setError(
          response?.message ||
            "பயணத்தை நிறுத்த முடியவில்லை."
        );

        setStarting(false);

        return;
      }

      setMessage(
        "பயணம் நிறுத்தப்பட்டது."
      );

      setTrips(
        (previous) =>
          previous.map(
            (item) =>
              item.id === trip.id
                ? {
                    ...item,
                    status:
                      "COMPLETED",
                  }
                : item
          )
      );

      currentTripRef.current =
        null;

      setSelectedTripId("");

      setLatitude(null);
      setLongitude(null);
      setSpeed(null);
      setAccuracy(null);
      setHeading(null);
      setLastGpsTime(null);
      setGpsStatus("OFFLINE");

      setStarting(false);
      setTracking(false);
    } catch (err) {
      console.error(
        "STOP_TRIP_CLIENT_ERROR:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "பயணத்தை நிறுத்த முடியவில்லை."
      );

      setStarting(false);
    }
  }

  /*
   * ==========================================================
   * LOADING
   * ==========================================================
   */

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-slate-700">
              Dashboard ஏற்றப்படுகிறது...
            </p>
          </div>
        </div>
      </main>
    );
  }

  /*
   * ==========================================================
   * DASHBOARD DATA
   * ==========================================================
   */

  const selectedTrip =
    trips.find(
      (trip) =>
        trip.id ===
        selectedTripId
    ) ||
    currentTripRef.current;

  const assignedTrips =
    trips.filter(
      (trip) =>
        trip.status ===
          "SCHEDULED" ||
        trip.status ===
          "RUNNING"
    );

  const getBusName = (
    trip: Trip
  ) => {
    return (
      trip.bus?.busNumber ||
      trip.bus?.busId ||
      "—"
    );
  };

  const getRouteName = (
    trip: Trip
  ) => {
    if (
      trip.route?.name
    ) {
      return trip.route.name;
    }

    if (
      trip.route?.routeName
    ) {
      return trip.route.routeName;
    }

    if (
      trip.route?.origin ||
      trip.route?.destination
    ) {
      return [
        trip.route?.origin,
        trip.route?.destination,
      ]
        .filter(Boolean)
        .join(" → ");
    }

    return "—";
  };

  const gpsClasses =
    getGpsStatusClasses();

  /*
   * ==========================================================
   * DASHBOARD UI
   * ==========================================================
   */

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-600">
              Driver Operations
            </p>

            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              Driver Dashboard
            </h1>

            <p className="mt-2 text-slate-600">
              வணக்கம்{" "}
              <span className="font-bold text-slate-900">
                {driver?.name ||
                  "Driver"}
              </span>
            </p>
          </div>

          <div
            className={`inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
              socketConnected
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                socketConnected
                  ? "bg-emerald-500"
                  : "bg-red-500"
              }`}
            />

            {socketConnected
              ? "Realtime Connected"
              : "Realtime Offline"}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {/* Success */}
        {message && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700">
            {message}
          </div>
        )}

        {/* Stats */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">
              Driver ID
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {driver?.driverId ||
                "—"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">
              Assigned Trips
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {assignedTrips.length}
            </p>
          </div>

          <div
            className={`rounded-2xl border p-6 shadow-sm ${gpsClasses.box}`}
          >
            <p className="text-sm opacity-80">
              GPS Status
            </p>

            <div className="mt-2 flex items-center gap-2">
              <span
                className={`h-3 w-3 rounded-full ${gpsClasses.dot}`}
              />

              <p
                className={`text-2xl font-bold ${gpsClasses.text}`}
              >
                {getGpsStatusText()}
              </p>
            </div>
          </div>
        </div>

        {/* Trip Selection */}
        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">
              பயணத்தை தேர்வு செய்யுங்கள்
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Assigned scheduled trip-ஐ தேர்வு செய்து பயணத்தை தொடங்குங்கள்.
            </p>
          </div>

          {assignedTrips.length ===
          0 ? (
            <div className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
              தற்போது Scheduled Trip இல்லை.
            </div>
          ) : (
            <>
              <select
                value={
                  selectedTripId
                }
                onChange={(event) =>
                  setSelectedTripId(
                    event.target.value
                  )
                }
                disabled={
                  tracking ||
                  starting
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">
                  -- பயணத்தை தேர்வு செய்யுங்கள் --
                </option>

                {assignedTrips.map(
                  (trip) => (
                    <option
                      key={trip.id}
                      value={trip.id}
                    >
                      {trip.tripId} —{" "}
                      {getBusName(
                        trip
                      )}{" "}
                      —{" "}
                      {getRouteName(
                        trip
                      )}{" "}
                      —{" "}
                      {trip.status}
                    </option>
                  )
                )}
              </select>

              {selectedTrip && (
                <div className="mt-6 grid gap-4 md:grid-cols-3">

                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">
                      Bus
                    </p>

                    <p className="mt-1 font-bold text-slate-900">
                      {getBusName(
                        selectedTrip
                      )}
                    </p>

                    {selectedTrip
                      .bus
                      ?.busNumber && (
                      <p className="mt-1 text-xs text-slate-500">
                        {selectedTrip.bus.busNumber}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">
                      Route
                    </p>

                    <p className="mt-1 font-bold text-slate-900">
                      {getRouteName(
                        selectedTrip
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">
                      Status
                    </p>

                    <p
                      className={`mt-1 font-bold ${
                        selectedTrip.status ===
                        "RUNNING"
                          ? "text-emerald-600"
                          : selectedTrip.status ===
                            "SCHEDULED"
                          ? "text-blue-600"
                          : "text-slate-700"
                      }`}
                    >
                      {
                        selectedTrip.status
                      }
                    </p>
                  </div>

                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">

                {!tracking ? (
                  <button
                    type="button"
                    onClick={
                      startTrip
                    }
                    disabled={
                      starting ||
                      !selectedTripId
                    }
                    className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {starting
                      ? "தொடங்குகிறது..."
                      : "🚌 பயணத்தை தொடங்கு"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={
                      stopTrip
                    }
                    disabled={
                      starting
                    }
                    className="rounded-xl bg-red-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {starting
                      ? "நிறுத்துகிறது..."
                      : "⛔ பயணத்தை நிறுத்து"}
                  </button>
                )}

              </div>
            </>
          )}
        </section>

        {/* GPS Status */}
        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                GPS Tracking
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Device GPS location realtime-ஆக server-க்கு அனுப்பப்படுகிறது.
              </p>
            </div>

            <div
              className={`inline-flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold ${gpsClasses.box} ${gpsClasses.text}`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${gpsClasses.dot}`}
              />

              {getGpsStatusText()}
            </div>
          </div>

          {gpsStatus ===
            "SEARCHING" && (
            <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
              <p className="font-bold">
                📡 GPS signal தேடப்படுகிறது...
              </p>

              <p className="mt-1">
                Mobile Location/GPS ON செய்து,
                browser Location permission-ஐ
                Allow செய்யுங்கள்.
              </p>
            </div>
          )}

          {gpsStatus ===
            "POOR" && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-bold">
                ⚠️ GPS accuracy மிகவும் குறைவு
              </p>

              <p className="mt-1">
                Current accuracy:{" "}
                {accuracy != null
                  ? `${accuracy.toFixed(
                      0
                    )}m`
                  : "—"}
                . Better GPS signal கிடைக்கும் வரை
                இந்த location server-க்கு அனுப்பப்படாது.
              </p>
            </div>
          )}

          {gpsStatus ===
            "GOOD" && (
            <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              <p className="font-bold">
                ✅ Good GPS signal
              </p>

              <p className="mt-1">
                Realtime location server-க்கு அனுப்பப்படுகிறது.
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">
                Latitude
              </p>

              <p className="mt-1 break-all font-bold text-slate-900">
                {latitude != null
                  ? latitude.toFixed(
                      6
                    )
                  : "—"}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">
                Longitude
              </p>

              <p className="mt-1 break-all font-bold text-slate-900">
                {longitude != null
                  ? longitude.toFixed(
                      6
                    )
                  : "—"}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">
                Speed
              </p>

              <p className="mt-1 font-bold text-slate-900">
                {speed != null
                  ? `${speed.toFixed(
                      1
                    )} km/h`
                  : "—"}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">
                Accuracy
              </p>

              <p
                className={`mt-1 font-bold ${
                  accuracy == null
                    ? "text-slate-900"
                    : accuracy <= 50
                    ? "text-emerald-600"
                    : accuracy <= 200
                    ? "text-amber-600"
                    : "text-red-600"
                }`}
              >
                {accuracy != null
                  ? `${accuracy.toFixed(
                      1
                    )} m`
                  : "—"}
              </p>
            </div>

          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">
                Heading
              </p>

              <p className="mt-1 font-bold text-slate-900">
                {heading != null
                  ? `${heading.toFixed(
                      0
                    )}°`
                  : "—"}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">
                Last Valid GPS
              </p>

              <p className="mt-1 font-bold text-slate-900">
                {lastGpsTime
                  ? lastGpsTime.toLocaleTimeString()
                  : "Waiting..."}
              </p>
            </div>

          </div>
        </section>

      </div>
    </main>
  );
}