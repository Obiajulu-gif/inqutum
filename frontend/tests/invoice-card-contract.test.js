const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canSendProofEmail,
} = require('../lib/mailto-delivery');
const {
  canDo,
  roleForSession,
} = require('../lib/capabilities');

test('invoice card contract - copy link validation', () => {
  const invoiceId = 'abc123def456';
  const origin = 'https://example.com';
  const paymentUrl = `${origin}/pay/${invoiceId}`;

  assert.ok(paymentUrl.includes(invoiceId));
  assert.ok(paymentUrl.startsWith('https://'));
});

test('invoice card contract - can send proof email', () => {
  const validInvoice = {
    status: 'PAID',
    customerEmail: 'customer@example.com',
  };
  const noEmailInvoice = {
    status: 'PAID',
    customerEmail: null,
  };
  const unpaidInvoice = {
    status: 'PENDING',
    customerEmail: 'customer@example.com',
  };

  assert.ok(canSendProofEmail(validInvoice), 'should allow email for paid invoice with customer email');
  assert.ok(!canSendProofEmail(noEmailInvoice), 'should reject email when no customer email');
  assert.ok(!canSendProofEmail(unpaidInvoice), 'should reject email for unpaid invoice');
});

test('invoice card contract - cancel authorization', () => {
  const invoiceOwnedByUser = {
    sellerPublicKey: 'GUSER123',
  };
  const invoiceOwnedByOther = {
    sellerPublicKey: 'GOTHER456',
  };

  const userSession = { connected: true, publicKey: 'GUSER123' };
  const otherUserSession = { connected: true, publicKey: 'GOTHER456' };
  const noWalletSession = { connected: false, publicKey: null };

  const canCancelOwned = canDo(
    roleForSession(userSession),
    'invoice:cancel',
    { wallet: userSession.publicKey, sellerPublicKey: invoiceOwnedByUser.sellerPublicKey }
  );
  assert.ok(canCancelOwned, 'invoice owner should be able to cancel');

  const canCancelOther = canDo(
    roleForSession(otherUserSession),
    'invoice:cancel',
    { wallet: otherUserSession.publicKey, sellerPublicKey: invoiceOwnedByUser.sellerPublicKey }
  );
  assert.ok(!canCancelOther, 'non-owner should not be able to cancel');

  const canCancelNoWallet = canDo(
    roleForSession(noWalletSession),
    'invoice:cancel',
    { wallet: null, sellerPublicKey: invoiceOwnedByUser.sellerPublicKey }
  );
  assert.ok(!canCancelNoWallet, 'disconnected user should not be able to cancel');
});

test('invoice card contract - status-dependent ui states', () => {
  const pendingInvoice = { status: 'PENDING' };
  const paidInvoice = { status: 'PAID' };
  const expiredInvoice = { status: 'EXPIRED' };

  const shouldShowCopyLink = (invoice) => invoice.status === 'PENDING';
  const shouldShowProof = (invoice) => invoice.status === 'PAID';
  const shouldShowExpired = (invoice) => invoice.status === 'EXPIRED';

  assert.ok(shouldShowCopyLink(pendingInvoice));
  assert.ok(!shouldShowCopyLink(paidInvoice));

  assert.ok(shouldShowProof(paidInvoice));
  assert.ok(!shouldShowProof(pendingInvoice));

  assert.ok(shouldShowExpired(expiredInvoice));
  assert.ok(!shouldShowExpired(pendingInvoice));
});

test('invoice card contract - error handling for async operations', () => {
  const handleError = (error) => {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown error occurred';
  };

  const typedError = new Error('Network timeout');
  const untypedError = { code: 'ERR_UNKNOWN' };

  assert.equal(handleError(typedError), 'Network timeout');
  assert.equal(handleError(untypedError), 'Unknown error occurred');
});

test('invoice card contract - copy state management', () => {
  let copyState = false;
  const setCopyState = (value) => { copyState = value; };
  const resetCopyAfterDelay = (delayMs = 2000) => {
    setTimeout(() => setCopyState(false), delayMs);
  };

  setCopyState(true);
  assert.ok(copyState);

  resetCopyAfterDelay(10);
  setTimeout(() => {
    assert.ok(!copyState, 'copy state should reset after delay');
  }, 15);
});
