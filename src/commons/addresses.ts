/* eslint-disable prefer-const */
import { dataSource } from '@graphprotocol/graph-ts'

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'

const MAINNET_FACTORY_ADDRESS = '0xd34971BaB6E5E356fd250715F5dE0492BB070452'
const RINKEBY_FACTORY_ADDRESS = '0x02f45e773436C6D96Cc73600fe94a660ec67734C'

export function getFactoryAddress(): string {
  return dataSource.network() == 'rinkeby' ? RINKEBY_FACTORY_ADDRESS : MAINNET_FACTORY_ADDRESS
}

const MAINNET_STAKING_REWARDS_FACTORY_ADDRESS = ADDRESS_ZERO
const RINKEBY_STAKING_REWARDS_FACTORY_ADDRESS = '0x2b2cbfC3F2D26789F224a65a5A0Fc2854EB8f0A1'

export function getStakingRewardsFactoryAddress(): string {
  return dataSource.network() == 'rinkeby'
    ? RINKEBY_STAKING_REWARDS_FACTORY_ADDRESS
    : MAINNET_STAKING_REWARDS_FACTORY_ADDRESS
}

const MAINNET_WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
const RINKEBY_WETH_ADDRESS = '0xc778417E063141139Fce010982780140Aa0cD5Ab'

export function getWethAddress(): string {
  return dataSource.network() == 'rinkeby' ? RINKEBY_WETH_ADDRESS : MAINNET_WETH_ADDRESS
}

// token where amounts should contribute to tracked volume and liquidity
let MAINNET_WHITELIST: string[] = [
  '0xa1d65e8fb6e87b60feccbc582f7f97804b725521', // DXD
  '0x5fbdb2315678afecb367f032d93f642f64180aa3', // WETH
  '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
  '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
  '0x0000000000085d4780b73119b644ae5ecd22b376', // TUSD
  '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643', // cDAI
  '0x39aa39c021dfbae8fac545936693ac917d5e7563', // cUSDC
  '0x0ae055097c6d159879521c384f1d2123d1f195e6', // STAKE
  '0xa117000000f279d81a1d3cc75430faa017fa5a2e', // ANT
  '0xd56dac73a4d6766464b38ec6d91eb45ce7457c44', // PAN
  '0x86fadb80d8d2cff3c3680819e4da99c10232ba0f', // EBASE
  '0x57ab1ec28d129707052df4df418d58a2d46d5f51', // sUSD
  '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2', // MKR
  '0xc00e94cb662c3520282e6f5717214004a7f26888', // COMP
  '0x514910771af9ca656af840dff83e8264ecf986ca', // LINK
  '0x960b236a07cf122663c4303350609a66a7b288c0', // ANTyar
  '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f', // SNX
  '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e', // YFI
  '0xdf5e0e81dff6faf3a7e52ba697820c5e32d806a8', // yCurv
  '0xd533a949740bb3306d119cc777fa900ba034cd52' // CRV
]
let RINKEBY_WHITELIST: string[] = [
  '0x554898A0BF98aB0C03ff86C7DccBE29269cc4d29', // DXD
  '0xc778417E063141139Fce010982780140Aa0cD5Ab' // WETH
]

export function getWhitelist(): string[] {
  return (dataSource.network() == 'rinkeby' ? RINKEBY_WHITELIST : MAINNET_WHITELIST) as string[]
}

const MAINNET_USDC_WETH_PAIR = '0x98f29f527c8e0ecc67a3c2d5567833bee01f2a12'
const RINKEBY_USDC_WETH_PAIR = ADDRESS_ZERO

export function getUsdcWethPair(): string {
  return dataSource.network() == 'rinkeby' ? RINKEBY_USDC_WETH_PAIR : MAINNET_USDC_WETH_PAIR
}

const MAINNET_DAI_WETH_PAIR = '0x7515be43d16f871588adc135d58a9c30a71eb34f'
const RINKEBY_DAI_WETH_PAIR = ADDRESS_ZERO

export function getDaiWethPair(): string {
  return dataSource.network() == 'rinkeby' ? RINKEBY_DAI_WETH_PAIR : MAINNET_DAI_WETH_PAIR
}

const MAINNET_USDT_WETH_PAIR = '0x83dd8227c5ef121f2ae99c6f1df0aa9e914448ce'
const RINKEBY_USDT_WETH_PAIR = ADDRESS_ZERO

export function getUsdtWethPair(): string {
  return dataSource.network() == 'rinkeby' ? RINKEBY_USDT_WETH_PAIR : MAINNET_USDT_WETH_PAIR
}
