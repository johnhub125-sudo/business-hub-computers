"use client";

import { useActionState } from "react";
import { registerStaffAction } from "@/app/actions/auth";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input, Select } from "@/components/ui/form";

export function StaffRegisterForm({ departments, roles }: { departments: string[]; roles: string[] }) {
  const [state, action, pending] = useActionState(registerStaffAction, null);
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  if (state?.ok) return <FormSuccess message={state.message} />;
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <div className="sm:col-span-2">
        <FormError message={state && !state.ok ? state.error : null} />
      </div>
      <Field label="Surname" htmlFor="surname" required error={fe.surname}>
        <Input id="surname" name="surname" required />
      </Field>
      <Field label="First name" htmlFor="firstName" required error={fe.firstName}>
        <Input id="firstName" name="firstName" required />
      </Field>
      <Field label="Work email" htmlFor="email" required error={fe.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Phone" htmlFor="phone" required error={fe.phone}>
        <Input id="phone" name="phone" type="tel" required />
      </Field>
      <Field label="Department" htmlFor="department" required error={fe.department}>
        <Select id="department" name="department" defaultValue="" required>
          <option value="" disabled>
            Select department
          </option>
          {departments.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </Select>
      </Field>
      <Field label="Position / job title" htmlFor="position" required error={fe.position}>
        <Input id="position" name="position" required />
      </Field>
      <Field label="Requested role" htmlFor="requestedRole" hint="Final role is assigned by the Super Admin" className="sm:col-span-2">
        <Select id="requestedRole" name="requestedRole" defaultValue="">
          <option value="">Not sure</option>
          {roles.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
      </Field>
      <Field label="Password" htmlFor="password" required error={fe.password}>
        <PasswordInput id="password" name="password" autoComplete="new-password" showStrength required />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword" required error={fe.confirmPassword}>
        <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" required />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" block size="lg" loading={pending}>
          Submit access request
        </Button>
      </div>
    </form>
  );
}
