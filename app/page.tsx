"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import HistoryFilter from "./components/HistoryFilter";
import CategoryFilter from "./components/CategoryFilter";
import InsightFeed from "./components/InsightFeed";

const HotspotMap = dynamic(
  () => import("./components/HotspotMap"),
  { ssr: false }
);

export default function Home() {
  const [period, setPeriod] = useState("all");
  const [category, setCategory] = useState("all");

  return (
    <main style={{ padding: "20px" }}>
      <h1>Winnipeg Animal Hotspot Map</h1>

      <HistoryFilter
        value={period}
        onChange={setPeriod}
      />

      <CategoryFilter
        value={category}
        onChange={setCategory}
      />

      <div style={{ display: "flex", gap: "20px", marginTop: "20px" }}>
        <div style={{ flex: 2 }}>
          <HotspotMap
            period={period}
            category={category}
          />
        </div>
        <div style={{ flex: 1, minWidth: "320px" }}>
          <h2 style={{ marginTop: 0 }}>AI Intelligence Feed</h2>
          <InsightFeed />
        </div>
      </div>
    </main>
  );
}