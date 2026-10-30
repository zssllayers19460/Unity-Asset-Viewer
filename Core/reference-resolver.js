// Resolves internal fileID and external guid references.
class ReferenceResolver {
  constructor(documents) {
    this.documentsById = new Map();
    for (let doc of documents) {
      this.documentsById.set(doc.fileId, doc);
    }
  }

  resolve(referenceValue) {
    if (!referenceValue || typeof referenceValue !== 'object') {
      return null;
    }
    let fileId = referenceValue.fileID;
    if (fileId === undefined || fileId === '0' || fileId === 0) {
      return { kind: 'none' };
    }
    if (referenceValue.guid) {
      return {
        kind: 'external',
        guid: referenceValue.guid,
        fileId: fileId,
        assetTypeHint: ReferenceResolver.guessAssetType(fileId)
      };
    }
    let targetDoc = this.documentsById.get(String(fileId));
    if (!targetDoc) {
      return { kind: 'unresolved', fileId: fileId };
    }
    return {
      kind: 'internal',
      fileId: fileId,
      document: targetDoc,
      displayName: ReferenceResolver.nameForDocument(targetDoc)
    };
  }

  static nameForDocument(doc) {
    if (doc.fields && doc.fields.m_Name) {
      return doc.fields.m_Name;
    }
    return doc.typeName || ('Object ' + doc.fileId);
  }

  static guessAssetType(fileId) {
    let fileIdString = String(fileId);
    let knownPrefixes = {
      '2100000': 'Material',
      '4300000': 'Mesh',
      '4800000': 'Shader',
      '7400000': 'AnimatorController',
      '11400000': 'AnimationClip',
      '13700000': 'AudioClip',
      '21300000': 'Texture2D',
      '115000000': 'MonoScript'
    };
    return knownPrefixes[fileIdString] || 'Asset';
  }
}