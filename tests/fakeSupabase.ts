// A minimal fake that implements just the surface our code touches:
// .from(table).insert/update/select/eq/ilike/neq/maybeSingle/single, and .rpc().
// This lets us unit-test business logic without a real Supabase project or
// installing @supabase/supabase-js (network is unavailable in this sandbox).

type Row = Record<string, any>;

export class FakeSupabase {
  tables: Record<string, Row[]> = {
    products: [],
    orders: [],
    line_events: [],
    order_number_counters: [],
    pending_product_confirmations: [],
  };

  from(table: string) {
    return new FakeQueryBuilder(this, table);
  }

  async rpc(fnName: string, args: Record<string, any>) {
    if (fnName === "next_order_seq") {
      const businessDate = args.p_business_date as string;
      const counters = this.tables.order_number_counters;
      let row = counters.find((r) => r.business_date === businessDate);
      if (!row) {
        row = { business_date: businessDate, last_seq: 0 };
        counters.push(row);
      }
      row.last_seq += 1;
      return { data: row.last_seq, error: null };
    }
    return { data: null, error: { message: `Unknown RPC ${fnName}` } };
  }
}

class FakeQueryBuilder {
  private filters: Array<(row: Row) => boolean> = [];
  private insertRows: Row[] | null = null;
  private updateValues: Row | null = null;
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private countMode = false;

  constructor(private db: FakeSupabase, private table: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.count) {
      this.countMode = true;
    }
    return this;
  }

  eq(col: string, val: any) {
    this.filters.push((row) => row[col] === val);
    return this;
  }

  neq(col: string, val: any) {
    this.filters.push((row) => row[col] !== val);
    return this;
  }

  in(col: string, vals: any[]) {
    this.filters.push((row) => vals.includes(row[col]));
    return this;
  }

  is(col: string, val: null) {
    this.filters.push((row) => (row[col] ?? null) === val);
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  order(_col: string, _opts?: any) {
    return this;
  }

  ilike(col: string, val: string) {
    const target = String(val).toLowerCase();
    this.filters.push((row) => String(row[col]).toLowerCase() === target);
    return this;
  }

  insert(rows: Row | Row[]) {
    this.mode = "insert";
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(values: Row) {
    this.mode = "update";
    this.updateValues = values;
    return this;
  }

  private matching(): Row[] {
    return this.db.tables[this.table].filter((row) =>
      this.filters.every((f) => f(row))
    );
  }

  async maybeSingle() {
    if (this.mode === "update" && this.updateValues) {
      const rows = this.matching();
      rows.forEach((row) => Object.assign(row, this.updateValues));
      return { data: rows[0] ?? null, error: null };
    }
    if (this.mode === "delete") {
      const rows = this.matching();
      this.db.tables[this.table] = this.db.tables[this.table].filter((row) => !rows.includes(row));
      return { data: rows[0] ?? null, error: null };
    }
    const rows = this.matching();
    return { data: rows[0] ?? null, error: null };
  }

  async single() {
    if (this.mode === "insert" && this.insertRows) {
      // Enforce simple unique constraints we rely on in tests: order_number, event_id, product name
      for (const row of this.insertRows) {
        if (this.table === "orders" && row.order_number) {
          const dup = this.db.tables.orders.find((r) => r.order_number === row.order_number);
          if (dup) return { data: null, error: { code: "23505", message: "duplicate order_number" } };
        }
        if (this.table === "products" && row.name) {
          const dup = this.db.tables.products.find(
            (r) => String(r.name).toLowerCase() === String(row.name).toLowerCase()
          );
          if (dup) return { data: null, error: { code: "23505", message: "duplicate product name" } };
        }
        const withId = { id: `id-${this.db.tables[this.table].length + 1}`, ...row };
        this.db.tables[this.table].push(withId);
      }
      return { data: this.db.tables[this.table][this.db.tables[this.table].length - 1], error: null };
    }
    const rows = this.matching();
    return { data: rows[0] ?? null, error: null };
  }

  // insert(...).then / used when caller does not chain .select()
  then(resolve: (v: any) => void, reject?: (e: any) => void) {
    if (this.mode === "insert" && this.insertRows) {
      for (const row of this.insertRows) {
        if (this.table === "line_events" && row.event_id) {
          const dup = this.db.tables.line_events.find((r) => r.event_id === row.event_id);
          if (dup) {
            resolve({ data: null, error: { code: "23505", message: "duplicate event_id" } });
            return;
          }
        }
        this.db.tables[this.table].push({ id: `id-${this.db.tables[this.table].length + 1}`, ...row });
      }
      resolve({ data: null, error: null });
      return;
    }
    if (this.countMode) {
      resolve({ data: null, error: null, count: this.matching().length });
      return;
    }
    if (this.mode === "delete") {
      const rows = this.matching();
      this.db.tables[this.table] = this.db.tables[this.table].filter((row) => !rows.includes(row));
      resolve({ data: null, error: null });
      return;
    }
    resolve({ data: this.matching(), error: null });
  }
}
