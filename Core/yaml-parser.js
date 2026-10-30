// Minimal YAML parser built specifically for Unity's prefab/scene/asset format.
class UnityYamlParser {
  static parseDocuments(rawText) {
    let lines = rawText.split('\n');
    let documents = [];
    let currentHeader = null;
    let currentBodyLines = [];

    for (let line of lines) {
      let headerMatch = line.match(/^--- !u!(\d+) &(-?\d+)/);
      if (headerMatch) {
        if (currentHeader) {
          documents.push(UnityYamlParser.finalizeDocument(currentHeader, currentBodyLines));
        }
        currentHeader = { classId: parseInt(headerMatch[1]), fileId: headerMatch[2] };
        currentBodyLines = [];
      } else if (currentHeader) {
        currentBodyLines.push(line);
      }
    }
    if (currentHeader) {
      documents.push(UnityYamlParser.finalizeDocument(currentHeader, currentBodyLines));
    }
    return documents;
  }

  static finalizeDocument(header, bodyLines) {
    let typeName = null;
    let contentStartIndex = 0;
    for (let i = 0; i < bodyLines.length; i++) {
      let trimmed = bodyLines[i].trim();
      if (trimmed.length === 0) continue;
      let typeMatch = bodyLines[i].match(/^(\w+):\s*$/);
      if (typeMatch) {
        typeName = typeMatch[1];
        contentStartIndex = i + 1;
      }
      break;
    }
    let parsedFields = UnityYamlParser.parseBlock(bodyLines.slice(contentStartIndex));
    return {
      classId: header.classId,
      fileId: header.fileId,
      typeName: typeName,
      fields: parsedFields,
      rawBodyLines: bodyLines
    };
  }

  static parseBlock(lines) {
    function currentIndent(line) {
      let match = line.match(/^(\s*)/);
      return match[1].length;
    }

    function parseValue(rawValue) {
      let trimmedValue = rawValue.trim();
      if (trimmedValue === '') return null;
      if (trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) {
        return UnityYamlParser.parseInlineMap(trimmedValue);
      }
      if (trimmedValue.startsWith('[') && trimmedValue.endsWith(']')) {
        return UnityYamlParser.parseInlineList(trimmedValue);
      }
      if (trimmedValue === 'null' || trimmedValue === '') return null;
      if (/^-?\d+$/.test(trimmedValue)) return parseInt(trimmedValue);
      if (/^-?\d*\.\d+$/.test(trimmedValue)) return parseFloat(trimmedValue);
      if (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) {
        return trimmedValue.slice(1, -1);
      }
      return trimmedValue;
    }

    function parseLinesFrom(startIndex, baseIndent) {
      let localResult = {};
      let i = startIndex;
      while (i < lines.length) {
        let line = lines[i];
        if (line.trim() === '') { i++; continue; }
        let indent = currentIndent(line);
        if (indent < baseIndent) break;
        if (indent > baseIndent) { i++; continue; }

        let kvMatch = line.match(/^(\s*)([\w\s]+):\s*(.*)$/);
        if (kvMatch) {
          let key = kvMatch[2].trim();
          let inlineValue = kvMatch[3];

          if (inlineValue === '' || inlineValue === '|' || inlineValue === '>') {
            let nextIndent = i + 1 < lines.length ? currentIndent(lines[i + 1]) : -1;
            let nextLine = lines[i + 1] ? lines[i + 1] : '';
            let trimmedNext = nextLine.trim();

            if (trimmedNext.startsWith('- ')) {
              let listItems = [];
              let j = i + 1;
              while (j < lines.length) {
                let currentLine = lines[j];
                if (currentLine.trim() === '') { j++; continue; }
                let curIndent = currentIndent(currentLine);
                if (curIndent < nextIndent) break;
                if (!currentLine.trim().startsWith('- ')) break;

                let itemLine = currentLine.replace(/^\s*- /, '').trim();
                let itemMatch = itemLine.match(/^([\w\s]+):\s*(.*)$/);
                
                if (itemMatch) {
                  // Handle complex list/dictionary item objects
                  let itemObj = {};
                  let objKey = itemMatch[1].trim();
                  let objVal = itemMatch[2].trim();
                  itemObj[objKey] = parseValue(objVal);

                  // Peek ahead for multi-line properties inside this list item
                  let innerIdx = j + 1;
                  while (innerIdx < lines.length) {
                    let innerLine = lines[innerIdx];
                    if (innerLine.trim() === '') { innerIdx++; continue; }
                    let innerIndent = currentIndent(innerLine);
                    if (innerIndent <= curIndent) break;
                    let innerMatch = innerLine.match(/^\s*([\w\s]+):\s*(.*)$/);
                    if (innerMatch) {
                      itemObj[innerMatch[1].trim()] = parseValue(innerMatch[2].trim());
                    }
                    innerIdx++;
                  }
                  listItems.push(itemObj);
                } else {
                  listItems.push(parseValue(itemLine));
                }
                j++;
              }
              localResult[key] = listItems;
              i = j;
              continue;
            } else if (nextIndent > baseIndent) {
              // Check if it's a multiline text block (description)
              let isMultilineText = true;
              let textLines = [];
              let j = i + 1;
              while (j < lines.length && currentIndent(lines[j]) > baseIndent) {
                let subLine = lines[j];
                if (/^\s*[\w\s]+:\s/.test(subLine) || subLine.trim().startsWith('- ')) {
                  isMultilineText = false;
                  break;
                }
                textLines.push(subLine.trim());
                j++;
              }

              if (isMultilineText && textLines.length > 0) {
                localResult[key] = textLines.join(' ');
                i = j;
                continue;
              } else {
                let nested = parseLinesFrom(i + 1, nextIndent);
                localResult[key] = nested.value;
                i = nested.nextIndex;
                continue;
              }
            } else {
              localResult[key] = inlineValue === '' ? null : inlineValue;
              i++;
              continue;
            }
          } else {
            localResult[key] = parseValue(inlineValue);
            i++;
            continue;
          }
        }
        i++;
      }
      return { value: localResult, nextIndex: i };
    }

    let parsed = parseLinesFrom(0, lines.length > 0 ? currentIndent(lines[0]) : 2);
    return parsed.value;
  }

  static parseInlineMap(text) {
    let inner = text.slice(1, -1);
    let result = {};
    let parts = inner.split(',');
    for (let part of parts) {
      let colonIndex = part.indexOf(':');
      if (colonIndex === -1) continue;
      let key = part.slice(0, colonIndex).trim();
      let rawValue = part.slice(colonIndex + 1).trim();

      if (key === 'fileID') {
        result[key] = rawValue;
        continue;
      }

      let isFullyNumeric = /^-?\d+(\.\d+)?$/.test(rawValue);
      result[key] = isFullyNumeric ? parseFloat(rawValue) : rawValue;
    }
    return result;
  }

  static parseInlineList(text) {
    let inner = text.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map(entry => entry.trim());
  }
}