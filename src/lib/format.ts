export function formatBaht(amount: number): string {
  return `฿${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}
