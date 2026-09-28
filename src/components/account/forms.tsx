"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  archiveNotificationAction,
  createTicketAction,
  deleteAddressAction,
  markNotificationsReadAction,
  replyTicketAction,
  requestAccountDeletionAction,
  saveAddressAction,
  updateProfileAction,
} from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, FormSuccess, Input, Select, Textarea } from "@/components/ui/form";
import { NIGERIAN_STATES } from "@/lib/brand";

type Profile = { surname: string; firstName: string; middleName: string | null; phone: string; whatsapp: string | null; address: string; state: string; city: string; marketingOptIn: boolean };

function StateSelect({ id, defaultValue }: { id: string; defaultValue?: string }) {
  return (
    <Select id={id} name="state" defaultValue={defaultValue ?? ""} required>
      <option value="" disabled>
        Select state
      </option>
      {NIGERIAN_STATES.map((s) => (
        <option key={s}>{s}</option>
      ))}
    </Select>
  );
}

export function ProfileForm({ profile, email }: { profile: Profile | null; email: string }) {
  const [state, action, pending] = useActionState(updateProfileAction, null);
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-3">
      <div className="sm:col-span-3">
        <FormError message={state && !state.ok ? state.error : null} />
        <FormSuccess message={state?.ok ? state.message : null} />
      </div>
      <Field label="Surname" htmlFor="surname" required error={fe.surname}>
        <Input id="surname" name="surname" defaultValue={profile?.surname} required />
      </Field>
      <Field label="First name" htmlFor="firstName" required error={fe.firstName}>
        <Input id="firstName" name="firstName" defaultValue={profile?.firstName} required />
      </Field>
      <Field label="Middle name" htmlFor="middleName">
        <Input id="middleName" name="middleName" defaultValue={profile?.middleName ?? ""} />
      </Field>
      <Field label="Email" htmlFor="email" hint="Contact support to change your login email" className="sm:col-span-3">
        <Input id="email" value={email} disabled readOnly />
      </Field>
      <Field label="Phone" htmlFor="phone" required error={fe.phone}>
        <Input id="phone" name="phone" type="tel" defaultValue={profile?.phone} required />
      </Field>
      <Field label="WhatsApp" htmlFor="whatsapp" error={fe.whatsapp}>
        <Input id="whatsapp" name="whatsapp" type="tel" defaultValue={profile?.whatsapp ?? ""} />
      </Field>
      <div />
      <Field label="Full address" htmlFor="address" required error={fe.address} className="sm:col-span-3">
        <Textarea id="address" name="address" rows={2} className="min-h-0" defaultValue={profile?.address} required />
      </Field>
      <Field label="State" htmlFor="state" required>
        <StateSelect id="state" defaultValue={profile?.state} />
      </Field>
      <Field label="Capital / City" htmlFor="city" required error={fe.city}>
        <Input id="city" name="city" defaultValue={profile?.city} required />
      </Field>
      <Checkbox id="marketingOptIn" name="marketingOptIn" defaultChecked={profile?.marketingOptIn} label="Email me deals and new arrivals" className="self-end sm:col-span-3" />
      <div className="sm:col-span-3">
        <Button type="submit" loading={pending}>
          Save profile
        </Button>
      </div>
    </form>
  );
}

type Address = { id: string; label: string; fullName: string; phone: string; line1: string; landmark: string | null; city: string; state: string; isDefault: boolean };

export function AddressManager({ list }: { list: Address[] }) {
  const [editing, setEditing] = useState<Address | "new" | null>(list.length ? null : "new");
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => {
    const r = await saveAddressAction(prev, fd);
    if (r.ok) setEditing(null);
    return r;
  }, null);
  const [busy, start] = useTransition();
  const current = editing && editing !== "new" ? editing : null;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((a) => (
          <div key={a.id} className="rounded-2xl border border-line bg-white p-4 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-bold">
                {a.label} {a.isDefault && <span className="ml-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">Default</span>}
              </p>
              <div className="flex gap-1">
                <button onClick={() => setEditing(a)} className="rounded-lg p-1.5 hover:bg-surface" aria-label={`Edit ${a.label}`}>
                  <Pencil className="size-4" />
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    confirm("Delete this address?") &&
                    start(async () => {
                      const r = await deleteAddressAction(a.id);
                      if (!r.ok) toast.error(r.error);
                    })
                  }
                  className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                  aria-label={`Delete ${a.label}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
            <p className="mt-1">{a.fullName}</p>
            <p className="text-muted">
              {a.line1}
              {a.landmark ? ` (near ${a.landmark})` : ""}, {a.city}, {a.state}
            </p>
            <p className="text-muted">{a.phone}</p>
          </div>
        ))}
      </div>
      {editing ? (
        <form key={current?.id ?? "new"} action={action} className="grid gap-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-2">
          <h2 className="font-bold sm:col-span-2">{current ? "Edit address" : "Add a new address"}</h2>
          <div className="sm:col-span-2">
            <FormError message={state && !state.ok ? state.error : null} />
          </div>
          <input type="hidden" name="id" value={current?.id ?? ""} />
          <Field label="Label" htmlFor="label" required>
            <Input id="label" name="label" defaultValue={current?.label ?? "Home"} required />
          </Field>
          <Field label="Recipient name" htmlFor="fullName" required>
            <Input id="fullName" name="fullName" defaultValue={current?.fullName} required />
          </Field>
          <Field label="Phone" htmlFor="aphone" required>
            <Input id="aphone" name="phone" type="tel" defaultValue={current?.phone} required />
          </Field>
          <Field label="Landmark" htmlFor="landmark">
            <Input id="landmark" name="landmark" defaultValue={current?.landmark ?? ""} />
          </Field>
          <Field label="Detailed address" htmlFor="line1" required className="sm:col-span-2">
            <Input id="line1" name="line1" defaultValue={current?.line1} required />
          </Field>
          <Field label="State" htmlFor="astate" required>
            <StateSelect id="astate" defaultValue={current?.state} />
          </Field>
          <Field label="City" htmlFor="acity" required>
            <Input id="acity" name="city" defaultValue={current?.city} required />
          </Field>
          <Checkbox id="isDefault" name="isDefault" defaultChecked={current?.isDefault} label="Make this my default address" className="sm:col-span-2" />
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" loading={pending}>
              Save address
            </Button>
            {list.length > 0 && (
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      ) : (
        <Button variant="outline" onClick={() => setEditing("new")}>
          + Add address
        </Button>
      )}
    </div>
  );
}

export function NewTicketForm({ orders, defaultOrder }: { orders: { id: string; orderNumber: string }[]; defaultOrder?: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => {
    const r = await createTicketAction(prev, fd);
    if (r.ok) router.push(`/account/support/${r.data.id}`);
    return r;
  }, null);
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormError message={state && !state.ok ? state.error : null} />
      </div>
      <Field label="Subject" htmlFor="subject" required error={fe.subject} className="sm:col-span-2">
        <Input id="subject" name="subject" required maxLength={140} />
      </Field>
      <Field label="Related order" htmlFor="orderId">
        <Select id="orderId" name="orderId" defaultValue={defaultOrder ?? ""}>
          <option value="">None</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.orderNumber}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Priority" htmlFor="priority">
        <Select id="priority" name="priority" defaultValue="medium">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </Select>
      </Field>
      <Field label="How can we help?" htmlFor="message" required error={fe.message} className="sm:col-span-2">
        <Textarea id="message" name="message" required minLength={10} maxLength={4000} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending}>
          Submit ticket
        </Button>
      </div>
    </form>
  );
}

export function TicketReplyForm({ ticketId }: { ticketId: string }) {
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set("body", body);
        start(async () => {
          const r = await replyTicketAction(ticketId, fd);
          if (!r.ok) return void toast.error(r.fieldErrors?._ ?? r.error);
          setBody("");
        });
      }}
      className="space-y-2"
    >
      <label htmlFor="reply" className="text-sm font-medium">
        Reply
      </label>
      <Textarea id="reply" value={body} onChange={(e) => setBody(e.target.value)} required minLength={2} maxLength={4000} />
      <Button type="submit" loading={pending}>
        Send reply
      </Button>
    </form>
  );
}

export function NotificationActions({ id }: { id?: string }) {
  const [pending, start] = useTransition();
  if (!id)
    return (
      <Button variant="outline" size="sm" loading={pending} onClick={() => start(() => markNotificationsReadAction("all"))}>
        Mark all as read
      </Button>
    );
  return (
    <span className="flex gap-1">
      <button disabled={pending} onClick={() => start(() => markNotificationsReadAction([id]))} className="rounded px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50">
        Mark read
      </button>
      <button disabled={pending} onClick={() => start(() => archiveNotificationAction(id))} className="rounded px-2 py-1 text-xs text-muted hover:bg-surface">
        Archive
      </button>
    </span>
  );
}

export function DeletionRequestForm() {
  const [state, action, pending] = useActionState(requestAccountDeletionAction, null);
  if (state?.ok) return <FormSuccess message={state.message} />;
  return (
    <form action={action} className="space-y-3">
      <FormError message={state && !state.ok ? state.error : null} />
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="kind" value="deactivate" defaultChecked className="accent-brand-700" /> Deactivate my account
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="kind" value="delete" className="accent-brand-700" /> Delete my personal data
        </label>
      </fieldset>
      <Field label='Type "DELETE" to confirm' htmlFor="confirm">
        <Input id="confirm" name="confirm" autoComplete="off" className="max-w-xs" />
      </Field>
      <Button type="submit" variant="danger" loading={pending}>
        Submit request
      </Button>
    </form>
  );
}
