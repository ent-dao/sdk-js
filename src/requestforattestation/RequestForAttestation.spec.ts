import Identity from '../identity/Identity'
import RequestForAttestation from './RequestForAttestation'
import RequestForAttestationUtils from './RequestForAttestation.utils'
import AttestedClaim from '../attestedclaim/AttestedClaim'
import Attestation from '../attestation/Attestation'
import CType from '../ctype/CType'
import ICType from '../types/CType'
import IClaim from '../types/Claim'
import { CompressedRequestForAttestation } from '../types/RequestForAttestation'
import { CompressedAttestedClaim } from '../types/AttestedClaim'

function buildRequestForAttestation(
  claimer: Identity,
  contents: object,
  legitimations: AttestedClaim[]
): RequestForAttestation {
  // create claim

  const identityAlice = Identity.buildFromURI('//Alice')

  const rawCType: ICType['schema'] = {
    $id: 'http://example.com/ctype-1',
    $schema: 'http://kilt-protocol.org/draft-01/ctype#',
    properties: {
      name: { type: 'string' },
    },
    type: 'object',
  }

  const testCType: CType = CType.fromSchema(rawCType, identityAlice.address)

  const claim: IClaim = {
    cTypeHash: testCType.hash,
    contents,
    owner: claimer.address,
  }
  // build request for attestation with legimitations
  return RequestForAttestation.fromClaimAndIdentity(
    claim,
    claimer,
    legitimations,
    null
  )
}

describe('RequestForAttestation', () => {
  const identityAlice = Identity.buildFromURI('//Alice')
  const identityBob = Identity.buildFromURI('//Bob')
  const identityCharlie = Identity.buildFromURI('//Charlie')

  const legitimationRequest: RequestForAttestation = buildRequestForAttestation(
    identityAlice,
    {},
    []
  )
  // build attestation
  const legitimationAttestationCharlie: Attestation = Attestation.fromRequestAndPublicIdentity(
    legitimationRequest,
    identityCharlie
  )
  // combine to attested claim
  const legitimationCharlie: AttestedClaim = AttestedClaim.fromRequestAndAttestation(
    legitimationRequest,
    legitimationAttestationCharlie
  )

  it('verify request for attestation', async () => {
    const request: RequestForAttestation = buildRequestForAttestation(
      identityBob,
      {
        a: 'a',
        b: 'b',
        c: 'c',
      },
      [legitimationCharlie]
    )

    // check proof on complete data
    expect(RequestForAttestation.verifyData(request)).toBeTruthy()

    // just deleting a field will result in a wrong proof
    const propertyName = 'a'
    delete request.claim.contents[propertyName]
    delete request.claimHashTree[propertyName]
    expect(() => {
      return RequestForAttestation.verifyData(request)
    }).toThrow()
  })

  it('throws on wrong hash in claim hash tree', () => {
    const request: RequestForAttestation = buildRequestForAttestation(
      identityBob,
      {
        a: 'a',
        b: 'b',
        c: 'c',
      },
      []
    )

    request.claimHashTree.a.nonce = '1234'
    expect(() => {
      RequestForAttestation.verifyData(request)
    }).toThrow()
  })

  it('hides the claim owner', () => {
    const request = buildRequestForAttestation(identityBob, {}, [])
    request.removeClaimOwner()
    expect(request.claimOwner.nonce).toBeUndefined()
    expect(request.claim.owner).toBeUndefined()
  })

  it('compresses and decompresses the request for attestation object', () => {
    const legitimationAttestationBob: Attestation = Attestation.fromRequestAndPublicIdentity(
      legitimationRequest,
      identityBob
    )
    const legitimationBob: AttestedClaim = AttestedClaim.fromRequestAndAttestation(
      legitimationRequest,
      legitimationAttestationBob
    )
    const reqForAtt: RequestForAttestation = buildRequestForAttestation(
      identityBob,
      {
        a: 'a',
        b: 'b',
        c: 'c',
      },
      [legitimationCharlie, legitimationBob]
    )

    const compressedLegitimationCharlie: CompressedAttestedClaim = [
      [
        [
          legitimationCharlie.request.claim.contents,
          legitimationCharlie.request.claim.cTypeHash,
          legitimationCharlie.request.claim.owner,
        ],
        {},
        [
          legitimationCharlie.request.claimOwner.hash,
          legitimationCharlie.request.claimOwner.nonce,
        ],
        legitimationCharlie.request.claimerSignature,
        [
          legitimationCharlie.request.cTypeHash.hash,
          legitimationCharlie.request.cTypeHash.nonce,
        ],
        legitimationCharlie.request.rootHash,
        [],
        legitimationCharlie.request.delegationId,
      ],
      [
        legitimationCharlie.attestation.claimHash,
        legitimationCharlie.attestation.cTypeHash,
        legitimationCharlie.attestation.owner,
        legitimationCharlie.attestation.revoked,
        legitimationCharlie.attestation.delegationId,
      ],
    ]

    const compressedLegitimationBob: CompressedAttestedClaim = [
      [
        [
          legitimationBob.request.claim.contents,
          legitimationBob.request.claim.cTypeHash,
          legitimationBob.request.claim.owner,
        ],
        {},
        [
          legitimationBob.request.claimOwner.hash,
          legitimationBob.request.claimOwner.nonce,
        ],
        legitimationBob.request.claimerSignature,
        [
          legitimationBob.request.cTypeHash.hash,
          legitimationBob.request.cTypeHash.nonce,
        ],
        legitimationBob.request.rootHash,
        [],
        legitimationBob.request.delegationId,
      ],
      [
        legitimationBob.attestation.claimHash,
        legitimationBob.attestation.cTypeHash,
        legitimationBob.attestation.owner,
        legitimationBob.attestation.revoked,
        legitimationBob.attestation.delegationId,
      ],
    ]

    const compressedReqForAtt: CompressedRequestForAttestation = [
      [
        reqForAtt.claim.contents,
        reqForAtt.claim.cTypeHash,
        reqForAtt.claim.owner,
      ],
      {
        a: [reqForAtt.claimHashTree.a.hash, reqForAtt.claimHashTree.a.nonce],
        b: [reqForAtt.claimHashTree.b.hash, reqForAtt.claimHashTree.b.nonce],
        c: [reqForAtt.claimHashTree.c.hash, reqForAtt.claimHashTree.c.nonce],
      },
      [reqForAtt.claimOwner.hash, reqForAtt.claimOwner.nonce],
      reqForAtt.claimerSignature,
      [reqForAtt.cTypeHash.hash, reqForAtt.cTypeHash.nonce],
      reqForAtt.rootHash,
      [compressedLegitimationCharlie, compressedLegitimationBob],
      reqForAtt.delegationId,
    ]

    expect(RequestForAttestationUtils.compress(reqForAtt)).toEqual(
      compressedReqForAtt
    )

    expect(RequestForAttestationUtils.decompress(compressedReqForAtt)).toEqual(
      reqForAtt
    )

    expect(reqForAtt.compress()).toEqual(compressedReqForAtt)

    expect(RequestForAttestation.decompress(compressedReqForAtt)).toEqual(
      reqForAtt
    )
    compressedReqForAtt.pop()
    delete reqForAtt.claimOwner

    expect(() => {
      RequestForAttestationUtils.compress(reqForAtt)
    }).toThrow()

    expect(() => {
      RequestForAttestationUtils.decompress(compressedReqForAtt)
    }).toThrow()

    expect(() => {
      reqForAtt.compress()
    }).toThrow()

    expect(() => {
      RequestForAttestation.decompress(compressedReqForAtt)
    }).toThrow()
  })

  it('hides claim properties', () => {
    const request = buildRequestForAttestation(
      identityBob,
      { a: 'a', b: 'b' },
      []
    )
    request.removeClaimProperties(['a'])

    expect((request.claim.contents as any).a).toBeUndefined()
    expect((request.claimHashTree as any).a.nonce).toBeUndefined()
    expect((request.claim.contents as any).b).toBe('b')
    expect((request.claimHashTree as any).b.nonce).toBeDefined()
  })
  it('should throw error on faulty constructor input', () => {
    const builtRequest = buildRequestForAttestation(
      identityBob,
      {
        a: 'a',
        b: 'b',
        c: 'c',
      },
      []
    )
    const builtRequestWithLegitimation = buildRequestForAttestation(
      identityBob,
      {
        a: 'a',
        b: 'b',
        c: 'c',
      },
      [legitimationCharlie]
    )

    const builtRequestNoLegitimations = {
      ...buildRequestForAttestation(
        identityBob,
        {
          a: 'a',
          b: 'b',
          c: 'c',
        },
        []
      ),
    }
    delete builtRequestNoLegitimations.legitimations

    const builtRequestMalformedRootHash = {
      ...builtRequest,
    }
    delete builtRequestMalformedRootHash.rootHash
    builtRequestMalformedRootHash.rootHash = builtRequest.rootHash.replace(
      'c',
      'd'
    )
    const builtRequestMalformedClaimOwner = {
      ...buildRequestForAttestation(
        identityBob,
        {
          a: 'a',
          b: 'b',
          c: 'c',
        },
        []
      ),
    }
    builtRequestMalformedClaimOwner.claimOwner = {
      hash: builtRequest.claimOwner.hash.replace('D', '7'),
      nonce: builtRequest.claimOwner.nonce,
    }

    const builtRequestIncompleteClaimHashTree = {
      ...buildRequestForAttestation(
        identityBob,
        {
          a: 'a',
          b: 'b',
          c: 'c',
        },
        []
      ),
    }
    delete builtRequestIncompleteClaimHashTree.claimHashTree.a
    const builtRequestMalformedSiganture = {
      ...buildRequestForAttestation(
        identityBob,
        {
          a: 'a',
          b: 'b',
          c: 'c',
        },
        []
      ),
    }
    builtRequestMalformedSiganture.claimerSignature = builtRequestMalformedSiganture.claimerSignature.replace(
      'd',
      'c'
    )
    const builtRequestMalformedCtypeHash = {
      ...buildRequestForAttestation(
        identityBob,
        {
          a: 'a',
          b: 'b',
          c: 'c',
        },
        []
      ),
    }
    builtRequestMalformedCtypeHash.cTypeHash = {
      hash: builtRequest.cTypeHash.hash.replace('D', '7'),
      nonce: builtRequest.cTypeHash.nonce,
    }
    expect(() => {
      return RequestForAttestation.isIRequestForAttestation(
        builtRequestNoLegitimations
      )
    }).toThrow()
    expect(() => {
      return RequestForAttestation.isIRequestForAttestation(
        builtRequestMalformedRootHash
      )
    }).toThrow()
    expect(() => {
      return RequestForAttestation.isIRequestForAttestation(
        builtRequestMalformedClaimOwner
      )
    }).toThrow()
    expect(() => {
      return RequestForAttestation.isIRequestForAttestation(
        builtRequestIncompleteClaimHashTree
      )
    }).toThrow()
    expect(() => {
      return RequestForAttestation.isIRequestForAttestation(
        builtRequestMalformedSiganture
      )
    }).toThrow()
    expect(() => {
      return RequestForAttestation.isIRequestForAttestation(
        builtRequestMalformedCtypeHash
      )
    }).toThrow()
    expect(() => {
      return RequestForAttestation.isIRequestForAttestation(builtRequest)
    }).not.toThrow()
    expect(() => {
      return RequestForAttestation.isIRequestForAttestation(
        builtRequestWithLegitimation
      )
    }).not.toThrow()
  })
  it('checks Object instanciation', () => {
    const builtRequest = buildRequestForAttestation(
      identityBob,
      {
        a: 'a',
        b: 'b',
        c: 'c',
      },
      []
    )
    expect(builtRequest instanceof RequestForAttestation).toEqual(true)
  })
})
