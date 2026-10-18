'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  EXPECTED_WALLET_NETWORK,
  getAccountBalance,
  readFreighterSession,
  stopFreighterWalletWatcher,
} from '@/lib/stellar';
import { useWalletStore } from '@/lib/store';
import { networkMatches, walletGate } from '@/lib/freighter-availability';
import { didFreighterAccountChange } from '@/lib/wallet-account-switch';

const SESSION_TOAST_ID = 'wallet-session-sync';

export default function WalletSessionSync() {
  const syncSession = useWalletStore((state) => state.syncSession);
  const confirmAccountSwitch = useWalletStore((state) => state.confirmAccountSwitch);
  const previous = useRef<{ publicKey: string | null; network: string | null }>({
    publicKey: useWalletStore.getState().publicKey,
    network: useWalletStore.getState().network,
  });

  useEffect(() => {
    let active = true;

    const sync = async (announce = false) => {
      const session = await readFreighterSession();
      if (!active) return;

      const previousKey = previous.current.publicKey;
      const changed =
        previousKey !== session.publicKey ||
        previous.current.network !== session.network;
      const accountChanged = didFreighterAccountChange(previousKey, session.publicKey);

      syncSession(session);
      previous.current = {
        publicKey: session.publicKey,
        network: session.network,
      };

      if (!session.connected || !session.publicKey) return;

      if (!networkMatches(session.network, EXPECTED_WALLET_NETWORK)) {
        if (announce && changed) {
          toast.warning(walletGate(session, EXPECTED_WALLET_NETWORK).title, {
            id: SESSION_TOAST_ID,
            description: walletGate(session, EXPECTED_WALLET_NETWORK).message,
          });
        }
        return;
      }

      try {
        const balances = await getAccountBalance(session.publicKey);
        if (!active) return;
        const xlm = balances.find((balance) => balance.assetCode === 'XLM');
        syncSession({
          ...session,
          balance: xlm ? parseFloat(xlm.balance).toFixed(2) : '0.00',
        });
      } catch {
        syncSession({ ...session, balance: '—' });
      }

      if (announce && changed) {
        toast[accountChanged ? 'warning' : 'info'](
          accountChanged ? 'Freighter account changed' : 'Wallet session updated',
          {
            id: SESSION_TOAST_ID,
            description: accountChanged
              ? 'In-progress payments were cancelled. Confirm which account you intend to use.'
              : undefined,
            action: accountChanged
              ? { label: 'Continue', onClick: confirmAccountSwitch }
              : undefined,
            duration: accountChanged ? Infinity : undefined,
            closeButton: !accountChanged,
          }
        );
      }
    };

    void sync(false);
    const stopWatching = stopFreighterWalletWatcher((session) => {
      if (!active) return;
      // Let the same read/compare path handle extension events and fallback
      // polling. Updating `previous` here first would hide the account switch.
      void sync(true);
    });
    const fallbackPoll = window.setInterval(() => void sync(true), 3000);

    return () => {
      active = false;
      window.clearInterval(fallbackPoll);
      stopWatching();
    };
  }, [confirmAccountSwitch, syncSession]);

  return null;
}
