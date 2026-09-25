"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/dashboard/StatTile";
import { formatBaht, formatNumber } from "@/lib/format";
import type { TodaySummary } from "@/lib/orders/getTodaySummary";

export default function TodayPage() {
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const res = await fetch("/api/summary", { cache: "no-store" });
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (!cancelled) {
        setSummary(data.summary);
        setLoading(false);
      }
    }

    load();
    // Refresh periodically so staff see new orders without manually reloading.
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (loading && !summary) {
    return <p className="text-center text-gray-400 mt-10">Loading today's numbers...</p>;
  }

  if (!summary) {
    return <p className="text-center text-gray-400 mt-10">Could not load today's data.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[#6b4c86]">Today</h1>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Orders" value={formatNumber(summary.orders)} />
        <StatTile label="Items" value={formatNumber(summary.items)} />
        <StatTile label="Sales" value={formatBaht(summary.sales)} accent="pink" />
        <StatTile label="Cost" value={formatBaht(summary.cost)} />
        <StatTile label="Profit" value={formatBaht(summary.profit)} accent="pink" />
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-[#6b4c86] mb-3">📦 To Make</h2>
        {summary.toMake.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing pending — all caught up!</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {summary.toMake.map((line) => (
              <li key={line.productName} className="flex justify-between text-sm">
                <span className="text-gray-700">{line.productName}</span>
                <span className="font-medium text-[#8a63a8]">{line.quantity}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
