"use client";

// Step 85: the company's limit on what AI may do, per group and per tool.
import { ToolCeilings } from "@/components/xenaxio/tool-permissions";
import { WorkspaceShell } from "@/components/xenaxio/workspace-shell";
import { useXT } from "@/lib/xenaxio/i18n";

export default function CompanyPermissionsPage() {
  const t = useXT();
  return (
    <WorkspaceShell title={t("permissions.admin_title")} backHref="/workspace/ai" requireAdmin>
      <ToolCeilings />
    </WorkspaceShell>
  );
}
