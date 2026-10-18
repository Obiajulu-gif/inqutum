/**
 * Pure helpers for Freighter multi-account detection (issue #22).
 * Kept free of React so node:test can simulate a switch between invoice
 * load and payment submit without the extension.
 */

export function didFreighterAccountChange(
  previousPublicKey: string | null | undefined,
  nextPublicKey: string | null | undefined
): boolean {
  if (!previousPublicKey || !nextPublicKey) return false;
  return previousPublicKey !== nextPublicKey;
}

export function shouldInvalidateUnsignedPayment(
  previousPublicKey: string | null | undefined,
  nextPublicKey: string | null | undefined,
  paymentInProgress: boolean
): boolean {
  return paymentInProgress && didFreighterAccountChange(previousPublicKey, nextPublicKey);
}

export const ACCOUNT_SWITCH_PROMPT = {
  title: 'Freighter account changed',
  message:
    'The active Freighter account changed. In-progress payments were cancelled. Confirm the account you want to use before continuing.',
};
