import { Address, log } from '@graphprotocol/graph-ts'
import {
  fetchTokenDecimals,
  fetchTokenName,
  fetchTokenSymbol,
  fetchTokenTotalSupply,
  ZERO_BD,
  ZERO_BI
} from '../mappings/helpers'
import { Token } from '../types/schema'

/**
 * Returns an existing Token from the data store; creates a new one if does not exist
 * @param address
 * @returns
 */
export function createOrGetToken(address: Address): Token {
  let hexTokenAddress = address.toHexString()
  let rewardToken = Token.load(hexTokenAddress)
  if (rewardToken === null) {
    rewardToken = new Token(hexTokenAddress)
    rewardToken.symbol = fetchTokenSymbol(address)
    rewardToken.name = fetchTokenName(address)
    rewardToken.totalSupply = fetchTokenTotalSupply(address)
    let decimals = fetchTokenDecimals(address)
    // bail if we couldn't figure out the decimals
    // if (decimals === null) {
    //   log.error('cannot retrieve token decimal value', [])
    //   return
    // }
    rewardToken.decimals = decimals
    rewardToken.derivedNativeCurrency = ZERO_BD
    rewardToken.tradeVolume = ZERO_BD
    rewardToken.tradeVolumeUSD = ZERO_BD
    rewardToken.untrackedVolumeUSD = ZERO_BD
    rewardToken.totalLiquidity = ZERO_BD
    rewardToken.txCount = ZERO_BI
    rewardToken.whitelistPairs = []
    // FIXME: how to add whitelist pairs?
    rewardToken.save()
  }

  return rewardToken as Token
}
