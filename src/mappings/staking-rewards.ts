/* eslint-disable prefer-const */
import { log, DataSourceContext, dataSource, Bytes, Address, store, Value } from '@graphprotocol/graph-ts'
import {
  Pair,
  Token,
  LiquidityMiningCampaign,
  LiquidityMiningCampaignDeposit,
  LiquidityMiningCampaignWithdrawal,
  LiquidityMiningCampaignClaim,
  LiquidityMiningCampaignRecovery,
  LiquidityMiningCampaignReward,
  SingleSidedStakingCampaign,
  SingleSidedStakingCampaignReward,
  SingleSidedStakingCampaignDeposit,
  SingleSidedStakingCampaignWithdrawal,
  SingleSidedStakingCampaignClaim,
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
  Withdrawn,
} from '../types/templates/Distribution/StakingRewardsDistribution'
import {
  convertTokenToDecimal,
  ZERO_BD,
  BI_18,
  getOrCreateLiquidityMiningPosition,
  createLiquidityMiningSnapshot,
  getSwaprStakingRewardsFactory,
  getOrCreateSingleSidedStakingCampaignPosition,
} from './helpers'
import { isSwaprLPToken } from '../commons/addresses'
import { createOrGetToken } from '../commons/token'

export function handleDistributionCreation(event: DistributionCreated): void {
  let context = new DataSourceContext()
  context.setString('owner', event.params.owner.toHexString())
  context.setString('address', event.params.deployedAt.toHexString())
  DistributionTemplate.createWithContext(event.params.deployedAt, context)
}

export function handleDistributionInitialization(event: Initialized): void {
  let factory = getSwaprStakingRewardsFactory()
  if (factory === null) {
    // bail if factory is null
    log.error('factory must be initialized when canceling a distribution', [])
    return
  }
  factory.initializedCampaignsCount = factory.initializedCampaignsCount + 1
  factory.save()

  // the contract
  let context = dataSource.context()
  let hexDistributionAddress = context.getString('address')

  // Assume that every ERC20 which is NOT a Swapr LP pair token is considered a single sided staking campaign
  if (!isSwaprLPToken(event.params.stakableTokenAddress)) {
    let sssCampaign = new SingleSidedStakingCampaign(event.address.toHexString())
    sssCampaign.initialized = true
    sssCampaign.owner = Bytes.fromHexString(context.getString('owner')) as Bytes
    sssCampaign.startsAt = event.params.startingTimestamp
    sssCampaign.endsAt = event.params.endingTimestamp
    sssCampaign.duration = sssCampaign.endsAt.minus(sssCampaign.startsAt)
    sssCampaign.locked = event.params.locked
    // Linked: Stake token entity
    let stakeToken = createOrGetToken(event.params.stakableTokenAddress)
    sssCampaign.stakeToken = stakeToken.id.toString()
    // Linked: Create Single Sided Staking Campaign Reward entity
    let rewardTokenAddresses = event.params.rewardsTokenAddresses
    let eventRewardAmounts = event.params.rewardsAmounts
    let rewardsIdList: string[] = []
    for (let index = 0; index < rewardTokenAddresses.length; index++) {
      let address: Address = rewardTokenAddresses[index]
      let hexTokenAddress = address.toHexString()
      let rewardToken = createOrGetToken(address)
      let rewardId = hexDistributionAddress.concat('-').concat(hexTokenAddress)
      let reward = SingleSidedStakingCampaignReward.load(rewardId)
      if (reward == null) reward = new SingleSidedStakingCampaignReward(rewardId)
      reward.token = hexTokenAddress
      reward.amount = convertTokenToDecimal(eventRewardAmounts[index], rewardToken.decimals)
      reward.save()
      rewardsIdList.push(reward.id)
    }
    // Link entries to main entity
    sssCampaign.rewards = rewardsIdList
    sssCampaign.stakedAmount = ZERO_BD
    sssCampaign.stakingCap = convertTokenToDecimal(event.params.stakingCap, BI_18) // lp tokens have hardcoded 18 decimals
    // Save and exit
    sssCampaign.save()
    return
  }

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
    let rewardToken = createOrGetToken(address)
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
  let campaignId = event.address.toHexString()
  let factory = getSwaprStakingRewardsFactory()
  if (factory === null) {
    // bail if factory is null
    log.error('factory must be initialized when canceling a distribution', [])
    return
  }
  factory.initializedCampaignsCount = factory.initializedCampaignsCount - 1
  factory.save()
  // Try to fetch LMCampaign, default back to SSSCampagin
  let lmCampaign = LiquidityMiningCampaign.load(campaignId)
  if (lmCampaign) {
    store.remove('LiquidityMiningCampaign', campaignId)
    return
  }
  let sssCampaign = SingleSidedStakingCampaign.load(campaignId)
  if (sssCampaign) {
    store.remove('SingleSidedStakingCampaign', campaignId)
    return
  }

  log.error('could not find distribution at {}', [campaignId])
}

export function handleDeposit(event: Staked): void {
  // Fetch both entities
  let campaignId = event.address.toHexString()
  let lmCampaign = LiquidityMiningCampaign.load(campaignId)
  let sssCampaign = SingleSidedStakingCampaign.load(campaignId)

  // Handle Type of LiquidityMiningCampaign
  if (lmCampaign) {
    let stakedAmount = convertTokenToDecimal(event.params.amount, BI_18) // lp tokens have hardcoded 18 decimals
    lmCampaign.stakedAmount = lmCampaign.stakedAmount.plus(stakedAmount)
    lmCampaign.save()
    let position = getOrCreateLiquidityMiningPosition(
      lmCampaign as LiquidityMiningCampaign,
      Pair.load(lmCampaign.stakablePair) as Pair,
      event.params.staker
    )
    position.stakedAmount = position.stakedAmount.plus(stakedAmount)
    position.save()

    createLiquidityMiningSnapshot(position, lmCampaign as LiquidityMiningCampaign, event)

    // populating the stake deposit entity
    let deposit = new LiquidityMiningCampaignDeposit(event.transaction.hash.toHexString())
    deposit.liquidityMiningCampaign = lmCampaign.id
    deposit.user = event.params.staker
    deposit.timestamp = event.block.timestamp
    deposit.amount = stakedAmount
    deposit.save()
    return
  }

  // Handle type of SingleSidedStakingCampaign
  if (sssCampaign) {
    let stakedAmount = convertTokenToDecimal(event.params.amount, BI_18) // lp tokens have hardcoded 18 decimals
    sssCampaign.stakedAmount = sssCampaign.stakedAmount.plus(stakedAmount)
    sssCampaign.save()
    // Link position
    let position = getOrCreateSingleSidedStakingCampaignPosition(
      sssCampaign as SingleSidedStakingCampaign,
      event.params.staker
    )
    position.stakedAmount = position.stakedAmount.plus(stakedAmount)
    position.save()
    // populating the stake deposit entity
    let deposit = new SingleSidedStakingCampaignDeposit(event.transaction.hash.toHexString())
    deposit.singleSidedStakingCampaign = sssCampaign.id
    deposit.user = event.params.staker
    deposit.timestamp = event.block.timestamp
    deposit.amount = stakedAmount
    deposit.save()
    return
  }

  log.error('non existent campaign {}', [campaignId])
}

export function handleWithdrawal(event: Withdrawn): void {
  let campaignId = event.address.toHexString()
  let lmCampaign = LiquidityMiningCampaign.load(campaignId)
  let sssCampaign = SingleSidedStakingCampaign.load(campaignId)
  // Early exit
  if (lmCampaign == null && sssCampaign == null) {
    log.error('non existent campaign {}', [campaignId])
    return
  }
  // Handle LMCampaign
  if (lmCampaign) {
    let withdrawnAmount = convertTokenToDecimal(event.params.amount, BI_18)
    lmCampaign.stakedAmount = lmCampaign.stakedAmount.minus(withdrawnAmount)
    let position = getOrCreateLiquidityMiningPosition(
      lmCampaign as LiquidityMiningCampaign,
      Pair.load(lmCampaign.stakablePair) as Pair,
      event.params.withdrawer
    )
    position.stakedAmount = position.stakedAmount.minus(withdrawnAmount)
    createLiquidityMiningSnapshot(position, lmCampaign as LiquidityMiningCampaign, event)
    // populating the withdrawal entity
    let withdrawal = new LiquidityMiningCampaignWithdrawal(event.transaction.hash.toHexString())
    withdrawal.liquidityMiningCampaign = campaignId
    withdrawal.user = event.params.withdrawer
    withdrawal.timestamp = event.block.timestamp
    withdrawal.amount = withdrawnAmount
    // save transaction
    withdrawal.save()
    position.save()
    lmCampaign.save()
    return
  }
  // Handle SSSCampaign
  if (sssCampaign) {
    let withdrawnAmount = convertTokenToDecimal(event.params.amount, BI_18)
    sssCampaign.stakedAmount = sssCampaign.stakedAmount.minus(withdrawnAmount)
    let position = getOrCreateSingleSidedStakingCampaignPosition(
      sssCampaign as SingleSidedStakingCampaign,
      event.params.withdrawer
    )
    position.stakedAmount = position.stakedAmount.minus(withdrawnAmount)
    // populating the withdrawal entity
    let withdrawal = new SingleSidedStakingCampaignWithdrawal(event.transaction.hash.toHexString())
    withdrawal.singleSidedStakingCampaign = campaignId
    withdrawal.user = event.params.withdrawer
    withdrawal.timestamp = event.block.timestamp
    withdrawal.amount = withdrawnAmount
    // save transaction
    withdrawal.save()
    position.save()
    sssCampaign.save()
    return
  }
}

export function handleClaim(event: Claimed): void {
  let campaignId = event.address.toHexString()
  let lmCampaign = LiquidityMiningCampaign.load(campaignId)
  let sssCampaign = SingleSidedStakingCampaign.load(campaignId)
  if (lmCampaign) {
    let claim = new LiquidityMiningCampaignClaim(event.transaction.hash.toHexString())
    claim.amounts = []
    // refer to Liquidty Mining Campaign
    claim.liquidityMiningCampaign = lmCampaign.id
    claim.user = event.params.claimer
    claim.timestamp = event.block.timestamp
    let distributionRewards = lmCampaign.rewards
    let claimedAmounts = event.params.amounts
    for (let i = 0; i < distributionRewards.length; i++) {
      let reward = LiquidityMiningCampaignReward.load(distributionRewards[i]) as LiquidityMiningCampaignReward
      let token = Token.load(reward.token) as Token
      claim.amounts.push(convertTokenToDecimal(claimedAmounts[i], token.decimals))
    }
    claim.save()
    return
  }
  if (sssCampaign) {
    let claim = new SingleSidedStakingCampaignClaim(event.transaction.hash.toHexString())
    claim.amounts = []
    // refer to Liquidty Mining Campaign
    claim.singleSidedStakingCampaign = sssCampaign.id
    claim.user = event.params.claimer
    claim.timestamp = event.block.timestamp
    let distributionRewards = sssCampaign.rewards
    let claimedAmounts = event.params.amounts
    for (let i = 0; i < distributionRewards.length; i++) {
      let reward = SingleSidedStakingCampaignReward.load(distributionRewards[i])
      if (reward) {
        let token = Token.load(reward.token) as Token
        claim.amounts.push(convertTokenToDecimal(claimedAmounts[i], token.decimals))
      }
    }
    claim.save()
    return
  }
  log.error('non existent campaign {}', [campaignId])
}

export function handleRecovery(event: Recovered): void {
  let campaignId = event.address.toHexString()
  let lmCampaign = LiquidityMiningCampaign.load(campaignId)
  let sssCampaign = SingleSidedStakingCampaign.load(campaignId)

  if (lmCampaign == null || sssCampaign == null) {
    log.error('non existent campaign {}', [campaignId])
    return
  }
  // Determine the entity type
  let campaignEntityName = 'LiquidityMiningCampaign'
  if (sssCampaign) {
    campaignEntityName = 'SingleSidedStakingCampaign'
  }

  // populating the recovery entity
  let recovery = new LiquidityMiningCampaignRecovery(event.transaction.hash.toHexString())
  recovery.amounts = []
  recovery.liquidityMiningCampaign = lmCampaign.id
  recovery.timestamp = event.block.timestamp

  let distributionRewards = lmCampaign.rewards
  let recoveredAmounts = event.params.amounts
  for (let i = 0; i < distributionRewards.length; i++) {
    // Load the entity record from store and then get the token address to get decimal
    let reward = store.get(campaignEntityName, distributionRewards[i])
    if (reward) {
      let tokenId = reward.get('token')
      if (tokenId) {
        let token = Token.load(tokenId.toString()) as Token
        recovery.amounts.push(convertTokenToDecimal(recoveredAmounts[i], token.decimals))
      }
    }
  }
  recovery.save()
}

export function handleOwnershipTransfer(event: OwnershipTransferred): void {
  let campaignId = event.address.toHexString()
  // Attempt to fetch the campaign
  let lmCampaign = LiquidityMiningCampaign.load(campaignId)
  if (lmCampaign) {
    lmCampaign.owner = event.params.newOwner
    lmCampaign.save()
    return
  }
  // Attempt to SingleSidedStakingCampaign
  let sssCampaign = SingleSidedStakingCampaign.load(campaignId)
  if (sssCampaign) {
    sssCampaign.owner = event.params.newOwner
    sssCampaign.save()
    return
  }
  // Ethier campaigns don't exist
  log.warning('ownership transfer event for {} failed', [campaignId])
}
