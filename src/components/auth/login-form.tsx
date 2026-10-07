"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fingerprint } from "lucide-react";
import { useEffect, useState } from "react";
import { afterSignInAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input } from "@/components/ui/form";
import { authClient } from "@/lib/auth-client";
import { PasswordInput } from "./password-input";

const UNVERIFIED_NOTICE = {
  live: "Please verify your email first. We've just sent you a new verification link — check your inbox (and spam folder).",
  limited: "Please verify your email first. We've tried to send you a new link; if it doesn't arrive within a few minutes, contact us and we'll activate your account.",
  off: "Please verify your email first. We can't send verification emails right now — please contact us and we'll activate your account.",
} as const;

export function LoginForm({
  next,
  area = "store",
  notice,
  emailDelivery = "live",
}: {
  next?: string | null;
  area?: "store" | "admin";
  notice?: string | null;
  emailDelivery?: keyof typeof UNVERIFIED_NOTICE;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(notice ?? null);
  const [pending, setPending] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    const password = String(fd.get("password") ?? "");
    if (!email || !password) return setError("Enter your email and password.");
    setPending(true);
    const { data, error: err } = await authClient.signIn.email({ email, password, rememberMe: fd.get("remember") === "on" });
    if (err) {
      setPending(false);
      if (err.status === 403 && /verif/i.test(err.message ?? "")) {
        if (emailDelivery !== "off") await authClient.sendVerificationEmail({ email, callbackURL: "/account?verified=1" });
        setInfo(UNVERIFIED_NOTICE[emailDelivery]);
        return;
      }
      setError(err.status === 401 ? "Incorrect email or password." : (err.message ?? "Sign in failed. Please try again."));
      return;
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      router.push(`/two-factor?next=${encodeURIComponent(next ?? "")}&area=${area}`);
      return;
    }
    const { redirect } = await afterSignInAction(next ?? null, area);
    router.push(redirect);
    router.refresh();
  }

  async function finishPasskey(res: { error?: { message?: string; status?: number } | null } | undefined, quiet: boolean) {
    if (!res || res.error) {
      // Cancelled prompts and "no passkey on this device" are normal: say nothing unless the user asked.
      if (!quiet && res?.error && !/cancel|abort|not allowed|timed out/i.test(res.error.message ?? "")) setError(res.error.status === 403 ? (res.error.message ?? "This account cannot sign in.") : "Quick sign-in did not work on this device. Use your email and password instead.");
      return;
    }
    setPending(true);
    const { redirect } = await afterSignInAction(next ?? null, area);
    router.push(redirect);
    router.refresh();
  }

  async function passkeySignIn() {
    setError(null);
    setInfo(null);
    setPasskeyBusy(true);
    const res = await authClient.signIn.passkey().catch(() => undefined);
    setPasskeyBusy(false);
    await finishPasskey(res, false);
  }

  // If this device has a saved sign-in for the site, the browser offers the account(s) as soon as the
  // email box is focused, and the customer picks which one to use. Nothing happens unless they do.
  useEffect(() => {
    let active = true;
    (async () => {
      if (typeof window === "undefined" || !window.PublicKeyCredential) return;
      setPasskeySupported(true);
      const conditional = await window.PublicKeyCredential.isConditionalMediationAvailable?.().catch(() => false);
      if (!conditional || !active) return;
      const res = await authClient.signIn.passkey({ autoFill: true }).catch(() => undefined);
      if (active) await finishPasskey(res, true);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start the browser's account picker once
  }, []);

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={error} />
      <FormSuccess message={info} />
      <Field label="Email address" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="username webauthn" required />
      </Field>
      <Field label="Password" htmlFor="password" required>
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </Field>
      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="remember" defaultChecked className="size-4 accent-brand-700" /> Keep me signed in
        </label>
        <Link href="/forgot-password" className="font-semibold text-brand-600 hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" block size="lg" loading={pending}>
        Sign in
      </Button>
      {passkeySupported && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted" aria-hidden>
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <Button type="button" block size="lg" variant="outline" loading={passkeyBusy} onClick={passkeySignIn}>
            <Fingerprint className="size-5" aria-hidden /> Quick sign-in on this device
          </Button>
          <p className="text-center text-xs text-muted">Uses your fingerprint, face or screen lock. Switch it on first under Account → Security.</p>
        </>
      )}
    </form>
  );
}
