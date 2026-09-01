// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../components/AppShell';
import { AccountsPage } from './AccountsPage';
import type { ConnectedAccount } from '../types/finance';

const connectedAccounts: ConnectedAccount[] = [
  {
    accountId: 'healthy-1',
    institutionName: 'Chase',
    accountName: 'Everyday Checking',
    accountMask: '1234',
    accountType: 'depository',
    accountSubtype: 'checking',
    health: 'healthy',
  },
  {
    accountId: 'attention-1',
    institutionName: 'Chase',
    accountName: 'Sapphire Card',
    accountMask: '5678',
    accountType: 'credit',
    accountSubtype: 'credit card',
    health: 'login_required',
  },
  {
    accountId: 'pending-1',
    institutionName: 'Ally Bank',
    accountName: 'Online Savings',
    accountMask: '9012',
    accountType: 'depository',
    accountSubtype: 'savings',
    health: 'pending_disconnect',
  },
  {
    accountId: 'disconnected-1',
    institutionName: 'Legacy Credit Union',
    accountName: 'Old Checking',
    accountMask: '3456',
    accountType: 'depository',
    accountSubtype: 'checking',
    health: 'disconnected',
  },
];

function apiResponse(data: unknown, ok = true): Response {
  return {
    ok,
    json: async () => data,
  } as Response;
}

describe('AccountsPage', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    // @ts-ignore React act environment flag used by the existing native test setup.
    global.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderAccounts(
    data: unknown = connectedAccounts,
    setActiveTab = vi.fn()
  ) {
    const apiFetch = vi.fn(async () => apiResponse(data));

    await act(async () => {
      root.render(
        <AccountsPage
          apiFetch={apiFetch}
          refreshKey={0}
          setActiveTab={setActiveTab}
        />
      );
    });

    return { apiFetch, setActiveTab };
  }

  it('renders account identity, institution, mask, type, subtype, and health without balances', async () => {
    const { apiFetch } = await renderAccounts();

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Everyday Checking');
    });

    expect(container.textContent).toContain('Chase');
    expect(container.textContent).toContain('••••1234');
    expect(container.textContent).toContain('Deposit account');
    expect(container.textContent).toContain('Checking');
    expect(container.textContent).toContain('Connected');
    expect(container.textContent).toContain('Needs attention');
    expect(container.textContent).toContain('Action needed soon');
    expect(container.textContent).toContain('Disconnected');
    expect(container.textContent).toContain('Old Checking');

    expect(container.querySelector('[data-testid="known-accounts-count"]')?.textContent).toBe('4');
    expect(container.querySelector('[data-testid="institutions-count"]')?.textContent).toBe('3');
    expect(container.querySelector('[data-testid="need-attention-count"]')?.textContent).toBe('2');

    expect(apiFetch).toHaveBeenCalledWith('/api/connected-accounts');
    expect(apiFetch).not.toHaveBeenCalledWith('/api/accounts');
    expect(container.textContent).not.toMatch(/Current balance|Available balance|Credit limit|Net worth|\$/i);
  });

  it('treats an empty array as a successful empty state and links to Settings', async () => {
    const setActiveTab = vi.fn();
    await renderAccounts([], setActiveTab);

    await vi.waitFor(() => {
      expect(container.textContent).toContain('No accounts found');
    });

    expect(container.textContent).not.toContain('Unable to load accounts');
    const settingsButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent?.includes('Go to Settings')
    );
    expect(settingsButton).toBeDefined();

    act(() => settingsButton?.click());
    expect(setActiveTab).toHaveBeenCalledWith('settings');
  });

  it('shows an error and retry action for a malformed non-array response', async () => {
    await renderAccounts({ accounts: connectedAccounts });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Unable to load accounts');
    });

    expect(container.textContent).toContain('Invalid connected accounts response.');
    expect(Array.from(container.querySelectorAll('button')).some(
      button => button.textContent?.includes('Retry')
    )).toBe(true);
  });

  it('navigates to Settings from Manage connections', async () => {
    const setActiveTab = vi.fn();
    await renderAccounts(connectedAccounts, setActiveTab);

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Manage connections');
    });

    const manageButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent?.trim() === 'Manage connections'
    );
    act(() => manageButton?.click());

    expect(setActiveTab).toHaveBeenCalledWith('settings');
  });

  it('filters connected, attention, and disconnected accounts using shared semantics', async () => {
    await renderAccounts();
    await vi.waitFor(() => expect(container.textContent).toContain('Everyday Checking'));

    const button = (label: string) => Array.from(container.querySelectorAll('button')).find(
      item => item.textContent?.includes(label)
    );

    act(() => button('Connected')?.click());
    expect(container.textContent).toContain('Everyday Checking');
    expect(container.textContent).not.toContain('Sapphire Card');
    expect(container.textContent).not.toContain('Online Savings');
    expect(container.textContent).not.toContain('Old Checking');

    act(() => button('Needs Attention')?.click());
    expect(container.textContent).toContain('Sapphire Card');
    expect(container.textContent).toContain('Online Savings');
    expect(container.textContent).not.toContain('Everyday Checking');
    expect(container.textContent).not.toContain('Old Checking');

    act(() => button('Disconnected')?.click());
    expect(container.textContent).toContain('Old Checking');
    expect(container.textContent).not.toContain('Online Savings');
  });

  it('sorts institutions and accounts deterministically', async () => {
    const unsorted: ConnectedAccount[] = [
      {
        ...connectedAccounts[0],
        accountId: 'z-2',
        institutionName: 'Zeta Bank',
        accountName: 'Zulu Checking',
      },
      {
        ...connectedAccounts[0],
        accountId: 'a-2',
        institutionName: 'Alpha Bank',
        accountName: 'Second Checking',
      },
      {
        ...connectedAccounts[0],
        accountId: 'a-1',
        institutionName: 'Alpha Bank',
        accountName: 'First Checking',
      },
    ];
    await renderAccounts(unsorted);
    await vi.waitFor(() => expect(container.textContent).toContain('Zeta Bank'));

    const institutionHeadings = Array.from(container.querySelectorAll('section h2')).map(
      heading => heading.textContent
    );
    expect(institutionHeadings).toEqual(['Alpha Bank', 'Zeta Bank']);

    const cards = Array.from(container.querySelectorAll('[data-account-name]')).map(
      card => card.getAttribute('data-account-name')
    );
    expect(cards).toEqual(['First Checking', 'Second Checking', 'Zulu Checking']);
  });

  it('preserves previously loaded cards when a refresh fails', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce(apiResponse(connectedAccounts))
      .mockRejectedValueOnce(new Error('network unavailable'));
    const setActiveTab = vi.fn();

    await act(async () => {
      root.render(<AccountsPage apiFetch={apiFetch} refreshKey={0} setActiveTab={setActiveTab} />);
    });
    await vi.waitFor(() => expect(container.textContent).toContain('Everyday Checking'));

    await act(async () => {
      root.render(<AccountsPage apiFetch={apiFetch} refreshKey={1} setActiveTab={setActiveTab} />);
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain(
        "Couldn't refresh account status. Showing the last loaded information."
      );
    });
    expect(container.textContent).toContain('Everyday Checking');
  });
});

describe('Accounts navigation', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    // @ts-ignore React act environment flag used by the existing native test setup.
    global.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('enables Accounts in desktop and mobile navigation', () => {
    const setActiveTab = vi.fn();
    act(() => {
      root.render(
        <AppShell
          syncing={false}
          onSync={vi.fn()}
          activeTab="overview"
          setActiveTab={setActiveTab}
        >
          <div>Content</div>
        </AppShell>
      );
    });

    const accountsButtons = Array.from(container.querySelectorAll('button')).filter(
      button => button.textContent?.trim() === 'Accounts'
    );
    expect(accountsButtons).toHaveLength(2);
    expect(accountsButtons.every(button => !button.disabled)).toBe(true);
    expect(container.textContent).not.toContain('Soon');

    act(() => accountsButtons.forEach(button => button.click()));
    expect(setActiveTab).toHaveBeenCalledTimes(2);
    expect(setActiveTab).toHaveBeenNthCalledWith(1, 'accounts');
    expect(setActiveTab).toHaveBeenNthCalledWith(2, 'accounts');
  });
});
