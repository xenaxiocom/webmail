"use client";

// xenaxio step 142: "In anderes Projekt verschieben…" — a task with all its
// subtasks to the board of another project (or another record with a board).
// Before the move the platform says what happens: how many subtasks go along,
// who becomes a person of the new project, who stops watching. The task gets
// a new number there; old references and links still find it.
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorText } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";
import { useXenaxioMe } from "@/lib/xenaxio/me-store";
import { type BoardColumn, local, type ObjectSummary, type ObjectType, projectHref, projectsApi, type TaskSummary, type TaskTransfer, typeHref } from "@/lib/xenaxio/projects";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { Modal, selectClass } from "./bits";

/** The page of a task on a record's board (projects have their own page). */
export function taskHref(typeKey: string, objectId: string, taskId: string): string {
  return typeKey === "project" ? projectHref(objectId, taskId) : `${typeHref(typeKey, objectId)}&task=${encodeURIComponent(taskId)}`;
}

export function MoveTaskDialog({
  objectId,
  typeKey,
  task,
  onClose,
  onMoved,
  onOpen,
}: {
  objectId: string;
  typeKey: string;
  task: Pick<TaskSummary, "id" | "ref" | "title">;
  onClose: () => void;
  /** After the move: the task left this board. */
  onMoved: (moved: TaskTransfer & { task: TaskSummary }) => void;
  /** "Open" in the confirmation: go to the task on its new board. */
  onOpen: (href: string) => void;
}) {
  const t = useXT();
  const locale = useLocale();
  const me = useXenaxioMe();
  const admin = me?.user.role === "admin";
  const [types, setTypes] = useState<ObjectType[]>([]);
  const [kind, setKind] = useState(typeKey);
  const [q, setQ] = useState("");
  const [records, setRecords] = useState<ObjectSummary[] | null>(null);
  const [target, setTarget] = useState<ObjectSummary | null>(null);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [columnId, setColumnId] = useState<string>("");
  const [plan, setPlan] = useState<TaskTransfer | null>(null);
  const [busy, setBusy] = useState(false);

  // Only types with a board (projects always have one).
  useEffect(() => {
    projectsApi
      .types()
      .then((r) => setTypes(r.types.filter((x) => x.key === "project" || x.hasTasks)))
      .catch(() => undefined);
  }, []);

  // Records the person may change: their own ones (admins may change all).
  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        projectsApi
          .query({ type: kind, mine: !admin, ...(q.trim() ? { q: q.trim() } : {}), limit: 50 })
          .then((r) => setRecords(r.objects.filter((o) => o.id !== objectId && !o.archivedAt)))
          .catch((err: unknown) => toast.error(errorText(t, err)));
      },
      q ? 250 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [q, kind, admin, objectId, t]);

  // The new board's columns; the platform picks the column with the same name, else the first.
  useEffect(() => {
    if (!target) return;
    setPlan(null);
    setColumnId("");
    projectsApi
      .tasks(target.id)
      .then((r) => setColumns(r.columns))
      .catch((err: unknown) => toast.error(errorText(t, err)));
  }, [target, t]);

  useEffect(() => {
    if (!target) return;
    let live = true;
    projectsApi
      .transferPreview(objectId, task.id, { targetId: target.id, ...(columnId ? { columnId } : {}) })
      .then((p) => {
        if (!live) return;
        setPlan(p);
        if (!columnId) setColumnId(p.column.id);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setPlan(null);
        toast.error(errorText(t, err));
      });
    return () => {
      live = false;
    };
  }, [objectId, task.id, target, columnId, t]);

  const move = async () => {
    if (!target || !plan) return;
    setBusy(true);
    try {
      const moved = await projectsApi.transfer(objectId, task.id, { targetId: target.id, columnId: columnId || plan.column.id });
      const href = taskHref(moved.target.typeKey, moved.target.id, moved.task.id);
      toast.success(t("projects.move_done", { ref: moved.task.ref, project: `${moved.target.ref} · ${moved.target.title}` }), { action: { label: t("projects.move_open"), onClick: () => onOpen(href) } });
      onMoved(moved);
    } catch (err) {
      toast.error(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={t("projects.move_title")}>
      <p className="mb-2 truncate text-sm text-muted-foreground">
        {task.ref} · {task.title}
      </p>
      {!target ? (
        <>
          {types.length > 1 && (
            <select className={cn(selectClass, "mb-2")} value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t("objects.type")}>
              {types.map((x) => (
                <option key={x.key} value={x.key}>
                  {local(x.plural, locale)}
                </option>
              ))}
            </select>
          )}
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("objects.search")} aria-label={t("objects.search")} autoFocus />
          <ul className="mt-2 max-h-72 overflow-y-auto rounded-md border border-border">
            {(records ?? []).map((r) => (
              <li key={r.id}>
                <button type="button" className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => setTarget(r)}>
                  <span className="text-xs text-muted-foreground">{r.ref}</span>
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                </button>
              </li>
            ))}
            {records && records.length === 0 && <li className="px-2 py-2 text-sm text-muted-foreground">{t("projects.add_none")}</li>}
          </ul>
        </>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
            <span className="text-xs text-muted-foreground">{target.ref}</span>
            <span className="min-w-0 flex-1 truncate">{target.title}</span>
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => setTarget(null)}>
              {t("projects.move_other")}
            </button>
          </div>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">{t("projects.column")}</span>
            <select className={selectClass} value={columnId} onChange={(e) => setColumnId(e.target.value)} disabled={columns.length === 0}>
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {plan && (
            <ul className="space-y-1 text-muted-foreground" aria-live="polite">
              {plan.subtasks > 0 && <li>{plan.subtasks === 1 ? t("projects.move_subtasks_one") : t("projects.move_subtasks", { count: plan.subtasks })}</li>}
              {plan.detached && <li>{t("projects.move_detached")}</li>}
              {plan.joining.length > 0 && <li className="text-warning">{t("projects.move_joining", { names: plan.joining.map((p) => p.name).join(", "), project: plan.target.ref })}</li>}
              {plan.leaving.length > 0 && <li className="text-warning">{t(plan.leaving.length === 1 ? "projects.move_leaving_one" : "projects.move_leaving", { names: plan.leaving.map((p) => p.name).join(", "), project: plan.target.ref })}</li>}
              <li>{t("projects.move_number")}</li>
            </ul>
          )}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button disabled={!plan || busy} onClick={() => void move()}>
          {t("projects.move")}
        </Button>
      </div>
    </Modal>
  );
}
