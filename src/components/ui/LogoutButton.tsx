"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="w-full rounded-xl border border-[#e5d9ee] text-[#6b4c86] py-3 font-medium disabled:opacity-50"
    >
      {loading ? "Logging out..." : "Log Out"}
    </button>
  );
}
