"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import HistoryFilter from "./components/HistoryFilter";
import CategoryFilter from "./components/CategoryFilter";

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

      <HotspotMap
        period={period}
        category={category}
      />
    </main>
  );
}