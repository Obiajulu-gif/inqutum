const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  didFreighterAccountChange,
  shouldInvalidateUnsignedPayment,
} = require('../lib/wallet-account-switch.js');

const ACCOUNT_A = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const ACCOUNT_B = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBWHF';

describe('Freighter account switch (issue #22)', () => {
  it('detects an account change without a page refresh', () => {
    assert.equal(didFreighterAccountChange(ACCOUNT_A, ACCOUNT_B), true);
    assert.equal(didFreighterAccountChange(ACCOUNT_A, ACCOUNT_A), false);
    assert.equal(didFreighterAccountChange(null, ACCOUNT_B), false);
  });

  it('invalidates an in-progress payment if the account changes between load and submit', () => {
    const loadedWith = ACCOUNT_A;
    const switchedTo = ACCOUNT_B;
    const paymentInProgress = true;
    assert.equal(
      shouldInvalidateUnsignedPayment(loadedWith, switchedTo, paymentInProgress),
      true
    );
    assert.equal(
      shouldInvalidateUnsignedPayment(loadedWith, switchedTo, false),
      false
    );
  });
});
