import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '../api';
import { appKind, cleanPath, cleanPayload, cleanReferrer, resetStatsForTests, sessionData, startStats, statsEvent, statsSession } from '../stats';

const ORIGIN = 'https://acme.xenaxio.com';
const CONFIG = { websiteId: '8cc7aecc-1d43-4cf4-ac58-bff037fdabae', product: 'xenaxio' as const };

function me(overrides: Partial<Me> = {}): Me {
  return {
    user: { id: 'u1', email: 'eva@acme.de', displayName: 'Eva Berg', role: 'admin', mustChangePassword: false, kind: 'mailbox' },
    tenant: { id: 't1', name: 'Acme GmbH', status: 'active', product: 'workspace', plan: null },
    edition: 'cloud',
    portal: { name: 'Acme GmbH', slug: 'acme', url: ORIGIN, color: null, colorText: null, logoUrl: null, iconUrl: null, iconBackground: null, background: null },
    ...overrides,
  } as Me;
}

describe('step 102: the screen as a template', () => {
  it('drops the locale, ids, folder and mailbox names', () => {
    expect(cleanPath('/de/mail/inbox/Mxyz123')).toBe('/mail');
    expect(cleanPath('/en/mail/Kunde%20M%C3%BCller')).toBe('/mail');
    expect(cleanPath('/de/files/Vertr%C3%A4ge/2026')).toBe('/files');
    expect(cleanPath('/de/contacts/c-81f2')).toBe('/contacts');
    expect(cleanPath('/de/calendar/2026-10-31')).toBe('/calendar');
    expect(cleanPath('/de/book/eva/first-call')).toBe('/book');
    expect(cleanPath('/de/meet/abc-defg-hij')).toBe('/meet');
    expect(cleanPath('/')).toBe('/');
    expect(cleanPath('/de/')).toBe('/');
  });

  it('keeps the fixed page names of the admin pages and settings', () => {
    expect(cleanPath('/de/workspace/users')).toBe('/workspace/users');
    expect(cleanPath('/en/workspace/ai/permissions')).toBe('/workspace/ai/permissions');
    expect(cleanPath('/de/settings/mail-apps')).toBe('/settings/mail-apps');
    expect(cleanPath('/de/rooms/start')).toBe('/rooms/start');
    // Anything that is not a page name stops there.
    expect(cleanPath('/de/settings/acc_12')).toBe('/settings');
    expect(cleanPath('/de/workspace/users/4f9a2c')).toBe('/workspace/users');
    expect(cleanPath('/de/settings/a/b')).toBe('/settings/a');
  });

  it('counts unknown screens as one and never the operator console', () => {
    expect(cleanPath('/de/something-new')).toBe('/other');
    expect(cleanPath('/de/operator')).toBeNull();
    expect(cleanPath('/admin/settings')).toBeNull();
  });

  it('copes with a mount prefix before the locale', () => {
    expect(cleanPath('/webmail/de/mail/inbox/1')).toBe('/mail');
  });
});

describe('step 102: what is sent', () => {
  it('a referrer on this address becomes its template, an outside one only its origin', () => {
    expect(cleanReferrer('/de/mail/inbox/abc', ORIGIN)).toBe('/mail');
    expect(cleanReferrer(`${ORIGIN}/de/files/Privat?x=1`, ORIGIN)).toBe('/files');
    expect(cleanReferrer('https://mail.google.com/mail/u/0/#inbox/FMfcg', ORIGIN)).toBe('https://mail.google.com/');
    expect(cleanReferrer('', ORIGIN)).toBe('');
    expect(cleanReferrer(undefined, ORIGIN)).toBe('');
    expect(cleanReferrer('javascript:alert(1)', ORIGIN)).toBe('');
  });

  it('replaces url and title, drops a distinct id and the operator console', () => {
    const payload = {
      website: CONFIG.websiteId,
      url: `${ORIGIN}/de/mail/inbox/abc?q=Rechnung#x`,
      title: 'Acme GmbH - Posteingang - eva@acme.de - Xenaxio',
      referrer: '/de/contacts/c-1',
      id: 'eva@acme.de',
      screen: '1920x1080',
    };
    expect(cleanPayload('event', payload, ORIGIN)).toEqual({ website: CONFIG.websiteId, url: '/mail', title: '/mail', referrer: '/contacts', screen: '1920x1080' });
    expect(cleanPayload('event', { ...payload, url: `${ORIGIN}/de/operator` }, ORIGIN)).toBeNull();
    // Event data stays only when it is flat.
    expect(cleanPayload('event', { ...payload, name: 'x', data: { area: 'form' } }, ORIGIN)).toMatchObject({ data: { area: 'form' } });
    expect(cleanPayload('event', { ...payload, name: 'x', data: { nested: { a: 1 } } }, ORIGIN)).not.toHaveProperty('data');
    // The visit's own data goes along on identify.
    expect(cleanPayload('identify', { ...payload, data: { company: 'acme' } }, ORIGIN)).toMatchObject({ data: { company: 'acme' } });
  });

  it('counts the visit under the company, never the person', () => {
    const data = sessionData(CONFIG, me(), 'browser');
    expect(data).toEqual({ product: 'xenaxio', app: 'browser', visitor: 'account', role: 'admin', company: 'acme' });
    expect(JSON.stringify(data)).not.toMatch(/eva|Berg|u1|t1/);
    expect(sessionData({ ...CONFIG, product: 'xenrooms' }, me({ tenant: { id: 't', name: 'B', status: 'active', product: 'rooms', plan: 'free' } }), 'installed')).toMatchObject({
      product: 'xenrooms',
      plan: 'free',
      app: 'installed',
    });
    expect(sessionData(CONFIG, me({ demo: { expiresAt: '', extendable: false, links: { site: '', quote: '', book: null } } }), 'browser').company).toBe('demo');
    expect(sessionData(CONFIG, null, 'browser')).toEqual({ product: 'xenaxio', app: 'browser', visitor: 'guest' });
  });

  it('tells an installed app from a browser tab', () => {
    const win = (standalone: boolean, ua = 'Mozilla/5.0') => ({ matchMedia: (q: string) => ({ matches: standalone && q.includes('standalone') }), navigator: { userAgent: ua } }) as unknown as Window;
    expect(appKind(win(true))).toBe('installed');
    expect(appKind(win(false))).toBe('browser');
    expect(appKind(win(false, 'Mozilla/5.0 XenRooms/1.0 Electron/33.0.0'))).toBe('installed');
  });
});

describe('step 102: the tracker', () => {
  afterEach(() => {
    resetStatsForTests();
    document.head.querySelectorAll('script[src="/_stats/script.js"]').forEach((s) => s.remove());
    delete (window as { umami?: unknown }).umami;
  });

  it('loads nothing without statistics (on-prem) and drops events then', () => {
    startStats({ kind: 'app', portals: false, baseDomain: null });
    statsEvent('sign-in');
    expect(document.querySelector('script[src="/_stats/script.js"]')).toBeNull();
  });

  it('loads the script from this address and sends what waited once it is there', () => {
    startStats({ kind: 'tenant', ...me().portal!, stats: CONFIG });
    startStats({ kind: 'tenant', ...me().portal!, stats: CONFIG });
    const scripts = document.querySelectorAll<HTMLScriptElement>('script[src="/_stats/script.js"]');
    expect(scripts).toHaveLength(1);
    const script = scripts[0];
    expect(script.dataset).toMatchObject({ websiteId: CONFIG.websiteId, hostUrl: '/_stats', doNotTrack: 'true', excludeSearch: 'true', excludeHash: 'true', beforeSend: '__xenaxioStatsBeforeSend' });

    statsEvent('assistant-open');
    statsSession({ product: 'xenaxio', company: 'acme' });
    statsSession({ product: 'xenaxio', company: 'acme' });
    const umami = { track: vi.fn().mockResolvedValue(undefined), identify: vi.fn().mockResolvedValue(undefined) };
    (window as { umami?: unknown }).umami = umami;
    script.dispatchEvent(new Event('load'));
    expect(umami.track).toHaveBeenCalledWith('assistant-open', undefined);
    expect(umami.identify).toHaveBeenCalledTimes(1);
    expect(umami.identify).toHaveBeenCalledWith({ product: 'xenaxio', company: 'acme' });
    statsEvent('sign-out');
    expect(umami.track).toHaveBeenCalledWith('sign-out', undefined);
    // The hook Umami calls before each send.
    const hook = (window as unknown as Record<string, (t: string, p: Record<string, unknown>) => unknown>).__xenaxioStatsBeforeSend;
    expect(hook('event', { url: `${window.location.origin}/de/mail/inbox/1`, title: 'eva@acme.de' })).toMatchObject({ url: '/mail', title: '/mail' });
  });
});
