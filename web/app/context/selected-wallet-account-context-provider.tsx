"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getUiWalletAccountStorageKey,
  UiWallet,
  UiWalletAccount,
  uiWalletAccountBelongsToUiWallet,
  uiWalletAccountsAreSame,
  useWallets,
} from "@wallet-standard/react";

import {
  SelectedWalletAccountContext,
  type SelectedWalletAccountState,
} from "./selected-wallet-account-context";

const STORAGE_KEY = "cayed:selected-wallet";

let wasSetterInvoked = false;
function getSavedWalletAccount(
  wallets: readonly UiWallet[],
): UiWalletAccount | undefined {
  if (typeof window === "undefined" || wasSetterInvoked) {
    // After the user makes an explicit choice of wallet, stop trying to auto-select the
    // saved wallet, if and when it appears.
    return;
  }
  const savedWalletNameAndAddress = localStorage.getItem(STORAGE_KEY);
  if (
    !savedWalletNameAndAddress ||
    typeof savedWalletNameAndAddress !== "string"
  ) {
    return;
  }
  const [savedWalletName, savedAccountAddress] =
    savedWalletNameAndAddress.split(":");
  if (!savedWalletName || !savedAccountAddress) {
    return;
  }
  for (const wallet of wallets) {
    if (wallet.name === savedWalletName) {
      for (const account of wallet.accounts) {
        if (account.address === savedAccountAddress) {
          return account;
        }
      }
    }
  }
}

/**
 * Saves the selected wallet account's storage key to the browser's local storage. In future
 * sessions it will try to return that same wallet account, or at least one from the same brand of
 * wallet if the wallet from which it came is still in the Wallet Standard registry.
 */
export function SelectedWalletAccountContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const wallets = useWallets();
  const [mounted, setMounted] = useState(false);
  const [selectedWalletAccount, setSelectedWalletAccountInternal] =
    useState<SelectedWalletAccountState>(undefined);

  useEffect(() => {
    setMounted(true);
    // This only runs in the browser — safe to touch localStorage here
    const saved = getSavedWalletAccount(wallets);
    if (saved) setSelectedWalletAccountInternal(saved);
  }, []); // empty deps: run once on mount

  const setSelectedWalletAccount: React.Dispatch<
    React.SetStateAction<SelectedWalletAccountState>
  > = (setStateAction) => {
    setSelectedWalletAccountInternal((prevSelectedWalletAccount) => {
      wasSetterInvoked = true;
      const nextWalletAccount =
        typeof setStateAction === "function"
          ? setStateAction(prevSelectedWalletAccount)
          : setStateAction;
      const accountKey = nextWalletAccount
        ? getUiWalletAccountStorageKey(nextWalletAccount)
        : undefined;
      if (accountKey) {
        localStorage.setItem(STORAGE_KEY, accountKey);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      return nextWalletAccount;
    });
  };
  useEffect(() => {
    const savedWalletAccount = getSavedWalletAccount(wallets);
    if (savedWalletAccount) {
      setSelectedWalletAccountInternal(savedWalletAccount);
    }
  }, [wallets]);
  const walletAccount = useMemo(() => {
    if (selectedWalletAccount) {
      for (const uiWallet of wallets) {
        for (const uiWalletAccount of uiWallet.accounts) {
          if (uiWalletAccountsAreSame(selectedWalletAccount, uiWalletAccount)) {
            return uiWalletAccount;
          }
        }
        if (
          uiWalletAccountBelongsToUiWallet(selectedWalletAccount, uiWallet) &&
          uiWallet.accounts[0]
        ) {
          // If the selected account belongs to this connected wallet, at least, then
          // select one of its accounts.
          return uiWallet.accounts[0];
        }
      }
    }
  }, [selectedWalletAccount, wallets]);
  useEffect(() => {
    // If there is a selected wallet account but the wallet to which it belongs has since
    // disconnected, clear the selected wallet.
    if (selectedWalletAccount && !walletAccount) {
      setSelectedWalletAccountInternal(undefined);
    }
  }, [selectedWalletAccount, walletAccount]);

  const contextValue = useMemo(
    () => [walletAccount, setSelectedWalletAccount] as const,
    [walletAccount],
  );

  if (!mounted) {
    return (
      <SelectedWalletAccountContext.Provider value={[undefined, () => void 0]}>
        {children}
      </SelectedWalletAccountContext.Provider>
    );
  }

  return (
    <SelectedWalletAccountContext.Provider value={contextValue}>
      {children}
    </SelectedWalletAccountContext.Provider>
  );
}
