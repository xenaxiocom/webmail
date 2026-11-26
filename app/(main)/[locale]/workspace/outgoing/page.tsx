"use client";

// Step 153: the company admin's list of outgoing mail (who, from which address, to whom, delivered).
import { OutgoingMailView } from "@/components/xenaxio/outgoing-mail";
import { WorkspaceShell } from "@/components/xenaxio/workspace-shell";
import { useXT } from "@/lib/xenaxio/i18n";

export default function OutgoingPage() {
  const t = useXT();
  return (
    <WorkspaceShell title={t("outgoing.title")} backHref="/workspace" requireAdmin>
      <OutgoingMailView />
    </WorkspaceShell>
  );
}
