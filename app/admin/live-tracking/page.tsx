"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

type LiveBus = {
  busId: string;
  busNumber: string;
  registration: string;
  tripId: string;
  tripCode?: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  recordedAt: string;
};

type ConnectionStatus =
  | "CONNECTING"
  | "ONLINE"
  | "OFFLINE";

type LeafletModule = typeof import("leaflet");

type MarkerLike = any;

type AccuracyLevel =
  | "GOOD"
  | "FAIR"
  | "POOR"
  | "UNKNOWN";

/*
 * ----------------------------------------------------
 * GPS HELPERS
 * ----------------------------------------------------
 */

function getAccuracyLevel(
  accuracy?: number | null
): AccuracyLevel {
  if (
    accuracy == null ||
    !Number.isFinite(accuracy)
  ) {
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

function getAccuracyLabel(
  accuracy?: number | null
): string {
  const level = getAccuracyLevel(accuracy);

  switch (level) {
    case "GOOD":
      return "Good GPS";

    case "FAIR":
      return "Fair GPS";

    case "POOR":
      return "Poor GPS";

    default:
      return "GPS unavailable";
  }
}

function getAccuracyColor(
  accuracy?: number | null
): string {
  const level = getAccuracyLevel(accuracy);

  switch (level) {
    case "GOOD":
      return "#16a34a";

    case "FAIR":
      return "#f59e0b";

    case "POOR":
      return "#dc2626";

    default:
      return "#64748b";
  }
}

function isStale(
  recordedAt: string
): boolean {
  const timestamp =
    new Date(recordedAt).getTime();

  if (!Number.isFinite(timestamp)) {
    return true;
  }

  return (
    Date.now() - timestamp >
    60 * 1000
  );
}

function formatTime(
  recordedAt: string
): string {
  const date =
    new Date(recordedAt);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "—";
  }

  return date.toLocaleTimeString();
}

function escapeHtml(
  value: string
): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/*
 * ----------------------------------------------------
 * PAGE
 * ----------------------------------------------------
 */

export default function LiveTrackingPage() {
  const socketRef =
    useRef<Socket | null>(null);

  const leafletRef =
    useRef<LeafletModule | null>(null);

  const mapRef =
    useRef<any>(null);

  const mapContainerRef =
    useRef<HTMLDivElement | null>(null);

  const markersRef =
    useRef<Record<string, MarkerLike>>(
      {}
    );

  const accuracyCirclesRef =
    useRef<Record<string, any>>(
      {}
    );

  const [connection, setConnection] =
    useState<ConnectionStatus>(
      "CONNECTING"
    );

  const [errorMessage, setErrorMessage] =
    useState("");

  const [liveBuses, setLiveBuses] =
    useState<Record<string, LiveBus>>(
      {}
    );

  const [loading, setLoading] =
    useState(true);

  /*
   * ----------------------------------------------------
   * INITIAL DATABASE LOAD
   * ----------------------------------------------------
   */

  useEffect(() => {
    let mounted = true;

    async function loadInitialLocations() {
      try {
        console.log(
          "[LIVE TRACKING] Loading initial GPS..."
        );

        const response =
          await fetch(
            "/api/admin/live-tracking",
            {
              method: "GET",
              credentials: "include",
              cache: "no-store",
              headers: {
                Accept:
                  "application/json",
              },
            }
          );

        const data =
          await response.json();

        console.log(
          "[LIVE TRACKING] Initial response:",
          data
        );

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.message ||
              "Unable to load live bus locations."
          );
        }

        if (!mounted) {
          return;
        }

        const initialBuses =
          Array.isArray(data.buses)
            ? data.buses
            : [];

        const busMap: Record<
          string,
          LiveBus
        > = {};

        for (
          const bus of initialBuses
        ) {
          if (
            bus?.busId &&
            typeof bus.latitude ===
              "number" &&
            typeof bus.longitude ===
              "number"
          ) {
            busMap[bus.busId] =
              bus;
          }
        }

        setLiveBuses(busMap);

        console.log(
          "[LIVE TRACKING] Loaded:",
          Object.keys(busMap).length
        );
      } catch (error) {
        console.error(
          "[LIVE TRACKING] Initial load error:",
          error
        );

        if (!mounted) {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load live bus locations."
        );
      }
    }

    loadInitialLocations();

    return () => {
      mounted = false;
    };
  }, []);

  /*
   * ----------------------------------------------------
   * LEAFLET MAP
   * ----------------------------------------------------
   */

  useEffect(() => {
    let mounted = true;

    async function initializeMap() {
      if (
        !mapContainerRef.current ||
        mapRef.current
      ) {
        return;
      }

      try {
        const leaflet =
          await import("leaflet");

        await import(
          "leaflet/dist/leaflet.css"
        );

        if (
          !mounted ||
          !mapContainerRef.current
        ) {
          return;
        }

        leafletRef.current =
          leaflet;

        const map =
          leaflet.map(
            mapContainerRef.current,
            {
              center: [
                9.9252,
                78.1198,
              ],

              zoom: 12,

              zoomControl: true,

              minZoom: 5,

              maxZoom: 19,
            }
          );

        leaflet
          .tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
              attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',

              maxZoom: 19,
            }
          )
          .addTo(map);

        mapRef.current =
          map;

        setTimeout(() => {
          if (mapRef.current) {
            mapRef.current.invalidateSize();
          }
        }, 300);
      } catch (error) {
        console.error(
          "[LIVE TRACKING] Map error:",
          error
        );

        if (mounted) {
          setErrorMessage(
            "Unable to load live tracking map."
          );
        }
      }
    }

    initializeMap();

    return () => {
      mounted = false;

      Object.values(
        markersRef.current
      ).forEach(
        (marker: MarkerLike) => {
          try {
            marker.remove();
          } catch {}
        }
      );

      Object.values(
        accuracyCirclesRef.current
      ).forEach(
        (circle: any) => {
          try {
            circle.remove();
          } catch {}
        }
      );

      markersRef.current = {};
      accuracyCirclesRef.current =
        {};

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      leafletRef.current = null;
    };
  }, []);

  /*
   * ----------------------------------------------------
   * SOCKET.IO
   * ----------------------------------------------------
   */

  useEffect(() => {
    let mounted = true;

    async function connectRealtime() {
      try {
        setLoading(true);
        setConnection("CONNECTING");

        const response =
          await fetch(
            "/api/auth/socket-token",
            {
              method: "GET",
              credentials: "include",
              cache: "no-store",
              headers: {
                Accept:
                  "application/json",
              },
            }
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.success ||
          !data.token
        ) {
          throw new Error(
            data.message ||
              "Unable to create realtime session."
          );
        }

        if (!mounted) {
          return;
        }

        const socket =
          io(
            "http://127.0.0.1:4001",
            {
              auth: {
                token: data.token,
              },

              withCredentials:
                true,

              transports: [
                "polling",
                "websocket",
              ],

              reconnection: true,

              reconnectionAttempts: 10,

              reconnectionDelay: 1000,
            }
          );

        socketRef.current =
          socket;

        socket.on(
          "connect",
          () => {
            console.log(
              "[LIVE TRACKING] Socket connected:",
              socket.id
            );

            if (!mounted) {
              return;
            }

            setConnection("ONLINE");
            setErrorMessage("");
            setLoading(false);
          }
        );

        socket.on(
          "connection:ready",
          (payload) => {
            console.log(
              "[LIVE TRACKING] connection:ready",
              payload
            );

            if (!mounted) {
              return;
            }

            setConnection("ONLINE");
          }
        );

        socket.on(
          "connect_error",
          (error) => {
            console.error(
              "[LIVE TRACKING] Socket error:",
              error
            );

            if (!mounted) {
              return;
            }

            setConnection("OFFLINE");

            setErrorMessage(
              error?.message ||
                "Realtime server connection failed."
            );

            setLoading(false);
          }
        );

        socket.on(
          "disconnect",
          (reason) => {
            console.warn(
              "[LIVE TRACKING] Disconnected:",
              reason
            );

            if (!mounted) {
              return;
            }

            setConnection("OFFLINE");
          }
        );

        socket.on(
          "tracking:error",
          (payload) => {
            console.error(
              "[LIVE TRACKING] Tracking error:",
              payload
            );

            if (!mounted) {
              return;
            }

            setErrorMessage(
              payload?.message ||
                "Realtime tracking error."
            );
          }
        );

        /*
         * REALTIME GPS
         */
        socket.on(
          "bus:location",
          (payload: LiveBus) => {
            console.log(
              "[LIVE TRACKING] GPS received:",
              payload
            );

            if (
              !mounted ||
              !payload?.busId ||
              typeof payload.latitude !==
                "number" ||
              typeof payload.longitude !==
                "number"
            ) {
              return;
            }

            setLiveBuses(
              (previous) => ({
                ...previous,

                [payload.busId]:
                  payload,
              })
            );
          }
        );

        /*
         * TRIP COMPLETED
         */
        socket.on(
          "trip:completed",
          (payload) => {
            console.log(
              "[LIVE TRACKING] Trip completed:",
              payload
            );

            if (
              !mounted ||
              !payload?.busId
            ) {
              return;
            }

            setLiveBuses(
              (previous) => {
                const next = {
                  ...previous,
                };

                delete next[
                  payload.busId
                ];

                return next;
              }
            );
          }
        );

        socket.on(
          "trip:started",
          (payload) => {
            console.log(
              "[LIVE TRACKING] Trip started:",
              payload
            );
          }
        );

        socket.on(
          "driver:location:success",
          (payload) => {
            console.log(
              "[LIVE TRACKING] Driver GPS success:",
              payload
            );
          }
        );
      } catch (error) {
        console.error(
          "[LIVE TRACKING] Connection error:",
          error
        );

        if (!mounted) {
          return;
        }

        setConnection("OFFLINE");

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to connect to realtime server."
        );

        setLoading(false);
      }
    }

    connectRealtime();

    return () => {
      mounted = false;

      if (
        socketRef.current
      ) {
        socketRef.current.disconnect();

        socketRef.current =
          null;
      }
    };
  }, []);

  /*
   * ----------------------------------------------------
   * UPDATE MAP
   * ----------------------------------------------------
   */

  useEffect(() => {
    let mounted = true;

    async function updateMap() {
      if (!mapRef.current) {
        return;
      }

      const leaflet =
        leafletRef.current ||
        (await import("leaflet"));

      if (!mounted) {
        return;
      }

      leafletRef.current =
        leaflet;

      const map =
        mapRef.current;

      const activeBusIds =
        new Set(
          Object.keys(
            liveBuses
          )
        );

      /*
       * REMOVE OLD MARKERS
       */
      Object.keys(
        markersRef.current
      ).forEach((busId) => {
        if (
          !activeBusIds.has(
            busId
          )
        ) {
          try {
            markersRef.current[
              busId
            ].remove();
          } catch {}

          delete markersRef.current[
            busId
          ];

          if (
            accuracyCirclesRef
              .current[busId]
          ) {
            try {
              accuracyCirclesRef
                .current[
                  busId
                ].remove();
            } catch {}

            delete accuracyCirclesRef
              .current[busId];
          }
        }
      });

      /*
       * CREATE / UPDATE
       */
      Object.values(
        liveBuses
      ).forEach((bus) => {
        const position:
          [number, number] = [
          bus.latitude,
          bus.longitude,
        ];

        const accuracy =
          bus.accuracy != null &&
          Number.isFinite(
            bus.accuracy
          )
            ? Math.min(
                Math.max(
                  bus.accuracy,
                  10
                ),
                100000
              )
            : 100;

        const accuracyColor =
          getAccuracyColor(
            bus.accuracy
          );

        const accuracyLabel =
          getAccuracyLabel(
            bus.accuracy
          );

        const stale =
          isStale(
            bus.recordedAt
          );

        /*
         * BUS ICON
         */
        const heading =
          bus.heading != null &&
          Number.isFinite(
            bus.heading
          )
            ? bus.heading
            : 0;

        const busIcon =
          leaflet.divIcon({
            className:
              "live-bus-marker",

            html: `
              <div
                style="
                  width:44px;
                  height:44px;
                  display:flex;
                  align-items:center;
                  justify-content:center;
                  position:relative;
                  filter:drop-shadow(0 3px 5px rgba(0,0,0,.35));
                "
              >
                <div
                  style="
                    position:absolute;
                    width:38px;
                    height:38px;
                    border-radius:50%;
                    background:#ffffff;
                    border:3px solid ${stale ? "#64748b" : accuracyColor};
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    transform:rotate(${heading}deg);
                  "
                >
                  <div
                    style="
                      font-size:23px;
                      line-height:1;
                      transform:rotate(-${heading}deg);
                    "
                  >
                    🚌
                  </div>
                </div>

                ${
                  !stale
                    ? `
                      <div
                        style="
                          position:absolute;
                          bottom:-3px;
                          width:0;
                          height:0;
                          border-left:7px solid transparent;
                          border-right:7px solid transparent;
                          border-top:11px solid ${accuracyColor};
                        "
                      ></div>
                    `
                    : ""
                }
              </div>
            `,

            iconSize: [
              44,
              44,
            ],

            iconAnchor: [
              22,
              22,
            ],

            tooltipAnchor: [
              0,
              -24,
            ],
          });

        let marker =
          markersRef.current[
            bus.busId
          ];

        /*
         * CREATE MARKER
         */
        if (!marker) {
          marker =
            leaflet.marker(
              position,
              {
                icon: busIcon,

                zIndexOffset:
                  1000,
              }
            ).addTo(map);

          markersRef.current[
            bus.busId
          ] = marker;
        } else {
          /*
           * SMOOTH POSITION UPDATE
           */
          const current =
            marker.getLatLng();

          const steps = 10;

          let step = 0;

          const startLat =
            current.lat;

          const startLng =
            current.lng;

          const endLat =
            bus.latitude;

          const endLng =
            bus.longitude;

          const timer =
            window.setInterval(
              () => {
                if (
                  !mounted
                ) {
                  window.clearInterval(
                    timer
                  );

                  return;
                }

                step++;

                const progress =
                  step /
                  steps;

                const lat =
                  startLat +
                  (endLat -
                    startLat) *
                    progress;

                const lng =
                  startLng +
                  (endLng -
                    startLng) *
                    progress;

                marker.setLatLng([
                  lat,
                  lng,
                ]);

                if (
                  step >=
                  steps
                ) {
                  window.clearInterval(
                    timer
                  );
                }
              },
              50
            );
        }

        /*
         * UPDATE ICON
         */
        marker.setIcon(
          busIcon
        );

        /*
         * POPUP / TOOLTIP
         */
        const statusText =
          stale
            ? "STALE GPS"
            : "RUNNING";

        const statusColor =
          stale
            ? "#64748b"
            : "#16a34a";

        const speedText =
          bus.speed != null &&
          Number.isFinite(
            bus.speed
          )
            ? `${bus.speed.toFixed(
                1
              )} km/h`
            : "—";

        const accuracyText =
          bus.accuracy != null &&
          Number.isFinite(
            bus.accuracy
          )
            ? `${bus.accuracy.toFixed(
                1
              )} m`
            : "—";

        const headingText =
          bus.heading != null &&
          Number.isFinite(
            bus.heading
          )
            ? `${Math.round(
                bus.heading
              )}°`
            : "—";

        const popupHtml = `
          <div
            style="
              min-width:260px;
              font-family:Arial,sans-serif;
            "
          >
            <div
              style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:12px;
                margin-bottom:10px;
              "
            >
              <div>
                <div
                  style="
                    font-size:18px;
                    font-weight:700;
                    color:#0f172a;
                  "
                >
                  🚌 Bus ${escapeHtml(
                    bus.busNumber
                  )}
                </div>

                <div
                  style="
                    font-size:12px;
                    color:#64748b;
                    margin-top:2px;
                  "
                >
                  ${escapeHtml(
                    bus.registration
                  )}
                </div>
              </div>

              <span
                style="
                  display:inline-block;
                  padding:4px 8px;
                  border-radius:999px;
                  background:${statusColor}20;
                  color:${statusColor};
                  font-size:11px;
                  font-weight:700;
                "
              >
                ${statusText}
              </span>
            </div>

            <div
              style="
                border-top:1px solid #e2e8f0;
                padding-top:9px;
              "
            >
              <div
                style="
                  display:grid;
                  grid-template-columns:1fr 1fr;
                  gap:8px;
                  font-size:12px;
                "
              >
                <div>
                  <div style="color:#64748b">
                    Speed
                  </div>
                  <strong style="color:#0f172a">
                    ${speedText}
                  </strong>
                </div>

                <div>
                  <div style="color:#64748b">
                    Heading
                  </div>
                  <strong style="color:#0f172a">
                    ${headingText}
                  </strong>
                </div>

                <div>
                  <div style="color:#64748b">
                    Accuracy
                  </div>
                  <strong style="color:${accuracyColor}">
                    ${accuracyText}
                  </strong>
                </div>

                <div>
                  <div style="color:#64748b">
                    GPS
                  </div>
                  <strong style="color:${accuracyColor}">
                    ${accuracyLabel}
                  </strong>
                </div>
              </div>
            </div>

            <div
              style="
                margin-top:10px;
                padding-top:8px;
                border-top:1px solid #e2e8f0;
                font-size:11px;
                color:#64748b;
              "
            >
              Last updated:
              ${escapeHtml(
                formatTime(
                  bus.recordedAt
                )
              )}
            </div>

            <div
              style="
                margin-top:5px;
                font-size:10px;
                color:#94a3b8;
              "
            >
              Trip:
              ${escapeHtml(
                bus.tripCode ||
                  bus.tripId
              )}
            </div>
          </div>
        `;

        marker.bindPopup(
          popupHtml,
          {
            maxWidth: 320,
          }
        );

        /*
         * ACCURACY CIRCLE
         */
        let circle =
          accuracyCirclesRef
            .current[
              bus.busId
            ];

        if (!circle) {
          circle =
            leaflet.circle(
              position,
              {
                radius: accuracy,

                color:
                  accuracyColor,

                weight: 2,

                opacity:
                  0.55,

                fillColor:
                  accuracyColor,

                fillOpacity:
                  0.08,

                interactive:
                  false,
              }
            ).addTo(map);

          accuracyCirclesRef
            .current[
              bus.busId
            ] = circle;
        } else {
          circle.setLatLng(
            position
          );

          circle.setRadius(
            accuracy
          );

          circle.setStyle({
            color:
              accuracyColor,

            fillColor:
              accuracyColor,
          });
        }
      });

      /*
       * MAP VIEW
       */
      const busArray =
        Object.values(
          liveBuses
        );

      if (
        busArray.length === 1
      ) {
        const bus =
          busArray[0];

        const currentZoom =
          map.getZoom();

        /*
         * Don't keep zooming on every GPS update.
         */
        if (
          currentZoom < 14
        ) {
          map.setView(
            [
              bus.latitude,
              bus.longitude,
            ],
            14,
            {
              animate: true,
            }
          );
        }
      }

      if (
        busArray.length > 1
      ) {
        const bounds =
          leaflet.latLngBounds(
            busArray.map(
              (bus) => [
                bus.latitude,
                bus.longitude,
              ]
            )
          );

        if (
          bounds.isValid()
        ) {
          map.fitBounds(
            bounds,
            {
              padding: [
                50,
                50,
              ],

              maxZoom: 15,

              animate: true,
            }
          );
        }
      }
    }

    updateMap();

    return () => {
      mounted = false;
    };
  }, [liveBuses]);

  /*
   * ----------------------------------------------------
   * PERIODIC STALE CHECK
   * ----------------------------------------------------
   */

  const [, forceRefresh] =
    useState(0);

  useEffect(() => {
    const timer =
      window.setInterval(
        () => {
          forceRefresh(
            (value) =>
              value + 1
          );
        },
        10000
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, []);

  /*
   * ----------------------------------------------------
   * DERIVED DATA
   * ----------------------------------------------------
   */

  const buses =
    Object.values(
      liveBuses
    );

  const goodGps =
    buses.filter(
      (bus) =>
        getAccuracyLevel(
          bus.accuracy
        ) === "GOOD"
    ).length;

  const fairGps =
    buses.filter(
      (bus) =>
        getAccuracyLevel(
          bus.accuracy
        ) === "FAIR"
    ).length;

  const poorGps =
    buses.filter(
      (bus) =>
        getAccuracyLevel(
          bus.accuracy
        ) === "POOR"
    ).length;

  const staleBuses =
    buses.filter(
      (bus) =>
        isStale(
          bus.recordedAt
        )
    ).length;

  const connectionText =
    connection === "ONLINE"
      ? "Realtime Connected"
      : connection === "CONNECTING"
        ? "Realtime Connecting"
        : "Realtime Offline";

  const connectionColor =
    connection === "ONLINE"
      ? "text-emerald-600"
      : connection ===
          "CONNECTING"
        ? "text-amber-600"
        : "text-red-600";

  /*
   * ----------------------------------------------------
   * UI
   * ----------------------------------------------------
   */

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* HEADER */}

        <section>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">

            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
                Realtime Operations
              </p>

              <h1 className="mt-1 text-3xl font-bold text-slate-900">
                Live Tracking
              </h1>

              <p className="mt-2 text-sm text-slate-600">
                Monitor active buses and
                incoming GPS locations in
                realtime.
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">

              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  connection ===
                  "ONLINE"
                    ? "bg-emerald-500"
                    : connection ===
                        "CONNECTING"
                      ? "bg-amber-500"
                      : "bg-red-500"
                }`}
              />

              <span
                className={`text-sm font-semibold ${connectionColor}`}
              >
                {connectionText}
              </span>
            </div>

          </div>
        </section>

        {/* ERROR */}

        {errorMessage && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-semibold text-red-700">
              {errorMessage}
            </p>
          </div>
        )}

        {/* SUMMARY */}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Connection
            </p>

            <p
              className={`mt-2 text-xl font-bold ${connectionColor}`}
            >
              {connection}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Live Buses
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {buses.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Good GPS
            </p>

            <p className="mt-2 text-2xl font-bold text-emerald-600">
              {goodGps}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Poor GPS
            </p>

            <p className="mt-2 text-2xl font-bold text-red-600">
              {poorGps}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              GPS Stream
            </p>

            <p className="mt-2 text-xl font-bold text-emerald-600">
              ACTIVE
            </p>
          </div>

        </section>

        {/* GPS LEGEND */}

        {buses.length > 0 && (
          <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">

            <span className="text-sm font-semibold text-slate-700">
              GPS Status
            </span>

            <span className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <span className="h-3 w-3 rounded-full bg-emerald-500" />
              Good ≤ 50m
            </span>

            <span className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <span className="h-3 w-3 rounded-full bg-amber-500" />
              Fair ≤ 200m
            </span>

            <span className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <span className="h-3 w-3 rounded-full bg-red-600" />
              Poor &gt; 200m
            </span>

            {staleBuses > 0 && (
              <span className="ml-auto rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {staleBuses} stale
              </span>
            )}

          </section>
        )}

        {/* MAP */}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 md:flex-row md:items-center md:justify-between">

            <div>
              <h2 className="text-xl font-bold text-slate-900">
                🗺️ Live Bus Map
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Driver GPS locations are
                displayed realtime.
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 px-4 py-2 text-sm text-slate-600">
              <span className="font-semibold text-slate-900">
                {buses.length}
              </span>{" "}
              active bus
              {buses.length === 1
                ? ""
                : "es"}
            </div>

          </div>

          <div className="relative">

            <div
              ref={
                mapContainerRef
              }
              className="h-[560px] w-full"
            />

            {/* MAP STATUS */}

            <div className="absolute left-4 top-4 z-[1000] rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur">

              <div className="flex items-center gap-2">

                <span
                  className={`h-3 w-3 rounded-full ${
                    connection ===
                    "ONLINE"
                      ? "bg-emerald-500"
                      : connection ===
                          "CONNECTING"
                        ? "bg-amber-500"
                        : "bg-red-500"
                  }`}
                />

                <span className="text-sm font-bold text-slate-800">
                  {connectionText}
                </span>

              </div>

              <p className="mt-1 text-xs text-slate-500">
                {buses.length} live bus
                {buses.length === 1
                  ? ""
                  : "es"}
              </p>

            </div>

            {/* EMPTY MAP STATE */}

            {!loading &&
              buses.length ===
                0 && (
                <div className="absolute inset-0 z-[900] flex items-center justify-center bg-white/60 backdrop-blur-[2px]">

                  <div className="rounded-2xl border border-slate-200 bg-white px-8 py-7 text-center shadow-xl">

                    <div className="text-5xl">
                      🚌
                    </div>

                    <h3 className="mt-3 font-bold text-slate-900">
                      No live buses
                    </h3>

                    <p className="mt-1 max-w-sm text-sm text-slate-500">
                      Start a driver trip and
                      allow GPS location access.
                    </p>

                  </div>

                </div>
              )}

          </div>
        </section>

        {/* LIVE BUS CARDS */}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          <div className="border-b border-slate-200 px-6 py-5">

            <h2 className="text-xl font-bold text-slate-900">
              Live Bus Locations
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Latest GPS locations from
              PostgreSQL and realtime
              Socket.IO updates.
            </p>

          </div>

          {loading ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-slate-500">
                Loading live bus locations...
              </p>
            </div>
          ) : buses.length ===
            0 ? (
            <div className="px-6 py-16 text-center">

              <div className="text-5xl">
                🚌
              </div>

              <h3 className="mt-4 text-lg font-bold text-slate-900">
                No live buses yet
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                Start a driver trip and
                allow location access. The
                bus will appear here when
                GPS coordinates arrive.
              </p>

            </div>
          ) : (
            <div className="grid gap-4 p-5 lg:grid-cols-2">

              {buses.map(
                (bus) => {
                  const level =
                    getAccuracyLevel(
                      bus.accuracy
                    );

                  const accuracyColor =
                    getAccuracyColor(
                      bus.accuracy
                    );

                  const stale =
                    isStale(
                      bus.recordedAt
                    );

                  return (
                    <div
                      key={
                        bus.busId
                      }
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                    >

                      {/* CARD HEADER */}

                      <div className="flex items-start justify-between gap-4">

                        <div className="flex items-center gap-3">

                          <div
                            className="flex h-12 w-12 items-center justify-center rounded-xl"
                            style={{
                              backgroundColor:
                                `${accuracyColor}15`,
                            }}
                          >
                            <span className="text-2xl">
                              🚌
                            </span>
                          </div>

                          <div>

                            <p className="text-lg font-bold text-slate-900">
                              Bus{" "}
                              {
                                bus.busNumber
                              }
                            </p>

                            <p className="text-xs text-slate-500">
                              {
                                bus.registration
                              }
                            </p>

                          </div>

                        </div>

                        <span
                          className="rounded-full px-3 py-1 text-xs font-bold"
                          style={{
                            color:
                              accuracyColor,

                            backgroundColor:
                              `${accuracyColor}15`,
                          }}
                        >
                          {stale
                            ? "STALE"
                            : level}
                        </span>

                      </div>

                      {/* DETAILS */}

                      <div className="mt-5 grid grid-cols-2 gap-3">

                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            Speed
                          </p>

                          <p className="mt-1 font-semibold text-slate-800">
                            {bus.speed !=
                              null
                              ? `${bus.speed.toFixed(
                                  1
                                )} km/h`
                              : "—"}
                          </p>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            Accuracy
                          </p>

                          <p
                            className="mt-1 font-semibold"
                            style={{
                              color:
                                accuracyColor,
                            }}
                          >
                            {bus.accuracy !=
                            null
                              ? `${bus.accuracy.toFixed(
                                  1
                                )} m`
                              : "—"}
                          </p>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            Latitude
                          </p>

                          <p className="mt-1 font-mono text-sm font-semibold text-slate-800">
                            {bus.latitude.toFixed(
                              6
                            )}
                          </p>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            Longitude
                          </p>

                          <p className="mt-1 font-mono text-sm font-semibold text-slate-800">
                            {bus.longitude.toFixed(
                              6
                            )}
                          </p>
                        </div>

                      </div>

                      {/* FOOTER */}

                      <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">

                        <span>
                          Trip:{" "}
                          <span className="font-semibold text-blue-600">
                            {
                              bus.tripCode ||
                              bus.tripId
                            }
                          </span>
                        </span>

                        <span>
                          Updated{" "}
                          <span className="font-semibold text-slate-700">
                            {formatTime(
                              bus.recordedAt
                            )}
                          </span>
                        </span>

                      </div>

                    </div>
                  );
                }
              )}

            </div>
          )}

        </section>

      </div>
    </main>
  );
}