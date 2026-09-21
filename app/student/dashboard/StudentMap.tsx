"use client";

import {
  useEffect,
  useRef,
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

type StudentMapProps = {
  busLocation: LiveBusLocation | null;
  pickupStop: PickupStop;
  busNumber: string;
  registration: string;
  tripRunning: boolean;
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

export default function StudentMap({
  busLocation,
  pickupStop,
  busNumber,
  registration,
  tripRunning,
}: StudentMapProps) {
  const containerRef =
    useRef<HTMLDivElement | null>(null);

  const mapRef =
    useRef<L.Map | null>(null);

  const busMarkerRef =
    useRef<L.Marker | null>(null);

  const stopMarkerRef =
    useRef<L.Marker | null>(null);

  const accuracyCircleRef =
    useRef<L.Circle | null>(null);

  const lineRef =
    useRef<L.Polyline | null>(null);

  const firstBusLocationRef =
    useRef(false);

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

    const map = L.map(
      containerRef.current,
      {
        center: [
          pickupStop.latitude,
          pickupStop.longitude,
        ],
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

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      busMarkerRef.current = null;
      stopMarkerRef.current = null;
      accuracyCircleRef.current = null;
      lineRef.current = null;
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

    const stopPosition: L.LatLngExpression =
      [
        pickupStop.latitude,
        pickupStop.longitude,
      ];

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
            `
              <div style="min-width:190px">
                <strong>📍 Pickup Stop</strong>
                <br/>
                ${pickupStop.name}
                <br/>
                <small>
                  Stop ${pickupStop.sequence}
                </small>
              </div>
            `
          );
    } else {
      stopMarkerRef.current.setLatLng(
        stopPosition
      );

      stopMarkerRef.current.setPopupContent(
        `
          <div style="min-width:190px">
            <strong>📍 Pickup Stop</strong>
            <br/>
            ${pickupStop.name}
            <br/>
            <small>
              Stop ${pickupStop.sequence}
            </small>
          </div>
        `
      );
    }
  }, [pickupStop]);

  /*
   * Update live bus.
   */
  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    /*
     * No valid bus location.
     */
    if (!busLocation) {
      if (busMarkerRef.current) {
        busMarkerRef.current.remove();
        busMarkerRef.current = null;
      }

      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.remove();
        accuracyCircleRef.current = null;
      }

      if (lineRef.current) {
        lineRef.current.remove();
        lineRef.current = null;
      }

      map.setView(
        [
          pickupStop.latitude,
          pickupStop.longitude,
        ],
        14
      );

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

    /*
     * Bus popup.
     */
    const popupContent = `
      <div style="min-width:220px">
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
            ? `${busLocation.speed.toFixed(
                1
              )} m/s`
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

    /*
     * Create / update bus marker.
     */
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
     * Accuracy circle.
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
     * Direct visual line:
     * Bus -> Pickup Stop.
     */
    const linePoints:
      L.LatLngExpression[] = [
        [
          busLocation.latitude,
          busLocation.longitude,
        ],
        [
          pickupStop.latitude,
          pickupStop.longitude,
        ],
      ];

    if (!lineRef.current) {
      lineRef.current =
        L.polyline(
          linePoints,
          {
            color: "#60a5fa",
            weight: 3,
            opacity: 0.65,
            dashArray: "8 8",
          }
        ).addTo(map);
    } else {
      lineRef.current.setLatLngs(
        linePoints
      );
    }

    /*
     * First live GPS:
     * fit both bus + pickup stop.
     */
    if (
      !firstBusLocationRef.current
    ) {
      firstBusLocationRef.current =
        true;

      const bounds =
        L.latLngBounds([
          [
            busLocation.latitude,
            busLocation.longitude,
          ],
          [
            pickupStop.latitude,
            pickupStop.longitude,
          ],
        ]);

      map.fitBounds(
        bounds,
        {
          padding: [50, 50],
          maxZoom: 15,
        }
      );
    }
  }, [
    busLocation,
    pickupStop,
    busNumber,
    registration,
    tripRunning,
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

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
    />
  );
}