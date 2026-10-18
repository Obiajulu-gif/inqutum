import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { walletStorageKey } from './wallet-storage-key';

export interface WalletSessionPatch {
  freighterAvailable?: boolean;
  connected?: boolean;
  publicKey?: string | null;
  network?: string | null;
  networkPassphrase?: string | null;
  balance?: string;
}

export interface WalletState {
  publicKey: string | null;
  balance: string;
  connected: boolean;
  network: string | null;
  networkPassphrase: string | null;
  isWrongNetwork: boolean;
  freighterAvailable: boolean;
  /** Bumps when the Freighter account changes so in-flight payments abort. */
  accountSwitchEpoch: number;
  pendingAccountSwitch: { from: string; to: string } | null;
  setWallet: (
    publicKey: string,
    balance: string,
    network?: string | null,
    networkPassphrase?: string | null
  ) => void;
  updateBalance: (balance: string) => void;
  setNetwork: (network: string | null, networkPassphrase?: string | null) => void;
  setIsWrongNetwork: (isWrong: boolean) => void;
  syncSession: (session: WalletSessionPatch) => void;
  confirmAccountSwitch: () => void;
  dismissAccountSwitch: () => void;
  disconnect: () => void;
}

const EXPECTED_NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'TESTNET').toUpperCase();

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      publicKey: null,
      balance: '0',
      connected: false,
      network: null,
      networkPassphrase: null,
      isWrongNetwork: false,
      freighterAvailable: false,
      accountSwitchEpoch: 0,
      pendingAccountSwitch: null,
      setWallet: (publicKey, balance, network = null, networkPassphrase = null) =>
        set({
          publicKey,
          balance,
          connected: true,
          network,
          networkPassphrase,
        }),
      updateBalance: (balance) => set({ balance }),
      setNetwork: (network, networkPassphrase = null) =>
        set({ network, networkPassphrase }),
      setIsWrongNetwork: (isWrongNetwork) => set({ isWrongNetwork }),
      syncSession: (session) =>
        set((state) => {
          const nextKey = session.publicKey !== undefined ? session.publicKey : state.publicKey;
          const switched =
            Boolean(state.publicKey && nextKey && state.publicKey !== nextKey);
          return {
            freighterAvailable: session.freighterAvailable ?? state.freighterAvailable,
            connected: session.connected ?? Boolean(nextKey),
            publicKey: nextKey ?? null,
            network: session.network !== undefined ? session.network : state.network,
            networkPassphrase:
              session.networkPassphrase !== undefined
                ? session.networkPassphrase
                : state.networkPassphrase,
            balance: session.balance !== undefined ? session.balance : state.balance,
            accountSwitchEpoch: switched ? state.accountSwitchEpoch + 1 : state.accountSwitchEpoch,
            pendingAccountSwitch: switched
              ? { from: state.publicKey as string, to: nextKey as string }
              : state.pendingAccountSwitch,
          };
        }),
      confirmAccountSwitch: () => set({ pendingAccountSwitch: null }),
      dismissAccountSwitch: () => set({ pendingAccountSwitch: null }),
      disconnect: () =>
        set({
          publicKey: null,
          balance: '0',
          connected: false,
          network: null,
          networkPassphrase: null,
          isWrongNetwork: false,
          pendingAccountSwitch: null,
        }),
    }),
    {
      name: 'wallet-storage', // localStorage key
      partialize: (state) => ({ 
        publicKey: state.publicKey, 
        balance: state.balance, 
        connected: state.connected,
        network: state.network,
        networkPassphrase: state.networkPassphrase,
      }),
    }
  )
);

/**
 * Checks whether the given connected wallet matches the invoice's seller public key.
 */
export function isWalletSeller(walletPublicKey?: string | null, sellerPublicKey?: string | null): boolean {
  if (!sellerPublicKey) return true;
  if (!walletPublicKey) return false;
  return walletPublicKey.trim() === sellerPublicKey.trim();
}

