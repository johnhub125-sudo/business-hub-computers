"use client";
import { passkeyClient } from "@better-auth/passkey/client";
import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        // Called outside React (auth client callback), so a router is not available here.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = `/two-factor?next=${encodeURIComponent(new URLSearchParams(window.location.search).get("next") ?? "")}`;
      },
    }),
    passkeyClient(),
  ],
});

export const { signIn, signOut, useSession } = authClient;
