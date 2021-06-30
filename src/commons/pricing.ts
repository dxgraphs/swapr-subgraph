/* eslint-disable prefer-const */
import { BigDecimal, dataSource, log } from '@graphprotocol/graph-ts/index'
import { ZERO_BD } from '../mappings/helpers'

// minimum liquidity required to count towards tracked volume for pairs with small # of Lps
export function getMinimumUsdThresholdForNewPairs(): BigDecimal {
  let network = dataSource.network() as string
  // not using a switch-case because using strings is not yet supported (only u32)
  if (network == 'mainnet') return BigDecimal.fromString('1000')
  if (network == 'rinkeby') return BigDecimal.fromString('0.1')
  if (network == 'xdai') return BigDecimal.fromString('10')
  if (network == 'arbitrum-one') return BigDecimal.fromString('1000')
  if (network == 'arbitrum-rinkeby') return BigDecimal.fromString('0.1')
  log.warning('no minimum usd threshold for new pairs for unsupported network {}', [network])
  return ZERO_BD
}

// minimum liquidity for price to get tracked
export function getMinimumLiquidityThresholdNativeCurrency(): BigDecimal {
  let network = dataSource.network() as string
  // not using a switch-case because using strings is not yet supported (only u32)
  if (network == 'mainnet') return BigDecimal.fromString('0.5')
  if (network == 'rinkeby') return BigDecimal.fromString('0.01')
  if (network == 'xdai') return BigDecimal.fromString('10')
  if (network == 'arbitrum-one') return BigDecimal.fromString('0.1')
  if (network == 'arbitrum-rinkeby') return BigDecimal.fromString('0.01')
  log.warning('no minimum usd threshold for new pairs for unsupported network {}', [network])
  return ZERO_BD
}
