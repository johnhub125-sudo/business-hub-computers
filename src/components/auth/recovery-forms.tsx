"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { afterSignInAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input } from "@/components/ui/form";
import { authClient } from "@/lib/auth-client";
import { passwordIssues } from "@/lib/validation/auth";
import { PasswordInput } from "./password-input";

export function ForgotPasswordForm() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const email = String(new FormData(e.currentTarget).get("email") ?? "").trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Enter a valid email address.");
        setPending(true);
        const { error: err } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
        setPending(false);
        if (err && err.status === 429) return setError("Too many requests. Please wait a while and try again.");
        // Same message whether or not the account exists (no account enumeration).
        setDone(true);
      }}
      className="space-y-4"
    >
      <FormError message={error} />
      {done ? (
        <FormSuccess message="If an account exists for that email, we've sent a password reset link. It expires in 30 minutes and can be used once." />
      ) : (
        <>
          <Field label="Email address" htmlFor="email" required>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Button type="submit" block size="lg" loading={pending}>
            Send reset link
          </Button>
        </>
      )}
      <p className="text-center text-sm">
        <Link href="/login" className="font-semibold text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        const password = String(fd.get("password") ?? "");
        const confirm = String(fd.get("confirmPassword") ?? "");
        const issues = passwordIssues(password);
        if (issues.length) return setError(`Password needs: ${issues.join(", ").toLowerCase()}.`);
        if (password !== confirm) return setError("Passwords do not match.");
        setPending(true);
        const { error: err } = await authClient.resetPassword({ newPassword: password, token });
        setPending(false);
        if (err) return setError(err.status === 400 ? "This reset link is invalid or has expired. Please request a new one." : (err.message ?? "Could not reset password."));
        router.push("/login?reset=1");
      }}
      className="space-y-4"
    >
      <FormError message={error} />
      <Field label="New password" htmlFor="password" required>
        <PasswordInput id="password" name="password" autoComplete="new-password" showStrength required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword" required>
        <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" required />
      </Field>
      <Button type="submit" block size="lg" loading={pending}>
        Set new password
      </Button>
    </form>
  );
}

export function TwoFactorForm({ next, area }: { next: string | null; area: "store" | "admin" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [backup, setBackup] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const code = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\s/g, "");
        setPending(true);
        const res = backup ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice: false }) : await authClient.twoFactor.verifyTotp({ code, trustDevice: false });
        if (res.error) {
          setPending(false);
          return setError("That code is not valid. Please try again.");
        }
        const { redirect } = await afterSignInAction(next, area);
        router.push(redirect);
        router.refresh();
      }}
      className="space-y-4"
    >
      <FormError message={error} />
      <Field label={backup ? "Backup code" : "6-digit code from your authenticator app"} htmlFor="code" required>
        <Input id="code" name="code" inputMode={backup ? "text" : "numeric"} autoComplete="one-time-code" maxLength={backup ? 20 : 6} required autoFocus className="text-center text-lg tracking-[0.3em]" />
      </Field>
      <Button type="submit" block size="lg" loading={pending}>
        Verify
      </Button>
      <button type="button" onClick={() => setBackup((b) => !b)} className="w-full text-center text-sm font-semibold text-brand-600 hover:underline">
        {backup ? "Use authenticator code instead" : "Use a backup code"}
      </button>
    </form>
  );
}
