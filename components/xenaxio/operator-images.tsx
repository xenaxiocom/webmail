"use client";

// Step 106, part C: the pictures people upload that others see — profile
// pictures, banners, company logos, the company's meeting background and own
// emoji. The operator marks them as checked, hides them (30 days, can be put
// back) or deletes them, and blocks the person or the company from a picture.
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Notice, Spinner } from "@/components/xenaxio/ui";
import {
  errorKey,
  type GalleryFilter,
  type GalleryImage,
  galleryImageUrl,
  type GalleryKind,
  type HiddenImage,
  hiddenImageUrl,
  xenaxio,
} from "@/lib/xenaxio/api";
import { withBasePath } from "@/lib/browser-navigation";
import { useXT } from "@/lib/xenaxio/i18n";

const SELECT = "h-9 rounded-md border border-input bg-background px-2 text-sm";
const KINDS: GalleryKind[] = ["avatar", "banner", "logo", "meeting_background", "emoji"];

function Picture({ src, contentType, alt }: { src: string; contentType: string; alt: string }) {
  if (contentType.startsWith("video/")) return <video src={withBasePath(src)} muted loop playsInline autoPlay className="h-full w-full object-contain" aria-label={alt} />;
  return <img src={withBasePath(src)} alt={alt} loading="lazy" className="h-full w-full object-contain" />;
}

function useDate() {
  const locale = useLocale();
  return (s: string) => new Date(s).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

function Card({ image, onChanged, onMessage }: { image: GalleryImage; onChanged: () => void; onMessage: (kind: "success" | "error", text: string) => void }) {
  const t = useXT();
  const date = useDate();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      onMessage("success", done);
      onChanged();
    } catch (err) {
      onMessage("error", t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  };
  const ask = (question: string) => {
    const reason = window.prompt(question)?.trim();
    return reason && reason.length >= 3 ? reason : null;
  };
  const remove = (mode: "hide" | "delete") => {
    const reason = ask(t(mode === "hide" ? "operator.images_hide_reason" : "operator.images_delete_reason"));
    if (reason) void run(() => xenaxio.operator.removeImage(image.kind, image.ref, reason, mode), t(mode === "hide" ? "operator.images_hidden_done" : "operator.images_deleted_done"));
  };
  const blockPerson = () => {
    const email = image.owner.email;
    if (!email) return;
    const reason = ask(t("operator.images_block_reason", { email }));
    if (reason) void run(() => xenaxio.operator.blockPerson({ email, reason, blockSignup: true, blockDomain: false, notify: true }), t("operator.images_person_blocked", { email }));
  };
  const blockCompany = () => {
    if (!window.confirm(t("operator.images_block_company_confirm", { company: image.company }))) return;
    void run(() => xenaxio.operator.setTenantBlocked(image.tenantId, true), t("operator.images_company_blocked", { company: image.company }));
  };
  const label = t(`operator.images_kind_${image.kind}`);
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex aspect-square items-center justify-center bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
        <Picture src={galleryImageUrl(image.kind, image.ref, image.animated && (image.kind === "avatar" || image.kind === "banner"))} contentType={image.contentType} alt={`${label} — ${image.company}`} />
      </div>
      <div className="flex-1 space-y-0.5 p-2 text-xs">
        <div className="font-medium">
          {label} {image.reviewed && <span className="ml-1 rounded bg-muted px-1 text-muted-foreground">{t("operator.images_reviewed")}</span>}
        </div>
        <div className="break-words">
          {image.company}
          {image.plan === "free" && <span className="text-muted-foreground"> · Free</span>}
        </div>
        {image.owner.email && <div className="break-all text-muted-foreground">{image.owner.name ? `${image.owner.name} · ` : ""}{image.owner.email}</div>}
        <div className="text-muted-foreground">{date(image.version)}</div>
      </div>
      <div className="flex flex-wrap gap-1 border-t border-border p-2">
        {!image.reviewed && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => xenaxio.operator.reviewImages([{ kind: image.kind, ref: image.ref, version: image.version }]), t("operator.images_reviewed_done"))}>
            {t("operator.images_review")}
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => remove("hide")}>
          {t("operator.images_hide")}
        </Button>
        <Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => remove("delete")}>
          {t("operator.images_delete")}
        </Button>
        {image.owner.kind === "person" && image.owner.email && (
          <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={blockPerson}>
            {t("operator.images_block_person")}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={blockCompany}>
          {t("operator.images_block_company")}
        </Button>
      </div>
    </div>
  );
}

function Hidden({ onMessage }: { onMessage: (kind: "success" | "error", text: string) => void }) {
  const t = useXT();
  const date = useDate();
  const [list, setList] = useState<HiddenImage[] | null>(null);
  useEffect(() => {
    xenaxio.operator.hiddenImages().then(setList, (err) => onMessage("error", t(errorKey(err))));
  }, [onMessage, t]);
  const act = async (fn: () => Promise<HiddenImage[]>, done: string) => {
    try {
      setList(await fn());
      onMessage("success", done);
    } catch (err) {
      onMessage("error", t(errorKey(err)));
    }
  };
  if (!list) return <Spinner label={t("operator.loading")} />;
  if (!list.length) return <p className="text-sm text-muted-foreground">{t("operator.images_hidden_none")}</p>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {list.map((h) => (
        <div key={h.id} className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex aspect-square items-center justify-center bg-muted/40">
            <Picture src={hiddenImageUrl(h.id)} contentType={h.contentType} alt={`${t(`operator.images_kind_${h.kind}`)} — ${h.company}`} />
          </div>
          <div className="flex-1 space-y-0.5 p-2 text-xs">
            <div className="font-medium">{t(`operator.images_kind_${h.kind}`)}</div>
            <div className="break-words">{h.company}</div>
            {h.ownerEmail && <div className="break-all text-muted-foreground">{h.ownerEmail}</div>}
            <div className="text-muted-foreground">— {h.reason}</div>
            <div className="text-muted-foreground">{t("operator.images_hidden_at", { at: date(h.hiddenAt), by: h.hiddenBy ?? "—" })}</div>
            <div className="text-muted-foreground">{t("operator.images_deletes_at", { at: date(h.deletesAt) })}</div>
          </div>
          <div className="flex flex-wrap gap-1 border-t border-border p-2">
            <Button size="sm" variant="outline" onClick={() => void act(() => xenaxio.operator.restoreImage(h.id), t("operator.images_restored_done"))}>
              {t("operator.images_restore")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive"
              onClick={() => {
                if (window.confirm(t("operator.images_purge_confirm"))) void act(() => xenaxio.operator.purgeImage(h.id), t("operator.images_deleted_done"));
              }}
            >
              {t("operator.images_delete")}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function OperatorImages() {
  const t = useXT();
  const [view, setView] = useState<"new" | "all" | "hidden">("new");
  const [filter, setFilter] = useState<GalleryFilter>({ page: 1 });
  const [search, setSearch] = useState("");
  const [data, setData] = useState<{ images: GalleryImage[]; total: number; newCount: number; pageSize: number } | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const onMessage = useCallback((kind: "success" | "error", text: string) => setNotice({ kind, text }), []);

  useEffect(() => {
    const timer = setTimeout(() => setFilter((f) => (f.q === (search.trim() || undefined) ? f : { ...f, q: search.trim() || undefined, page: 1 })), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (view === "hidden") return;
    let current = true;
    xenaxio.operator.images({ ...filter, status: view }).then(
      (r) => current && setData(r),
      (err) => current && setNotice({ kind: "error", text: t(errorKey(err)) }),
    );
    return () => {
      current = false;
    };
  }, [filter, view, version, t]);

  const set = <K extends keyof GalleryFilter>(key: K, value: GalleryFilter[K] | "") => setFilter((f) => ({ ...f, [key]: value === "" ? undefined : value, page: 1 }));
  const page = filter.page ?? 1;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const unreviewed = data?.images.filter((i) => !i.reviewed) ?? [];

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("operator.images_intro")}</p>
      <div className="flex flex-wrap gap-1" role="tablist" aria-label={t("operator.tab_images")}>
        {(["new", "all", "hidden"] as const).map((v) => (
          <Button key={v} size="sm" variant={view === v ? "default" : "outline"} role="tab" aria-selected={view === v} onClick={() => setView(v)}>
            {v === "new" ? t("operator.images_view_new", { count: data?.newCount ?? 0 }) : t(`operator.images_view_${v}`)}
          </Button>
        ))}
      </div>
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      {view === "hidden" ? (
        <Hidden onMessage={onMessage} />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <input
              type="search"
              aria-label={t("operator.people_search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("operator.images_search_hint")}
              className="h-9 min-w-[200px] flex-1 rounded-md border border-input bg-background px-3 text-sm"
            />
            <select aria-label={t("operator.images_kind")} className={SELECT} value={filter.kind ?? ""} onChange={(e) => set("kind", e.target.value as GalleryKind | "")}>
              <option value="">{t("operator.images_all_kinds")}</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`operator.images_kind_${k}`)}
                </option>
              ))}
            </select>
            <select aria-label={t("operator.people_plan")} className={SELECT} value={filter.plan ?? ""} onChange={(e) => set("plan", e.target.value as GalleryFilter["plan"] | "")}>
              <option value="">{t("operator.people_all_plans")}</option>
              <option value="free">Free</option>
              <option value="paid">{t("operator.people_paid")}</option>
            </select>
            {view === "new" && unreviewed.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void xenaxio.operator.reviewImages(unreviewed.map((i) => ({ kind: i.kind, ref: i.ref, version: i.version }))).then(
                    () => {
                      setNotice({ kind: "success", text: t("operator.images_reviewed_page", { count: unreviewed.length }) });
                      reload();
                    },
                    (err) => setNotice({ kind: "error", text: t(errorKey(err)) }),
                  )
                }
              >
                {t("operator.images_review_page")}
              </Button>
            )}
          </div>
          {!data && <Spinner label={t("operator.loading")} />}
          {data && data.images.length === 0 && <p className="text-sm text-muted-foreground">{view === "new" ? t("operator.images_none_new") : t("operator.images_none")}</p>}
          {data && data.images.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {data.images.map((i) => (
                <Card key={`${i.kind}:${i.ref}:${i.version}`} image={i} onChanged={reload} onMessage={onMessage} />
              ))}
            </div>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setFilter((f) => ({ ...f, page: page - 1 }))}>
                {t("operator.people_prev")}
              </Button>
              <span className="text-muted-foreground">{t("operator.people_page", { page, pages })}</span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setFilter((f) => ({ ...f, page: page + 1 }))}>
                {t("operator.people_next")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
