"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

type Report = {
  id: string;
  rawType: string;
  category: string;
  date: string;
  neighbourhood: string;
  ward?: string | null;
  lat: number;
  lng: number;
};

type Hotspot = {
  neighbourhood: string;
  count: number;
  lat: number;
  lng: number;
  categories: Record<string, number>;
};

type HotspotMapProps = {
  period: string;
  category: string;
};

export default function HotspotMap({
  period,
  category,
}: HotspotMapProps) {
  const [reports, setReports] = useState<Report[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    async function loadReports() {
      const response = await fetch("/api/reports");
      const data = await response.json();

      setReports(data);
    }

    loadReports();
  }, []);

  const filteredReports = useMemo(() => {
    let filtered = reports;

    // Filter by date
    if (period !== "all") {
      if (["2024", "2025", "2026"].includes(period)) {
        filtered = filtered.filter(
          (report) =>
            new Date(report.date).getFullYear().toString() === period
        );
      } else {
        const days = Number(period);

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        filtered = filtered.filter(
          (report) => new Date(report.date) >= cutoff
        );
      }
    }

    // Filter by category
    if (category !== "all") {
      filtered = filtered.filter(
        (report) => report.category === category
      );
    }

    return filtered;
  }, [reports, period, category]);

  const hotspots = useMemo(() => {
    const grouped: Record<
      string,
      {
        count: number;
        latTotal: number;
        lngTotal: number;
        categories: Record<string, number>;
      }
    > = {};

    for (const report of filteredReports) {
      if (!grouped[report.neighbourhood]) {
        grouped[report.neighbourhood] = {
          count: 0,
          latTotal: 0,
          lngTotal: 0,
          categories: {},
        };
      }

      const group = grouped[report.neighbourhood];

      group.count += 1;
      group.latTotal += report.lat;
      group.lngTotal += report.lng;

      group.categories[report.category] =
        (group.categories[report.category] || 0) + 1;
    }

    return Object.entries(grouped).map(
      ([neighbourhood, data]): Hotspot => ({
        neighbourhood,
        count: data.count,
        lat: data.latTotal / data.count,
        lng: data.lngTotal / data.count,
        categories: data.categories,
      })
    );
  }, [filteredReports]);

  if (!mounted) {
    return (
      <div
        style={{
          height: "600px",
          width: "100%",
        }}
      />
    );
  }

  return (
    <MapContainer
      center={[49.8951, -97.1384]}
      zoom={11}
      style={{
        height: "600px",
        width: "100%",
      }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {hotspots.map((hotspot) => (
        <CircleMarker
          key={hotspot.neighbourhood}
          center={[hotspot.lat, hotspot.lng]}
          radius={Math.max(6, Math.sqrt(hotspot.count) * 2)}
        >
          <Popup>
            <strong>{hotspot.neighbourhood}</strong>

            <br />

            Total reports: {hotspot.count}

            <hr />

            {Object.entries(hotspot.categories).map(
              ([categoryName, count]) => (
                <div key={categoryName}>
                  {categoryName}: {count}
                </div>
              )
            )}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}