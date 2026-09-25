"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import type { OrderListItem } from "@/lib/orders/listOrders";
import type { OrderStatus } from "@/lib/orders/status";
import { thaiLabelFor } from "@/lib/orders/status";

const STATUS_OPTIONS: OrderStatus[] = ["pending", "making", "done", "cancelled"];

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/orders", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setOrders(data.orders);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function changeStatus(id: string, status: OrderStatus) {
    setUpdatingId(id);
    const res = await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const data = await res.json();
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: data.order.status } : o)));
    }
    setUpdatingId(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg font-semibold text-[#6b4c86]">Orders</h1>

      {loading && <p className="text-center text-gray-400 mt-6">Loading orders...</p>}
      {!loading && orders.length === 0 && (
        <p className="text-center text-gray-400 mt-6">No orders yet today.</p>
      )}

      {orders.map((order) => (
        <Card key={order.id} className="flex flex-col gap-2">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-gray-400">{order.order_number}</p>
              <p className="font-medium text-gray-800">
                {order.product_name_snapshot} × {order.quantity}
              </p>
              <p className="text-sm text-gray-500">{order.customer_name}</p>
            </div>
            <StatusBadge status={order.status} />
          </div>

          <select
            value={order.status}
            disabled={updatingId === order.id}
            onChange={(e) => changeStatus(order.id, e.target.value as OrderStatus)}
            className="w-full rounded-xl border border-[#e5d9ee] px-3 py-2 text-sm text-gray-700"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {thaiLabelFor(s)}
              </option>
            ))}
          </select>
        </Card>
      ))}
    </div>
  );
}
