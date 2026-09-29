"use client";

import { MailCheck, MailWarning } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { registerCustomerAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { NIGERIAN_STATES } from "@/lib/brand";
import { PasswordInput } from "./password-input";

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerCustomerAction, null);
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const err = (k: string) => fe[k];
  const aria = (k: string) => ({ "aria-invalid": fe[k] ? true : undefined, "aria-describedby": fe[k] ? `${k}-error` : undefined });

  if (state?.ok && !state.data.verificationRequired) {
    return (
      <div className="py-6 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
          <MailCheck className="size-8" aria-hidden />
        </span>
        <h2 className="mt-4 text-xl font-bold">Welcome aboard!</h2>
        <p className="mx-auto mt-2 max-w-sm text-muted">
          Your account <strong className="text-ink">{state.data.email}</strong> is ready. You can sign in now and start shopping.
          {state.data.emailSent && " We've also emailed you a link to confirm your address."}
        </p>
        <Link href="/login" className="mt-6 inline-flex h-11 items-center rounded-xl bg-brand-700 px-6 font-semibold text-white hover:bg-brand-800">
          Sign in
        </Link>
      </div>
    );
  }

  if (state?.ok && !state.data.emailSent) {
    return (
      <div className="py-6 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-amber-50 text-amber-600">
          <MailWarning className="size-8" aria-hidden />
        </span>
        <h2 className="mt-4 text-xl font-bold">Account created</h2>
        <p className="mx-auto mt-2 max-w-sm text-muted">
          We couldn&apos;t send the verification email to <strong className="text-ink">{state.data.email}</strong> just now. Please{" "}
          <Link href="/contact" className="font-semibold text-brand-600 hover:underline">
            contact us
          </Link>{" "}
          and we&apos;ll activate your account, or try signing in later to get a new link.
        </p>
        <Link href="/login" className="mt-6 inline-block font-semibold text-brand-600 hover:underline">
          Go to sign in →
        </Link>
      </div>
    );
  }

  if (state?.ok) {
    return (
      <div className="py-6 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
          <MailCheck className="size-8" aria-hidden />
        </span>
        <h2 className="mt-4 text-xl font-bold">Check your inbox</h2>
        <p className="mx-auto mt-2 max-w-sm text-muted">
          We sent a verification link to <strong className="text-ink">{state.data.email}</strong>. Click it to activate your account, then sign in. If it isn&apos;t in your inbox within a few minutes, check your spam folder.
        </p>
        <Link href="/login" className="mt-6 inline-block font-semibold text-brand-600 hover:underline">
          Go to sign in →
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      <FormError message={state && !state.ok ? state.error : null} />
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Your name</legend>
        <Field label="Surname" htmlFor="surname" required error={err("surname")}>
          <Input id="surname" name="surname" autoComplete="family-name" required {...aria("surname")} />
        </Field>
        <Field label="First name" htmlFor="firstName" required error={err("firstName")}>
          <Input id="firstName" name="firstName" autoComplete="given-name" required {...aria("firstName")} />
        </Field>
        <Field label="Middle name" htmlFor="middleName" error={err("middleName")}>
          <Input id="middleName" name="middleName" autoComplete="additional-name" />
        </Field>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Contact</legend>
        <Field label="Email (your username)" htmlFor="email" required error={err("email")} className="sm:col-span-3">
          <Input id="email" name="email" type="email" autoComplete="email" required {...aria("email")} />
        </Field>
        <Field label="Phone number" htmlFor="phone" required error={err("phone")} className="sm:col-span-3 md:col-span-1">
          <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="0803 000 0000" required {...aria("phone")} />
        </Field>
        <Field label="WhatsApp number" htmlFor="whatsapp" error={err("whatsapp")} hint="Leave blank if same as phone" className="sm:col-span-3 md:col-span-2">
          <Input id="whatsapp" name="whatsapp" type="tel" placeholder="0803 000 0000" {...aria("whatsapp")} />
        </Field>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Address</legend>
        <Field label="Full address" htmlFor="address" required error={err("address")} className="sm:col-span-2">
          <Textarea id="address" name="address" autoComplete="street-address" rows={2} className="min-h-0" required {...aria("address")} />
        </Field>
        <Field label="State" htmlFor="state" required error={err("state")}>
          <Select id="state" name="state" defaultValue="" required {...aria("state")}>
            <option value="" disabled>
              Select state
            </option>
            {NIGERIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Capital / City" htmlFor="city" required error={err("city")}>
          <Input id="city" name="city" autoComplete="address-level2" required {...aria("city")} />
        </Field>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Security</legend>
        <Field label="Password" htmlFor="password" required error={err("password")}>
          <PasswordInput id="password" name="password" autoComplete="new-password" showStrength required {...aria("password")} />
        </Field>
        <Field label="Confirm password" htmlFor="confirmPassword" required error={err("confirmPassword")}>
          <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" required {...aria("confirmPassword")} />
        </Field>
      </fieldset>
      <div>
        <Checkbox
          id="acceptTerms"
          name="acceptTerms"
          label={
            <>
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="font-semibold text-brand-600 underline">
                Terms & Conditions
              </Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank" className="font-semibold text-brand-600 underline">
                Privacy Policy
              </Link>
            </>
          }
        />
        {err("acceptTerms") && <p className="mt-1 text-[13px] font-medium text-red-600">{err("acceptTerms")}</p>}
      </div>
      <Button type="submit" block size="lg" loading={pending}>
        Create account
      </Button>
    </form>
  );
}
