"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { markMessageAction, staffReplyAction, updateTicketAction } from "@/app/admin/actions/support";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/form";
import { TICKET_STATUS } from "@/lib/status";

export function TicketReply({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Reply to the customer (emailed and shown in their account)" aria-label="Reply" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Checkbox id="waiting" checked={waiting} onChange={(e) => setWaiting(e.target.checked)} label="Set to “waiting for customer”" />
        <Button
          loading={pending}
          disabled={body.trim().length < 2}
          onClick={() =>
            start(async () => {
              const r = await staffReplyAction(ticketId, body, waiting);
              if (!r.ok) return void toast.error(r.error);
              toast.success(r.message);
              setBody("");
              router.refresh();
            })
          }
        >
          Send reply
        </Button>
      </div>
    </div>
  );
}

export function TicketSettings({ ticketId, status, priority, assignedTo, resolution, staff }: { ticketId: string; status: string; priority: string; assignedTo: string | null; resolution: string | null; staff: { id: string; name: string }[] }) {
  const router = useRouter();
  const [s, setS] = useState(status);
  const [p, setP] = useState(priority);
  const [a, setA] = useState(assignedTo ?? "");
  const [res, setRes] = useState(resolution ?? "");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <Field label="Status" htmlFor="ts">
        <Select id="ts" value={s} onChange={(e) => setS(e.target.value)}>
          {Object.entries(TICKET_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Priority" htmlFor="tp">
        <Select id="tp" value={p} onChange={(e) => setP(e.target.value)}>
          {["low", "medium", "high", "urgent"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </Select>
      </Field>
      <Field label="Assigned staff" htmlFor="ta">
        <Select id="ta" value={a} onChange={(e) => setA(e.target.value)}>
          <option value="">Unassigned</option>
          {staff.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Resolution" htmlFor="tr" hint="Required to resolve or close">
        <Textarea id="tr" rows={3} value={res} onChange={(e) => setRes(e.target.value)} />
      </Field>
      <Button
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await updateTicketAction(ticketId, { status: s, priority: p, assignedTo: a, resolution: res || undefined });
            if (!r.ok) return void toast.error(r.error);
            toast.success(r.message);
            router.refresh();
          })
        }
      >
        Save
      </Button>
    </div>
  );
}

export function MessageActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (s: "read" | "replied" | "archived") =>
    start(async () => {
      await markMessageAction(id, s);
      router.refresh();
    });
  return (
    <div className="flex gap-1">
      {status === "new" && (
        <button disabled={pending} onClick={() => set("read")} className="rounded px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50">
          Mark read
        </button>
      )}
      {status !== "replied" && (
        <button disabled={pending} onClick={() => set("replied")} className="rounded px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
          Replied
        </button>
      )}
      {status !== "archived" && (
        <button disabled={pending} onClick={() => set("archived")} className="rounded px-2 py-1 text-xs text-muted hover:bg-surface">
          Archive
        </button>
      )}
    </div>
  );
}
