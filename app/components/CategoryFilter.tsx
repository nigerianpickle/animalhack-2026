"use client";

type CategoryFilterProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function CategoryFilter({
  value,
  onChange,
}: CategoryFilterProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "8px",
        marginBottom: "12px",
        marginLeft: "10px",
      }}
    >
      <option value="all">All issues</option>
      <option value="stray_roaming">Stray / Roaming</option>
      <option value="lost_found">Lost / Found</option>
      <option value="welfare_distress">Welfare / Distress</option>
      <option value="surrender_capacity">Surrender / Capacity</option>
      <option value="safety_complaint">Safety / Complaint</option>
    </select>
  );
}