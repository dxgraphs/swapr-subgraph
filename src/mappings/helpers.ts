/* eslint-disable prefer-const */
import { log, BigInt, BigDecimal, Address, ethereum, dataSource } from '@graphprotocol/graph-ts'
import { ERC20 } from '../types/Factory/ERC20'
import { ERC20SymbolBytes } from '../types/Factory/ERC20SymbolBytes'
import { ERC20NameBytes } from '../types/Factory/ERC20NameBytes'
import {
  User,
  Bundle,
  Token,
  LiquidityPosition,
  LiquidityPositionSnapshot,
  Pair,
  LiquidityMiningCampaign,
  LiquidityMiningPosition,
  LiquidityMiningPositionSnapshot,
  SingleSidedStakingCampaign,
  SingleSidedStakingCampaignPosition,
  SwaprStakingRewardsFactory
} from '../types/schema'
import { Factory as FactoryContract } from '../types/templates/Pair/Factory'
import { getFactoryAddress, getStakingRewardsFactoryAddress } from '../commons/addresses'

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'

export let ZERO_BI = BigInt.fromI32(0)
export let ONE_BI = BigInt.fromI32(1)
export let ZERO_BD = BigDecimal.fromString('0')
export let ONE_BD = BigDecimal.fromString('1')
export let BI_18 = BigInt.fromI32(18)

export let factoryContract = FactoryContract.bind(Address.fromString(getFactoryAddress()))

export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
  let bd = BigDecimal.fromString('1')
  for (let i = ZERO_BI; i.lt(decimals as BigInt); i = i.plus(ONE_BI)) {
    bd = bd.times(BigDecimal.fromString('10'))
  }
  return bd
}

export function bigDecimalExp18(): BigDecimal {
  return BigDecimal.fromString('1000000000000000000')
}

export function convertNativeCurrencyToDecimal(eth: BigInt): BigDecimal {
  return eth.toBigDecimal().div(exponentToBigDecimal(new BigInt(18)))
}

export function convertTokenToDecimal(tokenAmount: BigInt, exchangeDecimals: BigInt): BigDecimal {
  if (exchangeDecimals == ZERO_BI) {
    return tokenAmount.toBigDecimal()
  }
  return tokenAmount.toBigDecimal().div(exponentToBigDecimal(exchangeDecimals))
}

export function equalToZero(value: BigDecimal): boolean {
  const formattedVal = parseFloat(value.toString())
  const zero = parseFloat(ZERO_BD.toString())
  if (zero == formattedVal) {
    return true
  }
  return false
}

export function isNullEthValue(value: string): boolean {
  return value == '0x0000000000000000000000000000000000000000000000000000000000000001'
}

export function fetchTokenSymbol(tokenAddress: Address): string {
  // hard coded overrides
  let network = dataSource.network() as string
  if (network == 'mainnet') {
    if (tokenAddress.toHexString() == '0xe0b7927c4af23765cb51314a0e0521a9645f0e2a') return 'DGD'
    if (tokenAddress.toHexString() == '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9') return 'AAVE'
  }
  if (network == 'arbitrum-one') {
    if (tokenAddress.toHexString() == '0x2e9a6df78e42a30712c10a9dc4b1c8656f8f2879') return 'MKR'
  }

  let contract = ERC20.bind(tokenAddress)
  let contractSymbolBytes = ERC20SymbolBytes.bind(tokenAddress)

  // try types string and bytes32 for symbol
  let symbolValue = 'unknown'
  let symbolResult = contract.try_symbol()
  if (symbolResult.reverted) {
    let symbolResultBytes = contractSymbolBytes.try_symbol()
    if (!symbolResultBytes.reverted) {
      // for broken pairs that have no symbol function exposed
      if (!isNullEthValue(symbolResultBytes.value.toHexString())) {
        symbolValue = symbolResultBytes.value.toString()
      }
    }
  } else {
    symbolValue = symbolResult.value
  }

  return symbolValue
}

export function fetchTokenName(tokenAddress: Address): string {
  // hard coded overrides
  let network = dataSource.network() as string
  if (network == 'mainnet') {
    if (tokenAddress.toHexString() == '0xe0b7927c4af23765cb51314a0e0521a9645f0e2a') return 'DGD'
    if (tokenAddress.toHexString() == '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9') return 'Aave token'
  }
  if (network == 'arbitrum-one') {
    if (tokenAddress.toHexString() == '0x2e9a6df78e42a30712c10a9dc4b1c8656f8f2879') return 'Maker'
  }

  let contract = ERC20.bind(tokenAddress)
  let contractNameBytes = ERC20NameBytes.bind(tokenAddress)

  // try types string and bytes32 for name
  let nameValue = 'unknown'
  let nameResult = contract.try_name()
  if (nameResult.reverted) {
    let nameResultBytes = contractNameBytes.try_name()
    if (!nameResultBytes.reverted) {
      // for broken exchanges that have no name function exposed
      if (!isNullEthValue(nameResultBytes.value.toHexString())) {
        nameValue = nameResultBytes.value.toString()
      }
    }
  } else {
    nameValue = nameResult.value
  }

  return nameValue
}

export function fetchTokenTotalSupply(tokenAddress: Address): BigInt {
  let contract = ERC20.bind(tokenAddress)
  let totalSupplyResult = contract.try_totalSupply()
  if (!totalSupplyResult.reverted) {
    return totalSupplyResult.value
  }
  return BigInt.fromI32(0)
}

export function fetchTokenDecimals(tokenAddress: Address): BigInt {
  // hardcode overrides
  if (tokenAddress.toHexString() == '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9') {
    return BigInt.fromI32(18)
  }

  let contract = ERC20.bind(tokenAddress)
  // try types uint8 for decimals
  let decimalResult = contract.try_decimals()
  if (!decimalResult.reverted) {
    return BigInt.fromI32(decimalResult.value)
  }
  return BigInt.fromI32(0)
}

export function createLiquidityPosition(exchange: Address, user: Address): LiquidityPosition {
  let id = exchange
    .toHexString()
    .concat('-')
    .concat(user.toHexString())
  let liquidityTokenBalance = LiquidityPosition.load(id)
  if (liquidityTokenBalance === null) {
    let pair = Pair.load(exchange.toHexString())
    if (pair) {
      pair.liquidityProviderCount = pair.liquidityProviderCount.plus(ONE_BI)
      liquidityTokenBalance = new LiquidityPosition(id)
      liquidityTokenBalance.liquidityTokenBalance = ZERO_BD
      liquidityTokenBalance.pair = exchange.toHexString()
      liquidityTokenBalance.user = user.toHexString()
      liquidityTokenBalance.save()
      pair.save()
    }
  }
  if (liquidityTokenBalance === null) log.error('LiquidityTokenBalance is null', [id])
  return liquidityTokenBalance as LiquidityPosition
}

/**
 * Gets a Single Liquidity Mining Campaign Position for given compisite of campaign, pair, and user.
 * Defaults to creating a new entity if not found
 * @param campaign
 * @param pair
 * @param user
 * @returns
 */
export function getOrCreateLiquidityMiningPosition(
  campaign: LiquidityMiningCampaign,
  pair: Pair,
  user: Address
): LiquidityMiningPosition {
  let id = campaign.id.concat('-').concat(user.toHexString())
  let position = LiquidityMiningPosition.load(id)
  if (position === null) {
    position = new LiquidityMiningPosition(id)
    position.liquidityMiningCampaign = campaign.id
    position.targetedPair = pair.id
    position.stakedAmount = ZERO_BD
    position.user = user.toHexString()
    position.save()
  }
  return position as LiquidityMiningPosition
}

/**
 * Gets a Single Liquidity Mining Campaign Position for given compisite of campaign and user.
 * Defaults to creating a new entity if not found
 * @param campaign
 * @param user
 * @returns
 */
export function getOrCreateSingleSidedStakingCampaignPosition(
  campaign: SingleSidedStakingCampaign,
  user: Address
): SingleSidedStakingCampaignPosition {
  let id = campaign.id.concat('-').concat(user.toHexString())
  let position = SingleSidedStakingCampaignPosition.load(id)
  if (position === null) {
    position = new SingleSidedStakingCampaignPosition(id)
    position.singleSidedStakingCampaign = campaign.id
    position.stakedAmount = ZERO_BD
    position.user = user.toHexString()
    position.save()
  }
  return position as SingleSidedStakingCampaignPosition
}

export function createUser(address: Address): void {
  let user = User.load(address.toHexString())
  if (user === null) {
    user = new User(address.toHexString())
    user.usdSwapped = ZERO_BD
    user.save()
  }
}

export function createLiquiditySnapshot(position: LiquidityPosition, event: ethereum.Event): void {
  let timestamp = event.block.timestamp.toI32()
  let bundle = Bundle.load('1')
  let pair = Pair.load(position.pair)

  if (!bundle || !pair) return

  let token0 = Token.load(pair.token0)
  let token1 = Token.load(pair.token1)

  if (!token0 || !token1) return

  // create new snapshot
  let snapshot = new LiquidityPositionSnapshot(position.id.concat(timestamp.toString()))
  snapshot.liquidityPosition = position.id
  snapshot.timestamp = timestamp
  snapshot.block = event.block.number.toI32()
  snapshot.user = position.user
  snapshot.pair = position.pair
  snapshot.token0PriceUSD = (token0.derivedNativeCurrency as BigDecimal).times(bundle.nativeCurrencyPrice)
  snapshot.token1PriceUSD = (token1.derivedNativeCurrency as BigDecimal).times(bundle.nativeCurrencyPrice)
  snapshot.reserve0 = pair.reserve0
  snapshot.reserve1 = pair.reserve1
  snapshot.reserveUSD = pair.reserveUSD
  snapshot.liquidityTokenTotalSupply = pair.totalSupply
  snapshot.liquidityTokenBalance = position.liquidityTokenBalance
  snapshot.liquidityPosition = position.id
  snapshot.save()
}

export function createLiquidityMiningSnapshot(
  position: LiquidityMiningPosition,
  campaign: LiquidityMiningCampaign,
  event: ethereum.Event
): void {
  let timestamp = event.block.timestamp.toI32()
  let bundle = Bundle.load('1')
  let pair = Pair.load(position.targetedPair)

  if (!pair || !bundle) {
    return
  }

  let token0 = Token.load(pair.token0)
  let token1 = Token.load(pair.token1)

  if (!token0 || !token1) {
    return
  }

  // create new snapshot
  let snapshot = new LiquidityMiningPositionSnapshot(position.id.concat(timestamp.toString()))
  snapshot.liquidityMiningPosition = position.id
  snapshot.liquidityMiningCampaign = campaign.id
  snapshot.timestamp = timestamp
  snapshot.block = event.block.number.toI32()
  snapshot.user = position.user
  snapshot.pair = position.targetedPair

  if (bundle.nativeCurrencyPrice && token0.derivedNativeCurrency && token1.derivedNativeCurrency) {
    snapshot.token0PriceUSD = (token0.derivedNativeCurrency as BigDecimal).times(bundle.nativeCurrencyPrice)
    snapshot.token1PriceUSD = (token1.derivedNativeCurrency as BigDecimal).times(bundle.nativeCurrencyPrice)
  }

  snapshot.reserve0 = pair.reserve0
  snapshot.reserve1 = pair.reserve1
  snapshot.reserveUSD = pair.reserveUSD
  snapshot.totalStakedLiquidityToken = campaign.stakedAmount
  snapshot.stakedLiquidityTokenBalance = position.stakedAmount
  snapshot.save()
}

/**
 * Retrieves the SwaprStakingRewardsFactory, creates a one if none exists
 */
export function getSwaprStakingRewardsFactory(): SwaprStakingRewardsFactory {
  // load factory (create if first distribution)
  let stakingRewardsFactoryAddress = getStakingRewardsFactoryAddress()
  let factory = SwaprStakingRewardsFactory.load(stakingRewardsFactoryAddress)
  if (factory === null) {
    factory = new SwaprStakingRewardsFactory(stakingRewardsFactoryAddress)
    factory.initializedCampaignsCount = 0
    factory.save()
  }

  return factory as SwaprStakingRewardsFactory
}
