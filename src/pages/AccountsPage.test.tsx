import "@testing-library/jest-dom/vitest";
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { AccountsPage } from './AccountsPage';

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue('fake-token')
    }
  }))
}));

describe('AccountsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders loading state initially', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as any;
    const { container } = render(<AccountsPage />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders accounts grouped by institution with correct health states', async () => {
    const mockAccounts = [
      {
        accountId: 'acc1',
        institutionName: 'Chase',
        accountName: 'Checking 1',
        accountMask: '1234',
        accountType: 'depository',
        accountSubtype: 'checking',
        health: 'healthy'
      },
      {
        accountId: 'acc2',
        institutionName: 'Chase',
        accountName: 'Savings',
        accountMask: '5678',
        accountType: 'depository',
        accountSubtype: 'savings',
        health: 'healthy'
      },
      {
        accountId: 'acc3',
        institutionName: 'Bank of America',
        accountName: 'Credit Card',
        accountMask: '9999',
        accountType: 'credit',
        accountSubtype: 'credit card',
        health: 'login_required'
      }
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockAccounts)
    }) as any;

    render(<AccountsPage />);
    
    await waitFor(() => {
      expect(screen.queryByText(/Loading/i)).toBeNull();
    });

    expect(screen.getByText('Chase')).toBeInTheDocument();
    expect(screen.getByText('Checking 1')).toBeInTheDocument();
    expect(screen.getByText('depository • checking • x1234')).toBeInTheDocument();
    expect(screen.getByText('Savings')).toBeInTheDocument();
    expect(screen.getByText('depository • savings • x5678')).toBeInTheDocument();

    expect(screen.getByText('Bank of America')).toBeInTheDocument();
    expect(screen.getByText('Credit Card')).toBeInTheDocument();
    expect(screen.getByText('credit • credit card • x9999')).toBeInTheDocument();

    // Health states
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Needs Attention')).toBeInTheDocument();
  });

  it('renders disconnected accounts separately', async () => {
    const mockAccounts = [
      {
        accountId: 'acc1',
        institutionName: 'Wells Fargo',
        accountName: 'Everyday Checking',
        accountMask: '1111',
        accountType: 'depository',
        accountSubtype: 'checking',
        health: 'disconnected'
      }
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockAccounts)
    }) as any;

    render(<AccountsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Disconnected Accounts')).toBeInTheDocument();
    });

    expect(screen.getByText('Wells Fargo - Everyday Checking')).toBeInTheDocument();
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });
});
