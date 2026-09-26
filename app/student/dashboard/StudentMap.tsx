"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

type PickupStop = {
  id: string;
  stopId: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence: number;
};

type StudentLocation = {
  id: string;
  studentId: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  active: boolean;
  updatedAt: string;
};

type CollegeLocation = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  active: boolean;
  updatedAt: string;
};

type StudentMapProps = {
  busLocation: LiveBusLocation | null;
  pickupStop: PickupStop;
  busNumber: string;
  registration: string;
  tripRunning: boolean;
  studentLocation?: StudentLocation | null;
  collegeLocation?: CollegeLocation | null;
};

type RouteResponse = {
  code?: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry?: {
      coordinates: Array<
        [number, number]
      >;
    };
  }>;
};

const FIXED_COLLEGE = {
  name:
    "Fatima Michael College of Engineering & Technology",
  address:
    "Fatima Michael College of Engineering & Technology",
  latitude: 9.875728936747167,
  longitude: 78.27395353731299,
};

function isStale(
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

  return (
    Date.now() - timestamp >
    maxAgeMs
  );
}

function formatDistance(
  meters: number | null
) {
  if (
    meters === null ||
    !Number.isFinite(meters)
  ) {
    return "—";
  }

  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }

  return `${(
    meters / 1000
  ).toFixed(2)} km`;
}

function formatDuration(
  seconds: number | null
) {
  if (
    seconds === null ||
    !Number.isFinite(seconds)
  ) {
    return "—";
  }

  const minutes = Math.max(
    1,
    Math.round(seconds / 60)
  );

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(
    minutes / 60
  );

  const remaining =
    minutes % 60;

  return remaining > 0
    ? `${hours}h ${remaining}m`
    : `${hours}h`;
}

function getBusIcon(
  stale: boolean,
  heading: number | null | undefined
) {
  const borderColor = stale
    ? "#f59e0b"
    : "#10b981";

  const background = stale
    ? "#451a03"
    : "#052e16";

  const safeHeading =
    typeof heading === "number" &&
    Number.isFinite(heading)
      ? heading
      : 0;

  return L.divIcon({
    className:
      "student-live-bus-marker",

    html: `
      <div
        style="
          width:48px;
          height:48px;
          border-radius:50%;
          background:${background};
          border:3px solid ${borderColor};
          display:flex;
          align-items:center;
          justify-content:center;
          box-shadow:0 8px 28px rgba(0,0,0,.45);
        "
      >
        <div
          style="
            font-size:27px;
            line-height:1;
            transform:rotate(${safeHeading}deg);
            transition:transform .3s ease;
          "
        >
          🚌
        </div>
      </div>
    `,

    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -25],
  });
}

function getStopIcon() {
  return L.divIcon({
    className:
      "student-pickup-marker",

    html: `
      <div
        style="
          width:42px;
          height:42px;
          border-radius:50%;
          background:#172554;
          border:3px solid #60a5fa;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:23px;
          box-shadow:0 8px 25px rgba(0,0,0,.45);
        "
      >
        📍
      </div>
    `,

    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -22],
  });
}

function getStudentIcon() {
  return L.divIcon({
    className:
      "student-location-marker",

    html: `
      <div
        style="
          width:46px;
          height:46px;
          border-radius:50%;
          background:#2563eb;
          border:4px solid white;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:23px;
          box-shadow:
            0 8px 25px rgba(37,99,235,.45);
        "
      >
        👤
      </div>
    `,

    iconSize: [46, 46],
    iconAnchor: [23, 23],
    popupAnchor: [0, -24],
  });
}

function getCollegeIcon() {
  return L.divIcon({
    className:
      "college-location-marker",

    html: `
      <div
        style="
          width:48px;
          height:48px;
          border-radius:50%;
          background:#7c3aed;
          border:4px solid white;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:24px;
          box-shadow:
            0 8px 25px rgba(124,58,237,.45);
        "
      >
        🏫
      </div>
    `,

    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -25],
  });
}

export default function StudentMap({
  busLocation,
  pickupStop,
  busNumber,
  registration,
  tripRunning,
  studentLocation,
  collegeLocation,
}: StudentMapProps) {
  const containerRef =
    useRef<HTMLDivElement | null>(null);

  const mapRef =
    useRef<L.Map | null>(null);

  const busMarkerRef =
    useRef<L.Marker | null>(null);

  const stopMarkerRef =
    useRef<L.Marker | null>(null);

  const studentMarkerRef =
    useRef<L.Marker | null>(null);

  const collegeMarkerRef =
    useRef<L.Marker | null>(null);

  const accuracyCircleRef =
    useRef<L.Circle | null>(null);

  const routeLineRef =
    useRef<L.Polyline | null>(null);

  const firstMapFitRef =
    useRef(false);

  const routeRequestRef =
    useRef<AbortController | null>(null);

  const lastRouteRequestRef =
    useRef(0);

  const lastRouteBusPositionRef =
    useRef<{
      latitude: number;
      longitude: number;
    } | null>(null);

  const [routeDistance, setRouteDistance] =
    useState<number | null>(null);

  const [routeDuration, setRouteDuration] =
    useState<number | null>(null);

  const [routeLoading, setRouteLoading] =
    useState(false);

  const [routeAvailable, setRouteAvailable] =
    useState(false);

  const fixedCollege =
    collegeLocation ?? {
      id: "main",
      name: FIXED_COLLEGE.name,
      address: FIXED_COLLEGE.address,
      latitude:
        FIXED_COLLEGE.latitude,
      longitude:
        FIXED_COLLEGE.longitude,
      active: true,
      updatedAt: "",
    };

  const targetStudent =
    studentLocation?.active
      ? studentLocation
      : null;

  /*
   * Create map.
   */
  useEffect(() => {
    if (
      !containerRef.current ||
      mapRef.current
    ) {
      return;
    }

    const initialCenter =
      targetStudent
        ? [
            targetStudent.latitude,
            targetStudent.longitude,
          ] as L.LatLngExpression
        : [
            pickupStop.latitude,
            pickupStop.longitude,
          ] as L.LatLngExpression;

    const map = L.map(
      containerRef.current,
      {
        center: initialCenter,
        zoom: 14,
        zoomControl: true,
        attributionControl: true,
      }
    );

    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }
    ).addTo(map);

    mapRef.current = map;

    const resizeTimer =
      window.setTimeout(() => {
        map.invalidateSize();
      }, 250);

    return () => {
      window.clearTimeout(
        resizeTimer
      );

      routeRequestRef.current?.abort();

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      busMarkerRef.current = null;
      stopMarkerRef.current = null;
      studentMarkerRef.current = null;
      collegeMarkerRef.current = null;
      accuracyCircleRef.current = null;
      routeLineRef.current = null;
    };
  }, []);

  /*
   * Update pickup stop marker.
   */
  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const stopPosition:
      L.LatLngExpression = [
        pickupStop.latitude,
        pickupStop.longitude,
      ];

    const popupContent = `
      <div style="min-width:190px">
        <strong>📍 Pickup Stop</strong>
        <br/>
        ${pickupStop.name}
        <br/>
        <small>
          Stop ${pickupStop.sequence}
        </small>
      </div>
    `;

    if (!stopMarkerRef.current) {
      stopMarkerRef.current =
        L.marker(
          stopPosition,
          {
            icon: getStopIcon(),
          }
        )
          .addTo(map)
          .bindPopup(
            popupContent
          );
    } else {
      stopMarkerRef.current.setLatLng(
        stopPosition
      );

      stopMarkerRef.current.setPopupContent(
        popupContent
      );
    }
  }, [pickupStop]);

  /*
   * Update individual student location.
   */
  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    if (!targetStudent) {
      if (studentMarkerRef.current) {
        studentMarkerRef.current.remove();
        studentMarkerRef.current = null;
      }

      return;
    }

    const studentPosition:
      L.LatLngExpression = [
        targetStudent.latitude,
        targetStudent.longitude,
      ];

    const popupContent = `
      <div style="min-width:220px">
        <strong>🔵 Student Location</strong>
        <hr style="margin:8px 0"/>
        <strong>${targetStudent.name}</strong>
        <br/>
        ${
          targetStudent.address ??
          "Address not available"
        }
        <br/>
        <small>
          ${targetStudent.latitude.toFixed(6)},
          ${targetStudent.longitude.toFixed(6)}
        </small>
      </div>
    `;

    if (!studentMarkerRef.current) {
      studentMarkerRef.current =
        L.marker(
          studentPosition,
          {
            icon: getStudentIcon(),
            zIndexOffset: 800,
          }
        )
          .addTo(map)
          .bindPopup(
            popupContent
          );
    } else {
      studentMarkerRef.current.setLatLng(
        studentPosition
      );

      studentMarkerRef.current.setPopupContent(
        popupContent
      );
    }
  }, [studentLocation]);

  /*
   * Fixed college marker.
   */
  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const collegePosition:
      L.LatLngExpression = [
        fixedCollege.latitude,
        fixedCollege.longitude,
      ];

    const popupContent = `
      <div style="min-width:230px">
        <strong>🏫 Main College</strong>
        <hr style="margin:8px 0"/>
        <strong>${fixedCollege.name}</strong>
        <br/>
        ${
          fixedCollege.address ??
          ""
        }
        <br/>
        <small>
          ${fixedCollege.latitude.toFixed(6)},
          ${fixedCollege.longitude.toFixed(6)}
        </small>
      </div>
    `;

    if (!collegeMarkerRef.current) {
      collegeMarkerRef.current =
        L.marker(
          collegePosition,
          {
            icon: getCollegeIcon(),
            zIndexOffset: 700,
          }
        )
          .addTo(map)
          .bindPopup(
            popupContent
          );
    } else {
      collegeMarkerRef.current.setLatLng(
        collegePosition
      );

      collegeMarkerRef.current.setPopupContent(
        popupContent
      );
    }
  }, [
    collegeLocation,
  ]);

  /*
   * Live bus marker + GPS accuracy.
   */
  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

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

    const stale = isStale(
      busLocation.recordedAt,
      60_000
    );

    const busPosition:
      L.LatLngExpression = [
        busLocation.latitude,
        busLocation.longitude,
      ];

    const popupContent = `
      <div style="min-width:225px">
        <strong>🚌 Bus ${busNumber}</strong>
        <br/>
        ${registration}

        <hr style="margin:8px 0"/>

        <strong>Trip:</strong>
        ${
          tripRunning
            ? "RUNNING"
            : "NOT RUNNING"
        }

        <br/>

        <strong>GPS:</strong>
        ${
          stale
            ? "STALE"
            : "LIVE"
        }

        <br/>

        <strong>Accuracy:</strong>
        ${
          busLocation.accuracy != null
            ? `${Math.round(
                busLocation.accuracy
              )} m`
            : "—"
        }

        <br/>

        <strong>Speed:</strong>
        ${
          busLocation.speed != null
            ? `${(
                busLocation.speed *
                3.6
              ).toFixed(1)} km/h`
            : "—"
        }

        <br/>

        <strong>Last GPS:</strong>
        ${
          busLocation.recordedAt
            ? new Date(
                busLocation.recordedAt
              ).toLocaleTimeString(
                "en-IN"
              )
            : "—"
        }
      </div>
    `;

    if (!busMarkerRef.current) {
      busMarkerRef.current =
        L.marker(
          busPosition,
          {
            icon: getBusIcon(
              stale,
              busLocation.heading
            ),
            zIndexOffset: 1000,
          }
        )
          .addTo(map)
          .bindPopup(
            popupContent
          );
    } else {
      busMarkerRef.current.setLatLng(
        busPosition
      );

      busMarkerRef.current.setIcon(
        getBusIcon(
          stale,
          busLocation.heading
        )
      );

      busMarkerRef.current.setPopupContent(
        popupContent
      );
    }

    /*
     * GPS accuracy circle.
     */
    const accuracy =
      busLocation.accuracy != null &&
      Number.isFinite(
        busLocation.accuracy
      )
        ? Math.max(
            10,
            Math.min(
              busLocation.accuracy,
              100000
            )
          )
        : null;

    if (accuracy !== null) {
      const circleColor = stale
        ? "#f59e0b"
        : "#10b981";

      if (
        !accuracyCircleRef.current
      ) {
        accuracyCircleRef.current =
          L.circle(
            busPosition,
            {
              radius: accuracy,
              color: circleColor,
              fillColor:
                circleColor,
              fillOpacity: 0.08,
              weight: 1,
            }
          ).addTo(map);
      } else {
        accuracyCircleRef.current.setLatLng(
          busPosition
        );

        accuracyCircleRef.current.setRadius(
          accuracy
        );

        accuracyCircleRef.current.setStyle(
          {
            color: circleColor,
            fillColor:
              circleColor,
          }
        );
      }
    } else if (
      accuracyCircleRef.current
    ) {
      accuracyCircleRef.current.remove();

      accuracyCircleRef.current =
        null;
    }

    /*
     * First live GPS:
     * show bus + student + college.
     */
    if (
      !firstMapFitRef.current
    ) {
      firstMapFitRef.current =
        true;

      const points: L.LatLngExpression[] =
        [
          [
            busLocation.latitude,
            busLocation.longitude,
          ],
          [
            fixedCollege.latitude,
            fixedCollege.longitude,
          ],
        ];

      if (targetStudent) {
        points.push([
          targetStudent.latitude,
          targetStudent.longitude,
        ]);
      } else {
        points.push([
          pickupStop.latitude,
          pickupStop.longitude,
        ]);
      }

      const bounds =
        L.latLngBounds(points);

      map.fitBounds(
        bounds,
        {
          padding: [45, 45],
          maxZoom: 15,
        }
      );
    }
  }, [
    busLocation,
    busNumber,
    registration,
    tripRunning,
    pickupStop,
    studentLocation,
    collegeLocation,
  ]);

  /*
   * Road-following route:
   *
   * Bus -> Individual Student
   *
   * If student location is not available,
   * fallback to pickup stop.
   */
  useEffect(() => {
    const map = mapRef.current;

    if (
      !map ||
      !busLocation
    ) {
      return;
    }

    const destination =
      targetStudent
        ? {
            latitude:
              targetStudent.latitude,
            longitude:
              targetStudent.longitude,
          }
        : {
            latitude:
              pickupStop.latitude,
            longitude:
              pickupStop.longitude,
          };

    const busLatitude =
      busLocation.latitude;

    const busLongitude =
      busLocation.longitude;

    const previous =
      lastRouteBusPositionRef.current;

    /*
     * Avoid excessive public OSRM requests.
     *
     * First request is immediate.
     * Later requests happen after:
     * - 5 seconds, or
     * - bus moved approximately 50m.
     */
    const now = Date.now();

    let movedEnough = true;

    if (previous) {
      const latDiff =
        busLatitude -
        previous.latitude;

      const lngDiff =
        busLongitude -
        previous.longitude;

      const approximateMeters =
        Math.sqrt(
          latDiff * latDiff +
            lngDiff * lngDiff
        ) *
        111000;

      movedEnough =
        approximateMeters >= 50;
    }

    const timeEnough =
      now -
        lastRouteRequestRef.current >=
      5000;

    if (
      previous &&
      !movedEnough &&
      !timeEnough
    ) {
      return;
    }

    lastRouteRequestRef.current =
      now;

    lastRouteBusPositionRef.current = {
      latitude: busLatitude,
      longitude: busLongitude,
    };

    routeRequestRef.current?.abort();

    const controller =
      new AbortController();

    routeRequestRef.current =
      controller;

    setRouteLoading(true);

    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${busLongitude},${busLatitude};` +
      `${destination.longitude},${destination.latitude}` +
      `?overview=full&geometries=geojson&steps=false`;

    fetch(url, {
      signal:
        controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `OSRM HTTP ${response.status}`
          );
        }

        return response.json() as Promise<RouteResponse>;
      })
      .then((data) => {
        if (
          controller.signal.aborted
        ) {
          return;
        }

        const route =
          data.routes?.[0];

        if (
          !route ||
          !route.geometry ||
          !route.geometry.coordinates?.length
        ) {
          setRouteAvailable(false);
          return;
        }

        const latLngs =
          route.geometry.coordinates.map(
            ([lng, lat]) =>
              [
                lat,
                lng,
              ] as L.LatLngExpression
          );

        if (
          !routeLineRef.current
        ) {
          routeLineRef.current =
            L.polyline(
              latLngs,
              {
                color: "#2563eb",
                weight: 6,
                opacity: 0.85,
                lineCap: "round",
                lineJoin: "round",
              }
            ).addTo(map);
        } else {
          routeLineRef.current.setLatLngs(
            latLngs
          );
        }

        setRouteDistance(
          route.distance
        );

        setRouteDuration(
          route.duration
        );

        setRouteAvailable(true);
      })
      .catch((error) => {
        if (
          error instanceof
            DOMException &&
          error.name ===
            "AbortError"
        ) {
          return;
        }

        /*
         * Keep the last successful
         * route if OSRM temporarily
         * fails.
         */
        setRouteAvailable(
          Boolean(
            routeLineRef.current
          )
        );
      })
      .finally(() => {
        if (
          !controller.signal.aborted
        ) {
          setRouteLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    busLocation,
    pickupStop,
    studentLocation,
  ]);

  /*
   * Keep map correctly sized.
   */
  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const timer =
      window.setTimeout(() => {
        map.invalidateSize();
      }, 100);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  const stale =
    isStale(
      busLocation?.recordedAt,
      60_000
    );

  const destinationName =
    targetStudent
      ? targetStudent.name
      : pickupStop.name;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={containerRef}
        className="h-full w-full"
      />

      {/* Map status card */}
      <div className="pointer-events-none absolute left-3 top-3 z-[1000] w-[calc(100%-24px)] max-w-sm">
        <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-3 text-white shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Live Bus Tracking
              </p>

              <p className="mt-1 text-sm font-bold">
                🚌 Bus {busNumber}
              </p>

              <p className="text-xs text-slate-400">
                {registration}
              </p>
            </div>

            <div
              className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                !busLocation
                  ? "bg-slate-700 text-slate-300"
                  : stale
                    ? "bg-amber-500/15 text-amber-300"
                    : "bg-emerald-500/15 text-emerald-300"
              }`}
            >
              {!busLocation
                ? "NO GPS"
                : stale
                  ? "STALE"
                  : "LIVE"}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/5 p-2">
              <p className="text-[10px] uppercase text-slate-500">
                Destination
              </p>

              <p className="mt-1 truncate text-xs font-semibold text-slate-200">
                {destinationName}
              </p>
            </div>

            <div className="rounded-xl bg-white/5 p-2">
              <p className="text-[10px] uppercase text-slate-500">
                Road Distance
              </p>

              <p className="mt-1 text-xs font-semibold text-blue-300">
                {formatDistance(
                  routeDistance
                )}
              </p>
            </div>

            <div className="rounded-xl bg-white/5 p-2">
              <p className="text-[10px] uppercase text-slate-500">
                ETA
              </p>

              <p className="mt-1 text-xs font-semibold text-slate-200">
                {formatDuration(
                  routeDuration
                )}
              </p>
            </div>

            <div className="rounded-xl bg-white/5 p-2">
              <p className="text-[10px] uppercase text-slate-500">
                Route
              </p>

              <p className="mt-1 text-xs font-semibold">
                {routeLoading
                  ? "Updating..."
                  : routeAvailable
                    ? "Road route"
                    : "Waiting"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Map legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[1000]">
        <div className="rounded-xl border border-white/10 bg-slate-950/90 px-3 py-2 text-[11px] text-slate-300 shadow-xl backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              🚌 Bus
            </span>

            <span>
              🔵 Student
            </span>

            <span>
              🏫 College
            </span>

            <span>
              📍 Pickup
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}