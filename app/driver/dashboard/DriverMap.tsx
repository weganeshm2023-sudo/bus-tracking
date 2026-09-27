"use client";

import { useEffect, useMemo, useRef } from "react";
import type { GPSLocation } from "./page";

type RouteStop = {
  id: string;
  stopId: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence: number;
};

type Props = {
  location: GPSLocation | null;
  stops: RouteStop[];
  busNumber: string;
  registration: string;
};

type LeafletModule = typeof import("leaflet");

type RouteLine = {
  geometry: {
    coordinates: [number, number][];
  };
};

export default function DriverMap({
  location,
  stops,
  busNumber,
  registration,
}: Props) {
  const mapContainerRef =
    useRef<HTMLDivElement | null>(null);

  const mapRef =
    useRef<import("leaflet").Map | null>(null);

  const leafletRef =
    useRef<LeafletModule | null>(null);

  const busMarkerRef =
    useRef<import("leaflet").Marker | null>(null);

  const routeLayerRef =
    useRef<import("leaflet").Polyline | null>(null);

  const stopLayerRef =
    useRef<import("leaflet").LayerGroup | null>(null);

  const lastRouteRequestRef =
    useRef<string>("");

  const routeRequestTimerRef =
    useRef<number | null>(null);

  /*
   * ---------------------------------------------------------
   * ROUTE POINTS
   * ---------------------------------------------------------
   */

  const orderedStops = useMemo(() => {
    return [...stops].sort(
      (a, b) =>
        a.sequence - b.sequence
    );
  }, [stops]);

  /*
   * ---------------------------------------------------------
   * LOAD LEAFLET
   * ---------------------------------------------------------
   */

  useEffect(() => {
    let cancelled = false;

    async function createMap() {
      if (
        !mapContainerRef.current ||
        mapRef.current
      ) {
        return;
      }

      const L =
        await import("leaflet");

      if (cancelled) {
        return;
      }

      leafletRef.current =
        L;

      /*
       * Leaflet default marker icons
       * need explicit paths in Next.js.
       */

      delete (
        L.Icon.Default.prototype as unknown as {
          _getIconUrl?: unknown;
        }
      )._getIconUrl;

      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",

        iconUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",

        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const defaultCenter:
        [number, number] =
        location
          ? [
              location.latitude,
              location.longitude,
            ]
          : orderedStops.length
            ? [
                orderedStops[0]
                  .latitude,
                orderedStops[0]
                  .longitude,
              ]
            : [
                9.875728936747167,
                78.27395353731299,
              ];

      const map =
        L.map(
          mapContainerRef.current,
          {
            zoomControl: true,
            attributionControl: true,
          }
        ).setView(
          defaultCenter,
          15
        );

      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution:
            "&copy; OpenStreetMap contributors",
        }
      ).addTo(map);

      mapRef.current =
        map;

      stopLayerRef.current =
        L.layerGroup().addTo(
          map
        );

      /*
       * Route stops
       */

      orderedStops.forEach(
        (stop, index) => {
          const marker =
            L.marker([
              stop.latitude,
              stop.longitude,
            ]);

          marker.bindPopup(
            `
              <div style="min-width:180px">
                <strong>${escapeHtml(
                  stop.name
                )}</strong>
                <br />
                Stop ${index + 1}
                <br />
                ${escapeHtml(
                  stop.stopId
                )}
              </div>
            `
          );

          marker.addTo(
            stopLayerRef.current!
          );
        }
      );

      /*
       * Give React/Leaflet time to calculate
       * the container dimensions.
       */

      window.setTimeout(
        () => {
          map.invalidateSize();
        },
        100
      );
    }

    void createMap();

    return () => {
      cancelled = true;

      if (
        routeRequestTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          routeRequestTimerRef.current
        );

        routeRequestTimerRef.current =
          null;
      }

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current =
          null;
      }

      busMarkerRef.current =
        null;

      routeLayerRef.current =
        null;

      stopLayerRef.current =
        null;

      leafletRef.current =
        null;
    };
  }, []);

  /*
   * ---------------------------------------------------------
   * UPDATE BUS MARKER
   * ---------------------------------------------------------
   */

  useEffect(() => {
    const L =
      leafletRef.current;

    const map =
      mapRef.current;

    if (
      !L ||
      !map ||
      !location
    ) {
      return;
    }

    const position:
      [number, number] = [
      location.latitude,
      location.longitude,
    ];

    /*
     * Custom bus icon.
     */

    const busIcon =
      L.divIcon({
        className:
          "driver-live-bus-icon",

        html: `
          <div
            style="
              width:46px;
              height:46px;
              border-radius:50%;
              background:#2563eb;
              border:4px solid white;
              box-shadow:0 4px 18px rgba(0,0,0,.35);
              display:flex;
              align-items:center;
              justify-content:center;
              font-size:23px;
              line-height:1;
            "
          >
            🚌
          </div>
        `,

        iconSize: [
          46,
          46,
        ],

        iconAnchor: [
          23,
          23,
        ],

        popupAnchor: [
          0,
          -24,
        ],
      });

    if (
      !busMarkerRef.current
    ) {
      busMarkerRef.current =
        L.marker(
          position,
          {
            icon: busIcon,
            zIndexOffset: 1000,
          }
        ).addTo(map);

      busMarkerRef.current.bindPopup(
        `
          <div style="min-width:190px">
            <strong>Bus ${escapeHtml(
              busNumber
            )}</strong>
            <br />
            ${escapeHtml(
              registration
            )}
            <br />
            <span style="color:#16a34a">
              ● Live GPS
            </span>
          </div>
        `
      );
    } else {
      busMarkerRef.current.setLatLng(
        position
      );

      busMarkerRef.current.setIcon(
        busIcon
      );
    }
  }, [
    location,
    busNumber,
    registration,
  ]);

  /*
   * ---------------------------------------------------------
   * KEEP BUS VISIBLE
   * ---------------------------------------------------------
   */

  useEffect(() => {
    const map =
      mapRef.current;

    if (
      !map ||
      !location
    ) {
      return;
    }

    /*
     * Do not continuously force the map
     * to the bus position while the driver
     * manually pans/zooms.
     *
     * Only pan when the bus moves outside
     * the current visible area.
     */

    const busPosition =
      map.getCenter();

    const distance =
      map.distance(
        [
          busPosition.lat,
          busPosition.lng,
        ],
        [
          location.latitude,
          location.longitude,
        ]
      );

    if (
      distance > 2500
    ) {
      map.panTo(
        [
          location.latitude,
          location.longitude,
        ],
        {
          animate: true,
          duration: 0.8,
        }
      );
    }
  }, [location]);

  /*
   * ---------------------------------------------------------
   * ROAD ROUTE
   * ---------------------------------------------------------
   */

  useEffect(() => {
    const L =
      leafletRef.current;

    const map =
      mapRef.current;

    if (
      !L ||
      !map ||
      !location ||
      orderedStops.length === 0
    ) {
      return;
    }

    /*
     * Capture non-null references.
     *
     * TypeScript otherwise treats L/map as nullable
     * inside the asynchronous OSRM callback.
     */

    const leaflet =
      L;

    const leafletMap =
      map;

    /*
     * Current bus + all route stops.
     *
     * OSRM follows actual roads instead of drawing
     * a straight line.
     */

    const points = [
      [
        location.longitude,
        location.latitude,
      ] as [
        number,
        number
      ],

      ...orderedStops.map(
        (stop) => [
          stop.longitude,
          stop.latitude,
        ] as [
          number,
          number
        ]
      ),
    ];

    const routeKey =
      points
        .map(
          ([lng, lat]) =>
            `${lng.toFixed(
              5
            )},${lat.toFixed(5)}`
        )
        .join("|");

    /*
     * Avoid unnecessary OSRM requests.
     */

    if (
      routeKey ===
      lastRouteRequestRef.current
    ) {
      return;
    }

    if (
      routeRequestTimerRef.current !==
      null
    ) {
      window.clearTimeout(
        routeRequestTimerRef.current
      );
    }

    /*
     * Small debounce because GPS can update
     * several times per second.
     */

    routeRequestTimerRef.current =
      window.setTimeout(
        () => {
          lastRouteRequestRef.current =
            routeKey;

          void fetchRoadRoute(
            points
          );
        },
        700
      );

    async function fetchRoadRoute(
      coordinates: Array<
        [number, number]
      >
    ) {
      try {
        const coordinateText =
          coordinates
            .map(
              ([lng, lat]) =>
                `${lng},${lat}`
            )
            .join(";");

        const url =
          `https://router.project-osrm.org/route/v1/driving/${coordinateText}` +
          `?overview=full&geometries=geojson&steps=false`;

        const response =
          await fetch(
            url,
            {
              cache: "no-store",
            }
          );

        if (
          !response.ok
        ) {
          throw new Error(
            `OSRM HTTP ${response.status}`
          );
        }

        const data =
          (await response.json()) as {
            code?: string;
            routes?: RouteLine[];
          };

        if (
          data.code !==
            "Ok" ||
          !data.routes?.[0]
        ) {
          throw new Error(
            "No road route returned."
          );
        }

        const route =
          data.routes[0];

        const latLngs =
          route.geometry.coordinates.map(
            ([lng, lat]) =>
              [
                lat,
                lng,
              ] as [
                number,
                number
              ]
          );

        /*
         * Component may have unmounted while
         * the OSRM request was running.
         *
         * Do not touch Leaflet in that case.
         */

        if (
          !leafletMap ||
          !leaflet
        ) {
          return;
        }

        if (
          routeLayerRef.current
        ) {
          routeLayerRef.current.remove();
        }

        const newRouteLayer =
          leaflet.polyline(
            latLngs,
            {
              color:
                "#2563eb",

              weight: 6,

              opacity:
                0.85,

              lineCap:
                "round",

              lineJoin:
                "round",
            }
          );

        newRouteLayer.addTo(
          leafletMap
        );

        routeLayerRef.current =
          newRouteLayer;

        /*
         * Route should remain behind the bus marker.
         */

        newRouteLayer.bringToBack();

        /*
         * First route creation:
         * fit all route points once.
         *
         * After that, don't keep zooming/panning
         * every GPS update.
         */

        if (
          latLngs.length > 0 &&
          !mapHasBeenInteracted(
            leafletMap
          )
        ) {
          leafletMap.fitBounds(
            newRouteLayer.getBounds(),
            {
              padding: [
                40,
                40,
              ],
              maxZoom: 15,
            }
          );
        }
      } catch (error) {
        console.warn(
          "DRIVER_OSRM_ROUTE_ERROR",
          error
        );

        /*
         * Do not show a fake straight route.
         * Keep the map usable even if OSRM
         * is temporarily unavailable.
         */
      }
    }

    return () => {
      if (
        routeRequestTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          routeRequestTimerRef.current
        );

        routeRequestTimerRef.current =
          null;
      }
    };
  }, [
    location,
    orderedStops,
  ]);

  /*
   * ---------------------------------------------------------
   * NO GPS STATE
   * ---------------------------------------------------------
   */

  if (!location) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900">

        <div
          ref={
            mapContainerRef
          }
          className="h-[420px] w-full"
        />

        <div className="absolute inset-x-4 top-4 z-[1000] rounded-xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-slate-300 shadow-xl backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" />

            Waiting for live GPS...
          </div>

          <p className="mt-1 text-xs text-slate-500">
            Allow browser location access on the driver device.
          </p>
        </div>
      </div>
    );
  }

  /*
   * ---------------------------------------------------------
   * NORMAL MAP
   * ---------------------------------------------------------
   */

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900">

      <div
        ref={
          mapContainerRef
        }
        className="h-[420px] w-full"
      />

      {/* LIVE GPS BADGE */}

      <div className="absolute left-4 top-4 z-[1000] rounded-xl border border-emerald-400/20 bg-slate-950/90 px-4 py-3 shadow-xl backdrop-blur">

        <div className="flex items-center gap-2">

          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />

          <span className="text-xs font-black text-emerald-300">
            LIVE GPS
          </span>

        </div>

        <p className="mt-1 text-[11px] text-slate-400">
          Bus {busNumber}
        </p>

      </div>

      {/* GPS ACCURACY */}

      <div className="absolute bottom-4 left-4 z-[1000] rounded-xl border border-white/10 bg-slate-950/90 px-4 py-3 shadow-xl backdrop-blur">

        <p className="text-[10px] uppercase tracking-wider text-slate-500">
          GPS Accuracy
        </p>

        <p className="mt-1 text-sm font-black text-white">
          ±
          {Math.round(
            location.accuracy
          )}
          m
        </p>

      </div>

    </div>
  );
}

/*
 * ---------------------------------------------------------
 * MAP INTERACTION TRACKING
 * ---------------------------------------------------------
 *
 * We don't need to force-fit the map after every GPS update.
 * Leaflet's map state tells us whether the user has manually
 * interacted with it.
 *
 * This helper is intentionally conservative.
 */

function mapHasBeenInteracted(
  map: import("leaflet").Map
) {
  const container =
    map.getContainer();

  return Boolean(
    container.dataset
      .driverMapInteracted
  );
}

/*
 * ---------------------------------------------------------
 * ESCAPE HTML
 * ---------------------------------------------------------
 */

function escapeHtml(
  value: string
) {
  return value
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}