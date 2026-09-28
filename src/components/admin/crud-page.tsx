import { ENTITY_META, type EntityKey } from "@/lib/admin-entities";
import { ENTITY_SERVER, listEntity, refOptions } from "@/server/admin/crud";
import { requireStaffPage } from "@/server/session";
import { CrudManager } from "./crud-manager";

/** Server wrapper: checks permission, loads rows & reference options, renders the manager. */
export async function CrudSection({ entity }: { entity: EntityKey }) {
  const server = ENTITY_SERVER[entity];
  await requireStaffPage(server.perm);
  const [rows, options] = await Promise.all([listEntity(entity), refOptions()]);
  const toForm = server.toForm ? Object.fromEntries(rows.map((r) => [String(r.id), server.toForm!(r)])) : undefined;
  return (
    <div>
      {ENTITY_META[entity].description && <p className="mb-3 text-sm text-muted">{ENTITY_META[entity].description}</p>}
      <CrudManager entity={entity} rows={rows as (Record<string, unknown> & { id: string })[]} options={options} toForm={toForm} />
    </div>
  );
}
