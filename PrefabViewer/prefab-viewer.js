class PrefabViewer {
  constructor(treeContainerEl, inspectorContainerEl) {
    this.treeContainerEl = treeContainerEl;
    this.inspectorContainerEl = inspectorContainerEl;
    this.rawText = '';
    this.documents = [];
    this.resolver = null;
    this.selectedFileId = null;
    this.collapsedFileIds = new Set();
    this.collapsedComponents = new Set();
    this.scriptNameResolver = new ScriptNameResolver();
    this.searchQuery = '';
    this.componentSortMode = 'default';
    this.isEditMode = false;
  }

  setEditMode(enabled) {
    this.isEditMode = enabled;
    let selectedDoc = this.selectedFileId ? this.documents.find(d => d.fileId === this.selectedFileId) : null;
    if (selectedDoc) {
      let goDoc = this.documents.find(d => d.fileId === this.selectedFileId && d.typeName === 'GameObject');
      this.renderInspector(goDoc);
    }
  }

  addMetaFile(fileName, fileContent) {
    let wasAdded = this.scriptNameResolver.addMetaFile(fileName, fileContent);
    if (wasAdded && this.documents.length > 0) {
      this.renderTree();
      let selectedDoc = this.selectedFileId ? this.documents.find(d => d.fileId === this.selectedFileId) : null;
      this.renderInspector(selectedDoc);
    }
    return wasAdded;
  }

  loadFromText(rawText) {
    this.rawText = rawText;
    this.documents = UnityYamlParser.parseDocuments(rawText);
    this.resolver = new ReferenceResolver(this.documents);
    this.selectedFileId = null;
    this.collapsedFileIds = new Set(this.getGameObjectDocuments().map(doc => doc.fileId));
    this.renderTree();
    this.renderInspector(null);
  }

  getTransformForGameObject(gameObjectDoc) {
    let componentList = gameObjectDoc.fields.m_Component || [];
    for (let entry of componentList) {
      let ref = this.resolver.resolve(entry.component);
      if (ref && ref.kind === 'internal' && (ref.document.typeName === 'Transform' || ref.document.typeName === 'RectTransform')) {
        return ref.document;
      }
    }
    return null;
  }

  getComponentsForGameObject(gameObjectDoc) {
    let components = [];
    if (gameObjectDoc.fields && gameObjectDoc.fields.m_Component) {
      for (let compRef of gameObjectDoc.fields.m_Component) {
        let resolved = this.resolver.resolve(compRef.component);
        if (resolved && resolved.document) {
          components.push(resolved.document);
        }
      }
    }
    return components;
  }

  getGameObjectDocuments() {
    return this.documents.filter(doc =>
      doc.typeName === 'GameObject' &&
      doc.fields &&
      (doc.fields.m_Component || doc.fields.m_Name)
    );
  }

  buildHierarchy() {
    let gameObjects = this.getGameObjectDocuments();
    let childrenByParentFileId = new Map();
    let rootGameObjects = [];

    // Check if this is a Prefab Variant by looking for a PrefabInstance block
    let prefabInstanceDoc = this.documents.find(doc => doc.typeName === 'PrefabInstance');
    let virtualRootDoc = null;

    if (prefabInstanceDoc) {
      virtualRootDoc = {
        fileId: prefabInstanceDoc.fileId,
        typeName: 'GameObject',
        fields: {
          m_Name: prefabInstanceDoc.fields.m_Name || 'MCXWeaponRoot (Prefab Variant)',
          m_IsActive: 1,
          m_Component: []
        }
      };
      rootGameObjects.push(virtualRootDoc);
    }

    for (let gameObjectDoc of gameObjects) {
      let transformDoc = this.getTransformForGameObject(gameObjectDoc);
      let parentRef = transformDoc ? this.resolver.resolve(transformDoc.fields.m_Father) : null;

      if (parentRef && parentRef.kind === 'internal') {
        let parentTransformDoc = parentRef.document;
        let parentGameObjectRef = this.resolver.resolve(parentTransformDoc.fields.m_GameObject);
        if (parentGameObjectRef && parentGameObjectRef.kind === 'internal') {
          let parentFileId = parentGameObjectRef.document.fileId;
          if (!childrenByParentFileId.has(parentFileId)) {
            childrenByParentFileId.set(parentFileId, []);
          }
          childrenByParentFileId.get(parentFileId).push(gameObjectDoc);
          continue;
        }
      }

      if (virtualRootDoc && gameObjectDoc.fileId !== virtualRootDoc.fileId) {
        if (!childrenByParentFileId.has(virtualRootDoc.fileId)) {
          childrenByParentFileId.set(virtualRootDoc.fileId, []);
        }
        childrenByParentFileId.get(virtualRootDoc.fileId).push(gameObjectDoc);
      } else {
        rootGameObjects.push(gameObjectDoc);
      }
    }

    return { rootGameObjects, childrenByParentFileId };
  }

  setSearchQuery(query) {
    this.searchQuery = query.toLowerCase().trim();
    this.renderTree();
  }

  setComponentSortMode(mode) {
    this.componentSortMode = mode;
    let selectedDoc = this.selectedFileId ? this.documents.find(d => d.fileId === this.selectedFileId) : null;
    this.renderInspector(selectedDoc);
  }

  isEverythingCollapsed() {
    let { childrenByParentFileId } = this.buildHierarchy();
    let gameObjects = this.getGameObjectDocuments();
    let nodesWithChildren = gameObjects.filter(doc => {
      let children = childrenByParentFileId.get(doc.fileId) || [];
      return children.length > 0;
    });
    if (nodesWithChildren.length === 0) return true;
    return nodesWithChildren.every(doc => this.collapsedFileIds.has(doc.fileId));
  }

  updateHierarchyCollapseButtonState() {
    let collapseBtn = document.getElementById('collapseBtn');
    if (!collapseBtn) return;
    let allCollapsed = this.isEverythingCollapsed();
    collapseBtn.textContent = allCollapsed ? 'Expand' : 'Collapse';
    collapseBtn.title = allCollapsed ? 'Expand All Hierarchy' : 'Collapse All Hierarchy';
  }

  toggleCollapseAllHierarchy() {
    let allCollapsed = this.isEverythingCollapsed();
    if (allCollapsed) {
      this.collapsedFileIds.clear();
    } else {
      this.collapsedFileIds = new Set(this.getGameObjectDocuments().map(doc => doc.fileId));
    }
    this.renderTree();
    return !allCollapsed;
  }

  collapseAllComponents(gameObjectDoc, collapse) {
    let components = this.getComponentsForGameObject(gameObjectDoc);
    for (let comp of components) {
      if (collapse) {
        this.collapsedComponents.add(comp.fileId);
      } else {
        this.collapsedComponents.delete(comp.fileId);
      }
    }
    this.renderInspector(gameObjectDoc);
  }

  setSubTreeCollapsed(gameObjectDoc, childrenByParentFileId, collapse) {
    if (collapse) {
      this.collapsedFileIds.add(gameObjectDoc.fileId);
    } else {
      this.collapsedFileIds.delete(gameObjectDoc.fileId);
    }
    let children = childrenByParentFileId.get(gameObjectDoc.fileId) || [];
    for (let child of children) {
      this.setSubTreeCollapsed(child, childrenByParentFileId, collapse);
    }
  }

  renderTree() {
    let { rootGameObjects, childrenByParentFileId } = this.buildHierarchy();
    let treeContentEl = document.getElementById('treeContent');
    if (!treeContentEl) return;
    treeContentEl.innerHTML = '';

    // Check if this file is a Prefab Variant and display notice
    let prefabInstanceDoc = this.documents.find(doc => doc.typeName === 'PrefabInstance');
    if (prefabInstanceDoc) {
      let noticeEl = document.createElement('div');
      noticeEl.className = 'variant-notice';
      noticeEl.style.cssText = 'padding: 10px; margin: 8px; background: rgba(90, 180, 240, 0.1); border: 1px solid rgba(90, 180, 240, 0.3); border-radius: 6px; font-size: 11.5px; color: var(--accent); line-height: 1.4;';
      noticeEl.innerHTML = `⚠️ <strong>Prefab Variant Detected:</strong> This file only stores local overrides and attachment points. Base model hierarchy and inherited components reside in an external asset/FBX and cannot be read from this file alone.`;
      treeContentEl.appendChild(noticeEl);
    }

    if (rootGameObjects.length === 0) {
      treeContentEl.innerHTML = '<p class="empty-state">No GameObjects found.</p>';
      this.updateHierarchyCollapseButtonState();
      return;
    }

    let rootListEl = document.createElement('ul');
    rootListEl.className = 'tree-root';

    let hasVisibleNodes = false;
    for (let gameObjectDoc of rootGameObjects) {
      let nodeEl = this.renderTreeNode(gameObjectDoc, childrenByParentFileId);
      if (nodeEl) {
        rootListEl.appendChild(nodeEl);
        hasVisibleNodes = true;
      }
    }

    if (!hasVisibleNodes) {
      treeContentEl.innerHTML = '<p class="empty-state">No matching GameObjects found.</p>';
      this.updateHierarchyCollapseButtonState();
      return;
    }
    treeContentEl.appendChild(rootListEl);
    this.updateHierarchyCollapseButtonState();
  }

  nodeMatchesSearch(gameObjectDoc, childrenByParentFileId) {
    if (!this.searchQuery) return true;
    let name = (gameObjectDoc.fields.m_Name || '').toLowerCase();
    if (name.includes(this.searchQuery)) return true;

    let children = childrenByParentFileId.get(gameObjectDoc.fileId) || [];
    for (let child of children) {
      if (this.nodeMatchesSearch(child, childrenByParentFileId)) return true;
    }
    return false;
  }

  renderTreeNode(gameObjectDoc, childrenByParentFileId) {
    if (!this.nodeMatchesSearch(gameObjectDoc, childrenByParentFileId)) return null;

    let children = childrenByParentFileId.get(gameObjectDoc.fileId) || [];
    let hasChildren = children.length > 0;
    let isCollapsed = this.searchQuery ? false : this.collapsedFileIds.has(gameObjectDoc.fileId);

    let itemEl = document.createElement('li');
    itemEl.className = 'tree-node';

    let rowEl = document.createElement('div');
    rowEl.className = 'tree-node-row';

    let toggleEl = document.createElement('button');
    toggleEl.className = 'tree-toggle' + (hasChildren ? '' : ' no-children');
    toggleEl.textContent = hasChildren ? (isCollapsed ? '▶' : '▼') : '';

    toggleEl.addEventListener('click', (event) => {
      event.stopPropagation();
      if (event.altKey) {
        let shouldCollapse = !isCollapsed;
        this.setSubTreeCollapsed(gameObjectDoc, childrenByParentFileId, shouldCollapse);
      } else {
        if (isCollapsed) {
          this.collapsedFileIds.delete(gameObjectDoc.fileId);
        } else {
          this.collapsedFileIds.add(gameObjectDoc.fileId);
        }
      }
      this.renderTree();
    });
    rowEl.appendChild(toggleEl);

    let labelEl = document.createElement('div');
    labelEl.className = 'tree-node-label';
    if (gameObjectDoc.fileId === this.selectedFileId) {
      labelEl.classList.add('selected');
    }
    labelEl.textContent = gameObjectDoc.fields.m_Name || '(unnamed)';

    labelEl.addEventListener('click', () => {
      this.selectedFileId = gameObjectDoc.fileId;
      let components = this.getComponentsForGameObject(gameObjectDoc);
      for (let comp of components) {
        this.collapsedComponents.add(comp.fileId);
      }
      this.renderTree();
      this.renderInspector(gameObjectDoc);
    });

    rowEl.appendChild(labelEl);
    itemEl.appendChild(rowEl);

    if (hasChildren) {
      let childListEl = document.createElement('ul');
      childListEl.className = 'tree-children' + (isCollapsed ? ' collapsed' : '');
      for (let childDoc of children) {
        let childNode = this.renderTreeNode(childDoc, childrenByParentFileId);
        if (childNode) childListEl.appendChild(childNode);
      }
      itemEl.appendChild(childListEl);
    }
    return itemEl;
  }

  renderInspector(gameObjectDoc) {
    this.inspectorContainerEl.innerHTML = '';
    if (!gameObjectDoc) {
      this.inspectorContainerEl.innerHTML = '<p class="empty-state">Select a GameObject to inspect it.</p>';
      return;
    }

    let headerRowEl = document.createElement('div');
    headerRowEl.className = 'inspector-header-row';

    let titleAreaEl = document.createElement('div');
    let headerEl = document.createElement('h2');
    headerEl.style.margin = '0 0 4px';
    headerEl.textContent = gameObjectDoc.fields.m_Name || '(unnamed)';
    titleAreaEl.appendChild(headerEl);

    let metaEl = document.createElement('p');
    metaEl.className = 'inspector-meta';
    metaEl.style.margin = '0';
    metaEl.style.border = 'none';
    metaEl.style.padding = '0';
    let activeState = gameObjectDoc.fields.m_IsActive === 0 ? 'Inactive' : 'Active';
    let components = this.getComponentsForGameObject(gameObjectDoc);
    metaEl.textContent = `${activeState} · ${components.length} component${components.length === 1 ? '' : 's'} · fileID ${gameObjectDoc.fileId}`;
    titleAreaEl.appendChild(metaEl);
    headerRowEl.appendChild(titleAreaEl);

    let controlsWrapEl = document.createElement('div');
    controlsWrapEl.className = 'inspector-controls-group';

    let collapseAllCompBtn = document.createElement('button');
    collapseAllCompBtn.className = 'toolbar-btn';
    let allCollapsed = components.length > 0 && components.every(c => this.collapsedComponents.has(c.fileId));
    collapseAllCompBtn.textContent = allCollapsed ? 'Expand' : 'Collapse';
    collapseAllCompBtn.title = allCollapsed ? 'Expand All Components' : 'Collapse All Components';

    collapseAllCompBtn.addEventListener('click', () => {
      let shouldCollapse = !allCollapsed;
      this.collapseAllComponents(gameObjectDoc, shouldCollapse);
    });
    controlsWrapEl.appendChild(collapseAllCompBtn);

    let sortWrapEl = document.createElement('div');
    sortWrapEl.className = 'inspector-sort-controls';
    sortWrapEl.innerHTML = `<span>Sort:</span>`;
    let selectEl = document.createElement('select');
    selectEl.innerHTML = `
      <option value="default">Default Order</option>
      <option value="name">Component Name</option>
    `;
    selectEl.value = this.componentSortMode;
    selectEl.addEventListener('change', (e) => this.setComponentSortMode(e.target.value));
    sortWrapEl.appendChild(selectEl);
    controlsWrapEl.appendChild(sortWrapEl);

    headerRowEl.appendChild(controlsWrapEl);
    this.inspectorContainerEl.appendChild(headerRowEl);

    if (components.length === 0) {
      let emptyEl = document.createElement('p');
      emptyEl.className = 'empty-state';
      emptyEl.textContent = 'This GameObject has no resolvable components.';
      this.inspectorContainerEl.appendChild(emptyEl);
      return;
    }

    for (let componentDoc of components) {
      this.inspectorContainerEl.appendChild(this.renderComponentBlock(componentDoc));
    }
  }

  renderComponentBlock(componentDoc) {
    let blockEl = document.createElement('div');
    blockEl.className = 'component-block';

    let compId = componentDoc.fileId;
    let isCollapsed = this.collapsedComponents.has(compId);

    let headerEl = document.createElement('div');
    headerEl.className = 'component-header';
    headerEl.innerHTML = `
      <h3>${this.getComponentDisplayName(componentDoc)}</h3>
      <span class="component-collapse-indicator">${isCollapsed ? '▶ Expand' : '▼ Collapse'}</span>
    `;

    let bodyEl = document.createElement('div');
    bodyEl.className = 'component-body' + (isCollapsed ? ' collapsed' : '');

    headerEl.addEventListener('click', () => {
      if (this.collapsedComponents.has(compId)) {
        this.collapsedComponents.delete(compId);
      } else {
        this.collapsedComponents.add(compId);
      }
      let selectedDoc = this.documents.find(d => d.fileId === this.selectedFileId);
      this.renderInspector(selectedDoc);
    });

    let fieldListEl = document.createElement('div');
    fieldListEl.className = 'field-list';

    for (let [rawFieldName, value] of Object.entries(componentDoc.fields)) {
      if (rawFieldName.startsWith('m_Game') || rawFieldName === 'm_ObjectHideFlags') continue;
      fieldListEl.appendChild(this.renderField(componentDoc, rawFieldName, value));
    }

    bodyEl.appendChild(fieldListEl);
    blockEl.appendChild(headerEl);
    blockEl.appendChild(bodyEl);
    return blockEl;
  }

  renderField(componentDoc, rawFieldName, value) {
    let rowEl = document.createElement('div');
    rowEl.className = 'field-row';

    let labelEl = document.createElement('div');
    labelEl.className = 'field-label';
    labelEl.innerHTML = `<span class="field-plain-name">${FieldNameFormatter.getDisplayLabel(rawFieldName)}</span>
      <span class="field-raw-name">${rawFieldName}</span>`;
    rowEl.appendChild(labelEl);

    let valueEl = document.createElement('div');
    valueEl.className = 'field-value';

    let isVector = false;
    let vectorKeys = [];
    if (value && typeof value === 'object' && !Array.isArray(value) && !('fileID' in value)) {
      let keys = Object.keys(value).map(k => k.toLowerCase());
      if (keys.includes('x') && keys.includes('y')) {
        isVector = true;
        vectorKeys = Object.keys(value);
      }
    }

    let isBool = false;
    if (rawFieldName === 'm_IsActive' || rawFieldName === 'm_Enabled' || typeof value === 'boolean') {
      isBool = true;
    } else {
      let lowerName = rawFieldName.toLowerCase();
      if (lowerName.startsWith('is') || lowerName.startsWith('has') || lowerName.startsWith('can') || lowerName.startsWith('use') || lowerName.startsWith('enable')) {
        isBool = true;
      }
      if (componentDoc.typeName === 'MonoBehaviour') {
        let scriptRef = this.resolver.resolve(componentDoc.fields.m_Script);
        if (scriptRef && scriptRef.kind === 'external') {
          let scriptName = this.scriptNameResolver.getScriptName(scriptRef.guid);
          let csharpType = this.scriptNameResolver.getFieldType(scriptName, rawFieldName);
          if (csharpType === 'bool') isBool = true;
        }
      }
    }

    if (this.isEditMode) {
      if (isBool) {
        let boolVal = value === 1 || value === true || value === 'true';
        let labelWrap = document.createElement('label');
        labelWrap.className = 'field-bool-toggle';

        let inputEl = document.createElement('input');
        inputEl.type = 'checkbox';
        inputEl.checked = boolVal;

        inputEl.addEventListener('change', (e) => {
          let checked = e.target.checked;
          componentDoc.fields[rawFieldName] = checked ? 1 : 0;
        });

        let sliderSpan = document.createElement('span');
        sliderSpan.className = 'slider-toggle-ui';

        labelWrap.appendChild(inputEl);
        labelWrap.appendChild(sliderSpan);

        let textIndicator = document.createElement('span');
        textIndicator.className = 'bool-text-label';
        textIndicator.textContent = boolVal ? 'True' : 'False';
        inputEl.addEventListener('change', (e) => {
          textIndicator.textContent = e.target.checked ? 'True' : 'False';
        });

        let containerWrap = document.createElement('div');
        containerWrap.className = 'bool-edit-container';
        containerWrap.appendChild(labelWrap);
        containerWrap.appendChild(textIndicator);
        valueEl.appendChild(containerWrap);
      } else if (isVector) {
        let vectorWrap = document.createElement('div');
        vectorWrap.className = 'vector-input-group';

        for (let axisKey of vectorKeys) {
          let axisContainer = document.createElement('div');
          axisContainer.className = 'vector-axis-item';

          let axisLabel = document.createElement('span');
          axisLabel.className = 'vector-axis-label';
          axisLabel.textContent = axisKey.toUpperCase();

          let axisInput = document.createElement('input');
          axisInput.className = 'field-input';
          axisInput.type = 'number';
          axisInput.step = 'any';
          axisInput.value = value[axisKey] !== undefined ? value[axisKey] : 0;

          axisInput.addEventListener('input', (e) => {
            let numVal = e.target.value === '' ? 0 : parseFloat(e.target.value);
            value[axisKey] = numVal;
          });

          axisContainer.appendChild(axisLabel);
          axisContainer.appendChild(axisInput);
          vectorWrap.appendChild(axisContainer);
        }
        valueEl.appendChild(vectorWrap);
      } else if (typeof value === 'string' || typeof value === 'number') {
        let inputEl = document.createElement('input');
        inputEl.className = 'field-input';
        inputEl.type = typeof value === 'number' ? 'number' : 'text';
        inputEl.value = value;
        inputEl.step = 'any';

        inputEl.addEventListener('input', (e) => {
          let val = e.target.value;
          if (typeof value === 'number') {
            val = val === '' ? 0 : parseFloat(val);
          }
          componentDoc.fields[rawFieldName] = val;

          if (rawFieldName === 'm_Name') {
            this.renderTree();
          }
        });
        valueEl.appendChild(inputEl);
      } else {
        valueEl.textContent = this.formatValueForDisplay(value);
      }
    } else {
      if (isBool) {
        let boolVal = value === 1 || value === true || value === 'true';
        let badgeEl = document.createElement('span');
        badgeEl.className = 'bool-badge ' + (boolVal ? 'true' : 'false');
        badgeEl.textContent = boolVal ? 'True' : 'False';
        valueEl.appendChild(badgeEl);
      } else {
        valueEl.textContent = this.formatValueForDisplay(value);
      }
    }

    rowEl.appendChild(valueEl);
    return rowEl;
  }

  getComponentDisplayName(componentDoc) {
    if (componentDoc.typeName !== 'MonoBehaviour') {
      let rawName = componentDoc.typeName || 'Component';
      return FieldNameFormatter.formatScriptName(rawName);
    }
    let scriptRef = this.resolver.resolve(componentDoc.fields.m_Script);
    if (scriptRef && scriptRef.kind === 'external') {
      let scriptName = this.scriptNameResolver.getScriptName(scriptRef.guid);
      if (scriptName) {
        return FieldNameFormatter.formatScriptName(scriptName);
      }
    }
    return 'MonoBehaviour (unknown script)';
  }

  formatValueForDisplay(value) {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object' && 'fileID' in value) {
      let ref = this.resolver.resolve(value);
      if (ref.kind === 'none') return '(none)';
      if (ref.kind === 'internal') return ref.displayName;
      if (ref.kind === 'external') {
        let scriptName = this.scriptNameResolver.getScriptName(ref.guid);
        if (scriptName) return FieldNameFormatter.formatScriptName(scriptName);
        return `${ref.assetTypeHint} (external, guid: ${ref.guid.slice(0, 8)}...)`;
      }
      return '(unresolved reference)';
    }
    if (typeof value === 'object') {
      return Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(', ');
    }
    return String(value);
  }

  exportPrefab() {
    let outputLines = [];
    for (let doc of this.documents) {
      outputLines.push(`--- !u!${doc.classId} &${doc.fileId}`);
      if (doc.typeName) {
        outputLines.push(`${doc.typeName}:`);
      }

      function serializeObject(obj, indentLevel) {
        let lines = [];
        let indent = ' '.repeat(indentLevel);
        for (let [k, v] of Object.entries(obj)) {
          if (v === null || v === undefined) {
            lines.push(`${indent}${k}: 0`);
          } else if (typeof v === 'object' && !Array.isArray(v)) {
            if ('fileID' in v) {
              let mapParts = Object.entries(v).map(([mk, mv]) => `${mk}: ${mv}`).join(', ');
              lines.push(`${indent}${k}: {${mapParts}}`);
            } else {
              let keys = Object.keys(v);
              let isInlineStruct = keys.length <= 4 && keys.every(ek => ['x', 'y', 'z', 'w', 'r', 'g', 'b', 'a'].includes(ek.toLowerCase()));
              if (isInlineStruct) {
                let mapParts = Object.entries(v).map(([mk, mv]) => `${mk}: ${mv}`).join(', ');
                lines.push(`${indent}${k}: {${mapParts}}`);
              } else {
                lines.push(`${indent}${k}:`);
                lines.push(...serializeObject(v, indentLevel + 2));
              }
            }
          } else if (Array.isArray(v)) {
            lines.push(`${indent}${k}:`);
            for (let item of v) {
              if (typeof item === 'object') {
                let firstKey = Object.keys(item)[0];
                let firstVal = item[firstKey];
                if (typeof firstVal === 'object' && 'fileID' in firstVal) {
                  let mapParts = Object.entries(firstVal).map(([mk, mv]) => `${mk}: ${mv}`).join(', ');
                  lines.push(`${indent}- ${firstKey}: {${mapParts}}`);
                } else {
                  lines.push(`${indent}- ${firstKey}: ${firstVal}`);
                }
              } else {
                lines.push(`${indent}- ${item}`);
              }
            }
          } else {
            lines.push(`${indent}${k}: ${v}`);
          }
        }
        return lines;
      }

      outputLines.push(...serializeObject(doc.fields, 2));
      outputLines.push('');
    }
    return outputLines.join('\n');
  }
}