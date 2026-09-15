// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../components/AppShell';
import { AccountsPage } from './AccountsPage';
import type { ConnectedAccount } from '../types/finance';

const roleFields = {
  role: 'operating' as const,
  roleSource: 'default' as const,
  defaultRole: 'operating' as const,
  suggestedRole: null,
  requiresRoleConfirmation: false,
  current: 1200,
  available: 1100,
  isoCurrencyCode: 'USD',
  fetchedAt: '2026-09-07T12:00:00.000Z',
  balanceStatus: 'fresh' as const,
  source: 'linked' as const,
  manualKind: null,
  includeInCash: true,
  includeInNetWorth: true,
  duplicateOfAccountId: null,
};

const connectedAccounts: ConnectedAccount[] = [
  {
    accountId: 'healthy-1',
    institutionName: 'Chase',
    accountName: 'Everyday Checking',
    accountMask: '1234',
    accountType: 'depository',
    accountSubtype: 'checking',
    health: 'healthy',
    ...roleFields,
  },
  {
    accountId: 'attention-1',
    institutionName: 'Chase',
    accountName: 'Sapphire Card',
    accountMask: '5678',
    accountType: 'credit',
    accountSubtype: 'credit card',
    health: 'login_required',
    ...roleFields,
    role: 'debt',
    defaultRole: 'debt',
    current: 500,
  },
  {
    accountId: 'pending-1',
    institutionName: 'Ally Bank',
    accountName: 'Online Savings',
    accountMask: '9012',
    accountType: 'depository',
    accountSubtype: 'savings',
    health: 'pending_disconnect',
    ...roleFields,
    role: 'reserve',
    defaultRole: 'reserve',
    current: 5000,
    available: 5000,
  },
  {
    accountId: 'disconnected-1',
    institutionName: 'Legacy Credit Union',
    accountName: 'Old Checking',
    accountMask: '3456',
    accountType: 'depository',
    accountSubtype: 'checking',
    health: 'disconnected',
    ...roleFields,
    current: null,
    available: null,
    isoCurrencyCode: null,
    fetchedAt: null,
    balanceStatus: 'missing',
  },
];

const connectedAccountsResponse = {
  accounts: connectedAccounts,
  summary: {
    currency: 'USD',
    buckets: {
      operating: { accountCount: 2, knownBalanceCount: 1, total: 1200 },
      reserve: { accountCount: 1, knownBalanceCount: 1, total: 5000 },
      retirement: { accountCount: 0, knownBalanceCount: 0, total: null },
      investment: { accountCount: 0, knownBalanceCount: 0, total: null },
      health_savings: { accountCount: 0, knownBalanceCount: 0, total: null },
      debt: { accountCount: 1, knownBalanceCount: 1, total: 500 },
      unassigned: { accountCount: 0, knownBalanceCount: 0, total: null },
    },
  },
  financialPosition: {
    currency: 'USD', mixedCurrency: false, liquidCash: 6200, liquidChecking: 1200, liquidSavings: 5000,
    estimatedNetWorth: 5700, includedAccountCount: 3, knownBalanceCount: 3,
    excludedDuplicateCount: 0,
    netWorthHistory: [],
    retirement: {
      total: null, accountCount: 0, knownBalanceCount: 0, shareOfNetWorth: null,
      history: [], trend: null, contributionDataAvailable: false,
    },
  },
};

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
    data: unknown = connectedAccountsResponse,
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

  it('renders account identity, health, roles, balances, and freshness', async () => {
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
    expect(container.textContent).toContain('Money by purpose');
    expect(container.textContent).toContain('$1,200.00');
    expect(container.textContent).toContain('Updated');

    expect(container.querySelector('[data-testid="known-accounts-count"]')?.textContent).toBe('4');
    expect(container.querySelector('[data-testid="institutions-count"]')?.textContent).toBe('3');
    expect(container.querySelector('[data-testid="need-attention-count"]')?.textContent).toBe('2');

    expect(apiFetch).toHaveBeenCalledWith('/api/connected-accounts');
    expect(apiFetch).not.toHaveBeenCalledWith('/api/accounts');
    expect(container.textContent).toContain('Estimated net worth');
  });

  it('treats an empty array as a successful empty state and links to Settings', async () => {
    const setActiveTab = vi.fn();
    await renderAccounts({
      accounts: [],
      summary: {
        currency: null,
        buckets: Object.fromEntries([
          'operating', 'reserve', 'retirement', 'investment', 'health_savings', 'debt', 'unassigned',
        ].map(role => [role, { accountCount: 0, knownBalanceCount: 0, total: null }])),
      },
      financialPosition: {
        currency: null, mixedCurrency: false, liquidCash: null, liquidChecking: null, liquidSavings: null,
        estimatedNetWorth: null, includedAccountCount: 0, knownBalanceCount: 0,
        excludedDuplicateCount: 0,
        netWorthHistory: [],
        retirement: {
          total: null, accountCount: 0, knownBalanceCount: 0, shareOfNetWorth: null,
          history: [], trend: null, contributionDataAvailable: false,
        },
      },
    }, setActiveTab);

    await vi.waitFor(() => {
      expect(container.textContent).toContain('No accounts match this filter');
    });

    expect(container.textContent).not.toContain('Unable to load accounts');
    const settingsButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent?.includes('Manage connections')
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
    await renderAccounts(connectedAccountsResponse, setActiveTab);

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
    await renderAccounts({ ...connectedAccountsResponse, accounts: unsorted });
    await vi.waitFor(() => expect(container.textContent).toContain('Zeta Bank'));

    const institutionHeadings = Array.from(container.querySelectorAll('section[aria-label] h2'))
      .map(heading => heading.textContent)
      .filter(heading => heading !== 'Money by purpose');
    expect(institutionHeadings).toEqual(['Alpha Bank', 'Zeta Bank']);

    const cards = Array.from(container.querySelectorAll('[data-account-name]')).map(
      card => card.getAttribute('data-account-name')
    );
    expect(cards).toEqual(['First Checking', 'Second Checking', 'Zulu Checking']);
  });

  it('preserves previously loaded cards when a refresh fails', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce(apiResponse(connectedAccountsResponse))
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

  it('saves an owner role and reloads the account summary', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce(apiResponse(connectedAccountsResponse))
      .mockResolvedValueOnce(apiResponse({ accountId: 'healthy-1', role: 'reserve' }))
      .mockResolvedValueOnce(apiResponse(connectedAccountsResponse));

    await act(async () => {
      root.render(<AccountsPage apiFetch={apiFetch} refreshKey={0} setActiveTab={vi.fn()} />);
    });
    await vi.waitFor(() => expect(container.textContent).toContain('Everyday Checking'));

    const select = container.querySelector(
      'select[aria-label="Purpose for Everyday Checking"]'
    ) as HTMLSelectElement;
    await act(async () => {
      select.value = 'reserve';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      '/api/account-roles/healthy-1',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ role: 'reserve' }) })
    ));
    expect(apiFetch).toHaveBeenCalledTimes(3);
  });

  it('creates an Apple Savings manual account and reloads the unified view', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce(apiResponse(connectedAccountsResponse))
      .mockResolvedValueOnce(apiResponse({ accountId: 'manual_12345678-1234-1234-1234-123456789abc' }))
      .mockResolvedValueOnce(apiResponse(connectedAccountsResponse));

    await act(async () => {
      root.render(<AccountsPage apiFetch={apiFetch} refreshKey={0} setActiveTab={vi.fn()} />);
    });
    await vi.waitFor(() => expect(container.textContent).toContain('Add manual account'));
    const addButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent?.trim() === 'Add manual account'
    );
    act(() => addButton?.click());

    const balanceInput = container.querySelector('form input[type="number"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        balanceInput,
        '32450.18'
      );
      balanceInput.dispatchEvent(new Event('input', { bubbles: true }));
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/manual-accounts', {
      method: 'POST',
      body: JSON.stringify({
        institutionName: 'Apple / Goldman Sachs',
        accountName: 'Apple Savings',
        accountMask: '',
        kind: 'savings',
        balance: 32450.18,
        isoCurrencyCode: 'USD',
      }),
    }));
    expect(apiFetch).toHaveBeenCalledTimes(3);
  });

  it('updates a manual balance through its distinct account card', async () => {
    const manual: ConnectedAccount = {
      ...connectedAccounts[2],
      accountId: 'manual_12345678-1234-1234-1234-123456789abc',
      institutionName: 'Apple / Goldman Sachs',
      accountName: 'Apple Savings',
      health: 'manual',
      source: 'manual',
      manualKind: 'savings',
    };
    const response = { ...connectedAccountsResponse, accounts: [manual] };
    const apiFetch = vi.fn()
      .mockResolvedValueOnce(apiResponse(response))
      .mockResolvedValueOnce(apiResponse({ accountId: manual.accountId, balance: 6000 }))
      .mockResolvedValueOnce(apiResponse(response));

    await act(async () => {
      root.render(<AccountsPage apiFetch={apiFetch} refreshKey={0} setActiveTab={vi.fn()} />);
    });
    await vi.waitFor(() => expect(container.textContent).toContain('Manual balance'));
    const updateButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent?.trim() === 'Update balance'
    );
    act(() => updateButton?.click());
    const input = container.querySelector('input[type="number"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '6000');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const saveButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent?.trim() === 'Save balance'
    );
    await act(async () => saveButton?.click());

    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      `/api/manual-accounts/${manual.accountId}/balance`,
      { method: 'PUT', body: JSON.stringify({ balance: 6000 }) }
    ));
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
