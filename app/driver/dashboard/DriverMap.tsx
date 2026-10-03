"use client";

import { useEffect, useRef } from "react";
import type { GPSLocation } from "./page";
import "leaflet/dist/leaflet.css";

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

type LatLng = [number, number];

const ROUTER = "https://router.project-osrm.org/route/v1/driving";

export default function DriverMap({
  location,
  stops,
  busNumber,
  registration,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const busMarkerRef = useRef<any>(null);
  const routeLineRef = useRef<any>(null);
  const stopLayerRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const firstFitRef = useRef(false);
  const routeRequestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function createMap() {
      if (!containerRef.current || mapRef.current) return;

      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: [9.875728936747167, 78.27395353731299],
        zoom: 13,
        zoomControl: true,
        preferCanvas: true,
        attributionControl: true,
      });

      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          minZoom: 3,
          attribution: "&copy; OpenStreetMap contributors",
          updateWhenIdle: false,
          updateWhenZooming: true,
          keepBuffer: 2,
        }
      ).addTo(map);

      mapRef.current = map;
      stopLayerRef.current = L.layerGroup().addTo(map);

      const resizeObserver = new ResizeObserver(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize(false);
        }
      });

      resizeObserver.observe(containerRef.current);
      resizeObserverRef.current = resizeObserver;

      window.setTimeout(() => map.invalidateSize(true), 100);
      window.setTimeout(() => map.invalidateSize(true), 500);
      window.setTimeout(() => map.invalidateSize(true), 1000);
    }

    void createMap();

    return () => {
      cancelled = true;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      busMarkerRef.current = null;
      routeLineRef.current = null;
      stopLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function updateMap() {
      const map = mapRef.current;
      if (!map) return;

      const L = await import("leaflet");
      if (cancelled) return;

      const orderedStops = [...stops].sort(
        (a, b) => a.sequence - b.sequence
      );

      stopLayerRef.current?.clearLayers();

      for (const stop of orderedStops) {
        L.circleMarker([stop.latitude, stop.longitude], {
          radius: 7,
          color: "#f59e0b",
          weight: 2,
          fillColor: "#fbbf24",
          fillOpacity: 0.95,
        })
          .bindPopup(
            `<strong>📍 Route Stop</strong><br/>${escapeHtml(
              stop.name
            )}<br/>Stop ${stop.sequence}`
          )
          .addTo(stopLayerRef.current);
      }

      if (location) {
        const stale =
          Date.now() - new Date(location.recordedAt).getTime() > 60_000;

        const border = stale ? "#f59e0b" : "#22c55e";
        const background = stale ? "#451a03" : "#052e16";

        const busIcon = L.divIcon({
          className: "driver-bus-marker",
          html: `
            <div style="
              width:48px;
              height:48px;
              border-radius:50%;
              background:${background};
              border:3px solid ${border};
              display:flex;
              align-items:center;
              justify-content:center;
              box-shadow:0 8px 28px rgba(0,0,0,.55);
              font-size:26px;
              line-height:1;
            ">🚌</div>
          `,
          iconSize: [48, 48],
          iconAnchor: [24, 24],
          popupAnchor: [0, -24],
        });

        if (!busMarkerRef.current) {
          busMarkerRef.current = L.marker(
            [location.latitude, location.longitude],
            {
              icon: busIcon,
              zIndexOffset: 1000,
            }
          )
            .addTo(map)
            .bindPopup(
              `<strong>🚌 Bus ${escapeHtml(
                busNumber
              )}</strong><br/>${escapeHtml(registration)}`
            );
        } else {
          busMarkerRef.current.setLatLng([
            location.latitude,
            location.longitude,
          ]);
          busMarkerRef.current.setIcon(busIcon);
        }
      } else if (busMarkerRef.current) {
        busMarkerRef.current.remove();
        busMarkerRef.current = null;
      }

      if (location && orderedStops.length) {
        const nextStop =
          orderedStops.find((stop) => stop.sequence > 0) ??
          orderedStops[0];

        const requestId = ++routeRequestRef.current;

        const coordinates =
          `${location.longitude},${location.latitude};` +
          `${nextStop.longitude},${nextStop.latitude}`;

        try {
          const response = await fetch(
            `${ROUTER}/${coordinates}?overview=full&geometries=geojson`,
            { cache: "no-store" }
          );

          if (!response.ok) return;

          const result = await response.json();

          if (cancelled || requestId !== routeRequestRef.current) {
            return;
          }

          const geometry =
            result?.routes?.[0]?.geometry?.coordinates;

          if (!Array.isArray(geometry) || !geometry.length) {
            return;
          }

          const points: LatLng[] = geometry.map(
            (pair: [number, number]) =>
              [pair[1], pair[0]] as LatLng
          );

          if (!routeLineRef.current) {
            routeLineRef.current = L.polyline(points, {
              color: "#22d3ee",
              weight: 6,
              opacity: 0.9,
              lineCap: "round",
              lineJoin: "round",
            }).addTo(map);
          } else {
            routeLineRef.current.setLatLngs(points);
          }
        } catch {
          // Keep the live bus marker even if OSRM is temporarily unavailable.
        }
      } else if (routeLineRef.current) {
        routeLineRef.current.remove();
        routeLineRef.current = null;
      }

      const fitPoints: LatLng[] = [];

      if (location) {
        fitPoints.push([location.latitude, location.longitude]);
      }

      for (const stop of orderedStops) {
        fitPoints.push([stop.latitude, stop.longitude]);
      }

      if (fitPoints.length >= 2 && !firstFitRef.current) {
        firstFitRef.current = true;

        map.fitBounds(L.latLngBounds(fitPoints), {
          paddingTopLeft: [55, 55],
          paddingBottomRight: [55, 55],
          maxZoom: 15,
          animate: false,
        });
      } else if (fitPoints.length === 1 && !firstFitRef.current) {
        firstFitRef.current = true;
        map.setView(fitPoints[0], 15, {
          animate: false,
        });
      }

      window.setTimeout(() => {
        map.invalidateSize(true);
      }, 50);
    }

    void updateMap();

    return () => {
      cancelled = true;
    };
  }, [location, stops, busNumber, registration]);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
      <div
        ref={containerRef}
        className="relative h-[520px] w-full overflow-hidden"
        style={{
          minHeight: "520px",
          width: "100%",
          position: "relative",
          overflow: "hidden",
        }}
      />
    </div>
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
