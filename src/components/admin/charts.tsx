"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const NAVY = "#1B2A7B";
const RED = "#D62828";
const tick = { fontSize: 11, fill: "#5b6477" };
const shortDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
const compact = (kobo: number) => `₦${Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(kobo / 100)}`;

export function RevenueChart({ data }: { data: { day: string; revenue: number; orders: number }[] }) {
  return (
    <div className="h-72" role="img" aria-label="Daily revenue chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={NAVY} stopOpacity={0.3} />
              <stop offset="100%" stopColor={NAVY} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e6e9f2" vertical={false} />
          <XAxis dataKey="day" tickFormatter={shortDay} tick={tick} minTickGap={24} />
          <YAxis tickFormatter={compact} tick={tick} width={64} />
          <Tooltip formatter={(v, n) => (n === "revenue" ? [naira(Number(v)), "Revenue"] : [v, "Orders"])} labelFormatter={(l) => shortDay(String(l))} />
          <Area type="monotone" dataKey="revenue" stroke={NAVY} strokeWidth={2} fill="url(#rev)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PaymentsChart({ data }: { data: { day: string; successful: number; failed: number; pending: number; abandoned: number }[] }) {
  return (
    <div className="h-64" role="img" aria-label="Payments by status chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e6e9f2" vertical={false} />
          <XAxis dataKey="day" tickFormatter={shortDay} tick={tick} minTickGap={24} />
          <YAxis allowDecimals={false} tick={tick} />
          <Tooltip labelFormatter={(l) => shortDay(String(l))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="successful" stackId="a" fill="#059669" name="Successful" />
          <Bar dataKey="pending" stackId="a" fill="#f59e0b" name="Pending" />
          <Bar dataKey="failed" stackId="a" fill={RED} name="Failed" />
          <Bar dataKey="abandoned" stackId="a" fill="#94a3b8" name="Abandoned" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function InventoryChart({ data }: { data: { day: string; sold: number; received: number; adjusted: number }[] }) {
  return (
    <div className="h-64" role="img" aria-label="Inventory movement chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e6e9f2" vertical={false} />
          <XAxis dataKey="day" tickFormatter={shortDay} tick={tick} minTickGap={24} />
          <YAxis allowDecimals={false} tick={tick} />
          <Tooltip labelFormatter={(l) => shortDay(String(l))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="sold" stroke={RED} strokeWidth={2} dot={false} name="Units sold" />
          <Line type="monotone" dataKey="received" stroke={NAVY} strokeWidth={2} dot={false} name="Units received" />
          <Line type="monotone" dataKey="adjusted" stroke="#94a3b8" strokeWidth={1.5} dot={false} name="Adjustments" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleBars({ data, valueKey, labelKey, money }: { data: Record<string, string | number>[]; valueKey: string; labelKey: string; money?: boolean }) {
  return (
    <div className="h-64" role="img" aria-label="Bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e6e9f2" horizontal={false} />
          <XAxis type="number" tick={tick} tickFormatter={(v) => (money ? compact(Number(v)) : String(v))} />
          <YAxis type="category" dataKey={labelKey} tick={tick} width={120} />
          <Tooltip formatter={(v) => (money ? naira(Number(v)) : v)} />
          <Bar dataKey={valueKey} fill={NAVY} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GrowthChart({ data }: { data: { day: string; n: number }[] }) {
  return (
    <div className="h-56" role="img" aria-label="New customers chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e6e9f2" vertical={false} />
          <XAxis dataKey="day" tickFormatter={shortDay} tick={tick} minTickGap={24} />
          <YAxis allowDecimals={false} tick={tick} />
          <Tooltip labelFormatter={(l) => shortDay(String(l))} formatter={(v) => [v, "New customers"]} />
          <Bar dataKey="n" fill={RED} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
