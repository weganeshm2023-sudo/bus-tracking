"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL = "http://127.0.0.1:4001";

type SimPoint = {
  name: string;
  latitude: number;
  longitude: number;
  expected: string;
};

type AuthMeResponse = {
  success?: boolean;
  message?: string;
  role?: string;
  user?: {
    role?: string;
    username?: string;
    name?: string;
  };
  session?: {
    role?: string;
    username?: string;
  };
};

type GpsMode = "STATIONARY" | "SIMULATION" | "REAL";

type PreviousGpsPoint = {
  latitude: number;
  longitude: number;
  timestamp: number;
};

const SIMULATION_POINTS: SimPoint[] = [
  {
    name: "Start - 2.2 km away",
    latitude: 9.876,
    longitude: 78.278,
    expected: "No proximity notification",
  },
  {
    name: "Approaching - ~980 m",
    latitude: 9.8648,
    longitude: 78.278,
    expected: "BUS_APPROACHING",
  },
  {
    name: "Near - ~490 m",
    latitude: 9.8604,
    longitude: 78.278,
    expected: "BUS_NEAR",
  },
  {
    name: "Arriving - ~90 m",
    latitude: 9.8568,
    longitude: 78.278,
    expected: "BUS_ARRIVING",
  },
];

function distanceMeters(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number
) {
  const earthRadius = 6371000;

  const lat1 = (latitude1 * Math.PI) / 180;
  const lat2 = (latitude2 * Math.PI) / 180;

  const deltaLat =
    ((latitude2 - latitude1) * Math.PI) / 180;

  const deltaLon =
    ((longitude2 - longitude1) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) ** 2;

  const c =
    2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadius * c;
}

export default function DriverGpsTestPage() {
  const socketRef = useRef<Socket | null>(null);
  const timerRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const mountedRef = useRef(false);
  const connectingRef = useRef(false);

  const previousGpsRef =
    useRef<PreviousGpsPoint | null>(null);

  const [connected, setConnected] = useState(false);
  const [running, setRunning] = useState(false);

  const [currentIndex, setCurrentIndex] =
    useState(-1);

  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState("");

  const [checkingSession, setCheckingSession] =
    useState(true);

  const [sessionRole, setSessionRole] =
    useState("");

  const [gpsMode, setGpsMode] =
    useState<GpsMode>("STATIONARY");

  const [lastSpeed, setLastSpeed] =
    useState<number | null>(null);

  const addLog = (message: string) => {
    if (!mountedRef.current) {
      return;
    }

    setLogs((previous) => [
      `${new Date().toLocaleTimeString()} — ${message}`,
      ...previous,
    ]);
  };

  const stopRealGps = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(
        watchIdRef.current
      );

      watchIdRef.current = null;
    }

    previousGpsRef.current = null;
  };

  const stopSimulation = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    stopRealGps();

    setRunning(false);
    setCurrentIndex(-1);
  };

  const checkDriverSession =
    async (): Promise<boolean> => {
      try {
        setCheckingSession(true);
        setError("");

        const response = await fetch(
          "/api/auth/me",
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            headers: {
              Accept: "application/json",
            },
          }
        );

        let data: AuthMeResponse = {};

        try {
          data =
            (await response.json()) as AuthMeResponse;
        } catch {
          data = {};
        }

        if (!response.ok) {
          if (response.status === 401) {
            setSessionRole("");

            setError(
              "Driver login required. Please login at /driver/login using the same browser."
            );

            addLog(
              "AUTH — No active login session."
            );

            return false;
          }

          setSessionRole("");

          setError(
            data.message ||
              `Unable to verify login session (${response.status}).`
          );

          addLog(
            `AUTH ERROR — HTTP ${response.status}`
          );

          return false;
        }

        const role = String(
          data.user?.role ??
            data.role ??
            data.session?.role ??
            ""
        )
          .trim()
          .toUpperCase();

        setSessionRole(role);

        if (role !== "DRIVER") {
          setError(
            role
              ? `Current login role is ${role}. GPS Simulator requires a DRIVER login.`
              : "Driver session could not be identified. Please login again as driver."
          );

          addLog(
            role
              ? `AUTH — Current role=${role}. DRIVER required.`
              : "AUTH — Driver role was not returned."
          );

          return false;
        }

        addLog(
          "AUTH — Driver session verified."
        );

        return true;
      } catch (error) {
        console.error(
          "GPS_TEST_SESSION_ERROR:",
          error
        );

        setSessionRole("");

        setError(
          "Unable to verify driver login session."
        );

        addLog(
          "AUTH ERROR — Unable to verify session."
        );

        return false;
      } finally {
        if (mountedRef.current) {
          setCheckingSession(false);
        }
      }
    };

  const connectSocket =
    async (): Promise<boolean> => {
      if (!mountedRef.current) {
        return false;
      }

      if (socketRef.current?.connected) {
        return true;
      }

      if (connectingRef.current) {
        addLog(
          "Socket connection already in progress."
        );

        return false;
      }

      connectingRef.current = true;

      try {
        setError("");

        const isDriver =
          await checkDriverSession();

        if (!isDriver) {
          return false;
        }

        addLog(
          "Requesting realtime socket token..."
        );

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

        let tokenData: {
          token?: string;
          message?: string;
        } = {};

        try {
          tokenData =
            (await tokenResponse.json()) as {
              token?: string;
              message?: string;
            };
        } catch {
          tokenData = {};
        }

        if (!tokenResponse.ok) {
          if (tokenResponse.status === 401) {
            setError(
              "Driver session is not active. Please login again as driver."
            );

            addLog(
              "AUTH ERROR — Socket token returned 401."
            );

            return false;
          }

          setError(
            tokenData.message ||
              `Socket token failed: ${tokenResponse.status}`
          );

          addLog(
            `AUTH ERROR — Socket token HTTP ${tokenResponse.status}`
          );

          return false;
        }

        const token =
          tokenData?.token;

        if (!token) {
          setError(
            "Socket token was not returned by the server."
          );

          addLog(
            "AUTH ERROR — Empty socket token."
          );

          return false;
        }

        addLog(
          "Socket token received."
        );

        const oldSocket =
          socketRef.current;

        if (oldSocket) {
          oldSocket.removeAllListeners();
          oldSocket.disconnect();
        }

        const socket = io(
          SOCKET_URL,
          {
            transports: [
              "websocket",
              "polling",
            ],
            auth: {
              token,
            },
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            timeout: 8000,
          }
        );

        socketRef.current = socket;

        socket.on(
          "connect",
          () => {
            if (!mountedRef.current) {
              return;
            }

            setConnected(true);
            setError("");

            addLog(
              `Socket connected — id=${socket.id ?? "unknown"}`
            );
          }
        );

        socket.on(
          "disconnect",
          (reason) => {
            if (!mountedRef.current) {
              return;
            }

            setConnected(false);

            addLog(
              `Socket disconnected: ${reason}`
            );
          }
        );

        socket.on(
          "connect_error",
          (socketError) => {
            if (!mountedRef.current) {
              return;
            }

            setConnected(false);

            const message =
              socketError?.message ||
              "Socket connection failed.";

            addLog(
              `Socket error — ${message}`
            );

            if (
              /unauthorized|authentication|token|jwt|401/i.test(
                message
              )
            ) {
              setError(
                "Realtime authentication failed. Please login again as driver."
              );
            } else {
              setError(
                `Socket connection failed: ${message}`
              );
            }
          }
        );

        socket.on(
          "driver:location:success",
          (data) => {
            addLog(
              `SERVER ACK — trip=${data?.tripId ?? "unknown"}`
            );
          }
        );

        socket.on(
          "tracking:error",
          (data) => {
            addLog(
              `SERVER ERROR — ${
                data?.message ??
                "Unknown tracking error"
              }`
            );
          }
        );

        const connectedSuccessfully =
          await new Promise<boolean>(
            (resolve) => {
              if (socket.connected) {
                resolve(true);
                return;
              }

              let finished = false;

              const finish = (
                result: boolean
              ) => {
                if (finished) {
                  return;
                }

                finished = true;

                window.clearTimeout(
                  timeout
                );

                socket.off(
                  "connect",
                  onConnect
                );

                socket.off(
                  "connect_error",
                  onConnectError
                );

                resolve(result);
              };

              const onConnect =
                () => {
                  finish(true);
                };

              const onConnectError =
                () => {
                  finish(false);
                };

              const timeout =
                window.setTimeout(
                  () => {
                    finish(false);
                  },
                  8000
                );

              socket.once(
                "connect",
                onConnect
              );

              socket.once(
                "connect_error",
                onConnectError
              );
            }
          );

        if (!connectedSuccessfully) {
          if (mountedRef.current) {
            setConnected(false);

            if (!socket.connected) {
              setError(
                "Socket is not connected. Make sure the socket server is running."
              );
            }
          }

          return false;
        }

        return true;
      } catch (error) {
        console.error(
          "GPS_TEST_SOCKET_ERROR:",
          error
        );

        if (mountedRef.current) {
          setConnected(false);

          setError(
            error instanceof Error
              ? error.message
              : "Unable to connect to realtime socket."
          );

          addLog(
            "Socket setup failed."
          );
        }

        return false;
      } finally {
        connectingRef.current = false;
      }
    };

  const sendLocation = ({
    latitude,
    longitude,
    accuracy,
    speed,
    heading,
    source,
  }: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed: number;
    heading: number | null;
    source: string;
  }) => {
    const socket =
      socketRef.current;

    if (!socket?.connected) {
      setError(
        "Socket is not connected."
      );

      addLog(
        "Cannot send GPS — socket disconnected."
      );

      return;
    }

    const safeSpeed =
      Number.isFinite(speed) &&
      speed >= 0
        ? speed
        : 0;

    setLastSpeed(safeSpeed);

    socket.emit(
      "driver:location",
      {
        latitude,
        longitude,
        accuracy:
          accuracy !== null &&
          Number.isFinite(accuracy)
            ? accuracy
            : 20,
        speed: safeSpeed,
        heading:
          heading !== null &&
          Number.isFinite(heading)
            ? heading
            : 0,
      }
    );

    addLog(
      `GPS SENT — ${source} | ${latitude.toFixed(
        6
      )}, ${longitude.toFixed(
        6
      )} | Speed: ${(
        safeSpeed * 3.6
      ).toFixed(1)} km/h`
    );
  };

  const sendStationaryPoint = () => {
    const point =
      SIMULATION_POINTS[0];

    if (!point) {
      return;
    }

    setCurrentIndex(0);

    sendLocation({
      latitude: point.latitude,
      longitude: point.longitude,
      accuracy: 20,
      speed: 0,
      heading: 0,
      source: "STATIONARY",
    });
  };

  const sendPoint = (
    index: number
  ) => {
    const point =
      SIMULATION_POINTS[index];

    if (!point) {
      setError(
        "Simulation point not found."
      );

      return;
    }

    setCurrentIndex(index);

    sendLocation({
      latitude: point.latitude,
      longitude: point.longitude,
      accuracy: 20,

      // Simulation intentionally uses
      // 8 m/s = 28.8 km/h.
      speed: 8,

      heading: 90,
      source: "SIMULATION",
    });

    addLog(
      `Simulation point — ${point.name} | Expected: ${point.expected}`
    );
  };

  const startStationary =
    async () => {
      setError("");

      if (running) {
        return;
      }

      if (!socketRef.current?.connected) {
        const socketReady =
          await connectSocket();

        if (!socketReady) {
          return;
        }
      }

      if (
        !socketRef.current?.connected
      ) {
        setError(
          "Socket is still not connected. Check socket-server."
        );

        return;
      }

      stopSimulation();

      setGpsMode("STATIONARY");
      setRunning(true);

      addLog(
        "STATIONARY GPS started — speed will be 0 km/h."
      );

      sendStationaryPoint();
    };

  const startSimulation =
    async () => {
      setError("");

      if (running) {
        return;
      }

      if (!socketRef.current?.connected) {
        const socketReady =
          await connectSocket();

        if (!socketReady) {
          return;
        }
      }

      if (
        !socketRef.current?.connected
      ) {
        setError(
          "Socket is still not connected. Check socket-server."
        );

        return;
      }

      stopSimulation();

      setGpsMode("SIMULATION");
      setRunning(true);

      addLog(
        "GPS simulation started — simulated speed = 28.8 km/h."
      );

      let index = 0;

      sendPoint(index);

      timerRef.current =
        window.setInterval(
          () => {
            index += 1;

            if (
              index >=
              SIMULATION_POINTS.length
            ) {
              if (
                timerRef.current !== null
              ) {
                window.clearInterval(
                  timerRef.current
                );

                timerRef.current =
                  null;
              }

              setRunning(false);

              addLog(
                "GPS simulation completed."
              );

              return;
            }

            sendPoint(index);
          },
          4000
        );
    };

  const startRealGps =
    async () => {
      setError("");

      if (running) {
        return;
      }

      if (
        typeof navigator ===
          "undefined" ||
        !navigator.geolocation
      ) {
        setError(
          "This browser does not support GPS location."
        );

        return;
      }

      if (!socketRef.current?.connected) {
        const socketReady =
          await connectSocket();

        if (!socketReady) {
          return;
        }
      }

      if (
        !socketRef.current?.connected
      ) {
        setError(
          "Socket is still not connected. Check socket-server."
        );

        return;
      }

      stopSimulation();

      setGpsMode("REAL");
      setRunning(true);

      previousGpsRef.current =
        null;

      addLog(
        "REAL DEVICE GPS started."
      );

      addLog(
        "Browser will send actual GPS speed when available."
      );

      try {
        const watchId =
          navigator.geolocation.watchPosition(
            (position) => {
              if (!mountedRef.current) {
                return;
              }

              const {
                latitude,
                longitude,
                accuracy,
                speed: browserSpeed,
                heading,
              } = position.coords;

              const timestamp =
                position.timestamp;

              let speed =
                typeof browserSpeed ===
                    "number" &&
                Number.isFinite(
                  browserSpeed
                ) &&
                browserSpeed >= 0
                  ? browserSpeed
                  : null;

              const previous =
                previousGpsRef.current;

              if (
                speed === null &&
                previous
              ) {
                const distance =
                  distanceMeters(
                    previous.latitude,
                    previous.longitude,
                    latitude,
                    longitude
                  );

                const elapsedSeconds =
                  (timestamp -
                    previous.timestamp) /
                  1000;

                if (
                  elapsedSeconds > 0 &&
                  distance >= 3
                ) {
                  speed =
                    distance /
                    elapsedSeconds;
                } else {
                  speed = 0;
                }
              }

              if (speed === null) {
                speed = 0;
              }

              previousGpsRef.current =
                {
                  latitude,
                  longitude,
                  timestamp,
                };

              sendLocation({
                latitude,
                longitude,
                accuracy,
                speed,
                heading,
                source: "REAL GPS",
              });
            },
            (geoError) => {
              if (!mountedRef.current) {
                return;
              }

              let message =
                "Unable to read device GPS.";

              if (
                geoError.code ===
                geoError.PERMISSION_DENIED
              ) {
                message =
                  "GPS permission denied. Please allow location permission.";
              } else if (
                geoError.code ===
                geoError.POSITION_UNAVAILABLE
              ) {
                message =
                  "GPS position unavailable.";
              } else if (
                geoError.code ===
                geoError.TIMEOUT
              ) {
                message =
                  "GPS request timed out.";
              }

              setError(message);

              addLog(
                `REAL GPS ERROR — ${message}`
              );
            },
            {
              enableHighAccuracy: true,
              maximumAge: 1000,
              timeout: 10000,
            }
          );

        watchIdRef.current =
          watchId;
      } catch (error) {
        setRunning(false);

        setError(
          error instanceof Error
            ? error.message
            : "Unable to start real GPS."
        );

        addLog(
          "REAL GPS could not be started."
        );
      }
    };

  useEffect(() => {
    mountedRef.current = true;

    void connectSocket();

    return () => {
      mountedRef.current = false;
      connectingRef.current = false;

      if (
        timerRef.current !== null
      ) {
        window.clearInterval(
          timerRef.current
        );

        timerRef.current = null;
      }

      if (
        watchIdRef.current !== null
      ) {
        navigator.geolocation?.clearWatch(
          watchIdRef.current
        );

        watchIdRef.current = null;
      }

      previousGpsRef.current =
        null;

      const socket =
        socketRef.current;

      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }

      socketRef.current = null;
    };
  }, []);

  const speedKmh =
    lastSpeed !== null
      ? lastSpeed * 3.6
      : null;

  return (
    <main className="min-h-screen bg-[#070b18] px-4 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        {/* HEADER */}

        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">
            Development Testing
          </p>

          <h1 className="mt-2 text-3xl font-black">
            Driver GPS Simulator
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Stationary laptop, simulation and
            real device GPS testing.
          </p>
        </div>

        {/* STATUS CARD */}

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
          <div className="grid gap-4 md:grid-cols-5">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <p className="text-xs text-slate-500">
                Session
              </p>

              <p className="mt-2 text-xl font-black">
                {checkingSession
                  ? "CHECKING"
                  : sessionRole || "NONE"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <p className="text-xs text-slate-500">
                Socket
              </p>

              <p
                className={`mt-2 text-xl font-black ${
                  connected
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {connected
                  ? "CONNECTED"
                  : "DISCONNECTED"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <p className="text-xs text-slate-500">
                GPS Mode
              </p>

              <p className="mt-2 text-xl font-black text-cyan-400">
                {gpsMode}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <p className="text-xs text-slate-500">
                Status
              </p>

              <p className="mt-2 text-xl font-black">
                {running
                  ? "RUNNING"
                  : "STOPPED"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <p className="text-xs text-slate-500">
                Speed
              </p>

              <p className="mt-2 text-xl font-black text-emerald-400">
                {speedKmh !== null
                  ? `${speedKmh.toFixed(
                      1
                    )} km/h`
                  : "—"}
              </p>
            </div>
          </div>

          {/* ERROR */}

          {error && (
            <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
              <p className="font-bold">
                {error}
              </p>

              {!sessionRole && (
                <p className="mt-2 text-xs text-red-200/80">
                  Driver login:
                  {" "}
                  http://127.0.0.1:3000/driver/login
                </p>
              )}

              {sessionRole &&
                sessionRole !==
                  "DRIVER" && (
                  <p className="mt-2 text-xs text-red-200/80">
                    GPS Simulator must be
                    opened in the same browser
                    session where the DRIVER
                    account is logged in.
                  </p>
                )}
            </div>
          )}

          {/* SPEED EXPLANATION */}

          <div className="mt-5 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <p className="font-bold text-cyan-300">
              Speed Test
            </p>

            <p className="mt-1 text-sm text-slate-400">
              Stationary mode = 0 km/h.
              Simulation mode = 28.8 km/h.
              Real Device GPS = actual GPS speed.
            </p>
          </div>

          {/* BUTTONS */}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                void connectSocket();
              }}
              disabled={
                connected ||
                checkingSession
              }
              className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-5 py-3 text-sm font-black text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-40"
            >
              {checkingSession
                ? "Checking Session..."
                : connected
                ? "Socket Connected"
                : "Connect Socket"}
            </button>

            <button
              type="button"
              onClick={() => {
                void startStationary();
              }}
              disabled={
                running ||
                !connected ||
                checkingSession ||
                sessionRole !== "DRIVER"
              }
              className="rounded-xl bg-blue-500 px-5 py-3 text-sm font-black text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Stationary — 0 km/h
            </button>

            <button
              type="button"
              onClick={() => {
                void startSimulation();
              }}
              disabled={
                running ||
                !connected ||
                checkingSession ||
                sessionRole !== "DRIVER"
              }
              className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-black text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Start Simulation
            </button>

            <button
              type="button"
              onClick={() => {
                void startRealGps();
              }}
              disabled={
                running ||
                !connected ||
                checkingSession ||
                sessionRole !== "DRIVER"
              }
              className="rounded-xl bg-violet-500 px-5 py-3 text-sm font-black text-white hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Start Real Device GPS
            </button>

            <button
              type="button"
              onClick={stopSimulation}
              disabled={!running}
              className="rounded-xl bg-red-500 px-5 py-3 text-sm font-black text-white hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Stop GPS
            </button>

            <button
              type="button"
              onClick={() =>
                setLogs([])
              }
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-slate-300 hover:bg-white/10"
            >
              Clear Logs
            </button>
          </div>
        </section>

        {/* MODE INFORMATION */}

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-blue-500/20 bg-blue-500/5 p-6">
            <div className="text-3xl">
              🛑
            </div>

            <h2 className="mt-3 text-lg font-black">
              Stationary
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Laptop வீட்டில் stationary-ஆ
              இருக்கும்போது இதைப் பயன்படுத்தலாம்.
              Speed server-க்கு exactly
              <strong className="text-white">
                {" "}0 m/s
              </strong>
              {" "}அனுப்பப்படும்.
            </p>
          </div>

          <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-6">
            <div className="text-3xl">
              🚌
            </div>

            <h2 className="mt-3 text-lg font-black">
              Simulation
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Existing testing route.
              Simulation speed intentionally
              <strong className="text-white">
                {" "}28.8 km/h
              </strong>
              {" "}ஆக இருக்கும்.
            </p>
          </div>

          <div className="rounded-3xl border border-violet-500/20 bg-violet-500/5 p-6">
            <div className="text-3xl">
              📱
            </div>

            <h2 className="mt-3 text-lg font-black">
              Real Device GPS
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Mobile/device GPS பயன்படுத்தும்
              mode. Browser GPS speed available
              என்றால் அதையே server-க்கு அனுப்பும்.
            </p>
          </div>
        </section>

        {/* SIMULATION ROUTE */}

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-xl font-black">
            Simulation Route
          </h2>

          <div className="mt-5 space-y-3">
            {SIMULATION_POINTS.map(
              (point, index) => (
                <div
                  key={point.name}
                  className={`rounded-2xl border p-4 ${
                    currentIndex === index
                      ? "border-cyan-400/40 bg-cyan-400/10"
                      : "border-white/10 bg-black/20"
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-black">
                        {index + 1}.{" "}
                        {point.name}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {point.latitude},{" "}
                        {point.longitude}
                      </p>
                    </div>

                    <span className="text-xs font-bold text-cyan-300">
                      {point.expected}
                    </span>
                  </div>
                </div>
              )
            )}
          </div>
        </section>

        {/* LOGS */}

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-xl font-black">
            Server Logs
          </h2>

          <div className="mt-4 max-h-80 overflow-auto rounded-2xl bg-black/40 p-4 font-mono text-xs">
            {logs.length === 0 ? (
              <p className="text-slate-600">
                Waiting for test...
              </p>
            ) : (
              logs.map(
                (log, index) => (
                  <p
                    key={`${log}-${index}`}
                    className="mb-2 text-slate-300"
                  >
                    {log}
                  </p>
                )
              )
            )}
          </div>
        </section>
      </div>
    </main>
  );
}