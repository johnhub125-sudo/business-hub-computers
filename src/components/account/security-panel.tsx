"use client";

import { Fingerprint, Laptop, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import Image from "next/image";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { signOutEverywhereAction } from "@/app/actions/auth";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { Field, FormError, Input } from "@/components/ui/form";
import { authClient } from "@/lib/auth-client";
import { passwordIssues } from "@/lib/validation/auth";
import { formatDateTime } from "@/lib/utils";

export function ChangePasswordCard({ forced }: { forced?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  return (
    <Card className={forced ? "border-amber-300 p-5 ring-4 ring-amber-100" : "p-5"}>
      <h2 className="font-bold">{forced ? "Change your temporary password" : "Change password"}</h2>
      {forced && <p className="mt-1 text-sm text-amber-800">For security, you must set a new password before continuing.</p>}
      <form
        method="post"
        className="mt-4 grid max-w-md gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const fd = new FormData(e.currentTarget);
          const currentPassword = String(fd.get("current"));
          const newPassword = String(fd.get("new"));
          const issues = passwordIssues(newPassword);
          if (issues.length) return setError(`New password needs: ${issues.join(", ").toLowerCase()}.`);
          if (newPassword !== fd.get("confirm")) return setError("New passwords do not match.");
          setPending(true);
          const { error: err } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
          setPending(false);
          if (err) return setError(err.status === 400 || err.status === 401 ? "Your current password is incorrect." : (err.message ?? "Could not change password."));
          toast.success("Password changed. Other devices were signed out.");
          (e.target as HTMLFormElement).reset();
          await fetch("/api/account/password-changed", { method: "POST" });
          router.refresh();
        }}
      >
        <FormError message={error} />
        <Field label="Current password" htmlFor="current" required>
          <PasswordInput id="current" name="current" autoComplete="current-password" required />
        </Field>
        <Field label="New password" htmlFor="new" required>
          <PasswordInput id="new" name="new" autoComplete="new-password" showStrength required />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm" required>
          <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required />
        </Field>
        <Button type="submit" loading={pending} className="w-fit">
          Update password
        </Button>
      </form>
    </Card>
  );
}

export function TwoFactorCard({ enabled, recommended }: { enabled: boolean; recommended?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "password" | "scan" | "codes" | "disable">("idle");
  const [uri, setUri] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (uri) QRCode.toDataURL(uri, { margin: 1, width: 200 }).then(setQr).catch(() => setQr(null));
  }, [uri]);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-bold">
            <ShieldCheck className="size-5 text-brand-600" aria-hidden /> Two-factor authentication
          </h2>
          <p className="mt-1 text-sm text-muted">{enabled ? "Enabled — you'll enter a code from your authenticator app when signing in." : "Add a second step at sign-in using Google Authenticator, Microsoft Authenticator or Authy."}</p>
          {recommended && !enabled && <p className="mt-1 text-sm font-semibold text-amber-700">Strongly recommended for administrator accounts.</p>}
        </div>
        {step === "idle" && (
          <Button size="sm" variant={enabled ? "outline" : "primary"} onClick={() => setStep(enabled ? "disable" : "password")}>
            {enabled ? "Disable" : "Enable 2FA"}
          </Button>
        )}
      </div>
      {(step === "password" || step === "disable") && (
        <form
          method="post"
          className="mt-4 grid max-w-sm gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setPending(true);
            const password = String(new FormData(e.currentTarget).get("password"));
            if (step === "disable") {
              const { error: err } = await authClient.twoFactor.disable({ password });
              setPending(false);
              if (err) return setError("Incorrect password.");
              toast.success("Two-factor authentication disabled.");
              setStep("idle");
              return router.refresh();
            }
            const { data, error: err } = await authClient.twoFactor.enable({ password });
            setPending(false);
            if (err || !data) return setError("Incorrect password.");
            if (data.method !== "totp") return setError("Authenticator setup is unavailable. Please try again.");
            setUri(data.totpURI);
            setCodes(data.backupCodes);
            setStep("scan");
          }}
        >
          <FormError message={error} />
          <Field label="Confirm your password" htmlFor="tfpw" required>
            <PasswordInput id="tfpw" name="password" autoComplete="current-password" required />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" loading={pending}>
              Continue
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep("idle")}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {step === "scan" && (
        <form
          method="post"
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setPending(true);
            const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
            const { error: err } = await authClient.twoFactor.verifyTotp({ code });
            setPending(false);
            if (err) return setError("That code didn't match. Check the time on your phone and try again.");
            setStep("codes");
          }}
        >
          <p className="text-sm">1. Scan this QR code with your authenticator app.</p>
          {qr ? <Image src={qr} alt="Two-factor QR code" width={200} height={200} unoptimized className="rounded-xl border border-line" /> : <p className="break-all rounded-lg bg-surface p-3 font-mono text-xs">{uri}</p>}
          <p className="text-sm">2. Enter the 6-digit code it shows.</p>
          <FormError message={error} />
          <div className="flex max-w-xs gap-2">
            <Input name="code" inputMode="numeric" maxLength={6} required autoComplete="one-time-code" className="text-center tracking-[0.3em]" aria-label="Authenticator code" />
            <Button type="submit" loading={pending}>
              Verify
            </Button>
          </div>
        </form>
      )}
      {step === "codes" && (
        <div className="mt-4 space-y-3">
          <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Two-factor authentication is on.</p>
          <p className="text-sm">Save these backup codes somewhere safe. Each can be used once if you lose your phone:</p>
          <ul className="grid max-w-md grid-cols-2 gap-1.5 rounded-xl bg-surface p-3 font-mono text-sm">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <Button
            size="sm"
            onClick={() => {
              setStep("idle");
              router.refresh();
            }}
          >
            I&apos;ve saved them
          </Button>
        </div>
      )}
    </Card>
  );
}

type SessionRow = { id: string; token: string; userAgent?: string | null; ipAddress?: string | null; createdAt: Date; updatedAt: Date };

export function SessionsCard({ currentToken }: { currentToken?: string }) {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const load = () => authClient.listSessions().then(({ data }) => setSessions((data as SessionRow[] | null) ?? []));
  useEffect(() => {
    load();
  }, []);
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">Active sessions</h2>
        <Button
          size="sm"
          variant="outline"
          loading={pending}
          onClick={async () => {
            if (!confirm("Sign out of all devices, including this one?")) return;
            setPending(true);
            const r = await signOutEverywhereAction();
            setPending(false);
            if (!r.ok) return void toast.error(r.error);
            router.push("/login");
          }}
        >
          Sign out everywhere
        </Button>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {sessions === null && <li className="py-3 text-sm text-muted">Loading…</li>}
        {sessions?.map((s) => {
          const mobile = /mobile|android|iphone/i.test(s.userAgent ?? "");
          const current = s.token === currentToken;
          return (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span className="flex items-center gap-3">
                {mobile ? <Smartphone className="size-5 text-muted" aria-hidden /> : <Laptop className="size-5 text-muted" aria-hidden />}
                <span>
                  <span className="block font-medium">
                    {(s.userAgent ?? "Unknown device").slice(0, 60)}
                    {current && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">This device</span>}
                  </span>
                  <span className="text-xs text-muted">
                    {s.ipAddress ?? "IP hidden"} · last active {formatDateTime(s.updatedAt)}
                  </span>
                </span>
              </span>
              {!current && (
                <button
                  className="text-xs font-semibold text-red-600 hover:underline"
                  onClick={async () => {
                    await authClient.revokeSession({ token: s.token });
                    toast.success("Session revoked");
                    load();
                  }}
                >
                  Revoke
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

type SavedPasskey = { id: string; name?: string | null; deviceType?: string | null; createdAt?: string | Date | null };

/**
 * Quick sign-in (passkeys): the customer switches it on for each device they want. After that the
 * device's fingerprint, face or screen lock signs them in, and the browser lets them pick which
 * saved account to use. Nothing is enabled unless they choose it here.
 */
export function PasskeyCard() {
  const [items, setItems] = useState<SavedPasskey[] | null>(null);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await authClient.passkey.listUserPasskeys().catch(() => null);
    setItems((res?.data as SavedPasskey[] | undefined) ?? []);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setSupported(typeof window !== "undefined" && Boolean(window.PublicKeyCredential));
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  async function add() {
    setBusy(true);
    const ua = navigator.userAgent;
    const device = /iPhone|iPad/.test(ua) ? "iPhone / iPad" : /Android/.test(ua) ? "Android phone" : /Windows/.test(ua) ? "Windows computer" : /Mac/.test(ua) ? "Mac" : "This device";
    const res = await authClient.passkey.addPasskey({ name: device }).catch(() => ({ error: { message: "cancelled" } }));
    setBusy(false);
    if (res?.error) {
      if (!/cancel|abort|not allowed|timed out/i.test(res.error.message ?? "")) toast.error("Quick sign-in could not be switched on for this device.");
      return;
    }
    toast.success("Quick sign-in is on for this device");
    void load();
  }

  async function remove(id: string) {
    if (!confirm("Switch off quick sign-in for this device? You can still sign in with your password.")) return;
    const res = await authClient.passkey.deletePasskey({ id }).catch(() => ({ error: { message: "failed" } }));
    if (res?.error) return void toast.error("Could not remove it. Please try again.");
    toast.success("Removed");
    void load();
  }

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
          <Fingerprint className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-bold">Quick sign-in on your devices</h2>
          <p className="mt-0.5 text-sm text-muted">Sign in with your fingerprint, face or screen lock instead of typing your password. It is safer than a password because it only works on the real site and on your own device.</p>
        </div>
      </div>
      {!supported ? (
        <p className="mt-4 rounded-xl bg-surface p-3 text-sm text-muted">This browser does not support quick sign-in. Try a recent version of Chrome, Edge or Safari.</p>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {(items ?? []).map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm">
                <span>
                  <strong>{k.name || "Saved device"}</strong>
                  {k.createdAt && <span className="block text-xs text-muted">Switched on {formatDateTime(new Date(k.createdAt))}</span>}
                </span>
                <button type="button" onClick={() => remove(k.id)} className="rounded p-1.5 text-red-600 hover:bg-red-50" aria-label="Switch off quick sign-in for this device">
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
            {items && items.length === 0 && <li className="rounded-xl bg-surface p-3 text-sm text-muted">Not switched on for any device yet.</li>}
          </ul>
          <Button type="button" className="mt-4" loading={busy} onClick={add}>
            <Fingerprint className="size-4" aria-hidden /> Switch on for this device
          </Button>
        </>
      )}
    </Card>
  );
}
