"use client";

// Step 134: subtasks of a task, nested without a practical limit (the platform caps it at ten
// levels and refuses cycles). The tree in the task panel: tick, open, add below any row, fold
// branches (kept on the server, rule 10); the way down to a task; which task it belongs to.
import { type FormEvent, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useXT } from "@/lib/xenaxio/i18n";
import { dayText, isOverdue, type TaskSummary } from "@/lib/xenaxio/projects";
import { useViewPrefs } from "@/lib/xenaxio/view-prefs";
import { PersonBadge, selectClass } from "./bits";

/** Levels of subtasks the platform allows (the top task counts as one). */
export const TASK_DEPTH = 10;

export interface TreeRow {
  task: TaskSummary;
  depth: number;
  hasChildren: boolean;
}

/** The rows of a tree below `rootId`, parents before children, in the order given; folded branches stay hidden. */
export function treeRows(list: TaskSummary[], rootId: string, folded: Set<string> = new Set()): TreeRow[] {
  const kids = new Map<string, TaskSummary[]>();
  for (const t of list) if (t.parentId) kids.set(t.parentId, [...(kids.get(t.parentId) ?? []), t]);
  const out: TreeRow[] = [];
  const seen = new Set<string>([rootId]);
  const walk = (id: string, depth: number) => {
    for (const t of kids.get(id) ?? []) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      const hasChildren = (kids.get(t.id) ?? []).length > 0;
      out.push({ task: t, depth, hasChildren });
      if (!folded.has(t.id)) walk(t.id, depth + 1);
    }
  };
  walk(rootId, 0);
  return out;
}

/** Tasks a task may be put under: not itself, not one below it, not so deep that its branch would pass the limit. */
export function parentChoices(all: TaskSummary[], task: TaskSummary, below: TaskSummary[]): TaskSummary[] {
  const banned = new Set([task.id, ...below.map((b) => b.id)]);
  const ownDepth = (task.path?.length ?? 0) + 1;
  const height = 1 + Math.max(0, ...below.map((b) => (b.path?.length ?? 0) + 1 - ownDepth));
  return all.filter((x) => !banned.has(x.id) && (x.path?.length ?? 0) + 1 + height <= TASK_DEPTH);
}

const parseFolded = (v: Record<string, unknown>) => ({ ids: Array.isArray(v.ids) ? v.ids.filter((x): x is string => typeof x === "string").slice(-200) : ([] as string[]) });

export function Subtasks({
  task,
  canEdit,
  locale,
  onOpen,
  onToggle,
  onAdd,
}: {
  task: TaskSummary & { subtaskList?: TaskSummary[] };
  canEdit: boolean;
  locale: string;
  onOpen: (id: string) => void;
  onToggle: (id: string, done: boolean) => void;
  onAdd: (parentId: string, title: string) => Promise<boolean>;
}) {
  const t = useXT();
  const [prefs, setPrefs] = useViewPrefs("subtasks.folded", parseFolded);
  const folded = useMemo(() => new Set(prefs.ids), [prefs.ids]);
  const list = useMemo(() => task.subtaskList ?? [], [task.subtaskList]);
  const rows = useMemo(() => treeRows(list, task.id, folded), [list, task.id, folded]);
  const [adding, setAdding] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const depthOf = (x: TaskSummary) => (x.path?.length ?? 0) + 1;
  const canNest = (x: TaskSummary) => depthOf(x) < TASK_DEPTH;
  const fold = (id: string) => setPrefs({ ids: folded.has(id) ? prefs.ids.filter((x) => x !== id) : [...prefs.ids, id].slice(-200) });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!adding || !title.trim()) return;
    if (await onAdd(adding, title.trim())) setTitle("");
  };
  const form = (parentId: string, indent: number) =>
    adding === parentId && (
      <form onSubmit={(e) => void submit(e)} className="flex items-center gap-2 py-1" style={{ paddingLeft: indent }}>
        <Input autoFocus className="h-8 flex-1" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("projects.subtask_title")} aria-label={t("projects.subtask_title")} onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setAdding(null))} />
        <Button size="sm" type="submit" disabled={!title.trim()}>
          {t("projects.add")}
        </Button>
      </form>
    );

  const total = task.subtasks?.total ?? list.length;
  const done = task.subtasks?.done ?? list.filter((x) => x.done).length;
  if (!canEdit && total === 0) return null;
  return (
    <div className="space-y-1 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {t("projects.subtasks")}
          {total > 0 && <span className="ml-1 tabular-nums">{t("projects.subtasks_count", { done, total })}</span>}
        </span>
        {total > 0 && (
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className="block h-full bg-success" style={{ width: `${Math.round((done / total) * 100)}%` }} />
          </span>
        )}
      </div>
      <ul role="tree" aria-label={t("projects.subtasks")}>
        {rows.map(({ task: x, depth, hasChildren }) => (
          <li key={x.id} role="treeitem" aria-level={depth + 1} aria-expanded={hasChildren ? !folded.has(x.id) : undefined}>
            <div className="group flex items-center gap-1.5 rounded py-0.5 hover:bg-muted/60" style={{ paddingLeft: depth * 16 }}>
              {hasChildren ? (
                <button type="button" className="rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={() => fold(x.id)} aria-label={folded.has(x.id) ? t("projects.subtasks_unfold") : t("projects.subtasks_fold")}>
                  {folded.has(x.id) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              ) : (
                <span className="w-[18px] shrink-0" aria-hidden />
              )}
              <input type="checkbox" className="h-4 w-4 shrink-0" checked={x.done} disabled={!canEdit} onChange={(e) => onToggle(x.id, e.target.checked)} aria-label={x.done ? t("projects.task_reopen") : t("projects.task_done")} />
              <button type="button" className={cn("min-w-0 flex-1 truncate text-left hover:underline", x.done && "text-muted-foreground line-through")} onClick={() => onOpen(x.id)}>
                <span className="mr-1.5 text-xs tabular-nums text-muted-foreground">{x.ref}</span>
                {x.title}
              </button>
              {x.subtasks && x.subtasks.total > 0 && <span className="text-xs tabular-nums text-muted-foreground">⑂ {x.subtasks.done}/{x.subtasks.total}</span>}
              {x.dueOn && <span className={cn("text-xs", isOverdue(x.dueOn, x.done) ? "font-medium text-destructive" : "text-muted-foreground")}>{dayText(x.dueOn, locale)}</span>}
              {x.assignee && <PersonBadge name={x.assignee.name} email={x.assignee.email} />}
              {canEdit && canNest(x) && (
                <button type="button" className="rounded p-0.5 text-muted-foreground opacity-60 hover:text-foreground group-hover:opacity-100" onClick={() => (setAdding(x.id), setTitle(""))} aria-label={t("projects.subtask_add_below", { ref: x.ref })} title={t("projects.subtask_add_below", { ref: x.ref })}>
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {form(x.id, (depth + 1) * 16 + 18)}
          </li>
        ))}
      </ul>
      {form(task.id, 0)}
      {canEdit && canNest(task) && adding !== task.id && (
        <button type="button" className="flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => (setAdding(task.id), setTitle(""))}>
          <Plus className="h-3.5 w-3.5" />
          {t("projects.subtask_add")}
        </button>
      )}
    </div>
  );
}

/** The way down to a task: each step opens that task. */
export function TaskPath({ task, onOpen }: { task: TaskSummary; onOpen: (id: string) => void }) {
  const t = useXT();
  if (!task.path?.length) return null;
  return (
    <nav aria-label={t("projects.subtask_path")} className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {task.path.map((x, i) => (
        <span key={x.id} className="flex min-w-0 items-center gap-1">
          {i > 0 && <span aria-hidden>›</span>}
          <button type="button" className="max-w-[180px] truncate hover:text-foreground hover:underline" onClick={() => onOpen(x.id)} title={`${x.ref} ${x.title}`}>
            {x.ref} {x.title}
          </button>
        </span>
      ))}
    </nav>
  );
}

/** "Belongs to": make the task a subtask of another one, or a task of its own. */
export function ParentSelect({ task, all, canEdit, onChange }: { task: TaskSummary & { subtaskList?: TaskSummary[] }; all: TaskSummary[] | null; canEdit: boolean; onChange: (parentId: string | null) => void }) {
  const t = useXT();
  const choices = useMemo(() => {
    if (!all) return [];
    const ok = new Set(parentChoices(all, task, task.subtaskList ?? []).map((c) => c.id));
    // In tree order: each task under the one it belongs to.
    const ROOT = "\u0000root";
    return treeRows(all.map((x) => (x.parentId && all.some((y) => y.id === x.parentId) ? x : { ...x, parentId: ROOT })), ROOT)
      .map((r) => r.task)
      .filter((x) => ok.has(x.id));
  }, [all, task]);
  const current = all?.find((x) => x.id === task.parentId);
  return (
    <label className="block space-y-1 text-sm sm:col-span-2">
      <span className="text-xs text-muted-foreground">{t("projects.subtask_parent")}</span>
      <select className={selectClass} value={task.parentId ?? ""} disabled={!canEdit || !all} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{t("projects.subtask_parent_none")}</option>
        {current && !choices.some((c) => c.id === current.id) && (
          <option value={current.id}>
            {current.ref} {current.title}
          </option>
        )}
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {"  ".repeat(c.path?.length ?? 0)}
            {c.ref} {c.title}
          </option>
        ))}
      </select>
    </label>
  );
}
