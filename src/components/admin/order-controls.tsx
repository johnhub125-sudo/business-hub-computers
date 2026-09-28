"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addOrderNoteAction, adminRequestRefundAction, changeOrderStatusAction, resendReceiptAction, updateDeliveryAction } from "@/app/admin/actions/orders";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { ORDER_STATUS } from "@/lib/status";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Done");
      after?.();
      router.refresh();
    });
  return { pending, run };
}

export function StatusControl({ orderId, allowed }: { orderId: string; allowed: string[] }) {
  const [to, setTo] = useState(allowed[0] ?? "");
  const [note, setNote] = useState("");
  const { pending, run } = useRun();
  if (!allowed.length) return <p className="text-sm text-muted">No further status changes are available for this order.</p>;
  return (
    <div className="space-y-3">
      <Field label="Move order to" htmlFor="to">
        <Select id="to" value={to} onChange={(e) => setTo(e.target.value)}>
          {allowed.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS[s]?.label ?? s}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Note to customer (optional)" htmlFor="snote">
        <Textarea id="snote" rows={2} className="min-h-0" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </Field>
      <Button
        loading={pending}
        variant={to === "cancelled" ? "danger" : "primary"}
        onClick={() => {
          if (to === "cancelled" && !confirm("Cancel this order and release reserved stock?")) return;
          run(() => changeOrderStatusAction(orderId, to, note), () => setNote(""));
        }}
      >
        Update status
      </Button>
      <p className="text-xs text-muted">The customer is notified by email{`, WhatsApp (if configured)`} and in their account.</p>
    </div>
  );
}

export function DeliveryControl({ orderId, initial, staff }: { orderId: string; initial: { carrier: string; agentName: string; agentPhone: string; scheduledDate: string; location: string; instructions: string; assignedTo: string }; staff: { id: string; name: string }[] }) {
  const [d, setD] = useState(initial);
  const [notifyCustomer, setNotify] = useState(true);
  const { pending, run } = useRun();
  const set = (k: keyof typeof d, v: string) => setD((x) => ({ ...x, [k]: v }));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Carrier / motor park" htmlFor="carrier">
        <Input id="carrier" value={d.carrier} onChange={(e) => set("carrier", e.target.value)} placeholder="e.g. GIG Logistics, Iwo Road Park" />
      </Field>
      <Field label="Expected date" htmlFor="sdate">
        <Input id="sdate" type="date" value={d.scheduledDate} onChange={(e) => set("scheduledDate", e.target.value)} />
      </Field>
      <Field label="Agent name" htmlFor="agent">
        <Input id="agent" value={d.agentName} onChange={(e) => set("agentName", e.target.value)} />
      </Field>
      <Field label="Agent phone" htmlFor="aphone">
        <Input id="aphone" value={d.agentPhone} onChange={(e) => set("agentPhone", e.target.value)} />
      </Field>
      <Field label="Collection / delivery location" htmlFor="loc" className="sm:col-span-2">
        <Input id="loc" value={d.location} onChange={(e) => set("location", e.target.value)} />
      </Field>
      <Field label="Instructions" htmlFor="instr" className="sm:col-span-2">
        <Textarea id="instr" rows={2} className="min-h-0" value={d.instructions} onChange={(e) => set("instructions", e.target.value)} />
      </Field>
      <Field label="Assigned staff" htmlFor="assign">
        <Select id="assign" value={d.assignedTo} onChange={(e) => set("assignedTo", e.target.value)}>
          <option value="">Unassigned</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Checkbox id="notifyCust" checked={notifyCustomer} onChange={(e) => setNotify(e.target.checked)} label="Notify customer" className="self-end pb-3" />
      <div className="sm:col-span-2">
        <Button loading={pending} onClick={() => run(() => updateDeliveryAction(orderId, { ...d, notifyCustomer }))}>
          Save delivery details
        </Button>
      </div>
    </div>
  );
}

export function NoteControl({ orderId }: { orderId: string }) {
  const [note, setNote] = useState("");
  const [visible, setVisible] = useState(false);
  const { pending, run } = useRun();
  return (
    <div className="space-y-2">
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="min-h-0" placeholder="Add a note…" aria-label="Order note" />
      <div className="flex items-center justify-between gap-2">
        <Checkbox id="visible" checked={visible} onChange={(e) => setVisible(e.target.checked)} label="Visible to customer" />
        <Button size="sm" loading={pending} disabled={note.trim().length < 2} onClick={() => run(() => addOrderNoteAction(orderId, note, visible), () => setNote(""))}>
          Add note
        </Button>
      </div>
    </div>
  );
}

export function ReceiptControl({ orderId }: { orderId: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="outline" loading={pending} onClick={() => run(() => resendReceiptAction(orderId))}>
      Email receipt again
    </Button>
  );
}

export function RefundControl({ orderId, max }: { orderId: string; max: number }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(max / 100));
  const [reason, setReason] = useState("");
  const { pending, run } = useRun();
  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Request refund
      </Button>
    );
  return (
    <div className="space-y-2 rounded-xl bg-surface p-3">
      <Field label="Amount (₦)" htmlFor="ramt">
        <Input id="ramt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Reason" htmlFor="rreason">
        <Textarea id="rreason" rows={2} className="min-h-0" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button size="sm" loading={pending} onClick={() => run(() => adminRequestRefundAction(orderId, amount, reason), () => setOpen(false))}>
          Submit for approval
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
