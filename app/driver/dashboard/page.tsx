"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

export type GPSLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  recordedAt: string;
};

type RouteStop = {
  id: string;
  stopId: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence: number;
};

type Bus = {
  id: string;
  busId: string;
  busNumber: string;
  registration: string;
  status?: string;
};

type Route = {
  id: string;
  routeId: string;
  name: string;
  stops: RouteStop[];
};

type Trip = {
  id: string;
  tripId: string;
  tripDate?: string | null;
  status: string;
  startedAt?: string | null;
  completedAt?: string | null;
  bus: Bus;
  route: Route;
};

type Dashboard = {
  success: boolean;
  driver: {
    id: string;
    driverId: string;
    name: string;
  };
  assignments: Array<{
    id: string;
    bus: Bus;
  }>;
  trips: Trip[];
};

const DriverMap = dynamic(() => import("./DriverMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-2xl bg-slate-900 text-sm text-slate-400">
      Loading live map...
    </div>
  ),
});

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://127.0.0.1:4001";

const GPS_MAX_ACCURACY = 1000;
const GPS_REFRESH_INTERVAL = 15000;

const DEFAULT_SOUND = {
  enabled: true,
  volume: 1,
  approaching: true,
  nearby: true,
  arrived: true,
};

export default function DriverDashboardPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [selectedTripId, setSelectedTripId] = useState("");
  const [gpsLocation, setGpsLocation] = useState<GPSLocation | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [socketStatus, setSocketStatus] = useState("Connecting...");
  const [loading, setLoading] = useState(true);
  const [startingTrip, setStartingTrip] = useState(false);
  const [stoppingTrip, setStoppingTrip] = useState(false);
  const [sendingGPS, setSendingGPS] = useState(false);
  const [locationSharing, setLocationSharing] = useState(false);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("Tamil voice ready");
  const [soundSettings, setSoundSettings] = useState(DEFAULT_SOUND);
  const [now, setNow] = useState(Date.now());
  const [nextStopDistance, setNextStopDistance] = useState<number | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const gpsTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const selectedTripIdRef = useRef("");
  const lastGPSRef = useRef<GPSLocation | null>(null);
  const voiceThresholdsRef = useRef(new Set<string>());
  const dataRef = useRef<Dashboard | null>(null);
  const soundRef = useRef(DEFAULT_SOUND);

  useEffect(() => {
    const raw = localStorage.getItem("driver-sound-settings");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      const merged = { ...DEFAULT_SOUND, ...parsed };
      setSoundSettings(merged);
      soundRef.current = merged;
    } catch {
      // Ignore invalid local settings.
    }
  }, []);

  useEffect(() => {
    soundRef.current = soundSettings;
    localStorage.setItem(
      "driver-sound-settings",
      JSON.stringify(soundSettings)
    );
  }, [soundSettings]);

  const selectedTrip = useMemo(
    () =>
      dashboard?.trips.find(
        (trip) =>
          trip.tripId === selectedTripId ||
          trip.id === selectedTripId
      ) ?? null,
    [dashboard, selectedTripId]
  );

  const nextStop = useMemo(() => {
    if (!selectedTrip?.route?.stops?.length) return null;
    return [...selectedTrip.route.stops].sort(
      (a, b) => a.sequence - b.sequence
    )[0];
  }, [selectedTrip]);

  const loadDashboard = useCallback(async () => {
    try {
      setError("");

      const response = await fetch("/api/driver/dashboard", {
        credentials: "include",
        cache: "no-store",
      });

      const result = await response.json();

      if (response.status === 401 || response.status === 403) {
        window.location.href = "/driver/login";
        return;
      }

      if (!response.ok || !result.success) {
        setError(result.message || "Unable to load driver dashboard.");
        return;
      }

      const data = result as Dashboard;
      dataRef.current = data;
      setDashboard(data);

      const current =
        data.trips.find((trip) => trip.status === "RUNNING") ??
        data.trips[0];

      if (current) {
        setSelectedTripId(current.tripId);
        selectedTripIdRef.current = current.tripId;
      }
    } catch (err) {
      console.error("DRIVER_DASHBOARD_LOAD_ERROR", err);
      setError("Unable to load driver dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  const playBeep = useCallback(async (frequency: number) => {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      if (!AudioContextClass) return;

      const context = new AudioContextClass();
      if (context.state === "suspended") await context.resume();

      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      gain.gain.value = Math.max(0.01, soundRef.current.volume * 0.12);

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start();
      oscillator.stop(context.currentTime + 0.18);

      window.setTimeout(() => {
        void context.close();
      }, 300);
    } catch {
      // Audio beep is optional.
    }
  }, []);

  const getTamilVoice = useCallback(() => {
    if (!("speechSynthesis" in window)) return null;

    const voices = window.speechSynthesis.getVoices();
    const normalized = (voice: SpeechSynthesisVoice) =>
      voice.lang.toLowerCase().replace("_", "-");

    return (
      voices.find((voice) => normalized(voice) === "ta-in") ??
      voices.find((voice) => normalized(voice).startsWith("ta-")) ??
      null
    );
  }, []);

  const speakTamil = useCallback(
    async (text: string) => {
      if (!soundRef.current.enabled) return;
      if (!("speechSynthesis" in window)) {
        setVoiceStatus("Speech Synthesis is not supported.");
        return;
      }

      await playBeep(880);

      const synth = window.speechSynthesis;
      synth.cancel();
      synth.resume();

      await new Promise((resolve) => window.setTimeout(resolve, 100));

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ta-IN";

      const tamilVoice = getTamilVoice();
      if (tamilVoice) utterance.voice = tamilVoice;

      utterance.volume = soundRef.current.volume;
      utterance.rate = 0.88;
      utterance.pitch = 1;

      utterance.onstart = () => {
        setVoiceStatus(
          tamilVoice
            ? `Speaking Tamil: ${tamilVoice.name}`
            : "Speaking Tamil using browser fallback"
        );
      };

      utterance.onend = () => {
        setVoiceStatus(
          tamilVoice
            ? `Tamil voice ready: ${tamilVoice.name}`
            : "Tamil speech finished"
        );
      };

      utterance.onerror = (event) => {
        console.error("DRIVER_TAMIL_SPEECH_ERROR", event);
        setVoiceStatus(`Tamil speech error: ${event.error}`);
      };

      synth.speak(utterance);

      window.setTimeout(() => {
        if (synth.paused) synth.resume();
      }, 250);
    },
    [getTamilVoice, playBeep]
  );

  const testTamilVoice = useCallback(() => {
    void speakTamil(
      "வணக்கம். டிரைவர் தமிழ் குரல் சோதனை வெற்றிகரமாக தொடங்கியுள்ளது."
    );
  }, [speakTamil]);

  const connectSocket = useCallback(async () => {
    try {
      if (socketRef.current?.connected) return socketRef.current;

      const tokenResponse = await fetch("/api/auth/socket-token", {
        credentials: "include",
        cache: "no-store",
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok || !tokenData?.token) {
        setSocketStatus("Socket token unavailable");
        return null;
      }

      socketRef.current?.disconnect();

      const socket = io(SOCKET_URL, {
        transports: ["websocket", "polling"],
        auth: { token: tokenData.token },
        withCredentials: true,
        reconnection: true,
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        if (!mountedRef.current) return;
        setSocketConnected(true);
        setSocketStatus("Connected");
      });

      socket.on("disconnect", () => {
        if (!mountedRef.current) return;
        setSocketConnected(false);
        setSocketStatus("Disconnected");
      });

      socket.on("connect_error", (err) => {
        console.error("DRIVER_SOCKET_ERROR", err);
        setSocketConnected(false);
        setSocketStatus("Connection error");
      });

      socket.on(
        "bus:sharing-status",
        (payload: { busId?: string; tripId?: string; sharing?: boolean }) => {
          const currentTrip = selectedTripIdRef.current;
          if (payload.tripId && currentTrip && payload.tripId !== currentTrip) return;
          setLocationSharing(Boolean(payload.sharing));
        }
      );

      socket.on("trip:started", () => {
        setLocationSharing(false);
        voiceThresholdsRef.current.clear();
        void speakTamil(
          "டிரைவர் பஸ் பயணம் தொடங்கப்பட்டுள்ளது. பாதுகாப்பாக ஓட்டுங்கள்."
        );
        void loadDashboard();
      });

      socket.on("trip:completed", () => {
        void speakTamil("பஸ் பயணம் முடிக்கப்பட்டுள்ளது.");
        void loadDashboard();
      });

      return socket;
    } catch (err) {
      console.error("DRIVER_SOCKET_CONNECT_ERROR", err);
      setSocketConnected(false);
      setSocketStatus("Connection failed");
      return null;
    }
  }, [loadDashboard, speakTamil]);

  const sendGPS = useCallback(
    (position: GeolocationPosition) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;

      const current = position.coords;
      if (current.accuracy > GPS_MAX_ACCURACY) return;

      const previous = lastGPSRef.current;
      const nowMs = Date.now();

      let speed = current.speed;

      if (
        speed == null &&
        previous &&
        Number.isFinite(previous.latitude) &&
        Number.isFinite(previous.longitude)
      ) {
        const seconds =
          (nowMs - new Date(previous.recordedAt).getTime()) / 1000;

        if (seconds > 0.5) {
          const meters = haversineMeters(
            previous.latitude,
            previous.longitude,
            current.latitude,
            current.longitude
          );
          speed = meters / seconds;
        }
      }

      if (speed != null && speed < 0.35) speed = 0;

      const location: GPSLocation = {
        latitude: current.latitude,
        longitude: current.longitude,
        accuracy: current.accuracy,
        speed,
        heading: current.heading,
        recordedAt: new Date(nowMs).toISOString(),
      };

      lastGPSRef.current = location;
      setGpsLocation(location);
      setSendingGPS(true);

      socket.emit(
        "driver:location",
        {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          speed: location.speed ?? 0,
          heading: location.heading ?? null,
        },
        (response: { success?: boolean; message?: string }) => {
          setSendingGPS(false);

          if (response?.success === false) {
            console.warn("DRIVER_GPS_ACK_ERROR", response);
          }
        }
      );
    },
    []
  );

  const startGPS = useCallback(() => {
    if (!navigator.geolocation) {
      setError("This browser does not support GPS.");
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      sendGPS,
      (geoError) => {
        console.error("DRIVER_GPS_ERROR", geoError);
        setError(
          geoError.code === 1
            ? "GPS permission denied. Allow location access for this browser."
            : "Unable to read live GPS location."
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000,
      }
    );

    if (gpsTimerRef.current !== null) {
      window.clearInterval(gpsTimerRef.current);
    }

    gpsTimerRef.current = window.setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        sendGPS,
        () => undefined,
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15000,
        }
      );
    }, GPS_REFRESH_INTERVAL);
  }, [sendGPS]);

  const stopGPS = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (gpsTimerRef.current !== null) {
      window.clearInterval(gpsTimerRef.current);
      gpsTimerRef.current = null;
    }
  }, []);

  const startTrip = useCallback(async () => {
    const tripId = selectedTrip?.id;
    const socket = socketRef.current;

    if (!tripId || !socket?.connected) {
      setError("Realtime socket is not connected or trip is missing.");
      return;
    }

    setStartingTrip(true);
    setError("");
    setMessage("");
    voiceThresholdsRef.current.clear();

    socket.emit(
      "driver:start-trip",
      { tripId },
      (response: { success?: boolean; message?: string }) => {
        setStartingTrip(false);

        if (!response?.success) {
          setError(response?.message || "Unable to start trip.");
          return;
        }

        setMessage("Trip started successfully.");
        startGPS();
        void speakTamil(
          "டிரைவர் பஸ் பயணம் தொடங்கப்பட்டுள்ளது. பாதுகாப்பாக ஓட்டுங்கள்."
        );
        void loadDashboard();
      }
    );
  }, [loadDashboard, selectedTrip, socketConnected, speakTamil, startGPS]);

  const startLocationSharing = useCallback(() => {
    const tripId = selectedTrip?.id;
    const socket = socketRef.current;

    if (selectedTrip?.status !== "RUNNING") {
      setError("Start the trip before sharing live location.");
      return;
    }

    if (!tripId || !socket?.connected) {
      setError("Realtime socket is not connected or trip is missing.");
      return;
    }

    setSharingBusy(true);
    setError("");
    socket.emit("driver:start-sharing", { tripId }, (response: { success?: boolean; message?: string }) => {
      setSharingBusy(false);
      if (!response?.success) {
        setError(response?.message || "Unable to start live-location sharing.");
        return;
      }
      setLocationSharing(true);
      setMessage("Live location is now shared with students assigned to this bus.");
    });
  }, [selectedTrip, socketConnected]);

  const stopLocationSharing = useCallback(() => {
    const tripId = selectedTrip?.id;
    const socket = socketRef.current;

    if (!tripId || !socket?.connected) {
      setError("Realtime socket is not connected or trip is missing.");
      return;
    }

    setSharingBusy(true);
    setError("");
    socket.emit("driver:stop-sharing", { tripId }, (response: { success?: boolean; message?: string }) => {
      setSharingBusy(false);
      if (!response?.success) {
        setError(response?.message || "Unable to stop live-location sharing.");
        return;
      }
      setLocationSharing(false);
      setMessage("Live location sharing stopped.");
    });
  }, [selectedTrip, socketConnected]);

  const stopTrip = useCallback(async () => {
    const tripId = selectedTrip?.id;
    const socket = socketRef.current;

    if (!tripId || !socket?.connected) {
      setError("Realtime socket is not connected or trip is missing.");
      return;
    }

    setStoppingTrip(true);
    setError("");
    setMessage("");

    socket.emit(
      "driver:stop-trip",
      { tripId },
      (response: { success?: boolean; message?: string }) => {
        setStoppingTrip(false);

        if (!response?.success) {
          setError(response?.message || "Unable to complete trip.");
          return;
        }

        setMessage("Trip completed successfully.");
        setLocationSharing(false);
        stopGPS();
        void speakTamil("பஸ் பயணம் முடிக்கப்பட்டுள்ளது.");
        void loadDashboard();
      }
    );
  }, [loadDashboard, selectedTrip, speakTamil, stopGPS]);

  useEffect(() => {
    mountedRef.current = true;
    void loadDashboard();
    void connectSocket();

    return () => {
      mountedRef.current = false;
      stopGPS();
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [connectSocket, loadDashboard, stopGPS]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    selectedTripIdRef.current = selectedTripId;
  }, [selectedTripId]);

  useEffect(() => {
    if (selectedTrip?.status === "RUNNING") startGPS();
    else stopGPS();
  }, [selectedTrip?.status, startGPS, stopGPS]);

  useEffect(() => {
    if (!gpsLocation || !nextStop) {
      setNextStopDistance(null);
      return;
    }

    const distance = haversineMeters(
      gpsLocation.latitude,
      gpsLocation.longitude,
      nextStop.latitude,
      nextStop.longitude
    );

    setNextStopDistance(distance);

    if (selectedTrip?.status !== "RUNNING") return;

    const thresholds = [
      { key: "1000", value: 1000, text: "அடுத்த நிறுத்தம் 1 கிலோமீட்டர் தொலைவில் உள்ளது." },
      { key: "900", value: 900, text: "அடுத்த நிறுத்தம் 900 மீட்டர் தொலைவில் உள்ளது." },
      { key: "500", value: 500, text: "அடுத்த நிறுத்தம் 500 மீட்டர் தொலைவில் உள்ளது." },
      { key: "300", value: 300, text: "அடுத்த நிறுத்தம் 300 மீட்டர் தொலைவில் உள்ளது." },
      { key: "80", value: 80, text: "நீங்கள் அடுத்த நிறுத்தத்தை அடைந்துவிட்டீர்கள்." },
    ];

    for (const threshold of thresholds) {
      if (
        distance <= threshold.value &&
        !voiceThresholdsRef.current.has(threshold.key)
      ) {
        voiceThresholdsRef.current.add(threshold.key);
        void speakTamil(threshold.text);
      }
    }
  }, [gpsLocation, nextStop, selectedTrip?.status, speakTamil]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#070b18] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-8 py-10 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-cyan-400" />
          <p className="mt-4 text-lg font-black">Loading Driver Dashboard</p>
          <p className="mt-2 text-sm text-slate-400">
            Realtime tracking connection starting...
          </p>
        </div>
      </main>
    );
  }

  const bus = selectedTrip?.bus ?? dashboard?.assignments?.[0]?.bus;
  const route = selectedTrip?.route;
  const gpsAge =
    gpsLocation?.recordedAt
      ? now - new Date(gpsLocation.recordedAt).getTime()
      : Infinity;
  const gpsStale = gpsAge > 60000;
  const speedKmh =
    gpsLocation?.speed != null ? gpsLocation.speed * 3.6 : null;

  return (
    <main className="min-h-screen bg-[#070b18] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070b18]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400">
              Driver Operations
            </p>
            <h1 className="mt-1 text-xl font-black sm:text-2xl">
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
            {socketConnected ? "Realtime Connected" : socketStatus}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            <strong>Tracking Error:</strong> {error}
          </div>
        )}

        {message && (
          <div className="mb-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            {message}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-4">
          <InfoCard label="Driver" value={dashboard?.driver.name ?? "Driver"} sub={dashboard?.driver.driverId ?? "—"} />
          <InfoCard label="Assigned Bus" value={`Bus ${bus?.busNumber ?? "—"}`} sub={bus?.registration ?? "—"} />
          <InfoCard label="Route" value={route?.name ?? "—"} sub={route?.routeId ?? "—"} />
          <InfoCard label="Trip Status" value={selectedTrip?.status ?? "—"} sub={selectedTrip?.tripId ?? "—"} />
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-400">
                Trip Control
              </p>

              <select
                value={selectedTripId}
                onChange={(event) => {
                  setSelectedTripId(event.target.value);
                  selectedTripIdRef.current = event.target.value;
                  voiceThresholdsRef.current.clear();
                }}
                className="mt-3 w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 text-sm font-semibold"
              >
                <option value="">Select trip</option>
                {dashboard?.trips.map((trip) => (
                  <option key={trip.id} value={trip.tripId}>
                    {trip.tripId} — Bus {trip.bus.busNumber} — {trip.route.name} — {trip.status}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void loadDashboard()}
                className="rounded-xl border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-bold"
              >
                Refresh
              </button>

              {selectedTrip?.status === "SCHEDULED" && (
                <button
                  type="button"
                  onClick={() => void startTrip()}
                  disabled={startingTrip}
                  className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-50"
                >
                  {startingTrip ? "Starting..." : "Start Trip"}
                </button>
              )}

              {selectedTrip?.status === "RUNNING" && (
                <button
                  type="button"
                  onClick={() => void stopTrip()}
                  disabled={stoppingTrip}
                  className="rounded-xl bg-red-500 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
                >
                  {stoppingTrip ? "Stopping..." : "Stop Trip"}
                </button>
              )}

              {selectedTrip?.status === "RUNNING" && (
                <button
                  type="button"
                  onClick={locationSharing ? stopLocationSharing : startLocationSharing}
                  disabled={sharingBusy || !socketConnected}
                  className={`rounded-xl px-5 py-3 text-sm font-black disabled:opacity-50 ${
                    locationSharing
                      ? "border border-red-400/30 bg-red-500/15 text-red-300"
                      : "bg-cyan-400 text-slate-950"
                  }`}
                >
                  {sharingBusy
                    ? "Updating..."
                    : locationSharing
                      ? "📍 Stop Live Sharing"
                      : "📍 Share Live Location"}
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-400">
                Student Live Location
              </p>
              <h2 className="mt-1 text-lg font-black">Share this bus location</h2>
              <p className="mt-1 text-sm text-slate-400">
                Only students assigned to this bus can receive the live location.
              </p>
            </div>
            <div className={`rounded-full border px-4 py-2 text-xs font-black ${
              locationSharing
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                : "border-white/10 bg-slate-950/60 text-slate-400"
            }`}>
              {locationSharing ? "● LIVE SHARING ON" : "● SHARING OFF"}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard
            label="Speed"
            value={speedKmh != null ? `${speedKmh.toFixed(1)} km/h` : "—"}
            sub={gpsLocation?.speed === 0 ? "Stationary" : "Live GPS speed"}
          />
          <InfoCard
            label="GPS Accuracy"
            value={gpsLocation ? `${Math.round(gpsLocation.accuracy)} m` : "—"}
            sub={gpsStale ? "STALE" : "LIVE"}
          />
          <InfoCard
            label="Next Stop"
            value={nextStop?.name ?? "—"}
            sub={
              nextStopDistance != null
                ? formatDistance(nextStopDistance)
                : "Waiting for GPS"
            }
          />
          <InfoCard
            label="Realtime"
            value={socketConnected ? "CONNECTED" : "OFFLINE"}
            sub={SOCKET_URL}
          />
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-400">
              Live Navigation
            </p>
            <h2 className="mt-1 text-xl font-black">Bus Route Map</h2>
            <p className="mt-1 text-sm text-slate-400">
              OpenStreetMap + OSRM road-following route. No student details are shown here.
            </p>
          </div>

          <DriverMap
            location={gpsLocation}
            stops={route?.stops ?? []}
            busNumber={bus?.busNumber ?? "—"}
            registration={bus?.registration ?? "—"}
          />
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-400">
                Tamil Voice Alerts
              </p>
              <h2 className="mt-1 text-xl font-black">Driver Voice Control</h2>
              <p className="mt-1 text-sm text-slate-400">
                Driver-only announcements. No student name or student information is used.
              </p>
            </div>

            <button
              type="button"
              onClick={testTamilVoice}
              className="rounded-xl bg-cyan-500 px-5 py-3 text-sm font-black text-slate-950"
            >
              🔊 Test Tamil Voice
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-900 p-5">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Voice</p>
                <button
                  type="button"
                  onClick={() =>
                    setSoundSettings((old) => ({
                      ...old,
                      enabled: !old.enabled,
                    }))
                  }
                  className={`rounded-full px-4 py-2 text-xs font-black ${
                    soundSettings.enabled
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-red-500/20 text-red-300"
                  }`}
                >
                  {soundSettings.enabled ? "ON" : "OFF"}
                </button>
              </div>

              <p className="mt-4 text-xs leading-5 text-slate-400">
                Start trip, 1 km, 900 m, 500 m, 300 m and arrival alerts.
              </p>

              <div className="mt-4 rounded-xl bg-slate-950 p-3">
                <p className="text-xs text-slate-500">Voice status</p>
                <p className="mt-1 text-xs leading-5 text-slate-300">
                  {voiceStatus}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-900 p-5">
              <div className="flex justify-between">
                <p className="font-semibold">Volume</p>
                <span className="font-bold text-cyan-300">
                  {Math.round(soundSettings.volume * 100)}%
                </span>
              </div>

              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={soundSettings.volume}
                onChange={(event) =>
                  setSoundSettings((old) => ({
                    ...old,
                    volume: Number(event.target.value),
                  }))
                }
                className="mt-4 w-full accent-cyan-500"
              />
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            GPS Diagnostics
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InfoCard
              label="Latitude"
              value={gpsLocation?.latitude.toFixed(6) ?? "—"}
              sub="Current GPS"
            />
            <InfoCard
              label="Longitude"
              value={gpsLocation?.longitude.toFixed(6) ?? "—"}
              sub="Current GPS"
            />
            <InfoCard
              label="Heading"
              value={
                gpsLocation?.heading != null
                  ? `${Math.round(gpsLocation.heading)}°`
                  : "—"
              }
              sub="GPS heading"
            />
            <InfoCard
              label="Last GPS"
              value={
                gpsLocation?.recordedAt
                  ? new Date(gpsLocation.recordedAt).toLocaleTimeString()
                  : "—"
              }
              sub={gpsStale ? "STALE" : "LIVE"}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-xl">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 break-words text-xl font-black">{value}</p>
      <p className="mt-1 break-all text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const earth = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return 2 * earth * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters: number) {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }

  return `${Math.round(meters)} m`;
}
