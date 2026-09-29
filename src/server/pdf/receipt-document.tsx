import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { POWERED_BY_LINE } from "@/lib/brand";
import type { ReceiptData } from "../services/receipts";

const NAVY = "#1B2A7B";
const RED = "#D62828";

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, fontFamily: "Helvetica", color: "#1f2937" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 3, borderBottomColor: RED, paddingBottom: 12 },
  logo: { width: 170, height: 45, objectFit: "contain" },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", color: NAVY, textAlign: "right" },
  muted: { color: "#6b7280" },
  bold: { fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row" },
  box: { flex: 1, padding: 10, backgroundColor: "#f5f7fc", borderRadius: 6 },
  label: { fontSize: 8, color: "#6b7280", textTransform: "uppercase", marginBottom: 3, letterSpacing: 0.5 },
  th: { flexDirection: "row", backgroundColor: NAVY, color: "white", paddingVertical: 6, paddingHorizontal: 6, fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  tr: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb" },
  totals: { marginTop: 10, marginLeft: "auto", width: 230 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grand: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, marginTop: 4, borderTopWidth: 1.5, borderTopColor: NAVY, fontFamily: "Helvetica-Bold", fontSize: 12, color: NAVY },
  footer: { position: "absolute", bottom: 28, left: 36, right: 36, textAlign: "center", fontSize: 8, color: "#6b7280", borderTopWidth: 0.5, borderTopColor: "#e5e7eb", paddingTop: 8 },
  stamp: { marginTop: 14, alignSelf: "flex-start", borderWidth: 1.5, borderColor: "#059669", color: "#059669", paddingVertical: 4, paddingHorizontal: 10, fontFamily: "Helvetica-Bold", fontSize: 11, borderRadius: 4 },
});

// Built-in PDF fonts lack the ₦ glyph, so amounts use "NGN".
const money = (kobo: number) => `NGN ${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(new Date(d)) : "—");

export function ReceiptDocument({ data, logo }: { data: ReceiptData; logo: Buffer | null }) {
  const cols = [
    { k: "Product", w: "38%" },
    { k: "SKU", w: "16%" },
    { k: "Qty", w: "7%", r: true },
    { k: "Unit price", w: "14%", r: true },
    { k: "Discount", w: "11%", r: true },
    { k: "Total", w: "14%", r: true },
  ];
  return (
    <Document title={`Receipt ${data.receiptNumber}`} author={data.company.name} subject={`Order ${data.order.number}`}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            {/* react-pdf Image has no alt attribute (PDF output) */}
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {logo ? <Image src={logo} style={s.logo} /> : <Text style={[s.bold, { fontSize: 16, color: NAVY }]}>{data.company.name}</Text>}
            <Text style={[s.muted, { marginTop: 6, maxWidth: 260 }]}>{data.company.address}</Text>
            <Text style={s.muted}>
              {data.company.phone} · {data.company.email}
            </Text>
            <Text style={s.muted}>{data.company.rc}</Text>
          </View>
          <View>
            <Text style={s.h1}>RECEIPT</Text>
            <Text style={{ textAlign: "right", marginTop: 4 }}>
              <Text style={s.muted}>Receipt no: </Text>
              <Text style={s.bold}>{data.receiptNumber}</Text>
            </Text>
            <Text style={{ textAlign: "right" }}>
              <Text style={s.muted}>Date: </Text>
              {date(data.issuedAt)}
            </Text>
            <Text style={{ textAlign: "right" }}>
              <Text style={s.muted}>Order no: </Text>
              <Text style={s.bold}>{data.order.number}</Text>
            </Text>
            {data.order.tracking && (
              <Text style={{ textAlign: "right" }}>
                <Text style={s.muted}>Tracking no: </Text>
                {data.order.tracking}
              </Text>
            )}
          </View>
        </View>

        <View style={[s.row, { gap: 10, marginTop: 14 }]}>
          <View style={s.box}>
            <Text style={s.label}>Billed to</Text>
            <Text style={s.bold}>{data.order.customerName}</Text>
            <Text>{data.order.customerEmail}</Text>
            <Text>{data.order.customerPhone}</Text>
            {data.order.address ? <Text style={s.muted}>{data.order.address}</Text> : null}
          </View>
          <View style={s.box}>
            <Text style={s.label}>Payment</Text>
            <Text>
              <Text style={s.muted}>Method: </Text>
              {data.payment.method}
            </Text>
            <Text>
              <Text style={s.muted}>Reference: </Text>
              {data.payment.reference}
            </Text>
            <Text>
              <Text style={s.muted}>Status: </Text>
              <Text style={s.bold}>{data.payment.status}</Text>
            </Text>
            <Text>
              <Text style={s.muted}>Paid: </Text>
              {date(data.payment.paidAt)}
            </Text>
            <Text>
              <Text style={s.muted}>Fulfilment: </Text>
              {data.order.fulfilment}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 16 }}>
          <View style={s.th}>
            {cols.map((c) => (
              <Text key={c.k} style={{ width: c.w, textAlign: c.r ? "right" : "left" }}>
                {c.k}
              </Text>
            ))}
          </View>
          {data.items.map((it, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <View style={{ width: "38%" }}>
                <Text style={s.bold}>{it.name}</Text>
                {it.variant ? <Text style={s.muted}>{it.variant}</Text> : null}
                {data.showWarranty && it.warranty ? <Text style={[s.muted, { fontSize: 7.5 }]}>Warranty: {it.warranty}</Text> : null}
              </View>
              <Text style={{ width: "16%" }}>{it.sku}</Text>
              <Text style={{ width: "7%", textAlign: "right" }}>{it.quantity}</Text>
              <Text style={{ width: "14%", textAlign: "right" }}>{money(it.unitPrice)}</Text>
              <Text style={{ width: "11%", textAlign: "right" }}>{it.discount ? `-${money(it.discount)}` : "—"}</Text>
              <Text style={{ width: "14%", textAlign: "right" }}>{money(it.lineTotal)}</Text>
            </View>
          ))}
        </View>

        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text style={s.muted}>Subtotal</Text>
            <Text>{money(data.order.subtotal)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.muted}>Discount</Text>
            <Text>-{money(data.order.discountTotal)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.muted}>VAT ({data.order.vatRateBps / 100}%)</Text>
            <Text>{money(data.order.vatAmount)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.muted}>Logistics</Text>
            <Text>{money(data.order.logisticsFee)}</Text>
          </View>
          <View style={s.grand}>
            <Text>Grand total</Text>
            <Text>{money(data.order.grandTotal)}</Text>
          </View>
        </View>

        {data.payment.status === "Successful" && <Text style={s.stamp}>PAID</Text>}
        <Text style={{ marginTop: 18, color: "#374151" }}>{data.footer}</Text>

        <View style={s.footer} fixed>
          <Text>
            {data.company.name} — {data.company.tagline}
          </Text>
          <Text style={{ marginTop: 2 }}>{POWERED_BY_LINE}</Text>
        </View>
      </Page>
    </Document>
  );
}
