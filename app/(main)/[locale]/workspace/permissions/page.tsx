"use client";

// Step 85: "KI-Berechtigungen" — what the assistant, scheduled tasks and
// connected AI chats may do for the user, per tool.
import { ToolPermissions } from "@/components/xenaxio/tool-permissions";
import { WorkspaceShell } from "@/components/xenaxio/workspace-shell";
import { useXT } from "@/lib/xenaxio/i18n";

export default function PermissionsPage() {
  const t = useXT();
  return (
    <WorkspaceShell title={t("permissions.title")} backHref="/workspace">
      <ToolPermissions />
    </WorkspaceShell>
  );
}
