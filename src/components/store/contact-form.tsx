"use client";

import { useActionState } from "react";
import { contactAction } from "@/app/actions/store";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input, Textarea } from "@/components/ui/form";

export function ContactForm({ defaultSubject }: { defaultSubject?: string }) {
  const [state, action, pending] = useActionState(contactAction, null);
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  if (state?.ok) return <FormSuccess message={state.message} />;
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormError message={state && !state.ok ? state.error : null} />
      </div>
      <Field label="Your name" htmlFor="c-name" required error={fe.name}>
        <Input id="c-name" name="name" autoComplete="name" required />
      </Field>
      <Field label="Email" htmlFor="c-email" required error={fe.email}>
        <Input id="c-email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Phone / WhatsApp" htmlFor="c-phone" error={fe.phone}>
        <Input id="c-phone" name="phone" type="tel" autoComplete="tel" />
      </Field>
      <Field label="Subject" htmlFor="c-subject" required error={fe.subject}>
        <Input id="c-subject" name="subject" defaultValue={defaultSubject} required />
      </Field>
      <Field label="Message" htmlFor="c-message" required error={fe.message} className="sm:col-span-2">
        <Textarea id="c-message" name="message" required minLength={10} placeholder="Tell us what you need: product, quantity, budget, setup size…" />
      </Field>
      {/* honeypot for bots */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending}>
          Send message
        </Button>
      </div>
    </form>
  );
}
