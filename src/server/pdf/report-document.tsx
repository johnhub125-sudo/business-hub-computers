import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 8.5, fontFamily: "Helvetica", color: "#1f2937" },
  h1: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#1B2A7B" },
  meta: { color: "#6b7280", marginTop: 3, marginBottom: 12 },
  th: { flexDirection: "row", backgroundColor: "#1B2A7B", color: "white", fontFamily: "Helvetica-Bold", paddingVertical: 5 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb", paddingVertical: 4 },
  cell: { flex: 1, paddingHorizontal: 4 },
  footer: { position: "absolute", bottom: 16, left: 28, right: 28, fontSize: 7.5, color: "#6b7280", textAlign: "center" },
});

/** Generic tabular report PDF (amounts shown as NGN — built-in PDF fonts lack the ₦ glyph). */
export function ReportDocument({ title, subtitle, columns, rows }: { title: string; subtitle: string; columns: { key: string; label: string; money?: boolean }[]; rows: Record<string, unknown>[] }) {
  const fmt = (v: unknown, money?: boolean) => (v == null ? "" : money ? `NGN ${(Number(v) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : String(v));
  return (
    <Document title={title}>
      <Page size="A4" orientation={columns.length > 5 ? "landscape" : "portrait"} style={s.page}>
        <Text style={s.h1}>{title}</Text>
        <Text style={s.meta}>{subtitle}</Text>
        <View style={s.th} fixed>
          {columns.map((c) => (
            <Text key={c.key} style={[s.cell, c.money ? { textAlign: "right" } : {}]}>
              {c.label}
            </Text>
          ))}
        </View>
        {rows.map((r, i) => (
          <View key={i} style={s.tr} wrap={false}>
            {columns.map((c) => (
              <Text key={c.key} style={[s.cell, c.money ? { textAlign: "right" } : {}]}>
                {fmt(r[c.key], c.money)}
              </Text>
            ))}
          </View>
        ))}
        {rows.length === 0 && <Text style={{ marginTop: 12 }}>No data for this period.</Text>}
        <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `Business Hub Computers · Powered by Fodan Softnet Inc. · Page ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>
  );
}
