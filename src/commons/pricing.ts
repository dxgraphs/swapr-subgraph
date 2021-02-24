import { BigDecimal, dataSource } from '@graphprotocol/graph-ts/index'

// minimum liquidity required to count towards tracked volume for pairs with small # of Lps
export function getMinimumUsdThresholdForNewPairs(): BigDecimal {
  return dataSource.network() == 'rinkeby' ? BigDecimal.fromString('0.1') : BigDecimal.fromString('1000')
}

// minimum liquidity for price to get tracked
export function getMinimumLiquidityThresholdEth(): BigDecimal {
  return dataSource.network() == 'rinkeby' ? BigDecimal.fromString('0.0001') : BigDecimal.fromString('1')
}

// the minimum amount used to calculate apy
export function getMinimumUsdStakedAmount(): BigDecimal {
  return dataSource.network() == 'rinkeby' ? BigDecimal.fromString('1') : BigDecimal.fromString('1')
}
