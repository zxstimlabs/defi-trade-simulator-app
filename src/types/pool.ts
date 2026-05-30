export interface PoolState {
  currency0Symbol: string
  currency1Symbol: string
  currency0Decimals: number
  currency1Decimals: number
  sqrtPriceX96: string
  tick: number
  protocolFee: number
  lpFee: number
  liquidity: string
  feeGrowthGlobal0X128: string
  feeGrowthGlobal1X128: string
  reserve0: string
  reserve1: string
  blockNumber: string
  updatedAt: number
}

export interface SwapEvent {
  poolId: string
  sender: string
  userAddress: string
  amount0: string
  amount1: string
  sqrtPriceX96: string
  liquidity: string
  tick: number
  fee: number
  price: number
  transactionHash: string
  blockNumber: string
  blockTimestamp: number
  timestamp: number
}

// transactionHash alone isn't unique (one tx can hold several swaps); combine
// it with the amounts/price so each swap dedupes independently.
export const swapKey = (s: SwapEvent) =>
  `${s.transactionHash}:${s.sqrtPriceX96}:${s.amount0}:${s.amount1}`
