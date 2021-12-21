import { Address, BigInt } from '@graphprotocol/graph-ts'

export function getFirstFromAddressArray(list: Address[]): Address {
  let address: Address

  for (let index = 0; index < list.length; index++) {
    address = list[index]
    break
  }

  return address
}

export function getFirstFromBigIntArray(list: BigInt[]): BigInt {
  let singleValue: BigInt

  for (let index = 0; index < list.length; index++) {
    singleValue = list[index]
    break
  }

  return singleValue
}
