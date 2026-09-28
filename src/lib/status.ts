/** Human labels + badge tones for statuses (shared by storefront and admin). */

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending_payment: { label: "Pending payment", tone: "warning" },
  payment_processing: { label: "Payment processing", tone: "info" },
  payment_confirmed: { label: "Payment confirmed", tone: "success" },
  processing: { label: "Processing", tone: "info" },
  ready_for_collection: { label: "Ready for collection", tone: "brand" },
  ready_for_delivery: { label: "Ready for delivery", tone: "brand" },
  dispatched: { label: "Dispatched", tone: "info" },
  out_for_delivery: { label: "Out for delivery", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  collected: { label: "Collected", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
  refund_requested: { label: "Refund requested", tone: "warning" },
  refunded: { label: "Refunded", tone: "neutral" },
  partially_refunded: { label: "Partially refunded", tone: "neutral" },
};

export const PAYMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "warning" },
  initialized: { label: "Initialized", tone: "info" },
  processing: { label: "Processing", tone: "info" },
  verification_pending: { label: "Payment verification pending", tone: "warning" },
  successful: { label: "Successful", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  abandoned: { label: "Abandoned", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  refund_pending: { label: "Refund pending", tone: "warning" },
  refunded: { label: "Refunded", tone: "neutral" },
  partially_refunded: { label: "Partially refunded", tone: "neutral" },
  verification_failed: { label: "Verification failed", tone: "danger" },
};

export const PAYMENT_METHOD: Record<string, string> = {
  paystack: "Paystack",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  pos_terminal: "POS terminal",
  other: "Other",
};

export const DELIVERY_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "warning" },
  scheduled: { label: "Scheduled", tone: "info" },
  ready_for_collection: { label: "Ready for collection", tone: "brand" },
  dispatched: { label: "Dispatched", tone: "info" },
  out_for_delivery: { label: "Out for delivery", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  collected: { label: "Collected", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

export const TASK_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "neutral" },
  assigned: { label: "Assigned", tone: "info" },
  in_progress: { label: "In progress", tone: "info" },
  submitted: { label: "Submitted", tone: "brand" },
  under_review: { label: "Under review", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  completed: { label: "Completed", tone: "success" },
  overdue: { label: "Overdue", tone: "danger" },
};

export const TICKET_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "warning" },
  assigned: { label: "Assigned", tone: "info" },
  in_progress: { label: "In progress", tone: "info" },
  waiting_for_customer: { label: "Waiting for customer", tone: "brand" },
  resolved: { label: "Resolved", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
};

export const REFUND_STATUS: Record<string, { label: string; tone: Tone }> = {
  requested: { label: "Requested", tone: "warning" },
  approved: { label: "Approved", tone: "info" },
  processing: { label: "Processing", tone: "info" },
  refunded: { label: "Refunded", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  rejected: { label: "Rejected", tone: "neutral" },
};

/** Customer-facing order timeline (spec §108). */
export const TIMELINE_STEPS = [
  { key: "placed", label: "Order placed" },
  { key: "paid", label: "Payment confirmed" },
  { key: "processing", label: "Processing" },
  { key: "ready", label: "Ready for collection / dispatch" },
  { key: "dispatched", label: "Dispatched" },
  { key: "out", label: "Out for delivery" },
  { key: "done", label: "Delivered / collected" },
] as const;

export function timelineIndex(status: string): number {
  switch (status) {
    case "pending_payment":
    case "payment_processing":
      return 0;
    case "payment_confirmed":
      return 1;
    case "processing":
      return 2;
    case "ready_for_collection":
    case "ready_for_delivery":
      return 3;
    case "dispatched":
      return 4;
    case "out_for_delivery":
      return 5;
    case "delivered":
    case "collected":
      return 6;
    default:
      return -1;
  }
}

/** Allowed manual order status transitions for staff. */
export const ORDER_TRANSITIONS: Record<string, string[]> = {
  pending_payment: ["cancelled"],
  payment_processing: ["cancelled"],
  payment_confirmed: ["processing", "ready_for_collection", "ready_for_delivery", "refund_requested"],
  processing: ["ready_for_collection", "ready_for_delivery", "refund_requested"],
  ready_for_collection: ["collected", "processing", "refund_requested"],
  ready_for_delivery: ["dispatched", "processing", "refund_requested"],
  dispatched: ["out_for_delivery", "delivered", "refund_requested"],
  out_for_delivery: ["delivered", "refund_requested"],
  delivered: ["refund_requested"],
  collected: ["refund_requested"],
  refund_requested: ["processing"],
  cancelled: [],
  refunded: [],
  partially_refunded: ["refund_requested"],
};
