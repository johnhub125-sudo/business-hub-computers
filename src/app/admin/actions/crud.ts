"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ENTITY_META, type EntityKey } from "@/lib/admin-entities";
import { audit, diff } from "@/server/audit";
import { ENTITY_SERVER, parseEntityForm } from "@/server/admin/crud";
import { db } from "@/server/db";
import { runAction, UserError } from "@/server/errors";
import { requirePermission } from "@/server/session";

function def(key: string) {
  if (!(key in ENTITY_SERVER)) throw new UserError("Unknown entity.");
  return { key: key as EntityKey, server: ENTITY_SERVER[key as EntityKey], meta: ENTITY_META[key as EntityKey] };
}

/** Create or update any registered entity. Permission, validation and audit are enforced here. */
export async function saveEntityAction(key: string, id: string | null, fd: FormData) {
  return runAction(async () => {
    const { key: k, server, meta } = def(key);
    const staff = await requirePermission(server.perm);
    if (id && !/^[0-9a-f-]{36}$/i.test(id)) throw new UserError("Invalid id.");
    const parsed = await parseEntityForm(k, fd, staff.id);
    const table = server.table;
    const saved = await db.transaction(async (tx) => {
      const values = server.transform ? await server.transform(parsed, { id, tx }) : parsed;
      if (id) {
        const [before] = await tx.select().from(table as never).where(eq(table.id, id));
        if (!before) throw new UserError(`${meta.singular} not found.`);
        const [after] = await tx.update(table).set(values as never).where(eq(table.id, id)).returning();
        const d = diff(before as Record<string, unknown>, values);
        if (d.changed) {
          await audit(
            { actor: staff, action: `${k}.updated`, module: server.module, description: `Updated ${meta.singular} “${String((values.name ?? values.title ?? values.code ?? values.label ?? values.bankName ?? id) as string)}”`, entityType: k, entityId: id, before: d.before, after: d.after },
            tx,
          );
        }
        return after;
      }
      const [created] = await tx.insert(table).values(values as never).returning();
      await audit({ actor: staff, action: `${k}.created`, module: server.module, description: `Created ${meta.singular} “${String((values.name ?? values.title ?? values.code ?? values.label ?? values.bankName ?? "") as string)}”`, entityType: k, entityId: String((created as { id: string }).id), after: values }, tx);
      return created;
    });
    for (const p of server.revalidate) revalidatePath(p);
    revalidatePath(`/admin`, "layout");
    return { id: String((saved as { id: string }).id) };
  }, "Saved");
}

export async function deleteEntityAction(key: string, id: string) {
  return runAction(async () => {
    const { key: k, server, meta } = def(key);
    const staff = await requirePermission(server.perm);
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new UserError("Invalid id.");
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(server.table as never).where(eq(server.table.id, id));
      if (!before) throw new UserError(`${meta.singular} not found.`);
      try {
        await tx.delete(server.table).where(eq(server.table.id, id));
      } catch {
        throw new UserError(`This ${meta.singular} is in use and can't be deleted. Deactivate it instead.`);
      }
      await audit({ actor: staff, action: `${k}.deleted`, module: server.module, description: `Deleted ${meta.singular}`, entityType: k, entityId: id, before }, tx);
    });
    for (const p of server.revalidate) revalidatePath(p);
  }, "Deleted");
}
