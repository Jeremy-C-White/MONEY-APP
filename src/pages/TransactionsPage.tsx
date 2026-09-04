import React, { useEffect, useState, useRef } from 'react';
import { AlertCircle, RefreshCcw, Search, Filter, X, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  formatCurrency,
  getClassificationLabel,
  getCategoryLabel,
  getCategoryDisplayLabel,
  isNeedsReviewClassification,
  getTransactionClassificationLabel,
  getMerchantDisplayLabel,
  formatFriendlyDate
} from '../lib/formatters';
import { extractTransactionsResponse, extractAccountsResponse } from '../lib/api-contracts';
import type { Transaction, AccountSummary } from '../types/finance';
import { TransactionOverrideActions } from '../components/TransactionOverrideActions';

const CLASSIFICATIONS = [
  'spending', 'income', 'internal_transfer', 'investment_transfer', 'cash_withdrawal',
  'person_to_person', 'credit_card_payment', 'refund', 'merchant_credit',
  'interest_earned', 'interest_paid', 'bank_fee', 'unclassified_deposit', 'zero_amount', 'other'
];

export type TransactionsViewMode = 'posted' | 'pending' | 'needs_review' | 'overridden';

export function TransactionsPage({
  apiFetch,
  refreshKey,
  initialViewMode = 'posted',
}: {
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
  refreshKey: number;
  initialViewMode?: TransactionsViewMode;
}) {
  const [viewMode, setViewMode] = useState<TransactionsViewMode>(initialViewMode);
  
  const [page, setPage] = useState(1);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [categories, setCategories] = useState<{category: string}[]>([]);
  
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  const [filterAccount, setFilterAccount] = useState('');
  const [filterClassification, setFilterClassification] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Fetch options once
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await apiFetch('/api/accounts');
        if (res.ok) {
          const data = await res.json();
          setAccounts(extractAccountsResponse(data));
        }
      } catch (e) {
        console.warn("Failed to load account filter options", e);
      }
    };

    const fetchCategories = async () => {
      try {
        const res = await apiFetch('/api/dashboard/categories');
        if (res.ok) {
          const data = await res.json();
          setCategories(data.categories || []);
        }
      } catch (e) {
        console.warn("Failed to load category filter options", e);
      }
    };

    fetchAccounts();
    fetchCategories();
  }, [apiFetch]);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      if (debouncedSearch !== searchInput) {
        setDebouncedSearch(searchInput);
        setPage(1);
      }
    }, 350);
    return () => clearTimeout(handler);
  }, [searchInput, debouncedSearch]);

  const updateFilter = (setter: React.Dispatch<React.SetStateAction<any>>, val: any) => {
    setter(val);
    setPage(1);
  };

  const clearFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setFilterAccount('');
    setFilterClassification('');
    setFilterCategory('');
    setFilterStartDate('');
    setFilterEndDate('');
    setPage(1);
  };

  const selectViewMode = (mode: TransactionsViewMode) => {
    setViewMode(mode);
    setPage(1);

    if (mode === 'needs_review') {
      // The review inbox is a complete work queue. A search or account/date
      // filter left over from another tab must not make outstanding items look
      // as though they have all been reviewed.
      setSearchInput('');
      setDebouncedSearch('');
      setFilterAccount('');
      setFilterClassification('');
      setFilterCategory('');
      setFilterStartDate('');
      setFilterEndDate('');
    }
  };

  const loadTransactions = async () => {
    setRefreshWarning(null);
    if (initialLoad) {
      setLoading(true);
      setError(null);
    }
    
    try {
      const params = new URLSearchParams();
      if (viewMode === 'pending') {
        params.set('status', 'pending');
      } else if (viewMode === 'needs_review') {
        params.set('status', 'posted');
        params.set('classification', 'other,unclassified_deposit');
      } else if (viewMode === 'overridden') {
        params.set('status', 'posted');
        params.set('overridden', 'true');
      } else {
        params.set('status', 'posted');
      }
      
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (filterAccount) params.set('account', filterAccount);
      if (viewMode !== 'needs_review' && filterClassification) {
        params.set('classification', filterClassification);
      }
      if (filterCategory) params.set('category', filterCategory);
      if (filterStartDate) params.set('startDate', filterStartDate);
      if (filterEndDate) params.set('endDate', filterEndDate);
      
      params.set('page', page.toString());
      params.set('limit', '25');
      
      const res = await apiFetch(`/api/transactions?${params.toString()}`);
      if (!res.ok) {
         const errData = await res.json().catch(() => null);
         throw new Error(errData?.error || 'Failed to load transactions');
      }
      const data = await res.json();
      const parsed = extractTransactionsResponse(data);
      
      setTransactions(parsed.transactions);
      setTotal(parsed.total);
      setTotalPages(parsed.totalPages);
      setPage(parsed.page);
      
      if (initialLoad) {
        setInitialLoad(false);
        setLoading(false);
      }
    } catch (e: any) {
      if (initialLoad) {
        setError(e.message);
        setLoading(false);
      } else {
        setRefreshWarning("Couldn't refresh this view. Showing the last loaded results.");
      }
    }
  };

  // Run fetch when dependencies change
  useEffect(() => {
    loadTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, refreshKey, viewMode, page, debouncedSearch, filterAccount, filterClassification, filterCategory, filterStartDate, filterEndDate]);

  const activeTabClasses = "border-indigo-600 text-indigo-600 font-semibold";
  const inactiveTabClasses = "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 font-medium";

  const renderAmount = (tx: Transaction) => {
    const isPositive = tx.cashFlowAmount > 0;
    const amountStr = (isPositive ? '+' : '') + formatCurrency(tx.cashFlowAmount);
    return <span className={`font-semibold ${isPositive ? 'text-emerald-600' : 'text-slate-900'}`}>{amountStr}</span>;
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50">
      <div className="bg-white px-6 pt-6 border-b border-slate-200 shrink-0 safe-top">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Transactions</h1>
        
        <div className="flex gap-6 mt-6 border-b border-slate-200">
          <button 
            className={`pb-3 px-1 border-b-2 transition-colors ${viewMode === 'posted' ? activeTabClasses : inactiveTabClasses}`}
            onClick={() => selectViewMode('posted')}
          >
            Posted
          </button>
          <button 
            className={`pb-3 px-1 border-b-2 transition-colors ${viewMode === 'pending' ? activeTabClasses : inactiveTabClasses}`}
            onClick={() => selectViewMode('pending')}
          >
            Pending
          </button>
          <button 
            className={`pb-3 px-1 border-b-2 transition-colors ${viewMode === 'needs_review' ? activeTabClasses : inactiveTabClasses}`}
            onClick={() => selectViewMode('needs_review')}
          >
            Needs Review
          </button>
          <button
            className={`pb-3 px-1 border-b-2 transition-colors ${viewMode === 'overridden' ? activeTabClasses : inactiveTabClasses}`}
            onClick={() => selectViewMode('overridden')}
          >
            Reviewed
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-4 md:p-6 pb-24 md:pb-6">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 space-y-4">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
            <input 
              type="text"
              placeholder="Search transactions"
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          
          <div className="flex flex-wrap gap-3">
            <select 
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={filterAccount}
              onChange={(e) => updateFilter(setFilterAccount, e.target.value)}
            >
              <option value="">All Accounts</option>
              {accounts.map(a => (
                <option key={a.accountId} value={a.accountId}>{a.institutionName} · {a.accountName} ••••{a.accountMask}</option>
              ))}
            </select>
            
            {viewMode !== 'needs_review' && (
              <select 
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={filterClassification}
                onChange={(e) => updateFilter(setFilterClassification, e.target.value)}
              >
                <option value="">All Classifications</option>
                {CLASSIFICATIONS.map(c => (
                  <option key={c} value={c}>{getClassificationLabel(c)}</option>
                ))}
              </select>
            )}
            
            <select 
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={filterCategory}
              onChange={(e) => updateFilter(setFilterCategory, e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map(c => (
                <option key={c.category} value={c.category}>{getCategoryLabel(c.category)}</option>
              ))}
            </select>
            
            <input 
              type="date"
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={filterStartDate}
              onChange={(e) => updateFilter(setFilterStartDate, e.target.value)}
            />
            
            <input 
              type="date"
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={filterEndDate}
              onChange={(e) => updateFilter(setFilterEndDate, e.target.value)}
            />
            
            {(searchInput || filterAccount || filterClassification || filterCategory || filterStartDate || filterEndDate) && (
              <button 
                onClick={clearFilters}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 px-3 py-2 font-medium"
              >
                <X className="w-4 h-4" />
                Clear
              </button>
            )}
          </div>
        </div>

        {refreshWarning && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 font-medium">{refreshWarning}</p>
          </div>
        )}

        {viewMode === 'needs_review' && !loading && !error && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">
              {total} {total === 1 ? 'transaction remains' : 'transactions remain'} to review.
            </p>
            <p className="mt-1 text-amber-800">
              Select <strong>Review</strong> on a transaction, then identify it as income,
              spending, a reimbursement, or a transfer between your accounts. If you are
              unsure, leave it here for later.
            </p>
          </div>
        )}

        {loading && initialLoad ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 animate-pulse flex justify-between h-24" />
            ))}
          </div>
        ) : error && initialLoad ? (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-8 text-center">
            <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-rose-900 mb-2">Failed to load transactions</h3>
            <p className="text-rose-700 mb-6 max-w-md mx-auto">{error}</p>
            <button 
              onClick={loadTransactions}
              className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-6 py-3 rounded-xl font-bold transition-colors"
            >
              <RefreshCcw className="w-4 h-4" />
              Retry
            </button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">No transactions found</h3>
            <p className="text-slate-500 text-sm">Try adjusting your filters or search terms.</p>
          </div>
        ) : (
          <>
            {/* Mobile View */}
            <div className="block md:hidden space-y-4">
              {transactions.map(tx => (
                <div key={tx.transactionId} className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 min-w-0 pr-3">
                      <p className="font-bold text-slate-900 truncate">{getMerchantDisplayLabel({ merchant: tx.normalizedMerchant, fallbackDescription: tx.name, classification: tx.classification })}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{formatFriendlyDate(tx.normalizedDate)}</p>
                    </div>
                    <div className="whitespace-nowrap">
                      {renderAmount(tx)}
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
                    {tx.pending && <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded border border-amber-200/50 font-semibold">Pending</span>}
                    {isNeedsReviewClassification(tx.classification) && <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded border border-amber-200/50 font-semibold">{getTransactionClassificationLabel(tx.classification, tx.isOverridden, tx.overrideOffsetCategory)}</span>}
                    {!isNeedsReviewClassification(tx.classification) && <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded border border-slate-200 font-medium">{getTransactionClassificationLabel(tx.classification, tx.isOverridden, tx.overrideOffsetCategory)}</span>}
                    <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded border border-slate-200 font-medium">{getCategoryDisplayLabel(tx.overrideOffsetCategory || tx.normalizedCategory, tx.classification)}</span>
                  </div>

                  <TransactionOverrideActions
                    transaction={tx}
                    categories={categories}
                    reviewable={(viewMode === 'needs_review' || viewMode === 'posted') && !tx.pending && !tx.removed}
                    apiFetch={apiFetch}
                    onChanged={loadTransactions}
                  />
                  
                  <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 flex justify-between font-medium">
                    <span>{tx.institutionName} ••••{tx.accountMask}</span>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Desktop View */}
            <div className="hidden md:block bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="px-6 py-4 font-semibold w-32">Date</th>
                    <th className="px-6 py-4 font-semibold">Description</th>
                    <th className="px-6 py-4 font-semibold">Category</th>
                    <th className="px-6 py-4 font-semibold">Account</th>
                    <th className="px-6 py-4 font-semibold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map(tx => (
                    <tr key={tx.transactionId} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-slate-500 font-medium">
                        {formatFriendlyDate(tx.normalizedDate)}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{getMerchantDisplayLabel({ merchant: tx.normalizedMerchant, fallbackDescription: tx.name, classification: tx.classification })}</p>
                        <div className="flex gap-2 mt-1.5">
                          {tx.pending && <span className="inline-flex items-center text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-200/50 font-bold uppercase tracking-wider">Pending</span>}
                          {isNeedsReviewClassification(tx.classification) && <span className="inline-flex items-center text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-200/50 font-bold uppercase tracking-wider">{getTransactionClassificationLabel(tx.classification, tx.isOverridden, tx.overrideOffsetCategory)}</span>}
                          {!isNeedsReviewClassification(tx.classification) && <span className="inline-flex items-center text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-bold uppercase tracking-wider">{getTransactionClassificationLabel(tx.classification, tx.isOverridden, tx.overrideOffsetCategory)}</span>}
                        </div>
                        <TransactionOverrideActions
                          transaction={tx}
                          categories={categories}
                          reviewable={(viewMode === 'needs_review' || viewMode === 'posted') && !tx.pending && !tx.removed}
                          apiFetch={apiFetch}
                          onChanged={loadTransactions}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-slate-600 font-medium bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
                          {getCategoryDisplayLabel(tx.overrideOffsetCategory || tx.normalizedCategory, tx.classification)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-medium">
                        <div className="flex flex-col">
                          <span>{tx.institutionName}</span>
                          <span className="text-xs opacity-75">••••{tx.accountMask}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        {renderAmount(tx)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex justify-between items-center bg-white px-6 py-4 rounded-xl shadow-sm border border-slate-200">
                <span className="text-sm text-slate-500 font-medium">{total} transactions &middot; Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <button 
                    disabled={page <= 1} 
                    onClick={() => setPage(p => p - 1)}
                    className="flex items-center gap-1 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" /> Previous
                  </button>
                  <button 
                    disabled={page >= totalPages} 
                    onClick={() => setPage(p => p + 1)}
                    className="flex items-center gap-1 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
