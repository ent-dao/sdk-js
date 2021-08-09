/**
 * Copyright 2018-2021 BOTLabs GmbH.
 *
 * This source code is licensed under the BSD 4-Clause "Original" license
 * found in the LICENSE file in the root directory of this source tree.
 */

import type {
  DidSignature,
  IDidDetails,
  IDidResolver,
  KeyDetails,
  KeystoreSigner,
  VerificationKeyRelationship,
} from '@kiltprotocol/types'
import { SDKErrors, Crypto } from '@kiltprotocol/utils'
import { isHex } from '@polkadot/util'
import type { Codec, Registry } from '@polkadot/types/types'
import { checkAddress } from '@polkadot/util-crypto'
import { DefaultResolver } from './DidResolver/DefaultResolver'
import type {
  DidSigned,
  PublicKeyEnum,
  UrlEnum,
  IDidUpdateOptions,
  IDidCreationOptions,
  IAuthorizeCallOptions,
  UrlEncodingJson,
  DidAuthorizedCallOperation,
  DidCreationOperation,
  DidPublicKey,
  DidUpdateOperation,
  INewPublicKey,
} from './types'

export const KILT_DID_PREFIX = 'did:kilt:'
export const KILT_DID_REGEX = /^did:kilt:(?<identifier>[1-9a-km-zA-HJ-NP-Z]{48})(?<fragment>#.+)?$/
export const CHAIN_SUPPORTED_SIGNATURE_KEY_TYPES = [
  'ed25519',
  'sr25519',
  'ecdsa',
]
export const CHAIN_SUPPORTED_ENCRYPTION_KEY_TYPES = ['x25519']
export const CHAIN_SUPPORTED_KEY_TYPES = [
  ...CHAIN_SUPPORTED_SIGNATURE_KEY_TYPES,
  ...CHAIN_SUPPORTED_ENCRYPTION_KEY_TYPES,
]

export function getKiltDidFromIdentifier(identifier: string): string {
  if (identifier.startsWith(KILT_DID_PREFIX)) {
    return identifier
  }
  return KILT_DID_PREFIX + identifier
}

export function getIdentifierFromKiltDid(did: string): string {
  if (!did.startsWith(KILT_DID_PREFIX)) {
    throw SDKErrors.ERROR_INVALID_DID_PREFIX(did)
  }
  return did.substr(KILT_DID_PREFIX.length)
}

export function getIdentifierFromDid(did: string): string {
  const secondColonAt = did.indexOf(':', did.indexOf(':') + 1)
  const identifier = did.substring(secondColonAt + 1)
  if (!identifier) {
    throw SDKErrors.ERROR_INVALID_DID_PREFIX(did)
  }
  return identifier
}

export function parseDidUrl(didUrl: string) {
  const { identifier, fragment } = didUrl.match(KILT_DID_REGEX)?.groups || {}
  if (!identifier) throw SDKErrors.ERROR_INVALID_DID_PREFIX(didUrl)
  return {
    did: getKiltDidFromIdentifier(identifier),
    identifier,
    fragment: fragment?.substr(1),
  }
}

export function validateKiltDid(
  input: unknown,
  allowFragment = false
): input is IDidDetails['did'] {
  if (typeof input !== 'string') {
    throw TypeError(`DID string expected, got ${typeof input}`)
  }
  const { identifier, did } = parseDidUrl(input)
  if (!allowFragment && did !== input) {
    throw new Error(
      `Expected DID of format kilt:did:<ss58 identifier>, got ${input}`
    )
  }
  if (!checkAddress(identifier, 38)[0]) {
    throw SDKErrors.ERROR_ADDRESS_INVALID(identifier, 'DID identifier')
  }
  return true
}

export function validateDidSignature(input: unknown): input is DidSignature {
  try {
    if (
      !isHex((input as DidSignature).signature) ||
      !validateKiltDid((input as DidSignature).keyId, true)
    ) {
      throw SDKErrors.ERROR_SIGNATURE_DATA_TYPE()
    }
    return true
  } catch (e) {
    throw SDKErrors.ERROR_SIGNATURE_DATA_TYPE()
  }
}

export function signCodec<PayloadType extends Codec>(
  payload: PayloadType,
  signer: { type: string; sign: (message: Uint8Array) => Uint8Array }
): DidSigned<PayloadType> {
  const signature = {
    [signer.type]: signer.sign(payload.toU8a()),
  }
  return { payload, signature }
}

export function formatPublicKey(keypair: INewPublicKey): PublicKeyEnum {
  const { type, publicKey } = keypair
  return { [type]: publicKey }
}

export function isIKeyPair(keypair: unknown): keypair is INewPublicKey {
  if (typeof keypair === 'object') {
    const { publicKey, type } = keypair as any
    return publicKey instanceof Uint8Array && typeof type === 'string'
  }
  return false
}

export function encodeEndpointUrl(url: string): UrlEnum {
  const typedUrl: Record<string, UrlEncodingJson> = {}
  const matched = Array.from(['http', 'ftp', 'ipfs']).some((type) => {
    if (url.startsWith(type)) {
      typedUrl[type] = { payload: url }
      return true
    }
    return false
  })
  if (!matched)
    throw new Error(
      'only endpoint urls starting with http/https, ftp, and ipfs are accepted'
    )
  return typedUrl as UrlEnum
}

export function encodeDidCreationOperation(
  registry: Registry,
  { didIdentifier, keys, endpointUrl }: IDidCreationOptions
): DidCreationOperation {
  // build did create object
  const didCreateRaw = {
    did: didIdentifier,
    newAuthenticationKey: formatPublicKey(keys.authentication),
    newKeyAgreementKeys: keys.encryption
      ? [formatPublicKey(keys.encryption)]
      : [],
    newAttestationKey: keys.attestation
      ? formatPublicKey(keys.attestation)
      : undefined,
    newDelegationKey: keys.delegation
      ? formatPublicKey(keys.delegation)
      : undefined,
    newEndpointUrl: endpointUrl ? encodeEndpointUrl(endpointUrl) : undefined,
  }
  return new (registry.getOrThrow<DidCreationOperation>(
    'DidCreationOperation'
  ))(registry, didCreateRaw)
}

function matchKeyOperation(
  keypair: INewPublicKey | undefined | null
): { Delete: null } | { Ignore: null } | { Change: PublicKeyEnum } {
  if (keypair && typeof keypair === 'object') {
    return { Change: formatPublicKey(keypair) }
  }
  if (keypair === null) {
    return { Delete: null }
  }
  return { Ignore: null }
}

export function encodeDidUpdateOperation(
  registry: Registry,
  {
    keysToUpdate = {},
    publicKeysToRemove = [],
    newEndpointUrl,
  }: IDidUpdateOptions
): DidUpdateOperation {
  const { authentication, encryption, attestation, delegation } = keysToUpdate
  const didUpdateRaw = {
    newAuthenticationKey: authentication
      ? formatPublicKey(authentication)
      : null,
    newKeyAgreementKeys: encryption ? [formatPublicKey(encryption)] : [],
    attestationKeyUpdate: matchKeyOperation(attestation),
    delegationKeyUpdate: matchKeyOperation(delegation),
    publicKeysToRemove,
    newEndpointUrl: newEndpointUrl
      ? encodeEndpointUrl(newEndpointUrl)
      : undefined,
  }
  return new (registry.getOrThrow<DidUpdateOperation>('DidUpdateOperation'))(
    registry,
    didUpdateRaw
  )
}

export function encodeDidAuthorizedCallOperation(
  registry: Registry,
  { didIdentifier, txCounter, call }: IAuthorizeCallOptions
): DidAuthorizedCallOperation {
  return new (registry.getOrThrow<DidAuthorizedCallOperation>(
    'DidAuthorizedCallOperation'
  ))(registry, {
    did: didIdentifier,
    txCounter,
    call,
  })
}

export function encodeDidPublicKey(
  registry: Registry,
  key: INewPublicKey
): DidPublicKey {
  let keyClass: string
  if (CHAIN_SUPPORTED_SIGNATURE_KEY_TYPES.includes(key.type)) {
    keyClass = 'PublicVerificationKey'
  } else if (CHAIN_SUPPORTED_ENCRYPTION_KEY_TYPES.includes(key.type)) {
    keyClass = 'PublicEncryptionKey'
  } else {
    throw TypeError(
      `Unsupported key type; types currently recognized are ${CHAIN_SUPPORTED_KEY_TYPES}`
    )
  }
  return new (registry.getOrThrow<DidPublicKey>('DidPublicKey'))(registry, {
    [keyClass]: formatPublicKey(key),
  })
}

export function computeKeyId(publicKey: DidPublicKey): string {
  return Crypto.hashStr(publicKey.toU8a())
}

export type VerficationResult = {
  verified: boolean
  didDetails?: IDidDetails
  key?: KeyDetails
}

export async function verifyDidSignature({
  message,
  signature,
  keyId,
  keyRelationship,
  didDetails,
}: {
  message: string | Uint8Array
  signature: string | Uint8Array
  keyId: string
  didDetails: IDidDetails
  keyRelationship?: VerificationKeyRelationship
}): Promise<VerficationResult> {
  const key = keyRelationship
    ? didDetails?.getKeys(keyRelationship).find((k) => k.id === keyId)
    : didDetails?.getKey(keyId)
  if (!key || key.controller !== didDetails.did)
    return {
      verified: false,
      didDetails,
      key,
    }
  return {
    verified: Crypto.verify(message, signature, key.publicKeyHex),
    didDetails,
    key,
  }
}

export async function verifyDidSignatureAsync({
  message,
  signature,
  keyId,
  keyRelationship,
  resolver = DefaultResolver,
  didDetails,
}: {
  message: string | Uint8Array
  signature: string | Uint8Array
  keyId: string
  resolver?: IDidResolver
  didDetails?: IDidDetails
  keyRelationship?: VerificationKeyRelationship
}): Promise<VerficationResult> {
  let didOrNot: IDidDetails | undefined | null
  if (!didDetails) {
    if (!(typeof resolver?.resolve === 'function'))
      throw new Error(
        'Either the claimer DidDetails or a DID resolver is required for verification'
      )
    const { did } = parseDidUrl(keyId)
    didOrNot = await resolver.resolve({ did })
  } else {
    didOrNot = didDetails
  }
  if (didOrNot) {
    return verifyDidSignature({
      message,
      signature,
      keyId,
      keyRelationship,
      didDetails: didOrNot,
    })
  }
  return {
    verified: false,
  }
}

export async function authenticateWithDid(
  toSign: Uint8Array | string,
  did: IDidDetails,
  signer: KeystoreSigner
): Promise<DidSignature> {
  const [key] = did.getKeys('authentication')
  const keyId = key.id
  const { data: signature } = await signer.sign({
    keyId,
    alg: key.type,
    data: Crypto.coToUInt8(toSign),
  })
  return { keyId, signature: Crypto.u8aToHex(signature) }
}
