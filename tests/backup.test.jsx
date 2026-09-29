// @vitest-environment happy-dom
// 設定の「控えとお知らせ」（試験データは作り物だけ）
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppContext } from '../src/app-context.js';
import { BackupInfo } from '../src/screens/Settings.jsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T12:00:00+09:00'));
});

const show = (st) =>
  render(
    <AppContext.Provider value={{ st: { phase: 'ready', ...st } }}>
      <BackupInfo />
    </AppContext.Provider>,
  );

describe('控えとお知らせ', () => {
  it('最後の控えの日と行数を出す', () => {
    show({ backup: { at: '2026-11-01T03:10:00.000+09:00', rows: 123 } });
    expect(screen.getByText('最後の控え：26年11月1日（123行）')).toBeTruthy();
    expect(screen.queryByText(/控えができていません/)).toBeNull();
  });

  it('40日より古ければ知らせる', () => {
    show({ backup: { at: '2026-10-01T03:10:00.000+09:00', rows: 5 } });
    expect(screen.getByText('40日以上、控えができていません。GAS の時間指定を確かめてください')).toBeTruthy();
  });

  it('まだなければ「まだありません」。読み込み前は出さない', () => {
    show({ backup: null });
    expect(screen.getByText('控えはまだありません')).toBeTruthy();
    cleanup();
    show({ phase: 'loading', backup: null });
    expect(screen.queryByText('控えとお知らせ')).toBeNull();
  });
});
