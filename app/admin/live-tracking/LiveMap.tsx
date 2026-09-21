"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import { useEffect } from "react";

type Stop = {
  id: string;
  stopId: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence: number;
};

type Props = {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  busLabel: string;
  stops: Stop[];
};

const busIcon = L.divIcon({
  className: "custom-bus-marker",
  html: `
    <div style="
      width:42px;
      height:42px;
      border-radius:50%;
      background:#0f172a;
      border:4px solid white;
      box-shadow:0 4px 14px rgba(0,0,0,.25);
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:21px;
    ">
      🚌
    </div>
  `,
  iconSize: [42, 42],
  iconAnchor: [21, 21],
});

const stopIcon = L.divIcon({
  className: "custom-stop-marker",
  html: `
    <div style="
      width:28px;
      height:28px;
      border-radius:50%;
      background:white;
      border:3px solid #2563eb;
      box-shadow:0 3px 10px rgba(0,0,0,.2);
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:12px;
      font-weight:800;
      color:#2563eb;
    ">
      •
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function MapCenter({
  latitude,
  longitude,
}: {
  latitude: number | null;
  longitude: number | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (latitude == null || longitude == null) {
      return;
    }

    map.setView([latitude, longitude], Math.max(map.getZoom(), 15));
  }, [latitude, longitude, map]);

  return null;
}

export default function LiveMap({
  latitude,
  longitude,
  accuracy,
  busLabel,
  stops,
}: Props) {
  const defaultPosition: [number, number] = [9.915228, 78.110193];

  const position: [number, number] =
    latitude != null && longitude != null
      ? [latitude, longitude]
      : defaultPosition;

  return (
    <div className="relative h-[520px] w-full">
      <MapContainer
        center={position}
        zoom={15}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapCenter
          latitude={latitude}
          longitude={longitude}
        />

        {latitude != null && longitude != null && (
          <>
            <Marker position={position} icon={busIcon}>
              <Popup>
                <div className="text-sm">
                  <strong>{busLabel}</strong>
                  <br />
                  Live bus location
                  <br />
                  {latitude.toFixed(6)}, {longitude.toFixed(6)}
                </div>
              </Popup>
            </Marker>

            {accuracy != null && accuracy > 0 && (
              <Circle
                center={position}
                radius={accuracy}
                pathOptions={{
                  fillOpacity: 0.08,
                  weight: 1,
                }}
              />
            )}
          </>
        )}

        {stops.map((stop) => (
          <Marker
            key={stop.id}
            position={[stop.latitude, stop.longitude]}
            icon={stopIcon}
          >
            <Popup>
              <div className="text-sm">
                <strong>
                  Stop {stop.sequence}
                </strong>
                <br />
                {stop.name}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {latitude == null || longitude == null ? (
        <div className="absolute left-4 top-4 rounded-xl bg-white/95 px-4 py-3 text-xs font-bold text-slate-600 shadow-lg">
          Waiting for GPS location...
        </div>
      ) : (
        <div className="absolute left-4 top-4 rounded-xl bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Live Location
          </div>
          <div className="mt-1 text-xs font-bold text-slate-700">
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </div>
        </div>
      )}
    </div>
  );
}