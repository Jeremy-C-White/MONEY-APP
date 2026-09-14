import { GoogleGenAI } from '@google/genai';
import type { AccountBalanceSummary } from './account-balances';
import type { AccountRole } from './account-roles';
import type { NormalizedTransaction } from './financial';
import type { HouseholdPlan } from './household-plan';
import type { ReviewedRecurringObligation } from './recurring-obligation-decisions';
import type { SafeToSpend } from './safe-to-spend';

export interface AiChatMessage {
  role: 'user' | 'model' | 'assistant';
  content: string;
}

export interface FinancialContextInput {
  asOfDate: string;
  timezone: string;
  accountBalances?: AccountBalanceSummary | null;
  accountRoleOverrides?: ReadonlyMap<string, AccountRole> | null;
  safeToSpend?: SafeToSpend | null;
  recurringObligations?: readonly ReviewedRecurringObligation[] | null;
  householdPlan?: HouseholdPlan | null;
  transactions?: readonly NormalizedTransaction[] | null;
}

export class AiChatRequestError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'AiChatRequestError';
  }
}

export function parseAiChatRequest(body: unknown): { messages: AiChatMessage[] } {
  if (!body || typeof body !== 'object') {
    throw new AiChatRequestError('Request body must be a JSON object.');
  }

  const { messages } = body as { messages?: unknown };
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new AiChatRequestError('Messages array is required and must not be empty.');
  }

  const parsed: AiChatMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const item = messages[i];
    if (!item || typeof item !== 'object') {
      throw new AiChatRequestError(`Message at index ${i} must be an object.`);
    }

    const { role, content } = item as { role?: unknown; content?: unknown };
    if (role !== 'user' && role !== 'model' && role !== 'assistant') {
      throw new AiChatRequestError(`Message at index ${i} has an invalid role. Must be 'user' or 'model'.`);
    }

    if (typeof content !== 'string' || !content.trim()) {
      throw new AiChatRequestError(`Message at index ${i} must have a non-empty content string.`);
    }

    if (content.length > 5000) {
      throw new AiChatRequestError(`Message at index ${i} exceeds maximum length of 5000 characters.`);
    }

    parsed.push({
      role: role === 'assistant' ? 'model' : role,
      content: content.trim(),
    });
  }

  const lastMessage = parsed[parsed.length - 1];
  if (lastMessage.role !== 'user') {
    throw new AiChatRequestError('The last message in the conversation must be from the user.');
  }

  return { messages: parsed };
}

export function formatFinancialContext(input: FinancialContextInput): string {
  const sections: string[] = [];

  sections.push(`### Current System Context\n- Current Date: ${input.asOfDate}\n- Financial Timezone: ${input.timezone}`);

  // Safe to Spend Section
  if (input.safeToSpend) {
    const sts = input.safeToSpend;
    if (sts.status === 'ready' && sts.amount !== null) {
      const totalDeductions = (sts.billsDue ?? 0) + (sts.pendingOutflow ?? 0) + sts.buffer;
      sections.push(
        `### Safe to Spend\n- Status: Ready\n- Safe to Spend Amount: $${sts.amount.toFixed(2)}\n- Cash on Hand (Operating accounts): ${(sts.cashOnHand ?? 0).toFixed(2)}\n- Scheduled Bills: ${(sts.billsDue ?? 0).toFixed(2)}\n- Buffer: ${sts.buffer.toFixed(2)}\n- Total Deductions: ${totalDeductions.toFixed(2)}\n- Coverage Window: ${sts.asOfDate} through ${sts.throughDate}`
      );
    } else {
      sections.push(
        `### Safe to Spend\n- Status: Unavailable\n- Blockers: ${sts.blockers.join(', ') || 'Insufficient operating account configuration'}`
      );
    }
  }

  // Account Balances Section
  if (input.accountBalances && input.accountBalances.accounts.length > 0) {
    const accountLines = input.accountBalances.accounts.map(acc => {
      const balanceStr = acc.current !== null ? `${acc.current.toFixed(2)}` : 'Not reported';
      const availableStr = acc.available !== null ? ` (Available: ${acc.available.toFixed(2)})` : '';
      return `- ${acc.institutionName} · ${acc.accountName} (${acc.accountType}/${acc.accountSubtype}): ${balanceStr}${availableStr} [Health: ${acc.health}, Status: ${acc.balanceStatus}]`;
    });
    sections.push(`### Connected Accounts & Balances\n${accountLines.join('\n')}`);
  } else {
    sections.push('### Connected Accounts & Balances\nNo connected account balance records available.');
  }

  // Recurring Obligations Section
  if (input.recurringObligations && input.recurringObligations.length > 0) {
    const obligLines = input.recurringObligations.map(ob => {
      return `- ${ob.merchant} (${ob.cadence}, ${ob.amountBehavior}): ~${ob.typicalCharge.toFixed(2)} per charge, ~${ob.estimatedMonthlyAmount.toFixed(2)}/mo [Category: ${ob.category}, Status: ${ob.status}]`;
    });
    sections.push(`### Recurring Obligations & Bills\n${obligLines.join('\n')}`);
  }

  // Household Plan Section
  if (input.householdPlan) {
    const plan = input.householdPlan;
    const planDetails: string[] = [];
    if (plan.monthlySpendingTarget !== null) {
      planDetails.push(`- Monthly Spending Target: ${plan.monthlySpendingTarget.toFixed(2)}`);
    }
    if (plan.safeToSpendBuffer > 0) {
      planDetails.push(`- Safe-to-Spend Buffer: ${plan.safeToSpendBuffer.toFixed(2)}`);
    }
    if (planDetails.length > 0) {
      sections.push(`### Household Plan\n${planDetails.join('\n')}`);
    }
  }

  // Recent Transactions Section (Up to 150 most recent)
  if (input.transactions && input.transactions.length > 0) {
    const validTxs = input.transactions.filter(tx => !tx.removed);
    const sorted = [...validTxs].sort((a, b) => b.normalizedDate.localeCompare(a.normalizedDate));
    const txSlice = sorted.slice(0, 150);

    const txLines = txSlice.map(tx => {
      const amountStr = `$${Math.abs(tx.cashFlowAmount).toFixed(2)}`;
      const typeStr = tx.classification === 'income' ? `+${amountStr} (Income)` : tx.classification === 'spending' ? `-${amountStr} (Spending)` : `${amountStr} (Transfer)`;
      const noteStr = tx.overrideNote ? ` [Note: ${tx.overrideNote}]` : '';
      return `${tx.normalizedDate} | ${tx.normalizedMerchant || tx.name} | ${typeStr} | Category: ${tx.normalizedCategory} | Account: ${tx.accountName}${noteStr}`;
    });

    sections.push(
      `### Recent Transaction History (Showing ${txSlice.length} of ${validTxs.length} total transactions)\nFormat: Date | Merchant/Name | Amount | Category | Account\n${txLines.join('\n')}`
    );
  } else {
    sections.push('### Transaction History\nNo transactions currently loaded or synced from Google Sheets.');
  }

  return sections.join('\n\n');
}

export function buildFinancialAssistantSystemPrompt(contextString: string): string {
  return `You are FinSync's Read-Only AI Financial Assistant. You help users understand their personal finances, spending habits, cash flow, recurring bills, and account balances.

================================================================================
CRITICAL READ-ONLY DIRECTIVE (ZERO PERMISSIONS TO WRITE OR MODIFY DATA)
================================================================================
1. You operate in STRICT READ-ONLY MODE.
2. You CANNOT create, modify, recategorize, edit, or delete any transaction, account, rule, budget, or configuration.
3. You have NO tools, functions, or database mutations available to alter user data.
4. IF THE USER ASKS YOU TO CHANGE, EDIT, RECLASSIFY, DELETE, OR ADD DATA:
   - Clearly and politely explain that you operate with strictly read-only visibility for security and audit integrity.
   - Direct the user on how they can make that change manually in FinSync:
     * Transactions & Categories: Go to the "Transactions" tab to edit notes, adjust categories, or set classification rules.
     * Account Purposes: Go to the "Accounts" tab to assign account roles (e.g. Operating, Reserve, Retirement).
     * Budgets & Targets: Go to the "Overview" tab and open Household Plan settings.
     * Connections & Sync: Go to the "Settings" tab to trigger syncs or manage bank connections.

================================================================================
DATA GROUNDING & ACCURACY GUIDELINES
================================================================================
- Base your answers strictly and factually on the financial context provided below.
- Do NOT invent or hallucinate transaction records, merchants, or balances that are not in the context.
- If the user asks about something not present in the data (e.g., transactions from an unlinked account or years not in the ledger), state clearly that the information is not present in the current dataset.
- Always quote exact currency amounts with dollar signs (e.g., $142.50) and mention dates or merchants to provide clear, actionable context.
- When summarizing spending, highlight key categories, notable merchants, and trends.
- Use clean, well-formatted Markdown with bolding, bullet points, or simple markdown tables when comparing figures.

================================================================================
USER'S FINANCIAL DATA CONTEXT (READ-ONLY)
================================================================================
${contextString}
`;
}

let genAiInstance: GoogleGenAI | null = null;

export function getGenAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured.');
  }
  if (!genAiInstance) {
    genAiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAiInstance;
}

export async function generateAiFinancialResponse(
  messages: AiChatMessage[],
  context: FinancialContextInput,
  clientOverride?: GoogleGenAI
): Promise<string> {
  const ai = clientOverride || getGenAiClient();
  const contextString = formatFinancialContext(context);
  const systemInstruction = buildFinancialAssistantSystemPrompt(contextString);

  const contents = messages.map(msg => ({
    role: msg.role === 'model' || msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents,
    config: {
      systemInstruction,
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('No response was generated by the AI model.');
  }

  return text;
}
