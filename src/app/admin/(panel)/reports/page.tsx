import { FileDown, FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "@/components/admin/print-button";
import { AdminHeader, FilterBar, FilterInput, one, Table, type SP } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { rangeFromParams } from "@/server/queries/admin";
import { formatReportValue, REPORTS } from "@/server/reports";
import { can, requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const staff = await requireStaffPage("reports.view");
  const sp = (await searchParams) as SP;
  const available = Object.entries(REPORTS).filter(([, r]) => can(staff, r.perm));
  const key = one(sp, "report");
  const active = available.find(([k]) => k === key)?.[0] ?? available[0]?.[0];
  const rep = active ? REPORTS[active] : null;
  const from = one(sp, "from");
  const to = one(sp, "to");
  const range = rangeFromParams(from, to, 30);
  const rows = rep ? await rep.load(range) : [];
  const qs = `from=${from ?? ""}&to=${to ?? ""}`;
  const totals = rep?.columns.filter((c) => c.money).map((c) => [c.key, rows.reduce((s, r) => s + Number(r[c.key] ?? 0), 0)] as const) ?? [];

  return (
    <div>
      <AdminHeader title="Reports" description="Choose a report and date range. Export to CSV (opens in Excel), PDF, or print." />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Reports" className="print:hidden">
          <ul className="space-y-0.5">
            {available.map(([k, r]) => (
              <li key={k}>
                <Link href={`/admin/reports?report=${k}&${qs}`} className={cn("block rounded-lg px-3 py-2 text-sm", k === active ? "bg-brand-700 font-semibold text-white" : "hover:bg-white")}>
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {rep && active && (
          <div>
            <div className="print:hidden">
              <FilterBar action="/admin/reports">
                <input type="hidden" name="report" value={active} />
                <FilterInput name="from" label="From" type="date" defaultValue={from ?? range.start.toISOString().slice(0, 10)} />
                <FilterInput name="to" label="To" type="date" defaultValue={to ?? range.end.toISOString().slice(0, 10)} />
              </FilterBar>
            </div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">{rep.title}</h2>
                <p className="text-sm text-muted">
                  {rep.description} · {range.start.toISOString().slice(0, 10)} → {range.end.toISOString().slice(0, 10)} · {rows.length} row(s)
                </p>
              </div>
              {can(staff, "reports.export") && (
                <div className="flex gap-2 print:hidden">
                  <ButtonLink href={`/admin/reports-export/${active}?format=csv&${qs}`} size="sm" variant="outline">
                    <FileSpreadsheet aria-hidden /> CSV / Excel
                  </ButtonLink>
                  <ButtonLink href={`/admin/reports-export/${active}?format=pdf&${qs}`} size="sm" variant="outline">
                    <FileDown aria-hidden /> PDF
                  </ButtonLink>
                  <PrintButton />
                </div>
              )}
            </div>
            {totals.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-3">
                {totals.map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-line bg-white px-4 py-2 text-sm">
                    <span className="text-muted">{rep.columns.find((c) => c.key === k)?.label}: </span>
                    <strong>{formatReportValue(v, true)}</strong>
                  </div>
                ))}
              </div>
            )}
            <Table head={rep.columns.map((c) => c.label)}>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={rep.columns.length} className="py-10 text-center text-muted">
                    No data for this period.
                  </td>
                </tr>
              )}
              {rows.slice(0, 1000).map((r, i) => (
                <tr key={i}>
                  {rep.columns.map((c) => (
                    <td key={c.key} className={c.money ? "whitespace-nowrap text-right font-medium" : ""}>
                      {formatReportValue(r[c.key], c.money)}
                    </td>
                  ))}
                </tr>
              ))}
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
