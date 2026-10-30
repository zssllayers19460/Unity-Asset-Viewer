// Indexes .cs scripts, .meta GUID maps, and .asset ScriptableObjects.
class ScriptNameResolver {
  constructor() {
    this.nameByGuid = new Map();
    this.scriptSourceFiles = new Map();
    this.fieldTypesByClassName = new Map();
    this.processedFiles = new Set();
  }

  addFile(filePath, fileContent, filters = { cs: true, meta: true, asset: true }) {
    if (this.processedFiles.has(filePath)) return false;
    this.processedFiles.add(filePath);

    let cleanPathName = filePath.split('/').pop();

    if (filters.cs && cleanPathName.endsWith('.cs')) {
      let baseName = cleanPathName.replace(/\.cs$/, '');
      this.scriptSourceFiles.set(baseName, fileContent);
      this.parseCSharpSource(baseName, fileContent);
      return true;
    }

    if (filters.meta && cleanPathName.endsWith('.meta')) {
      let guidMatch = fileContent.match(/^guid:\s*([a-f0-9]{32})/m);
      if (!guidMatch) return false;

      let assetName = cleanPathName.replace(/\.cs\.meta$/, '').replace(/\.meta$/, '');
      this.nameByGuid.set(guidMatch[1], assetName);

      if (this.scriptSourceFiles.has(assetName)) {
        this.parseCSharpSource(assetName, this.scriptSourceFiles.get(assetName));
      }
      return true;
    }

    if (filters.asset && cleanPathName.endsWith('.asset')) {
      let assetName = cleanPathName.replace(/\.asset$/, '');
      let nameMatch = fileContent.match(/^m_Name:\s*(.+)$/m);
      if (nameMatch) {
        let actualName = nameMatch[1].trim();
        if (actualName && actualName !== '-') {
          assetName = actualName;
        }
      }
      return true;
    }

    return false;
  }

  addMetaFile(filePath, fileContent) {
    return this.addFile(filePath, fileContent);
  }

  parseCSharpSource(className, codeText) {
    let fieldMap = new Map();
    let lines = codeText.split('\n');
    for (let line of lines) {
      let trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

      let match = trimmed.match(/(?:public|private|protected|internal)?\s*(?:static)?\s*(?:readonly)?\s*(?:volatile)?\s*([a-zA-Z0-9_<>[\]]+)\s+([a-zA-Z0-9_]+)\s*(?:=|;)/);
      if (match) {
        let typeName = match[1].toLowerCase();
        let fieldName = match[2];

        if (['return', 'base', 'this', 'new', 'default', 'using', 'namespace', 'class', 'struct', 'if', 'for', 'while', 'switch'].includes(fieldName)) {
          continue;
        }

        fieldMap.set(fieldName, typeName);
      }
    }

    this.fieldTypesByClassName.set(className, fieldMap);
  }

  getFieldType(className, fieldName) {
    if (!className) return null;
    let fieldMap = this.fieldTypesByClassName.get(className);
    if (!fieldMap) return null;
    return fieldMap.get(fieldName) || null;
  }

  getScriptName(guid) {
    return this.nameByGuid.get(guid) || null;
  }

  get knownScriptCount() {
    return this.nameByGuid.size;
  }
}