"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { formatBaht, formatNumber } from "@/lib/format";
import type { ReportResult } from "@/lib/orders/getReportByDate";

export default function ReportsPage() {
  const [date, setDate] = useState<string>("");
  const [report, setReport] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function load(selectedDate: string) {
    setLoading(true);
    const url = selectedDate ? `/api/reports?date=${selectedDate}` : "/api/reports";
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setReport(data.report);
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[#6b4c86]">Reports</h1>

      <Card>
        <label className="text-sm text-gray-600 flex flex-col gap-1">
          Select date (Asia/Bangkok)
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border border-[#e5d9ee] px-3 py-2 text-sm"
          />
        </label>
      </Card>

      {loading && <p className="text-center text-gray-400">Loading report...</p>}

      {!loading && report && (
        <>
          <Card>
            <p className="text-xs text-gray-400 mb-2">{report.businessDate}</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-semibold text-[#8a63a8]">{formatNumber(report.totals.quantity)}</p>
                <p className="text-xs text-gray-500">Items</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-[#8a63a8]">{formatBaht(report.totals.revenue)}</p>
                <p className="text-xs text-gray-500">Revenue</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-[#c47ea0]">{formatBaht(report.totals.profit)}</p>
                <p className="text-xs text-gray-500">Profit</p>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-[#6b4c86] mb-3">By product</h2>
            {report.lines.length === 0 ? (
              <p className="text-sm text-gray-400">No orders on this date.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 text-xs">
                    <th className="pb-2">Product</th>
                    <th className="pb-2 text-right">Qty</th>
                    <th className="pb-2 text-right">Revenue</th>
                    <th className="pb-2 text-right">Cost</th>
                    <th className="pb-2 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {report.lines.map((line) => (
                    <tr key={line.productName} className="border-t border-[#f3ecf7]">
                      <td className="py-2 text-gray-700">{line.productName}</td>
                      <td className="py-2 text-right">{formatNumber(line.quantity)}</td>
                      <td className="py-2 text-right">{formatBaht(line.revenue)}</td>
                      <td className="py-2 text-right">{formatBaht(line.cost)}</td>
                      <td className="py-2 text-right">{formatBaht(line.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
