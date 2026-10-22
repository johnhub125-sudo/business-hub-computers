"use client";

import { createContext, useContext, type ReactNode } from "react";

/** Storefront choices made in Admin → Settings → Storefront that client components need. */
type StorePrefs = { showStockCount: boolean };

const Ctx = createContext<StorePrefs>({ showStockCount: false });

export function StorePrefsProvider({ value, children }: { value: StorePrefs; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStorePrefs = () => useContext(Ctx);
