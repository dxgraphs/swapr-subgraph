/* eslint-disable prefer-const */
import { log, DataSourceContext, dataSource, Bytes, Address } from '@graphprotocol/graph-ts'
import {
  SwaprStakingRewardsFactory,
  Pair,
  Token,
  Distribution,
  DistributionReward,
  Deposit,
  Withdrawal,
  Claim,
  Recovery
} from '../types/schema'
import { Distribution as DistributionTemplate } from '../types/templates'
import { DistributionCreated } from '../types/StakingRewardsFactory/StakingRewardsFactory'
import {
  Canceled,
  Claimed,
  Initialized,
  Recovered,
  Staked,
  Withdrawn
} from '../types/templates/Distribution/StakingRewardsDistribution'
import {
  convertTokenToDecimal,
  ZERO_BD,
  getOrCreateAggregatedToken0DistributionData,
  BI_18,
  fetchTokenSymbol,
  fetchTokenName,
  fetchTokenTotalSupply,
  fetchTokenDecimals,
  ZERO_BI
} from './helpers'
import { findEthPerToken } from './pricing'
import { getStakingRewardsFactoryAddress } from '../commons/addresses'

export function handleDistributionCreation(event: DistributionCreated): void {
  let context = new DataSourceContext()
  context.setString('owner', event.params.owner.toHexString())
  context.setString('address', event.params.deployedAt.toHexString())
  DistributionTemplate.createWithContext(event.params.deployedAt, context)
}

export function handleDistributionInitialization(event: Initialized): void {
  // load factory (create if first distribution)
  let factory = SwaprStakingRewardsFactory.load(getStakingRewardsFactoryAddress())
  if (factory === null) {
    factory = new SwaprStakingRewardsFactory(getStakingRewardsFactoryAddress())
    factory.initializedDistributionsCount = 0
  }
  factory.initializedDistributionsCount = factory.initializedDistributionsCount + 1
  factory.save()

  if (event.params.rewardsTokenAddresses.length !== event.params.rewardsAmounts.length) {
    // bail if the passed reward-related arrays have a different length
    log.error('inconsistent reward tokens and amounts', [])
    return
  }
  let stakablePair = Pair.load(event.params.stakableTokenAddress.toHexString())
  if (stakablePair === null) {
    // bail if the passed stakable token is not a registered pair (LP token)
    log.error('could not get pair for address', [event.params.stakableTokenAddress.toString()])
    return
  }
  let context = dataSource.context()
  let hexDistributionAddress = context.getString('address')
  // distribution needs to be loaded since it's possible to cancel and then reinitialize
  // an already-existing instance
  let distribution = Distribution.load(hexDistributionAddress)
  if (distribution === null) {
    distribution = new Distribution(hexDistributionAddress)
  }
  distribution.owner = Bytes.fromHexString(context.getString('owner')) as Bytes
  distribution.startsAt = event.params.startingTimestamp
  distribution.endsAt = event.params.endingTimestamp
  let duration = distribution.endsAt.minus(distribution.startsAt)
  distribution.duration = duration
  distribution.locked = event.params.locked
  distribution.stakablePair = stakablePair.id
  let rewards = new Array<DistributionReward>()
  let rewardTokenAddresses = event.params.rewardsTokenAddresses
  let rewardAmounts = event.params.rewardsAmounts
  for (let index = 0; index < rewardTokenAddresses.length; index++) {
    let address: Address = rewardTokenAddresses[index]
    let hexTokenAddress = address.toHexString()
    let rewardToken = Token.load(hexTokenAddress)
    if (rewardToken === null) {
      rewardToken = new Token(hexTokenAddress)
      rewardToken.symbol = fetchTokenSymbol(address)
      rewardToken.name = fetchTokenName(address)
      rewardToken.totalSupply = fetchTokenTotalSupply(address)
      let decimals = fetchTokenDecimals(address)
      // bail if we couldn't figure out the decimals
      if (decimals === null) {
        log.error('cannot retrieve token decimal value', [])
        return
      }
      rewardToken.decimals = decimals
      rewardToken.derivedETH = findEthPerToken(rewardToken as Token)
      rewardToken.tradeVolume = ZERO_BD
      rewardToken.tradeVolumeUSD = ZERO_BD
      rewardToken.untrackedVolumeUSD = ZERO_BD
      rewardToken.totalLiquidity = ZERO_BD
      rewardToken.txCount = ZERO_BI
      rewardToken.save()
    }

    let reward = new DistributionReward(hexTokenAddress)
    reward.token = rewardToken.id
    reward.amount = convertTokenToDecimal(rewardAmounts[index], rewardToken.decimals)
    reward.distribution = distribution.id
    reward.save()
    rewards.push(reward)
  }
  distribution.stakedAmount = ZERO_BD
  distribution.initialized = true

  // updating distribution per token 0 in pair
  let token0 = Token.load(stakablePair.token0)
  if (token0 === null) {
    // bail if token0 is null
    log.error('could not get token 0 for stakable pair', [])
    return
  }
  let aggregatedDistributionData = getOrCreateAggregatedToken0DistributionData(token0 as Token)
  aggregatedDistributionData.numberOfDistributions = aggregatedDistributionData.numberOfDistributions + 1
  aggregatedDistributionData.save()

  distribution.aggregatedData = aggregatedDistributionData.id
  distribution.save()
}

export function handleDistributionCancelation(event: Canceled): void {
  // load factory (create if first distribution)
  let factory = SwaprStakingRewardsFactory.load(getStakingRewardsFactoryAddress())
  if (factory === null) {
    // bail if factory is null
    log.error('factory must be initialized when canceling a distribution', [])
    return
  }
  factory.initializedDistributionsCount = factory.initializedDistributionsCount - 1
  factory.save()

  let canceledDistribution = Distribution.load(event.address.toHexString())
  canceledDistribution.initialized = false
  canceledDistribution.save()

  // updating aggregated distribution data
  let stakablePair = Pair.load(canceledDistribution.stakablePair)
  let token0 = Token.load(stakablePair.token0)
  if (token0 === null) {
    // bail if token0 is null
    log.error('could not get token 0 for stakable pair', [])
    return
  }
  let aggregatedDistributionData = getOrCreateAggregatedToken0DistributionData(token0 as Token)
  // untrack distribution from aggregated data if currently tracked
  let indexOfCanceledDistribution = aggregatedDistributionData.distributions.indexOf(canceledDistribution.id)
  if (indexOfCanceledDistribution >= 0) {
    aggregatedDistributionData.distributions.splice(indexOfCanceledDistribution, 1)
    aggregatedDistributionData.numberOfDistributions = aggregatedDistributionData.numberOfDistributions - 1
  }
  aggregatedDistributionData.save()
}

export function handleDeposit(event: Staked): void {
  let distribution = Distribution.load(event.address.toHexString())
  distribution.stakedAmount = distribution.stakedAmount.plus(
    convertTokenToDecimal(event.params.amount, BI_18) // lp tokens have hardcoded 18 decimals
  )

  // populating the stake depoist entity
  let deposit = new Deposit(event.transaction.hash.toHexString())
  deposit.user = event.params.staker
  deposit.timestamp = event.block.timestamp
  deposit.distribution = distribution.id
  deposit.amount = convertTokenToDecimal(event.params.amount, BI_18)
  deposit.save()

  distribution.deposits.push(deposit.id)
  distribution.save()
}

export function handleWithdrawal(event: Withdrawn): void {
  let distribution = Distribution.load(event.address.toHexString())
  distribution.stakedAmount = distribution.stakedAmount.minus(
    convertTokenToDecimal(event.params.amount, BI_18) // lp tokens have hardcoded 18 decimals
  )

  // populating the withdrawal entity
  let withdrawal = new Withdrawal(event.transaction.hash.toHexString())
  withdrawal.user = event.params.withdrawer
  withdrawal.timestamp = event.block.timestamp
  withdrawal.distribution = distribution.id
  withdrawal.amount = convertTokenToDecimal(event.params.amount, BI_18)
  withdrawal.save()

  distribution.withdrawals.push(withdrawal.id)
  distribution.save()
}

export function handleClaim(event: Claimed): void {
  let distribution = Distribution.load(event.address.toHexString())

  // populating the claim entity
  let claim = new Claim(event.transaction.hash.toHexString())
  claim.user = event.params.claimer
  claim.timestamp = event.block.timestamp
  claim.distribution = distribution.id
  let distributionRewards = distribution.rewards
  let loadedDistributionRewards = new Array<DistributionReward>()
  for (let i = 0; i < distribution.rewards.length; i++) {
    loadedDistributionRewards.push(DistributionReward.load(distributionRewards[i]) as DistributionReward)
  }

  let claimedAmounts = event.params.amounts
  for (let i = 0; i < claimedAmounts.length; i++) {
    claim.amounts.push(
      convertTokenToDecimal(claimedAmounts[i], Token.load(loadedDistributionRewards[i].token).decimals)
    )
  }
  claim.save()

  distribution.claims.push(claim.id)
  distribution.save()
}

export function handleRecovery(event: Recovered): void {
  let distribution = Distribution.load(event.address.toHexString())

  // populating the recovery entity
  let recovery = new Recovery(event.transaction.hash.toHexString())
  recovery.timestamp = event.block.timestamp
  recovery.distribution = distribution.id
  let loadedDistributionRewards = new Array<DistributionReward>()
  let distributionRewards = distribution.rewards
  for (let i = 0; i < distribution.rewards.length; i++) {
    loadedDistributionRewards.push(DistributionReward.load(distributionRewards[i]) as DistributionReward)
  }
  let recoveredAmounts = event.params.amounts
  for (let i = 0; i < recoveredAmounts.length; i++) {
    recovery.amounts.push(
      convertTokenToDecimal(recoveredAmounts[i], Token.load(loadedDistributionRewards[i].token).decimals)
    )
  }
  recovery.save()

  distribution.recoveries.push(recovery.id)
  distribution.save()
}
