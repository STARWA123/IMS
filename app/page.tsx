import { OfferTrackApp } from "../src/components/offertrack-app";
import { WorkspaceProvider } from "../src/components/workspace/workspace-provider";
import { initializeDatabase } from "../src/db/initialize-database";
import { getCurrentUser } from "../src/modules/auth/session";
import { listWorkspaces } from "../src/modules/workspace/workspace-service";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }
  if (currentUser.mustChangePassword) {
    redirect("/change-password");
  }
  await initializeDatabase(currentUser.id);
  const workspaces = await listWorkspaces(currentUser.id);
  return (
    <WorkspaceProvider initialWorkspaces={workspaces}>
      <OfferTrackApp currentUser={currentUser} />
    </WorkspaceProvider>
  );
}
