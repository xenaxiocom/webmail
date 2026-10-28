import { beforeEach, describe, expect, it, vi } from 'vitest';

// Step 64: in xenaxio the settings are kept by the platform (/api/settings),
// the same in every browser and on every company address.

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/browser-navigation', () => ({ apiFetch, withBasePath: (p: string) => p, getLocaleFromPath: () => 'en' }));
vi.mock('@/lib/xenaxio/bff', async (orig) => ({ ...(await orig<typeof import('@/lib/xenaxio/bff')>()), XENAXIO_BFF: true }));

import { useSettingsStore } from '../settings-store';
import { useTemplateStore } from '../template-store';
import { useCalendarStore } from '../calendar-store';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const user = 'anna@acme.de';
const server = 'https://acme.test/api/jmap';
const posts = () => apiFetch.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST');

describe('settings sync with the xenaxio platform', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    localStorage.clear();
    useSettingsStore.getState().disableSync();
    useSettingsStore.setState({ sendDelaySeconds: 0, settingsSyncDisabled: false });
    useTemplateStore.setState({ templates: [], recentTemplateIds: [], deletedTemplateIds: {} });
    useCalendarStore.setState({ icalSubscriptions: [], deletedSubscriptionIds: {} });
  });

  it('shows what another browser saved', async () => {
    apiFetch.mockResolvedValue(json({ settings: { sendDelaySeconds: 60 } }));
    expect(await useSettingsStore.getState().loadFromServer(user, server)).toBe(true);
    expect(useSettingsStore.getState().sendDelaySeconds).toBe(60);
    expect(posts()).toHaveLength(0);
  });

  it('saves what this browser has on the first sign-in, when nothing is stored yet', async () => {
    useSettingsStore.setState({ sendDelaySeconds: 10 });
    apiFetch.mockResolvedValue(json({ settings: null }));
    await useSettingsStore.getState().loadFromServer(user, server);
    apiFetch.mockReset().mockResolvedValueOnce(json({ settings: null })).mockResolvedValueOnce(json({ ok: true }));
    useSettingsStore.getState().enableSync(user, server);
    await useSettingsStore.getState().flushSync();

    expect(posts()).toHaveLength(1);
    const [url, init] = posts()[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('/api/settings');
    expect(init.headers['x-xenaxio-csrf']).toBe('1');
    expect(JSON.parse(init.body as string)).toMatchObject({ username: user, settings: { sendDelaySeconds: 10 } });
  });

  it('saves a change, keeping a template another browser added', async () => {
    apiFetch.mockResolvedValue(json({ settings: { sendDelaySeconds: 0 } }));
    await useSettingsStore.getState().loadFromServer(user, server);
    useSettingsStore.getState().enableSync(user, server);

    const other = { id: 'other', name: 'Other', subject: '', body: '', isHTML: false, category: '', isFavorite: false, createdAt: '2026-10-28T08:00:00Z', updatedAt: '2026-10-28T08:00:00Z' };
    apiFetch.mockReset()
      .mockResolvedValueOnce(json({ settings: { sendDelaySeconds: 0, templates: [other], deletedTemplateIds: {} } }))
      .mockResolvedValueOnce(json({ ok: true }));
    useSettingsStore.getState().updateSetting('sendDelaySeconds', 30);
    await useSettingsStore.getState().flushSync();

    const sent = JSON.parse((posts()[0][1] as RequestInit).body as string);
    expect(sent.settings.sendDelaySeconds).toBe(30);
    expect(sent.settings.templates.map((t: { id: string }) => t.id)).toEqual(['other']);
  });
});
