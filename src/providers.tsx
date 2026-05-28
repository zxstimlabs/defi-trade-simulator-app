import * as React from "react";
import { arbitrumSepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, WagmiProvider, http } from "wagmi";
import { ThemeProvider } from "@/components/theme-provider.tsx";
import { Provider as JotaiProvider } from "jotai";


const config = createConfig({
  chains: [arbitrumSepolia],
  transports: {
    [arbitrumSepolia.id]: http(import.meta.env.VITE_ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc"),
  },
});

const queryClient = new QueryClient();


export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </JotaiProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}