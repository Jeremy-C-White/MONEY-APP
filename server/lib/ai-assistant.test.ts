import { describe, expect, it, vi } from 'vitest';
import {
  AiChatRequestError,
  buildFinancialAssistantSystemPrompt,
  formatFinancialContext,
  generateAiFinancialResponse,
  parseAiChatRequest,
} from './ai-assistant';
import type { NormalizedTransaction } from './financial';

describe('AI Assistant Module', () => {
  describe('parseAiChatRequest', () => {
    it('throws when body is not an object', () => {
      expect(() => parseAiChatRequest(null)).toThrow(AiChatRequestError);
      expect(() => parseAiChatRequest('invalid')).toThrow(AiChatRequestError);
    });

    it('throws when messages array is missing or empty', () => {
      expect(() => parseAiChatRequest({})).toThrow(AiChatRequestError);
      expect(() => parseAiChatRequest({ messages: [] })).toThrow(AiChatRequestError);
    });

    it('throws when message has invalid role', () => {
      expect(() =>
        parseAiChatRequest({
          messages: [{ role: 'system', content: 'hello' }],
        })
      ).toThrow(AiChatRequestError);
    });

    it('throws when message content is blank', () => {
      expect(() =>
        parseAiChatRequest({
          messages: [{ role: 'user', content: '   ' }],
        })
      ).toThrow(AiChatRequestError);
    });

    it('throws when last message is not from user', () => {
      expect(() =>
        parseAiChatRequest({
          messages: [
            { role: 'user', content: 'What is my balance?' },
            { role: 'model', content: 'Your balance is $500.' },
          ],
        })
      ).toThrow(AiChatRequestError);
    });

    it('successfully parses valid conversation and normalizes assistant role', () => {
      const parsed = parseAiChatRequest({
        messages: [
          { role: 'user', content: 'How much did I spend at Walmart?' },
          { role: 'assistant', content: 'You spent $120.45.' },
          { role: 'user', content: 'And last month?' },
        ],
      });

      expect(parsed.messages).toEqual([
        { role: 'user', content: 'How much did I spend at Walmart?' },
        { role: 'model', content: 'You spent $120.45.' },
        { role: 'user', content: 'And last month?' },
      ]);
    });
  });

  describe('formatFinancialContext', () => {
    it('formats empty context gracefully', () => {
      const formatted = formatFinancialContext({
        asOfDate: '2026-09-14',
        timezone: 'America/New_York',
      });

      expect(formatted).toContain('2026-09-14');
      expect(formatted).toContain('America/New_York');
      expect(formatted).toContain('No connected account balance records available.');
      expect(formatted).toContain('No transactions currently loaded');
    });

    it('formats account balances, safe to spend, and transactions', () => {
      const tx = {
        transactionId: 'tx_1',
        accountId: 'acc_1',
        accountName: 'Main Checking',
        institutionName: 'Chase',
        accountMask: '1234',
        accountType: 'depository',
        accountSubtype: 'checking',
        normalizedDate: '2026-09-10',
        name: 'Trader Joes',
        normalizedMerchant: "Trader Joe's",
        cashFlowAmount: -85.2,
        spendingAdjustment: 85.2,
        incomeAdjustment: 0,
        classification: 'spending',
        normalizedCategory: 'Groceries',
        pending: false,
        removed: false,
        isOverridden: false,
        overrideNote: null,
        overrideOffsetCategory: null,
      } as unknown as NormalizedTransaction;

      const formatted = formatFinancialContext({
        asOfDate: '2026-09-14',
        timezone: 'America/New_York',
        safeToSpend: {
          status: 'ready',
          asOfDate: '2026-09-14',
          throughDate: '2026-09-30',
          currency: 'USD',
          cashBasis: 'current',
          cashOnHand: 2500,
          cashAccountCount: 1,
          excludedCashAccountCount: 0,
          unassignedCashAccountCount: 0,
          billsDue: 400,
          pendingOutflow: 0,
          buffer: 500,
          amount: 1600,
          deductions: [],
          pendingReflectedInBalance: false,
          blockers: [],
          warning: null,
        },
        accountBalances: {
          status: 'complete',
          currency: 'USD',
          oldestFetchedAt: '2026-09-14T10:00:00Z',
          newestFetchedAt: '2026-09-14T10:00:00Z',
          connectedItemCount: 1,
          reportingItemCount: 1,
          freshItemCount: 1,
          missingCurrentBalanceCount: 0,
          currencyIssueCount: 0,
          cashCurrent: 2500,
          cashAvailable: 2500,
          creditBalance: 0,
          creditOwed: 0,
          creditCredits: 0,
          loanBalance: 0,
          investmentValue: 0,
          connectedPosition: 2500,
          issues: [],
          accounts: [
            {
              institutionName: 'Chase',
              accountId: 'acc_1',
              accountName: 'Main Checking',
              accountMask: '1234',
              accountType: 'depository',
              accountSubtype: 'checking',
              health: 'healthy',
              balanceStatus: 'fresh',
              current: 2500,
              available: 2500,
              limit: null,
              isoCurrencyCode: 'USD',
              unofficialCurrencyCode: null,
              fetchedAt: '2026-09-14T10:00:00Z',
            },
          ],
        },
        transactions: [tx],
      });

      expect(formatted).toContain('Safe to Spend Amount: $1600.00');
      expect(formatted).toContain('Chase · Main Checking');
      expect(formatted).toContain('Trader Joe\'s');
      expect(formatted).toContain('Groceries');
    });
  });

  describe('buildFinancialAssistantSystemPrompt', () => {
    it('strictly includes read-only instructions and guidance for user modifications', () => {
      const prompt = buildFinancialAssistantSystemPrompt('Sample context');
      expect(prompt).toContain('STRICT READ-ONLY MODE');
      expect(prompt).toContain('ZERO PERMISSIONS TO WRITE OR MODIFY DATA');
      expect(prompt).toContain('Transactions');
      expect(prompt).toContain('Accounts');
      expect(prompt).toContain('Sample context');
    });
  });

  describe('generateAiFinancialResponse', () => {
    it('invokes Gemini generateContent with correct model and system instruction', async () => {
      const mockGenerateContent = vi.fn().mockResolvedValue({
        text: 'Your current Safe to Spend amount is $1600.00 through September 30th.',
      });

      const mockAi = {
        models: {
          generateContent: mockGenerateContent,
        },
      } as any;

      const response = await generateAiFinancialResponse(
        [{ role: 'user', content: 'What is my safe to spend?' }],
        {
          asOfDate: '2026-09-14',
          timezone: 'America/New_York',
        },
        mockAi
      );

      expect(response).toBe('Your current Safe to Spend amount is $1600.00 through September 30th.');
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.model).toBe('gemini-3.8-flash');
      expect(callArgs.config.systemInstruction).toContain('STRICT READ-ONLY MODE');
      expect(callArgs.contents).toEqual([
        {
          role: 'user',
          parts: [{ text: 'What is my safe to spend?' }],
        },
      ]);
    });
  });
});
