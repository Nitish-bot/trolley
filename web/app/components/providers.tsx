"use client";

import { PropsWithChildren } from "react";

import { ChainContextProvider } from "../context/chain-context-provider";
import { SelectedWalletAccountContextProvider } from "../context/selected-wallet-account-context-provider";
import { ConnectionContextProvider } from "../context/connection-context-provider";

export function Providers({ children }: PropsWithChildren) {
  return (
    <ChainContextProvider>
      <SelectedWalletAccountContextProvider>
        <ConnectionContextProvider>{children}</ConnectionContextProvider>
      </SelectedWalletAccountContextProvider>
    </ChainContextProvider>
  );
}
