"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { formatBaht } from "@/lib/format";
import type { ProductRecord } from "@/lib/orders/getActiveProductByName";

interface FormState {
  id?: string;
  name: string;
  unit: string;
  selling_price: string;
  cost_price: string;
  active: boolean;
}

const EMPTY_FORM: FormState = { name: "", unit: "", selling_price: "", cost_price: "", active: true };

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/products?all=true");
    if (res.ok) {
      const data = await res.json();
      setProducts(data.products);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(p: ProductRecord) {
    setForm({
      id: p.id,
      name: p.name,
      unit: p.unit ?? "",
      selling_price: String(p.selling_price),
      cost_price: String(p.cost_price),
      active: p.active,
    });
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      name: form.name,
      unit: form.unit,
      selling_price: Number(form.selling_price),
      cost_price: Number(form.cost_price),
      active: form.active,
    };

    const res = form.id
      ? await fetch(`/api/products/${form.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Something went wrong.");
      setSaving(false);
      return;
    }

    setForm(EMPTY_FORM);
    setSaving(false);
    load();
  }

  async function toggleActive(p: ProductRecord) {
    await fetch(`/api/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[#6b4c86]">Products</h1>

      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <p className="text-sm font-medium text-gray-600">{form.id ? "Edit product" : "New product"}</p>
          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-xl border border-[#e5d9ee] px-3 py-2 text-sm"
            required
          />
          <input
            placeholder="Unit (e.g. bottle, cup)"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            className="rounded-xl border border-[#e5d9ee] px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Selling price"
              value={form.selling_price}
              onChange={(e) => setForm({ ...form, selling_price: e.target.value })}
              className="flex-1 rounded-xl border border-[#e5d9ee] px-3 py-2 text-sm"
              required
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Cost price"
              value={form.cost_price}
              onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
              className="flex-1 rounded-xl border border-[#e5d9ee] px-3 py-2 text-sm"
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Active
          </label>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-[#c9a8e0] text-white py-2 font-medium disabled:opacity-50"
            >
              {saving ? "Saving..." : form.id ? "Save changes" : "Add product"}
            </button>
            {form.id && (
              <button
                type="button"
                onClick={() => setForm(EMPTY_FORM)}
                className="rounded-xl border border-[#e5d9ee] px-4 text-sm text-gray-500"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </Card>

      {loading && <p className="text-center text-gray-400">Loading products...</p>}

      {!loading &&
        products.map((p) => (
          <Card key={p.id} className="flex justify-between items-center">
            <div>
              <p className="font-medium text-gray-800">
                {p.name} {!p.active && <span className="text-xs text-gray-400">(inactive)</span>}
              </p>
              <p className="text-sm text-gray-500">
                {formatBaht(p.selling_price)} sell · {formatBaht(p.cost_price)} cost {p.unit && `· ${p.unit}`}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(p)} className="text-sm text-[#8a63a8] font-medium">
                Edit
              </button>
              <button onClick={() => toggleActive(p)} className="text-sm text-gray-400">
                {p.active ? "Deactivate" : "Activate"}
              </button>
            </div>
          </Card>
        ))}
    </div>
  );
}
