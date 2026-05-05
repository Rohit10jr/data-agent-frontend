import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { UserRole } from "@nao/shared/types";

import type { TeamMember } from "@/components/settings/team";
import { EditMemberDialog } from "@/components/settings/team";
import { signOut, updateProfile, useSession } from "@/lib/auth-client";
import { SettingsVersionInfo } from "@/components/settings/version-info";
import { useAuthRoute } from "@/hooks/use-auth-route";
import { UserProfileCard } from "@/components/settings/profile-card";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { soundNotificationStorage } from "@/hooks/use-stream-end-sound";
import { ThemeSelector } from "@/components/settings/theme-selector";
import { DangerZone } from "@/components/settings/danger-zone";
import {
  SettingsCard,
  SettingsPageWrapper,
} from "@/components/ui/settings-card";
import {
  SettingsControlRow,
  SettingsToggleRow,
} from "@/components/ui/settings-toggle-row";
import { trpc } from "@/main";

export const Route = createFileRoute("/_sidebar-layout/settings/account")({
  component: GeneralPage,
});

function GeneralPage() {
  const navigate = useNavigate();
  const { data: session, refetch } = useSession();
  const user = session?.user;
  const queryClient = useQueryClient();
  const project = useQuery(trpc.project.getCurrent.queryOptions());
  const [soundEnabled, setSoundEnabled] = useLocalStorage(
    soundNotificationStorage,
  );

  const isAdmin = project.data?.userRole === "admin";
  const navigation = useAuthRoute();

  const [editOpen, setEditOpen] = useState(false);

  const editMember: TeamMember | null =
    user && editOpen
      ? {
          id: String(user.id),
          name: user.name,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: project.data?.userRole ?? "user",
        }
      : null;

  // Updates the caller's own profile via PUT /api/update-profile/.
  // (Role changes are not yet implemented on Django for self-service —
  // `newRole` is accepted but ignored for now.)
  const handleEdit = async (data: {
    userId: string;
    firstName?: string;
    lastName?: string;
    newRole?: UserRole;
  }) => {
    await updateProfile({ firstName: data.firstName, lastName: data.lastName });
    await queryClient.invalidateQueries({ queryKey: ["session"] });
    await refetch();
  };

  const handleSignOut = async () => {
    queryClient.clear();
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          navigate({ to: navigation });
        },
      },
    });
  };

  return (
    <SettingsPageWrapper>
      <UserProfileCard
        name={user?.name}
        email={user?.email}
        onEdit={() => setEditOpen(true)}
        onSignOut={handleSignOut}
      />

      <EditMemberDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        member={editMember}
        isAdmin={isAdmin}
        onSubmit={handleEdit}
      />

      <SettingsCard title="General Settings" divide>
        <SettingsToggleRow
          id="sound-notification"
          label="Sound notification"
          description="Play a sound when the agent finishes responding."
          checked={soundEnabled}
          onCheckedChange={setSoundEnabled}
        />
        <SettingsControlRow
          label="Theme"
          description="Choose how Queryn looks."
          control={<ThemeSelector />}
        />
      </SettingsCard>

      <DangerZone />

      {isAdmin && <SettingsVersionInfo />}
    </SettingsPageWrapper>
  );
}
