"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { annotatePaymentAction, processRefundAction, rejectTransferAction, reverifyPaystackAction, verifyTransferAction } from "@/app/admin/actions/payments";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return {
    pending,
    run: (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
      start(async () => {
        const r = await fn();
        if (!r.ok) return void toast.error(r.error);
        toast.success(r.message ?? "Done");
        after?.();
        router.refresh();
      }),
  };
}

export function TransferVerification({ paymentId, expectedNaira }: { paymentId: string; expectedNaira: string }) {
  const [amount, setAmount] = useState(expectedNaira);
  const [note, setNote] = useState("");
  const [cancel, setCancel] = useState(false);
  const { pending, run } = useRun();
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount confirmed on bank statement (₦)" htmlFor="amt" required hint={`Expected ₦${Number(expectedNaira).toLocaleString("en-NG")}`}>
          <Input id="amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Verification note" htmlFor="vnote" hint="e.g. Seen on Fidelity statement, session ID…">
          <Input id="vnote" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="success" loading={pending} onClick={() => confirm(`Confirm you have seen ₦${Number(amount).toLocaleString("en-NG")} in the bank account? This confirms the order and issues a receipt.`) && run(() => verifyTransferAction(paymentId, amount, note))}>
          Verify payment
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => {
          const msg = prompt("What should the customer clarify or send? (sent to the customer)");
          if (msg) run(() => annotatePaymentAction(paymentId, "clarify", msg));
        }}>
          Request clarification
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => {
          const msg = prompt("Why is this suspicious? (internal note)");
          if (msg) run(() => annotatePaymentAction(paymentId, "suspicious", msg));
        }}>
          Mark as suspicious
        </Button>
      </div>
      <details className="rounded-xl border border-red-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-red-700">Reject this transfer</summary>
        <div className="mt-3 space-y-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="min-h-0" placeholder="Reason (sent to the customer)" aria-label="Rejection reason" />
          <Checkbox id="cancelOrder" checked={cancel} onChange={(e) => setCancel(e.target.checked)} label="Also cancel the order and release stock" />
          <Button variant="danger" size="sm" loading={pending} onClick={() => run(() => rejectTransferAction(paymentId, note, cancel))}>
            Reject transfer
          </Button>
        </div>
      </details>
    </div>
  );
}

export function PaymentAdminTools({ paymentId, reference, isPaystack, canManage, staff, assignedTo, successful }: { paymentId: string; reference: string; isPaystack: boolean; canManage: boolean; staff: { id: string; name: string }[]; assignedTo: string | null; successful: boolean }) {
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState(assignedTo ?? "");
  const { pending, run } = useRun();
  if (!canManage) return null;
  return (
    <div className="space-y-4">
      {isPaystack && (
        <Button variant="outline" size="sm" loading={pending} onClick={() => run(() => reverifyPaystackAction(reference))}>
          Re-verify with Paystack
        </Button>
      )}
      <div className="flex flex-wrap gap-2">
        {successful && (
          <Button size="sm" variant="success" disabled={pending} onClick={() => run(() => annotatePaymentAction(paymentId, "reconcile", note))}>
            Mark reconciled
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => annotatePaymentAction(paymentId, "investigate", note))}>
          Investigate
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => annotatePaymentAction(paymentId, "suspicious", note))}>
          Flag
        </Button>
      </div>
      <div className="flex gap-2">
        <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assign staff" className="h-10">
          <option value="">Unassigned</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="secondary" className="h-10" disabled={pending} onClick={() => run(() => annotatePaymentAction(paymentId, "assign", undefined, assignee))}>
          Assign
        </Button>
      </div>
      <div className="space-y-2">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="min-h-0" placeholder="Internal note" aria-label="Payment note" />
        <Button size="sm" variant="ghost" disabled={pending || !note.trim()} onClick={() => run(() => annotatePaymentAction(paymentId, "note", note), () => setNote(""))}>
          Add note
        </Button>
      </div>
    </div>
  );
}

export function RefundDecision({ refundId, method }: { refundId: string; method: string }) {
  const { pending, run } = useRun();
  return (
    <div className="flex gap-1.5">
      <Button
        size="sm"
        variant="success"
        loading={pending}
        onClick={() => confirm(method === "paystack" ? "Approve and send this refund through Paystack now?" : "Approve this refund? Confirm the money has been / will be paid out manually.") && run(() => processRefundAction(refundId, "approve"))}
      >
        Approve
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => {
        const n = prompt("Reason for rejecting this refund?");
        if (n) run(() => processRefundAction(refundId, "reject", n));
      }}>
        Reject
      </Button>
    </div>
  );
}
