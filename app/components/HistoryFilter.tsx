"use client";

type HistoryFilterProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function HistoryFilter({
  value,
  onChange,
}: HistoryFilterProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "8px",
        marginBottom: "12px",
      }}
    >
      <option value="all">All time</option>
      <option value="30">Last 30 days</option>
      <option value="90">Last 3 months</option>
      <option value="180">Last 6 months</option>
      <option value="2024">2024</option>
      <option value="2025">2025</option>
      <option value="2026">2026</option>
    </select>
  );
}