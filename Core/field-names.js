// Clean formatting for Unity internal field names and component titles.
class FieldNameFormatter {
  static knownLabels = {
    m_Name: 'Name',
    m_IsActive: 'Active',
    m_LocalPosition: 'Position',
    m_LocalRotation: 'Rotation',
    m_LocalScale: 'Scale',
    m_LocalEulerAnglesHint: 'Rotation (Euler Hint)',
    m_Father: 'Parent',
    m_Children: 'Children',
    m_TagString: 'Tag',
    m_Layer: 'Layer',
    m_Enabled: 'Enabled',
    m_Mesh: 'Mesh',
    m_Materials: 'Materials',
    m_CastShadows: 'Cast Shadows',
    m_ReceiveShadows: 'Receive Shadows',
    m_Script: 'Script'
  };

  static getDisplayLabel(rawFieldName) {
    if (FieldNameFormatter.knownLabels[rawFieldName]) {
      return FieldNameFormatter.knownLabels[rawFieldName];
    }
    return FieldNameFormatter.cleanRawName(rawFieldName);
  }

  static cleanRawName(rawFieldName) {
    let withoutPrefix = rawFieldName.replace(/^m_/, '');
    let spaced = withoutPrefix.replace(/([a-z])([A-Z])/g, '$1 $2');
    spaced = spaced.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
    return spaced.trim();
  }

  static formatScriptName(scriptName) {
    if (!scriptName) return 'Unknown Script';
    let processed = scriptName;
    if (/^[A-Z0-9_]+$/.test(scriptName)) {
      processed = scriptName.charAt(0) + scriptName.slice(1).toLowerCase();
    }
    let spaced = processed.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    spaced = spaced.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
    return spaced.replace(/\b\w/g, l => l.toUpperCase());
  }
}