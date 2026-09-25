import { thaiLabelFor, type OrderStatus } from "@/lib/orders/status";

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: "bg-[#f3e8fb] text-[#8a63a8]",
  making: "bg-[#fdeef4] text-[#c47ea0]",
  done: "bg-[#e6f7ed] text-[#3f9d5f]",
  cancelled: "bg-[#f5f5f5] text-[#999999]",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {thaiLabelFor(status)}
    </span>
  );
}
