"use client";

// xenaxio step 129 G: industry packages of the company (the admin).
import { PackagesAdmin } from "@/components/xenaxio/packages-admin";
import { WorkspaceShell } from "@/components/xenaxio/workspace-shell";
import { useXT } from "@/lib/xenaxio/i18n";

export default function ExtensionsPage() {
  const t = useXT();
  return (
    <WorkspaceShell title={t("packages.title")}>
      <PackagesAdmin />
    </WorkspaceShell>
  );
}
