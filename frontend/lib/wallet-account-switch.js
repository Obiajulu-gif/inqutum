function didFreighterAccountChange(previousPublicKey, nextPublicKey) {
  if (!previousPublicKey || !nextPublicKey) return false;
  return previousPublicKey !== nextPublicKey;
}

function shouldInvalidateUnsignedPayment(previousPublicKey, nextPublicKey, paymentInProgress) {
  return paymentInProgress && didFreighterAccountChange(previousPublicKey, nextPublicKey);
}

const ACCOUNT_SWITCH_PROMPT = {
  title: 'Freighter account changed',
  message:
    'The active Freighter account changed. In-progress payments were cancelled. Confirm the account you want to use before continuing.',
};

module.exports = {
  didFreighterAccountChange,
  shouldInvalidateUnsignedPayment,
  ACCOUNT_SWITCH_PROMPT,
};
