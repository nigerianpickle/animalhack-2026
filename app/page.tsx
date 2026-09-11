"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import HistoryFilter from "./components/HistoryFilter";
import CategoryFilter from "./components/CategoryFilter";
import InsightFeed from "./components/InsightFeed";

const HotspotMap = dynamic(() => import("./components/HotspotMap"), { ssr: false });

type Report = {
  category: string;
  neighbourhood: string;
  ward: string;
  date: string;
};

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 150,
        background: "#fff",
        border: "1px solid #e8e8ec",
        borderRadius: 12,
        padding: "14px 16px",
        boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
      }}
    >
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#98a2b3", fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#101828", marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: "#667085", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

export default function Home() {
  const [period, setPeriod] = useState("all");
  const [category, setCategory] = useState("all");
  const [scope, setScope] = useState<"live" | "historical">("live");
  const [reports, setReports] = useState<Report[]>([]);

  useEffect(() => {
    fetch("/api/reports")
      .then((r) => (r.ok ? r.json() : []))
      .then(setReports)
      .catch(() => setReports([]));
  }, []);

  const total = reports.length;
  const wards = new Set(reports.map((r) => r.ward).filter(Boolean)).size;

  const dates = reports.map((r) => new Date(r.date).getTime()).filter((t) => !Number.isNaN(t));
  const fmt = (t: number) => new Date(t).toLocaleString("en-CA", { month: "short", year: "numeric" });
  const range = dates.length ? `${fmt(Math.min(...dates))} – ${fmt(Math.max(...dates))}` : "—";

  const topWard = (() => {
    const counts = new Map<string, number>();
    reports.forEach((r) => r.ward && counts.set(r.ward, (counts.get(r.ward) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  })();

  const topCategory = (() => {
    const counts = new Map<string, number>();
    reports.forEach((r) => counts.set(r.category, (counts.get(r.category) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  })();

  const tab = (id: "live" | "historical", label: string, sub: string) => {
    const active = scope === id;
    return (
      <button
        key={id}
        onClick={() => setScope(id)}
        style={{
          flex: 1,
          textAlign: "left",
          padding: "8px 10px",
          borderRadius: 8,
          border: active ? "1px solid #d0c8f5" : "1px solid transparent",
          background: active ? "#f1eefc" : "transparent",
          cursor: "pointer",
        }}
      >
        <div style={{ fontSize: 12.5, fontWeight: 700, color: active ? "#5b3fd6" : "#475467" }}>{label}</div>
        <div style={{ fontSize: 10.5, color: "#98a2b3", marginTop: 1 }}>{sub}</div>
      </button>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f7f8fa", color: "#101828" }}>
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #e8e8ec",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em" }}>
            🐾 Winnipeg Animal Welfare Operations
          </div>
          <div style={{ fontSize: 13, color: "#667085", marginTop: 2 }}>
            What&apos;s happening, why it&apos;s happening, and what to do about it.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <HistoryFilter value={period} onChange={setPeriod} />
          <CategoryFilter value={category} onChange={setCategory} />
        </div>
      </header>

      <main style={{ padding: 24, maxWidth: 1600, margin: "0 auto" }}>
        <section style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <StatCard label="Total reports" value={total ? total.toLocaleString() : "—"} hint={range} />
          <StatCard label="Wards" value={wards ? String(wards) : "—"} hint="City of Winnipeg 311 data" />
          <StatCard
            label="Highest-load ward"
            value={topWard ? topWard[0] : "—"}
            hint={topWard ? `${topWard[1]} reports` : undefined}
          />
          <StatCard
            label="Most common issue"
            value={topCategory ? topCategory[0].replace(/_/g, " ") : "—"}
            hint={topCategory ? `${topCategory[1]} reports` : undefined}
          />
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) minmax(360px, 1fr)",
            gap: 20,
            alignItems: "start",
          }}
        >
          <div
            style={{
              background: "#fff",
              border: "1px solid #e8e8ec",
              borderRadius: 12,
              padding: 12,
              boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "#344054", marginBottom: 8, paddingLeft: 4 }}>
              Hotspot Map
            </div>
            <HotspotMap period={period} category={category} />
          </div>

          <aside style={{ position: "sticky", top: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 8px" }}>AI Intelligence Feed</h2>

            <div
              style={{
                display: "flex",
                gap: 6,
                background: "#fff",
                border: "1px solid #e8e8ec",
                borderRadius: 10,
                padding: 4,
                marginBottom: 12,
              }}
            >
              {tab("live", "Current view", "Follows your filters")}
              {tab("historical", "Historical patterns", "Multi-year, unfiltered")}
            </div>

            <div style={{ maxHeight: "calc(100vh - 210px)", overflowY: "auto", paddingRight: 4 }}>
              <InsightFeed scope={scope} category={category} period={period} />
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}