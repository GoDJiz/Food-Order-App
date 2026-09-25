import { Card } from "@/components/ui/Card";

export function StatTile({ label, value, accent }: { label: string; value: string; accent?: "purple" | "pink" }) {
  const accentClass = accent === "pink" ? "text-[#c47ea0]" : "text-[#8a63a8]";
  return (
    <Card className="flex flex-col items-center justify-center gap-1 py-5">
      <span className={`text-2xl font-semibold ${accentClass}`}>{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </Card>
  );
}
