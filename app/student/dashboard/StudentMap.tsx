"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";

type LocationLike = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  recordedAt?: string;
};

type PointLike = {
  name?: string;
  latitude: number;
  longitude: number;
  address?: string | null;
};

type RouteInfo = {
  distanceMeters: number;
  durationSeconds: number;
};

type Props = {
  busLocation: LocationLike | null;
  pickupStop: PointLike;
  busNumber: string;
  registration: string;
  tripRunning: boolean;
  studentLocation?: PointLike | null;
  collegeLocation?: PointLike | null;
  onRouteInfo?: (info: RouteInfo) => void;
};

type LatLng = [number, number];

const ROUTER = "https://router.project-osrm.org/route/v1/driving";
const ROUTE_REFRESH_MS = 7000;
const ROUTE_MOVE_THRESHOLD_M = 80;

export default function StudentMap({
  busLocation,
  pickupStop,
  busNumber,
  registration,
  tripRunning,
  studentLocation,
  collegeLocation,
  onRouteInfo,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const busMarkerRef = useRef<any>(null);
  const routeLineRef = useRef<any>(null);
  const accuracyCircleRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastRouteAtRef = useRef(0);
  const lastRouteOriginRef = useRef<LatLng | null>(null);
  const routeRequestRef = useRef(0);
  const firstFitRef = useRef(false);
  const [followBus, setFollowBus] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const followRef = useRef(true);

  useEffect(() => {
    followRef.current = followBus;
  }, [followBus]);

  useEffect(() => {
    let cancelled = false;

    async function createMap() {
      if (!containerRef.current || mapRef.current) return;

      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      const defaultCenter: LatLng = [
        pickupStop.latitude,
        pickupStop.longitude,
      ];

      const map = L.map(containerRef.current, {
        center: defaultCenter,
        zoom: 14,
        zoomControl: false,
        preferCanvas: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
        updateWhenIdle: true,
        keepBuffer: 2,
      }).addTo(map);

      L.control.zoom({ position: "topright" }).addTo(map);

      mapRef.current = map;
      setMapReady(true);

      // Leaflet must measure the final visible container, not the first
      // render size. This prevents partially laid-out tile grids.
      requestAnimationFrame(() => {
        if (mapRef.current === map && map.getContainer().isConnected) {
          map.invalidateSize(true);
        }
      });

      window.setTimeout(() => map.invalidateSize(true), 100);
      window.setTimeout(() => map.invalidateSize(true), 500);
      window.setTimeout(() => map.invalidateSize(true), 1000);
      window.setTimeout(() => map.invalidateSize(true), 1800);
      window.setTimeout(() => map.invalidateSize(true), 2400);

      const resizeObserver = new ResizeObserver(() => {
        map.invalidateSize(false);
      });
      resizeObserver.observe(containerRef.current);
      (map as any).__studentResizeObserver = resizeObserver;
    }

    void createMap();

  return () => {
      cancelled = true;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (busMarkerRef.current?.__studentAnimationFrame != null) {
        cancelAnimationFrame(busMarkerRef.current.__studentAnimationFrame);
      }

      routeRequestRef.current += 1;
      if (mapRef.current) {
        const observer = (mapRef.current as any).__studentResizeObserver;
        observer?.disconnect();
        mapRef.current.remove();
        mapRef.current = null;
      }
      busMarkerRef.current = null;
      routeLineRef.current = null;
      accuracyCircleRef.current = null;
      firstFitRef.current = false;
      lastRouteAtRef.current = 0;
      lastRouteOriginRef.current = null;
    };
  }, [pickupStop.latitude, pickupStop.longitude]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    let cancelled = false;

    async function updateMarkers() {
      const L = await import("leaflet");
      if (cancelled || !map) return;

      if (!busLocation) {
        if (busMarkerRef.current) {
          busMarkerRef.current.remove();
          busMarkerRef.current = null;
        }
        if (accuracyCircleRef.current) {
          accuracyCircleRef.current.remove();
          accuracyCircleRef.current = null;
        }
        return;
      }

      const heading =
        typeof busLocation.heading === "number" &&
        Number.isFinite(busLocation.heading)
          ? busLocation.heading
          : 0;

      const busIcon = L.divIcon({
        className: "student-live-bus-marker",
        html: `
          <div style="position:relative;width:58px;height:58px;display:flex;align-items:center;justify-content:center;">
            <div style="position:absolute;inset:4px;border-radius:50%;background:rgba(37,99,235,.16);animation:studentBusPulse 1.8s ease-out infinite;"></div>
            <div style="position:absolute;top:-1px;left:50%;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:13px solid #22c55e;transform:translateX(-50%) rotate(${heading}deg);transform-origin:50% 29px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));"></div>
            <div style="position:relative;z-index:2;width:44px;height:44px;border-radius:50%;background:#0f172a;border:3px solid #60a5fa;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 25px rgba(0,0,0,.45);font-size:24px;">🚌</div>
          </div>
          <style>
            @keyframes studentBusPulse { 0% { transform:scale(.65); opacity:.8 } 70% { transform:scale(1.15); opacity:0 } 100% { transform:scale(1.15); opacity:0 } }
          </style>
        `,
        iconSize: [58, 58],
        iconAnchor: [29, 29],
      });

      const target: LatLng = [busLocation.latitude, busLocation.longitude];

      if (!busMarkerRef.current) {
        busMarkerRef.current = L.marker(target, {
          icon: busIcon,
          zIndexOffset: 1000,
        })
          .addTo(map)
          .bindPopup(
            `<strong>🚌 Bus ${escapeHtml(busNumber)}</strong><br/>${escapeHtml(registration)}<br/>${tripRunning ? "LIVE TRIP" : "Trip not running"}`
          );
      } else {
        busMarkerRef.current.setIcon(busIcon);
        animateMarker(busMarkerRef.current, target);
      }

      if (busLocation.accuracy && busLocation.accuracy > 0) {
        if (!accuracyCircleRef.current) {
          accuracyCircleRef.current = L.circle(target, {
            radius: Math.min(Math.max(busLocation.accuracy, 5), 500),
            color: "#60a5fa",
            fillColor: "#60a5fa",
            fillOpacity: 0.08,
            weight: 1,
          }).addTo(map);
        } else {
          accuracyCircleRef.current.setLatLng(target);
          accuracyCircleRef.current.setRadius(
            Math.min(Math.max(busLocation.accuracy, 5), 500)
          );
        }
      }

      if (!firstFitRef.current) {
        firstFitRef.current = true;
        const overviewBounds = L.latLngBounds([
          target,
          [pickupStop.latitude, pickupStop.longitude],
        ]);
        map.fitBounds(overviewBounds, {
          padding: [70, 70],
          maxZoom: 14,
          animate: true,
        });
      } else if (followRef.current) {
        map.panTo(target, { animate: true, duration: 0.5 });
      }
    }

    void updateMarkers();

    return () => {
      cancelled = true;
    };
  }, [
    mapReady,
    busLocation?.latitude,
    busLocation?.longitude,
    busLocation?.accuracy,
    busLocation?.heading,
    busNumber,
    registration,
    tripRunning,
  ]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    let cancelled = false;
    let stopMarker: any = null;
    let studentMarker: any = null;
    let collegeMarker: any = null;

    async function updatePlaces() {
      const L = await import("leaflet");
      if (cancelled) return;

      stopMarker?.remove();
      studentMarker?.remove();
      collegeMarker?.remove();

      const stopIcon = L.divIcon({
        className: "student-stop-marker",
        html: `<div style="width:42px;height:42px;border-radius:50%;background:#f59e0b;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 5px 18px rgba(0,0,0,.35);font-size:20px;">📍</div>`,
        iconSize: [42, 42],
        iconAnchor: [21, 21],
      });

      stopMarker = L.marker(
        [pickupStop.latitude, pickupStop.longitude],
        { icon: stopIcon, zIndexOffset: 700 }
      )
        .addTo(map)
        .bindPopup(
          `<strong>📍 Pickup Stop</strong><br/>${escapeHtml(pickupStop.name || "Pickup stop")}`
        );

      if (studentLocation) {
        const studentIcon = L.divIcon({
          className: "student-own-marker",
          html: `<div style="width:40px;height:40px;border-radius:50%;background:#2563eb;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 5px 18px rgba(0,0,0,.35);font-size:19px;">🔵</div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });
        studentMarker = L.marker(
          [studentLocation.latitude, studentLocation.longitude],
          { icon: studentIcon, zIndexOffset: 600 }
        )
          .addTo(map)
          .bindPopup("<strong>🔵 Your saved location</strong>");
      }

      if (collegeLocation) {
        const collegeIcon = L.divIcon({
          className: "student-college-marker",
          html: `<div style="width:40px;height:40px;border-radius:50%;background:#7c3aed;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 5px 18px rgba(0,0,0,.35);font-size:19px;">🏫</div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });
        collegeMarker = L.marker(
          [collegeLocation.latitude, collegeLocation.longitude],
          { icon: collegeIcon, zIndexOffset: 500 }
        )
          .addTo(map)
          .bindPopup(
            `<strong>🏫 College</strong><br/>${escapeHtml(collegeLocation.name || "College")}`
          );
      }
    }

    void updatePlaces();

    return () => {
      cancelled = true;
      stopMarker?.remove();
      studentMarker?.remove();
      collegeMarker?.remove();
    };
  }, [
    mapReady,
    pickupStop.latitude,
    pickupStop.longitude,
    pickupStop.name,
    studentLocation?.latitude,
    studentLocation?.longitude,
    collegeLocation?.latitude,
    collegeLocation?.longitude,
    collegeLocation?.name,
  ]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !busLocation) return;

    const origin: LatLng = [busLocation.latitude, busLocation.longitude];
    const destination: LatLng = [pickupStop.latitude, pickupStop.longitude];
    const now = Date.now();
    const previous = lastRouteOriginRef.current;

    if (previous) {
      const moved = haversineMeters(
        previous[0],
        previous[1],
        origin[0],
        origin[1]
      );
      if (
        now - lastRouteAtRef.current < ROUTE_REFRESH_MS &&
        moved < ROUTE_MOVE_THRESHOLD_M
      ) {
        return;
      }
    }

    const requestId = ++routeRequestRef.current;
    lastRouteAtRef.current = now;
    lastRouteOriginRef.current = origin;
    setRouteLoading(true);
    setRouteError("");

    async function fetchRoute() {
      const map = mapRef.current;
      if (!map) return;

      try {
        const url =
          `${ROUTER}/${origin[1]},${origin[0]};${destination[1]},${destination[0]}` +
          `?overview=full&geometries=geojson&steps=true&alternatives=false`;

        const response = await fetch(url, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`OSRM ${response.status}`);
        }

        const result = await response.json();
        if (requestId !== routeRequestRef.current) return;

        const route = result?.routes?.[0];
        const coordinates = route?.geometry?.coordinates;

        if (!route || !Array.isArray(coordinates) || !coordinates.length) {
          throw new Error("No road route returned");
        }

        const points: LatLng[] = coordinates.map(
          (pair: [number, number]) => [pair[1], pair[0]]
        );

        const L = await import("leaflet");
        const activeMap = mapRef.current;

        // The route request is asynchronous. The component/map can be
        // recreated while OSRM is responding (React dev mode, navigation,
        // or a changed pickup stop). Never add a layer to an old Leaflet map.
        if (
          requestId !== routeRequestRef.current ||
          !activeMap ||
          activeMap !== map ||
          !activeMap.getContainer?.()?.isConnected
        ) {
          return;
        }

        if (!routeLineRef.current) {
          routeLineRef.current = L.polyline(points, {
            color: "#2563eb",
            weight: 7,
            opacity: 0.82,
            lineCap: "round",
            lineJoin: "round",
          });
          routeLineRef.current.addTo(activeMap);
        } else {
          routeLineRef.current.setLatLngs(points);
          if (!activeMap.hasLayer(routeLineRef.current)) {
            routeLineRef.current.addTo(activeMap);
          }
        }

        onRouteInfo?.({
          distanceMeters: Number(route.distance) || 0,
          durationSeconds: Number(route.duration) || 0,
        });
      } catch (error) {
        if (requestId !== routeRequestRef.current) return;
        console.warn("Student road route unavailable", error);
        setRouteError("Road route temporarily unavailable");
      } finally {
        if (requestId === routeRequestRef.current) {
          setRouteLoading(false);
        }
      }
    }

    void fetchRoute();

    return () => {
      // Invalidate an in-flight OSRM response before the next effect run.
      routeRequestRef.current += 1;
    };
  }, [
    mapReady,
    busLocation?.latitude,
    busLocation?.longitude,
    pickupStop.latitude,
    pickupStop.longitude,
    onRouteInfo,
  ]);

  function recenter() {
    const map = mapRef.current;
    if (!map) return;
    followRef.current = true;
    setFollowBus(true);
    if (busLocation) {
      map.setView([busLocation.latitude, busLocation.longitude], 15, {
        animate: true,
      });
    } else {
      map.setView([pickupStop.latitude, pickupStop.longitude], 14, {
        animate: true,
      });
    }
  }

  function fitAll() {
    const map = mapRef.current;
    if (!map) return;

    const points: LatLng[] = [
      [pickupStop.latitude, pickupStop.longitude],
    ];

    if (busLocation) {
      points.push([busLocation.latitude, busLocation.longitude]);
    }
    if (studentLocation) {
      points.push([studentLocation.latitude, studentLocation.longitude]);
    }
    if (collegeLocation) {
      points.push([collegeLocation.latitude, collegeLocation.longitude]);
    }

    void import("leaflet").then((L) => {
      map.fitBounds(L.latLngBounds(points), {
        padding: [35, 35],
        maxZoom: 15,
        animate: true,
      });
    });
  }

  return (
    <div className="student-map-root relative h-[520px] min-h-[520px] min-w-0 w-full overflow-hidden rounded-xl bg-slate-900">
      <style>{`
        .student-map-root .student-leaflet-map,
        .student-map-root .leaflet-container {
          width: 100% !important;
          height: 100% !important;
          min-width: 0 !important;
          min-height: 0 !important;
          overflow: hidden !important;
        }

        .student-map-root .leaflet-map-pane {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
        }

        .student-map-root .leaflet-tile-pane {
          z-index: 200 !important;
        }

        .student-map-root .leaflet-tile-container {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
        }

        .student-map-root .leaflet-tile {
          width: 256px !important;
          height: 256px !important;
          max-width: none !important;
          max-height: none !important;
        }

        .student-map-root .leaflet-tile-pane img {
          max-width: none !important;
          max-height: none !important;
        }

        .student-map-root .leaflet-control-zoom {
          margin-top: 12px !important;
          margin-right: 12px !important;
        }

        @media (max-width: 640px) {
          .student-map-root {
            height: 440px;
            min-height: 440px;
          }
        }
      `}</style>

      <div ref={containerRef} className="student-leaflet-map absolute inset-0 h-full w-full min-h-0 min-w-0" />

      <div className="pointer-events-none absolute left-3 top-3 z-[500] flex flex-wrap gap-2">
        <div className="rounded-full border border-white/15 bg-slate-950/90 px-3 py-2 text-xs font-bold text-white shadow-lg backdrop-blur">
          🚌 Bus {busNumber}
        </div>
        <div
          className={`rounded-full border px-3 py-2 text-xs font-bold shadow-lg backdrop-blur ${
            busLocation
              ? "border-emerald-400/30 bg-emerald-950/90 text-emerald-300"
              : "border-amber-400/30 bg-amber-950/90 text-amber-300"
          }`}
        >
          {busLocation ? "● LIVE GPS" : "● WAITING FOR GPS"}
        </div>
      </div>

      <div className="absolute bottom-4 left-3 z-[500] flex flex-col gap-2">
        <button
          type="button"
          onClick={() => {
            setFollowBus((value) => !value);
          }}
          className={`rounded-xl border px-3 py-2 text-xs font-bold shadow-lg backdrop-blur ${
            followBus
              ? "border-blue-400/40 bg-blue-950/90 text-blue-200"
              : "border-white/15 bg-slate-950/90 text-slate-200"
          }`}
        >
          {followBus ? "◎ Follow Bus ON" : "◎ Follow Bus OFF"}
        </button>
        <button
          type="button"
          onClick={recenter}
          className="rounded-xl border border-white/15 bg-slate-950/90 px-3 py-2 text-xs font-bold text-white shadow-lg backdrop-blur"
        >
          ⦿ Recenter Bus
        </button>
        <button
          type="button"
          onClick={fitAll}
          className="rounded-xl border border-white/15 bg-slate-950/90 px-3 py-2 text-xs font-bold text-white shadow-lg backdrop-blur"
        >
          ⛶ Show All
        </button>
      </div>

      <div className="absolute bottom-4 right-3 z-[500] max-w-[220px] rounded-xl border border-white/10 bg-slate-950/90 px-3 py-2 text-right text-[11px] text-slate-300 shadow-lg backdrop-blur">
        {routeLoading
          ? "Calculating road route…"
          : routeError
            ? routeError
            : "Road-following live route"}
      </div>

      <div className="pointer-events-none absolute right-3 top-3 z-[500] rounded-xl border border-white/10 bg-slate-950/90 px-3 py-2 text-[11px] text-slate-300 shadow-lg backdrop-blur">
        <div>📍 Pickup: {pickupStop.name || "Stop"}</div>
        <div className="mt-1">🚌 {registration}</div>
        <div className="mt-1">{tripRunning ? "Trip running" : "Trip not running"}</div>
      </div>
    </div>
  );
}

function animateMarker(marker: any, target: LatLng) {
  if (!marker) return;

  const start = marker.getLatLng();
  const startLat = Number(start.lat);
  const startLng = Number(start.lng);
  const startTime = performance.now();
  const duration = 900;

  if (marker.__studentAnimationFrame != null) {
    cancelAnimationFrame(marker.__studentAnimationFrame);
  }

  let frameId: number | null = null;

  function frame(now: number) {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const lat = startLat + (target[0] - startLat) * eased;
    const lng = startLng + (target[1] - startLng) * eased;
    marker.setLatLng([lat, lng]);

    if (progress < 1) {
      frameId = requestAnimationFrame(frame);
      marker.__studentAnimationFrame = frameId;
    } else {
      frameId = null;
      marker.__studentAnimationFrame = null;
    }
  }

  frameId = requestAnimationFrame(frame);
  marker.__studentAnimationFrame = frameId;
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
