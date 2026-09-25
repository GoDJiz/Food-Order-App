import type { ReactNode } from "react";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/today", label: "Today" },
  { href: "/orders", label: "Orders" },
  { href: "/products", label: "Products" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#faf7fb] pb-20 md:pb-6">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-[#f0e6f5] px-4 py-3">
        <nav className="hidden md:flex gap-6 max-w-3xl mx-auto">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-[#6b4c86] hover:text-[#8a63a8]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <span className="md:hidden text-sm font-semibold text-[#6b4c86]">Food Orders</span>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#f0e6f5] flex justify-around py-2">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="text-xs text-[#6b4c86] flex flex-col items-center px-2 py-1"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
