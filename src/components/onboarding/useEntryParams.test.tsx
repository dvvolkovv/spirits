// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { flush, mount, type Mounted } from '../../test/dom';
import { useEntryParams } from './useEntryParams';

const Probe = () => { useEntryParams(); return null; };

let view: Mounted | null = null;
beforeEach(() => localStorage.clear());
afterEach(() => { view?.unmount(); view = null; });

describe('параметры входа', () => {
  it('рефссылка запоминается на 7 дней', async () => {
    view = mount(<MemoryRouter initialEntries={['/chat?ref=abc']}><Probe /></MemoryRouter>);
    await flush();
    expect(localStorage.getItem('referral_slug')).toBe('abc');
    expect(Number(localStorage.getItem('referral_slug_expires'))).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000);
  });

  it('ассистент из адреса — намерение', async () => {
    view = mount(<MemoryRouter initialEntries={['/chat?assistant=14']}><Probe /></MemoryRouter>);
    await flush();
    expect(JSON.parse(localStorage.getItem('pending_assistant') ?? 'null')?.value).toBe('14');
  });
});
