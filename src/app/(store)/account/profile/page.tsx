import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { ProfileForm } from "@/components/account/forms";
import { Card } from "@/components/ui/misc";
import { db } from "@/server/db";
import { customerProfiles } from "@/server/db/schema";
import { requireUserPage } from "@/server/session";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const me = await requireUserPage("/account/profile");
  const [profile] = await db.select().from(customerProfiles).where(eq(customerProfiles.userId, me.id));
  return (
    <div>
      <h1 className="mb-5 font-display text-2xl font-extrabold">Profile</h1>
      <Card className="p-5 sm:p-6">
        <ProfileForm email={me.email} profile={profile ?? null} />
      </Card>
    </div>
  );
}
