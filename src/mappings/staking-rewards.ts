/* eslint-disable prefer-const */
import { log, DataSourceContext, dataSource, Bytes, Address, BigDecimal } from '@graphprotocol/graph-ts'
import {
  SwaprStakingRewardsFactory,
  Pair,
  Token,
  LiquidityMiningCampaign,
  Deposit,
  Withdrawal,
  Claim,
  Recovery,
  LiquidityMiningCampaignReward
} from '../types/schema'
import { Distribution as DistributionTemplate } from '../types/templates'
import { DistributionCreated } from '../types/StakingRewardsFactory/StakingRewardsFactory'
import {
  Canceled,
  Claimed,
  Initialized,
  OwnershipTransferred,
  Recovered,
  Staked,
  Withdrawn
} from '../types/templates/Distribution/StakingRewardsDistribution'
import {
  convertTokenToDecimal,
  ZERO_BD,
  BI_18,
  fetchTokenSymbol,
  fetchTokenName,
  fetchTokenTotalSupply,
  fetchTokenDecimals,
  ZERO_BI,
  getOrCreateLiquidityMiningPosition,
  createLiquidityMiningSnapshot
} from './helpers'
import { getStakingRewardsFactoryAddress } from '../commons/addresses'

export function handleDistributionCreation(event: DistributionCreated): void {
  let context = new DataSourceContext()
  context.setString('owner', event.params.owner.toHexString())
  context.setString('address', event.params.deployedAt.toHexString())
  DistributionTemplate.createWithContext(event.params.deployedAt, context)
}

export function handleDistributionInitialization(event: Initialized): void {
  // load factory (create if first distribution)
  let stakingRewardsFactoryAddress = getStakingRewardsFactoryAddress()
  let factory = SwaprStakingRewardsFactory.load(stakingRewardsFactoryAddress)
  if (factory === null) {
    factory = new SwaprStakingRewardsFactory(stakingRewardsFactoryAddress)
    factory.initializedCampaignsCount = 0
  }
  factory.initializedCampaignsCount = factory.initializedCampaignsCount + 1
  factory.save()

  if (event.params.rewardsTokenAddresses.length !== event.params.rewardsAmounts.length) {
    // bail if the passed reward-related arrays have a different length
    log.error('inconsistent reward tokens and amounts', [])
    return
  }
  let stakablePair = Pair.load(event.params.stakableTokenAddress.toHexString())
  if (stakablePair === null) {
    // bail if the passed stakable token is not a registered pair (LP token)
    log.warning('could not get pair for address {}', [event.params.stakableTokenAddress.toHexString()])
    return
  }
  let context = dataSource.context()
  let hexDistributionAddress = context.getString('address')
  // distribution needs to be loaded since it's possible to cancel and then reinitialize
  // an already-existing instance
  let distribution = LiquidityMiningCampaign.load(hexDistributionAddress)
  if (distribution === null) {
    distribution = new LiquidityMiningCampaign(hexDistributionAddress)
  }
  distribution.owner = Bytes.fromHexString(context.getString('owner')) as Bytes
  distribution.startsAt = event.params.startingTimestamp
  distribution.endsAt = event.params.endingTimestamp
  let duration = distribution.endsAt.minus(distribution.startsAt)
  distribution.duration = duration
  distribution.locked = event.params.locked
  distribution.stakablePair = stakablePair.id
  distribution.stakingCap = convertTokenToDecimal(event.params.stakingCap, BI_18) // lp tokens have hardcoded 18 decimals
  let rewardTokenAddresses = event.params.rewardsTokenAddresses
  let eventRewardAmounts = event.params.rewardsAmounts
  let rewards: string[] = []
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
    let rewardId = hexDistributionAddress.concat('-').concat(hexTokenAddress)
    let reward = LiquidityMiningCampaignReward.load(rewardId)
    if (reward == null) reward = new LiquidityMiningCampaignReward(rewardId)
    reward.token = hexTokenAddress
    reward.amount = convertTokenToDecimal(eventRewardAmounts[index], rewardToken.decimals)
    reward.save()
    rewards.push(reward.id)
  }
  distribution.stakedAmount = ZERO_BD
  distribution.stakingCap = convertTokenToDecimal(event.params.stakingCap, BI_18)
  distribution.rewards = rewards
  distribution.initialized = true
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
  factory.initializedCampaignsCount = factory.initializedCampaignsCount - 1
  factory.save()

  let canceledDistribution = LiquidityMiningCampaign.load(event.address.toHexString())
  canceledDistribution.initialized = false
  canceledDistribution.save()
}

export function handleDeposit(event: Staked): void {
  let campaign = LiquidityMiningCampaign.load(event.address.toHexString())
  if (campaign == null) {
    log.error('non existent campaign {}', [event.address.toHexString()])
    return
  }
  let stakedAmount = convertTokenToDecimal(event.params.amount, BI_18) // lp tokens have hardcoded 18 decimals
  campaign.stakedAmount = campaign.stakedAmount.plus(stakedAmount)
  campaign.save()

  let position = getOrCreateLiquidityMiningPosition(
    campaign as LiquidityMiningCampaign,
    Pair.load(campaign.stakablePair) as Pair,
    event.params.staker
  )
  position.stakedAmount = position.stakedAmount.plus(stakedAmount)
  position.save()

  createLiquidityMiningSnapshot(position, campaign as LiquidityMiningCampaign, event)

  // populating the stake deposit entity
  let deposit = new Deposit(event.transaction.hash.toHexString())
  deposit.liquidityMiningCampaign = campaign.id
  deposit.user = event.params.staker
  deposit.timestamp = event.block.timestamp
  deposit.amount = stakedAmount
  deposit.save()
}

export function handleWithdrawal(event: Withdrawn): void {
  let campaign = LiquidityMiningCampaign.load(event.address.toHexString())
  if (campaign == null) {
    log.error('non existent campaign {}', [event.address.toHexString()])
    return
  }
  let withdrawnAmount = convertTokenToDecimal(event.params.amount, BI_18)
  campaign.stakedAmount = campaign.stakedAmount.minus(withdrawnAmount)
  campaign.save()

  let position = getOrCreateLiquidityMiningPosition(
    campaign as LiquidityMiningCampaign,
    Pair.load(campaign.stakablePair) as Pair,
    event.params.withdrawer
  )
  position.stakedAmount = position.stakedAmount.minus(withdrawnAmount)
  position.save()

  createLiquidityMiningSnapshot(position, campaign as LiquidityMiningCampaign, event)

  // populating the withdrawal entity
  let withdrawal = new Withdrawal(event.transaction.hash.toHexString())
  withdrawal.liquidityMiningCampaign = campaign.id
  withdrawal.user = event.params.withdrawer
  withdrawal.timestamp = event.block.timestamp
  withdrawal.amount = withdrawnAmount
  withdrawal.save()
}

export function handleClaim(event: Claimed): void {
  let campaign = LiquidityMiningCampaign.load(event.address.toHexString())
  if (campaign == null) {
    log.error('non existent campaign {}', [event.address.toHexString()])
    return
  }

  // populating the claim entity
  let claim = new Claim(event.transaction.hash.toHexString())
  claim.amounts = []
  claim.liquidityMiningCampaign = campaign.id
  claim.user = event.params.claimer
  claim.timestamp = event.block.timestamp

  let distributionRewards = campaign.rewards
  let claimedAmounts = event.params.amounts
  for (let i = 0; i < distributionRewards.length; i++) {
    let reward = LiquidityMiningCampaignReward.load(distributionRewards[i]) as LiquidityMiningCampaignReward
    let token = Token.load(reward.token) as Token
    claim.amounts.push(convertTokenToDecimal(claimedAmounts[i], token.decimals))
  }
  claim.save()
}

export function handleRecovery(event: Recovered): void {
  let campaign = LiquidityMiningCampaign.load(event.address.toHexString())
  if (campaign == null) {
    log.error('non existent campaign {}', [event.address.toHexString()])
    return
  }

  // populating the recovery entity
  let recovery = new Recovery(event.transaction.hash.toHexString())
  recovery.amounts = []
  recovery.liquidityMiningCampaign = campaign.id
  recovery.timestamp = event.block.timestamp

  let distributionRewards = campaign.rewards
  let recoveredAmounts = event.params.amounts
  for (let i = 0; i < distributionRewards.length; i++) {
    let reward = LiquidityMiningCampaignReward.load(distributionRewards[i]) as LiquidityMiningCampaignReward
    let token = Token.load(reward.token) as Token
    recovery.amounts.push(convertTokenToDecimal(recoveredAmounts[i], token.decimals))
  }
  recovery.save()
}

export function handleOwnershipTransfer(event: OwnershipTransferred): void {
  let id = event.address.toHexString()
  let campaign = LiquidityMiningCampaign.load(id)
  if (campaign == null) {
    log.warning('ownership transfer event for {} failed', [id])
    return
  }
  campaign.owner = event.params.newOwner
  campaign.save()
}
