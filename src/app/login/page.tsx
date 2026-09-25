"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      if (!res.ok) {
        setError("Incorrect PIN. Please try again.");
        setLoading(false);
        return;
      }

      router.replace("/today");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#faf7fb] px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-6 flex flex-col gap-4"
      >
        <h1 className="text-lg font-semibold text-center text-[#6b4c86]">Staff Login</h1>

        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Enter PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="w-full rounded-xl border border-[#e5d9ee] px-4 py-3 text-center text-xl tracking-widest focus:outline-none focus:ring-2 focus:ring-[#c9a8e0]"
          autoFocus
        />

        {error && <p className="text-sm text-red-500 text-center">{error}</p>}

        <button
          type="submit"
          disabled={loading || pin.length === 0}
          className="w-full rounded-xl bg-[#c9a8e0] text-white py-3 font-medium disabled:opacity-50"
        >
          {loading ? "Checking..." : "Log In"}
        </button>
      </form>
    </main>
  );
}
