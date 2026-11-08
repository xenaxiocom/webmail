"use client";

// Step 126: computed fields and rules in the type editor. A formula reads the record's own
// fields (the flow's expression language: + - * /, ==, and, or, functions like round(),
// days_between(), today(), coalesce()); a rollup counts or sums records of another type that
// point here; a rule refuses a record when its condition holds. Every expression is checked
// by the platform while the admin types and shows the value for the newest record.
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { Plus, Trash } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/xenaxio/ui";
import { cn } from "@/lib/utils";
import { errorText } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";
import { asValueField, COMPUTED_KINDS, CURRENCIES, type FormulaDef, type FormulaResult, local, type ObjectType, projectsApi, type RollupDef, type RollupOp, type TypeField, type TypeRule } from "@/lib/xenaxio/projects";
import { selectClass } from "./bits";

const RESULTS: FormulaResult[] = ["number", "money", "date", "text", "checkbox"];
const OPS: RollupOp[] = ["count", "sum", "avg", "min", "max"];

type Check = { state: "idle" } | { state: "checking" } | { state: "ok"; example: unknown } | { state: "error"; error: string };

/** Checks an expression on the platform a moment after the admin stops typing. */
function useCheck(typeKey: string, body: Parameters<typeof projectsApi.checkExpression>[1] | null): Check {
  const [check, setCheck] = useState<Check>({ state: "idle" });
  const key = JSON.stringify(body);
  useEffect(() => {
    if (!body || !body.expr.trim()) {
      setCheck({ state: "idle" });
      return;
    }
    setCheck({ state: "checking" });
    let live = true;
    const timer = window.setTimeout(() => {
      projectsApi
        .checkExpression(typeKey, body)
        .then((r) => live && setCheck(r.ok ? { state: "ok", example: r.example } : { state: "error", error: r.error }))
        .catch(() => live && setCheck({ state: "idle" }));
    }, 400);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for the body.
  }, [typeKey, key]);
  return check;
}

function CheckLine({ check, example }: { check: Check; example?: (v: unknown) => string }) {
  const t = useXT();
  if (check.state === "idle") return null;
  if (check.state === "checking") return <p className="text-xs text-muted-foreground">{t("computed.checking")}</p>;
  if (check.state === "error") return <p className="text-xs text-destructive">{t("computed.error", { error: check.error })}</p>;
  return (
    <p className="text-xs text-success">
      {t("computed.ok")}
      {check.example !== null && check.example !== undefined && example ? ` · ${t("computed.example", { value: example(check.example) })}` : ""}
    </p>
  );
}

/** Names the expression can use: the type's fields (not sensitive, no files) and the built-in parts. */
function NameHints({ fields, onPick }: { fields: TypeField[]; onPick: (name: string) => void }) {
  const t = useXT();
  const locale = useLocale();
  const names = [
    ...["title", "status", "due", "created"].map((k) => ({ key: k, label: t(`computed.builtin.${k}`) })),
    ...fields.filter((f) => !f.sensitive && !["file", "image", "location", "external"].includes(f.type)).map((f) => ({ key: f.key, label: local(f.label, locale) })),
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {names.map((n) => (
        <button key={n.key} type="button" className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent" title={n.label} onClick={() => onPick(n.key)}>
          {n.key}
        </button>
      ))}
    </div>
  );
}

function ExprInput({ value, onChange, fields, placeholder, label }: { value: string; onChange: (v: string) => void; fields: TypeField[]; placeholder: string; label: string }) {
  return (
    <div className="space-y-1">
      <textarea className="min-h-16 w-full rounded-md border border-input bg-background p-2 font-mono text-sm" spellCheck={false} maxLength={2000} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} />
      <NameHints fields={fields} onPick={(n) => onChange(value ? `${value.replace(/\s*$/, "")} ${n}` : n)} />
    </div>
  );
}

const plain = (v: unknown) => (v && typeof v === "object" ? JSON.stringify(v) : String(v));

export function FormulaEditor({ type, fieldKey, value, onChange }: { type: ObjectType; fieldKey: string | null; value: FormulaDef; onChange: (v: FormulaDef) => void }) {
  const t = useXT();
  const fields = useMemo(() => type.fields.filter((f) => f.key !== fieldKey), [type.fields, fieldKey]);
  const check = useCheck(type.key, { kind: "formula", expr: value.expr, result: value.result, ...(value.result === "money" ? { currency: value.currency ?? "EUR" } : {}), ...(fieldKey ? { field: fieldKey } : {}) });
  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">{t("computed.formula")}</span>
        <ExprInput value={value.expr} onChange={(expr) => onChange({ ...value, expr })} fields={fields} placeholder="amount * chance / 100" label={t("computed.formula")} />
      </label>
      <CheckLine check={check} example={plain} />
      <div className="flex flex-wrap gap-2">
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">{t("computed.result")}</span>
          <select className={cn(selectClass, "w-auto")} value={value.result} onChange={(e) => onChange({ ...value, result: e.target.value as FormulaResult })}>
            {RESULTS.map((r) => (
              <option key={r} value={r}>
                {t(`computed.result_${r}`)}
              </option>
            ))}
          </select>
        </label>
        {value.result === "money" && (
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">{t("computed.currency")}</span>
            <select className={cn(selectClass, "w-auto")} value={value.currency ?? "EUR"} onChange={(e) => onChange({ ...value, currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("computed.formula_help")}</p>
    </div>
  );
}

export function RollupEditor({ type, types, value, onChange }: { type: ObjectType; types: ObjectType[]; value: RollupDef; onChange: (v: RollupDef) => void }) {
  const t = useXT();
  const locale = useLocale();
  // Types with a ref field that points here, and those fields.
  const sources = useMemo(() => types.filter((x) => x.fields.some((f) => (f.type === "ref" || f.type === "refs") && f.ref === type.key)), [types, type.key]);
  const from = sources.find((x) => x.key === value.from);
  const vias = (from?.fields ?? []).filter((f) => (f.type === "ref" || f.type === "refs") && f.ref === type.key);
  const numbers = (from?.fields ?? []).filter((f) => f.type !== "rollup" && !f.sensitive && ["number", "money"].includes(asValueField(f).type));
  const check = useCheck(type.key, value.where?.trim() && from ? { kind: "where", expr: value.where, from: from.key } : null);
  if (sources.length === 0) return <Notice kind="info">{t("computed.rollup_none")}</Notice>;
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">{t("computed.rollup_from")}</span>
          <select
            className={selectClass}
            value={value.from}
            onChange={(e) => {
              const next = sources.find((x) => x.key === e.target.value);
              const via = next?.fields.find((f) => (f.type === "ref" || f.type === "refs") && f.ref === type.key)?.key ?? "";
              onChange({ from: e.target.value, via, op: value.op });
            }}
          >
            <option value="">—</option>
            {sources.map((x) => (
              <option key={x.key} value={x.key}>
                {local(x.plural, locale)}
              </option>
            ))}
          </select>
        </label>
        {vias.length > 1 && (
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">{t("computed.rollup_via")}</span>
            <select className={selectClass} value={value.via} onChange={(e) => onChange({ ...value, via: e.target.value })}>
              {vias.map((f) => (
                <option key={f.key} value={f.key}>
                  {local(f.label, locale)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">{t("computed.rollup_op")}</span>
          <select className={selectClass} value={value.op} onChange={(e) => onChange({ ...value, op: e.target.value as RollupOp, ...(e.target.value === "count" ? { field: undefined } : { field: value.field ?? numbers[0]?.key }) })}>
            {OPS.map((op) => (
              <option key={op} value={op} disabled={op !== "count" && numbers.length === 0}>
                {t(`computed.op_${op}`)}
              </option>
            ))}
          </select>
        </label>
        {value.op !== "count" && (
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">{t("computed.rollup_field")}</span>
            <select className={selectClass} value={value.field ?? ""} onChange={(e) => onChange({ ...value, field: e.target.value })}>
              {numbers.map((f) => (
                <option key={f.key} value={f.key}>
                  {local(f.label, locale)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {from && (
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">{t("computed.rollup_where")}</span>
          <ExprInput value={value.where ?? ""} onChange={(where) => onChange({ ...value, where })} fields={from.fields} placeholder={'status == "won"'} label={t("computed.rollup_where")} />
          <CheckLine check={check} />
        </label>
      )}
    </div>
  );
}

function RuleRow({ type, rule, onChange, onRemove }: { type: ObjectType; rule: TypeRule; onChange: (r: TypeRule) => void; onRemove: () => void }) {
  const t = useXT();
  const check = useCheck(type.key, { kind: "rule", expr: rule.when });
  return (
    <li className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-xs text-muted-foreground">{t("computed.rule_when")}</span>
          <ExprInput value={rule.when} onChange={(when) => onChange({ ...rule, when })} fields={type.fields} placeholder={'status == "won" and empty(close_on)'} label={t("computed.rule_when")} />
          <CheckLine check={check} example={(v) => (v ? t("computed.rule_breaks") : t("computed.rule_passes"))} />
        </div>
        <button type="button" className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label={t("computed.rule_remove")} onClick={onRemove}>
          <Trash className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={rule.message.de} maxLength={300} onChange={(e) => onChange({ ...rule, message: { ...rule.message, de: e.target.value } })} placeholder={t("computed.rule_message_de")} aria-label={t("computed.rule_message_de")} />
        <Input value={rule.message.en} maxLength={300} onChange={(e) => onChange({ ...rule, message: { ...rule.message, en: e.target.value } })} placeholder={t("computed.rule_message_en")} aria-label={t("computed.rule_message_en")} />
      </div>
    </li>
  );
}

/** The type's rules: each a condition under which a record is refused, with its message. */
export function RulesEditor({ type, onSaved }: { type: ObjectType; onSaved: (t: ObjectType) => void }) {
  const t = useXT();
  const [rules, setRules] = useState<TypeRule[]>(type.rules ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setRules(type.rules ?? []), [type.rules]);
  const changed = JSON.stringify(rules) !== JSON.stringify(type.rules ?? []);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await projectsApi.setRules(type.key, rules));
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("computed.rules_help")}</p>
      {error && <Notice kind="error">{error}</Notice>}
      <ul className="space-y-2">
        {rules.map((r, i) => (
          <RuleRow key={r.id} type={type} rule={r} onChange={(next) => setRules(rules.map((x, j) => (j === i ? next : x)))} onRemove={() => setRules(rules.filter((_, j) => j !== i))} />
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {rules.length < 30 && (
          <Button size="sm" variant="outline" onClick={() => setRules([...rules, { id: `rule-${Date.now().toString(36)}`, when: "", message: { de: "", en: "" } }])}>
            <Plus className="mr-1 h-4 w-4" />
            {t("computed.rule_add")}
          </Button>
        )}
        {changed && (
          <Button size="sm" onClick={() => void save()} disabled={busy || rules.some((r) => !r.when.trim() || !(r.message.de.trim() || r.message.en.trim()))}>
            {t("common.save")}
          </Button>
        )}
      </div>
    </div>
  );
}

/** "berechnet": the mark on a computed value in cards and the editor. */
export function ComputedMark({ field }: { field: TypeField }) {
  const t = useXT();
  if (!COMPUTED_KINDS.includes(field.type)) return null;
  return (
    <span className="ml-1 rounded bg-muted px-1 py-0.5 text-[10px] font-normal text-muted-foreground" title={field.formula?.expr}>
      {t("computed.mark")}
    </span>
  );
}
