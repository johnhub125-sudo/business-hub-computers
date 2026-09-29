"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={error} />
      <FormSuccess message={info} />
      <Field label="Email address" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="username" required />
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
    </form>
  );
}
