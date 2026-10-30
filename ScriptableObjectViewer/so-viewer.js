class ScriptableObjectViewer {

    constructor(inspectorContainerEl) {
        this.inspectorContainerEl = inspectorContainerEl;
        this.rawText = '';
        this.documents = [];
        this.resolver = null;
        this.scriptNameResolver = new ScriptNameResolver();
        this.isEditMode = false;
        this.isDebugMode = false;
        this.collapsedStates = new Map();
    }

    setEditMode(enabled) {
        this.isEditMode = enabled;
        this.renderInspector();
    }

    setDebugMode(enabled) {
        this.isDebugMode = enabled;
        this.renderInspector();
    }

    loadFromText(rawText) {
        this.rawText = rawText;
        this.documents = UnityYamlParser.parseDocuments(rawText);
        this.resolver = new ReferenceResolver(this.documents);
        this.collapsedStates.clear();
        this.renderInspector();
    }

    renderInspector() {
        this.inspectorContainerEl.innerHTML = '';
        if (this.documents.length === 0) {
            this.inspectorContainerEl.innerHTML = '<p class="empty-state">Drop a ScriptableObject (.asset) file into Box 1 to view its config data.</p>';
            return;
        }

        let primaryDoc = this.documents.find(d => d.classId === 114 || d.typeName === 'MonoBehaviour' || d.typeName === 'ScriptableObject') || this.documents[0];

        // --- Header Row ---
        let headerRowEl = document.createElement('div');
        headerRowEl.className = 'so-inspector-header-row';

        let titleAreaEl = document.createElement('div');
        let headerEl = document.createElement('h2');
        headerEl.style.margin = '0 0 4px';

        let scriptTypeName = 'ScriptableObject';
        if (primaryDoc.fields.m_Script) {
            let scriptRef = this.resolver.resolve(primaryDoc.fields.m_Script);
            if (scriptRef && scriptRef.guid) {
                let resolvedName = this.scriptNameResolver.getScriptName(scriptRef.guid);
                if (resolvedName) scriptTypeName = resolvedName;
            }
        }
        headerEl.textContent = `${primaryDoc.fields.m_Name || 'Asset'} (${scriptTypeName})`;
        titleAreaEl.appendChild(headerEl);

        let metaEl = document.createElement('p');
        metaEl.className = 'inspector-meta';
        metaEl.style.margin = '0';
        metaEl.style.color = 'var(--text-dim)';
        metaEl.style.fontSize = '11.5px';
        metaEl.textContent = `ScriptableObject Asset · ClassID ${primaryDoc.classId} · fileID ${primaryDoc.fileId}`;
        titleAreaEl.appendChild(metaEl);
        headerRowEl.appendChild(titleAreaEl);

        // --- Controls Group (Debug Toggle) ---
        let controlsGroup = document.createElement('div');
        controlsGroup.className = 'inspector-controls-group';

        let debugToggleLabel = document.createElement('label');
        debugToggleLabel.className = 'edit-toggle-label';
        debugToggleLabel.style.fontSize = '12px';
        debugToggleLabel.innerHTML = `
            <input type="checkbox" id="soDebugToggle" ${this.isDebugMode ? 'checked' : ''}> Debug Mode 🪲
        `;
        debugToggleLabel.querySelector('input').addEventListener('change', (e) => {
            this.setDebugMode(e.target.checked);
        });

        controlsGroup.appendChild(debugToggleLabel);
        headerRowEl.appendChild(controlsGroup);
        this.inspectorContainerEl.appendChild(headerRowEl);

        // --- Scrollable Body ---
        let scrollBodyEl = document.createElement('div');
        scrollBodyEl.className = 'so-inspector-scroll-body';

        let blockEl = document.createElement('div');
        blockEl.className = 'so-component-block';

        let compHeader = document.createElement('div');
        compHeader.className = 'so-component-header';
        compHeader.innerHTML = `<h3>${scriptTypeName} Data</h3>`;
        blockEl.appendChild(compHeader);

        let bodyEl = document.createElement('div');
        bodyEl.className = 'so-component-body';

        let fieldListEl = document.createElement('div');
        fieldListEl.className = 'field-list';

        for (let [rawFieldName, value] of Object.entries(primaryDoc.fields)) {
            if (!this.isDebugMode) {
                if (rawFieldName.startsWith('m_') && rawFieldName !== 'm_Name') {
                    continue;
                }
            }
            fieldListEl.appendChild(this.renderFieldTree(primaryDoc, primaryDoc.fields, rawFieldName, value, 0));
        }

        bodyEl.appendChild(fieldListEl);
        blockEl.appendChild(bodyEl);
        scrollBodyEl.appendChild(blockEl);
        this.inspectorContainerEl.appendChild(scrollBodyEl);
    }

    renderFieldTree(componentDoc, parentContainer, rawFieldName, value, depth) {
        let isCompound = value && typeof value === 'object' && !Array.isArray(value) && !('fileID' in value);
        let isArray = Array.isArray(value);

        if (isCompound || isArray) {
            let groupKey = `${rawFieldName}_${depth}_${JSON.stringify(value).slice(0, 30)}`;
            if (!this.collapsedStates.has(groupKey)) {
                this.collapsedStates.set(groupKey, true);
            }
            let isCollapsed = this.collapsedStates.get(groupKey);

            let foldoutContainer = document.createElement('div');
            foldoutContainer.className = 'so-foldout-group';

            let foldoutHeader = document.createElement('div');
            foldoutHeader.className = 'so-foldout-header';
            foldoutHeader.style.paddingLeft = `${depth * 14 + 10}px`;

            let arrow = document.createElement('span');
            arrow.className = 'so-foldout-arrow';
            arrow.textContent = isCollapsed ? '▶' : '▼';

            let labelSpan = document.createElement('span');
            labelSpan.className = 'so-field-plain-name';
            labelSpan.textContent = FieldNameFormatter.getDisplayLabel(rawFieldName);

            foldoutHeader.appendChild(arrow);
            foldoutHeader.appendChild(labelSpan);

            let foldoutContent = document.createElement('div');
            foldoutContent.className = 'so-foldout-content' + (isCollapsed ? ' hidden' : '');

            foldoutHeader.addEventListener('click', () => {
                let current = this.collapsedStates.get(groupKey);
                this.collapsedStates.set(groupKey, !current);
                arrow.textContent = !current ? '▶' : '▼';
                foldoutContent.classList.toggle('hidden', !current);
            });

            if (isCompound) {
                for (let [subKey, subVal] of Object.entries(value)) {
                    foldoutContent.appendChild(this.renderFieldTree(componentDoc, value, subKey, subVal, depth + 1));
                }
            } else if (isArray) {
                value.forEach((item, idx) => {
                    foldoutContent.appendChild(this.renderFieldTree(componentDoc, value, `[${idx}]`, item, depth + 1));
                });
            }

            foldoutContainer.appendChild(foldoutHeader);
            foldoutContainer.appendChild(foldoutContent);
            return foldoutContainer;
        }

        // Standard Field Row
        let row = document.createElement('div');
        row.className = 'so-field-row';
        row.style.paddingLeft = `${depth * 14}px`;

        let labelEl = document.createElement('div');
        labelEl.className = 'so-field-label';

        let rawNameMarkup = this.isDebugMode ? `<span class="so-field-raw-name">${rawFieldName}</span>` : '';
        labelEl.innerHTML = `
            <span class="so-field-plain-name">${FieldNameFormatter.getDisplayLabel(rawFieldName)}</span>
            ${rawNameMarkup}
        `;
        row.appendChild(labelEl);

        let valueEl = document.createElement('div');
        valueEl.className = 'so-field-value';

        if (this.isEditMode) {
            let isBool = false;
            if (typeof value === 'boolean') {
                isBool = true;
            } else {
                let lowerName = rawFieldName.toLowerCase();
                let boolPrefixes = ['is', 'has', 'can', 'use', 'enable', 'disable', 'allow', 'show', 'hide', 'manual', 'auto', 'force'];
                let nameSuggestsBool = boolPrefixes.some(prefix => lowerName.startsWith(prefix)) || lowerName === 'm_enabled' || lowerName === 'm_isactive';
                if (nameSuggestsBool && (value === 0 || value === 1 || value === 'true' || value === 'false')) {
                    isBool = true;
                }
            }

            if (isBool) {
                let boolVal = value === 1 || value === true || value === 'true';
                let labelWrap = document.createElement('label');
                labelWrap.className = 'field-bool-toggle';

                let inputEl = document.createElement('input');
                inputEl.type = 'checkbox';
                inputEl.checked = boolVal;

                inputEl.addEventListener('change', (e) => {
                    parentContainer[rawFieldName] = e.target.checked ? 1 : 0;
                });

                let sliderSpan = document.createElement('span');
                sliderSpan.className = 'slider-toggle-ui';

                labelWrap.appendChild(inputEl);
                labelWrap.appendChild(sliderSpan);
                valueEl.appendChild(labelWrap);
            } else if (typeof value === 'string' && (value.length > 40 || rawFieldName.toLowerCase().includes('description') || rawFieldName.toLowerCase().includes('text'))) {
                let textareaEl = document.createElement('textarea');
                textareaEl.className = 'field-textarea';
                textareaEl.value = value || '';

                textareaEl.addEventListener('input', (e) => {
                    parentContainer[rawFieldName] = e.target.value;
                });
                valueEl.appendChild(textareaEl);
            } else if (typeof value === 'number' || typeof value === 'string') {
                let inputEl = document.createElement('input');
                inputEl.className = 'field-input';
                inputEl.type = typeof value === 'number' ? 'number' : 'text';
                inputEl.value = value !== null && value !== undefined ? value : '';
                inputEl.step = 'any';

                inputEl.addEventListener('input', (e) => {
                    let val = e.target.value;
                    if (typeof value === 'number') {
                        val = val === '' ? 0 : parseFloat(val);
                    }
                    parentContainer[rawFieldName] = val;
                });
                valueEl.appendChild(inputEl);
            } else {
                valueEl.textContent = this.formatValueForDisplay(value);
            }
        } else {
            valueEl.textContent = this.formatValueForDisplay(value);
        }

        row.appendChild(valueEl);
        return row;
    }

    formatValueForDisplay(value) {
        if (value === null || value === undefined) return 'None (Object)';
        if (typeof value === 'object' && 'fileID' in value) {
            let ref = this.resolver.resolve(value);
            if (ref.kind === 'none' || ref.fileId === '0' || ref.fileId === 0) return 'None (Object)';
            if (ref.kind === 'internal') return ref.displayName;
            if (ref.kind === 'external') {
                let scriptName = this.scriptNameResolver.getScriptName(ref.guid);
                if (scriptName) return `${scriptName} (${ref.assetTypeHint || 'Asset'})`;
                return `🔗 Linked Asset (GUID: ${ref.guid.slice(0, 8)}...)`;
            }
            return 'Reference (fileID: ' + ref.fileId + ')';
        }
        if (typeof value === 'object') {
            return Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(', ');
        }
        return String(value);
    }

    exportAsset() {
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
                            lines.push(`${indent}${k}:`);
                            lines.push(...serializeObject(v, indentLevel + 2));
                        }
                    } else if (Array.isArray(v)) {
                        lines.push(`${indent}${k}:`);
                        for (let item of v) {
                            if (typeof item === 'object') {
                                let keys = Object.keys(item);
                                if (keys.length > 1) {
                                    lines.push(`${indent}- ${keys[0]}: ${item[keys[0]]}`);
                                    for (let ki = 1; ki < keys.length; ki++) {
                                        let subK = keys[ki];
                                        lines.push(`${indent}  ${subK}: ${item[subK]}`);
                                    }
                                } else if (keys.length === 1) {
                                    lines.push(`${indent}- ${keys[0]}: ${item[keys[0]]}`);
                                } else {
                                    lines.push(`${indent}- ${item}`);
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

if (typeof module !== 'undefined') module.exports = { ScriptableObjectViewer };