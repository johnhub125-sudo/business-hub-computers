"use server";

import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, UserError } from "@/server/errors";
import { requirePermission } from "@/server/session";
import { cancelPurchase, receivePurchase, savePurchase } from "@/server/services/purchases";
import { uploadFile } from "@/server/storage";

export async function savePurchaseAction(payload: unknown) {
  return runAction(async () => {
    const staff = await requirePermission("purchases.manage");
    const res = await savePurchase(payload, staff);
    revalidatePath("/admin/purchases");
    return res;
  }, "Purchase saved");
}

export async function uploadPurchaseAttachmentAction(fd: FormData) {
  return runAction(async () => {
    const staff = await requirePermission("purchases.manage");
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) throw new UserError("Choose a file.");
    const up = await uploadFile({ file, kind: "document", folder: "purchases", access: "private", userId: staff.id, entityType: "purchase" });
    return { pathname: up.pathname };
  });
}

export async function receivePurchaseAction(id: string, updateCostPrices: boolean) {
  return runAction(async () => {
    const staff = await requirePermission("purchases.manage", "inventory.manage");
    await receivePurchase(z.string().uuid().parse(id), staff, updateCostPrices);
    refresh();
  }, "Purchase received — stock updated");
}

export async function cancelPurchaseAction(id: string) {
  return runAction(async () => {
    const staff = await requirePermission("purchases.manage");
    await cancelPurchase(z.string().uuid().parse(id), staff);
    refresh();
  }, "Purchase cancelled");
}
