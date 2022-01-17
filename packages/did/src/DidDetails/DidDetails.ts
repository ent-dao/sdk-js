/**
 * Copyright 2018-2021 BOTLabs GmbH.
 *
 * This source code is licensed under the BSD 4-Clause "Original" license
 * found in the LICENSE file in the root directory of this source tree.
 */

import type {
  DidKey,
  DidPublicKey,
  DidServiceEndpoint,
  DidSignature,
  IDidDetails,
  IDidIdentifier,
  KeystoreSigner,
} from '@kiltprotocol/types'
import { KeyRelationship } from '@kiltprotocol/types'
import { Crypto } from '@kiltprotocol/utils'
import { u8aToHex } from '@polkadot/util'

import type { DidCreationDetails, MapKeysToRelationship } from '../types.js'
import {
  checkDidCreationDetails,
  getSignatureAlgForKeyType,
} from './DidDetails.utils.js'

type PublicKeysInner = Map<DidKey['id'], Omit<DidKey, 'id'>>
type ServiceEndpointsInner = Map<
  DidServiceEndpoint['id'],
  Omit<DidServiceEndpoint, 'id'>
>

export abstract class DidDetails implements IDidDetails {
  public readonly did: IDidDetails['did']

  // { key ID -> key details} - key ID does not include the DID subject
  protected publicKeys: PublicKeysInner

  // { key relationship -> set of key IDs}
  protected keyRelationships: MapKeysToRelationship

  // { service ID -> service details} - service ID does not include the DID subject
  protected serviceEndpoints: ServiceEndpointsInner

  protected constructor({
    did,
    keys,
    keyRelationships,
    serviceEndpoints = {},
  }: DidCreationDetails) {
    checkDidCreationDetails({
      did,
      keys,
      keyRelationships,
      serviceEndpoints,
    })

    this.did = did
    this.publicKeys = new Map(Object.entries(keys))
    this.keyRelationships = keyRelationships
    this.serviceEndpoints = new Map(Object.entries(serviceEndpoints))
  }

  public abstract get identifier(): IDidIdentifier

  public get authenticationKey(): DidKey {
    const firstAuthenticationKey = this.getKeys(
      KeyRelationship.authentication
    )[0]
    if (!firstAuthenticationKey) {
      throw new Error(
        'Unexpected error. Any DID should always have at least one authentication key.'
      )
    }
    return firstAuthenticationKey
  }

  public get encryptionKey(): DidKey | undefined {
    return this.getKeys(KeyRelationship.keyAgreement)[0]
  }

  public get attestationKey(): DidKey | undefined {
    return this.getKeys(KeyRelationship.assertionMethod)[0]
  }

  public get delegationKey(): DidKey | undefined {
    return this.getKeys(KeyRelationship.capabilityDelegation)[0]
  }

  public getKey(id: DidKey['id']): DidKey | undefined {
    const keyDetails = this.publicKeys.get(id)
    if (!keyDetails) {
      return undefined
    }
    return {
      id,
      ...keyDetails,
    }
  }

  public getKeys(relationship?: KeyRelationship | 'none'): DidKey[] {
    const keyIds = relationship
      ? this.keyRelationships[relationship] || new Set()
      : new Set(this.publicKeys.keys())
    return [...keyIds].map((keyId) => this.getKey(keyId) as DidKey)
  }

  public getEndpoint(
    id: DidServiceEndpoint['id']
  ): DidServiceEndpoint | undefined {
    const endpointDetails = this.serviceEndpoints.get(id)
    if (!endpointDetails) {
      return undefined
    }
    return {
      id,
      ...endpointDetails,
    }
  }

  public getEndpoints(type?: string): DidServiceEndpoint[] {
    const serviceEndpointsEntries = type
      ? [...this.serviceEndpoints.entries()].filter(([, details]) => {
          return details.types.includes(type)
        })
      : [...this.serviceEndpoints.entries()]

    return serviceEndpointsEntries.map(([id, details]) => {
      return { id, ...details }
    })
  }

  public assembleKeyId(keyId: DidKey['id']): DidPublicKey['id'] {
    return `${this.did}#${keyId}`
  }

  // Generates a DID signature over a given input using the key with the given ID.
  public async signPayload(
    payload: Uint8Array | string,
    {
      signer,
      keyId,
    }: {
      signer: KeystoreSigner
      keyId: DidPublicKey['id']
    }
  ): Promise<DidSignature> {
    const key = this.getKey(keyId)
    if (!key) {
      throw Error(`failed to find key with ID ${keyId} on DID (${this.did})`)
    }
    const alg = getSignatureAlgForKeyType(key.type)
    if (!alg) {
      throw new Error(`No algorithm found for key type ${key.type}`)
    }
    const { data: signature } = await signer.sign({
      publicKey: key.publicKey,
      alg,
      data: Crypto.coToUInt8(payload),
    })
    return { keyId: this.assembleKeyId(key.id), signature: u8aToHex(signature) }
  }
}
