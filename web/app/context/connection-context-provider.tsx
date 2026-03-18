import { type ReactNode, useContext, useMemo } from "react";

import { connect } from "solana-kite";

import { ChainContext } from "./chain-context";
import {
  ConnectionContext,
  type ConnectionContextType,
} from "./connection-context";

export function ConnectionContextProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { solanaRpcUrl, solanaRpcSubscriptionsUrl } = useContext(ChainContext);

  const contextValue: ConnectionContextType = useMemo(
    () => ({
      connection: connect(solanaRpcUrl, solanaRpcSubscriptionsUrl),
    }),
    [solanaRpcUrl, solanaRpcSubscriptionsUrl],
  );

  return (
    <ConnectionContext.Provider value={contextValue}>
      {children}
    </ConnectionContext.Provider>
  );
}
