let dropZoneEl = document.getElementById('dropZone');
let fileInputEl = document.getElementById('fileInput');
let metaDropZoneEl = document.getElementById('metaDropZone');
let metaFileInputEl = document.getElementById('metaFileInput');
let metaStatusEl = document.getElementById('metaStatus');

let soDropZoneEl = document.getElementById('soDropZone');
let soFileInputEl = document.getElementById('soFileInput');

let prefabDropZoneGroupEl = document.getElementById('prefabDropZoneGroup');
let soDropZoneGroupEl = document.getElementById('soDropZoneGroup');

let viewerLayoutEl = document.getElementById('viewerLayout');
let prefabViewWorkspaceEl = document.getElementById('prefabViewWorkspace');
let soViewWorkspaceEl = document.getElementById('soViewWorkspace');

let treeContainerEl = document.getElementById('treeContainer');
let inspectorContainerEl = document.getElementById('inspectorContainer');
let soInspectorContainerEl = document.getElementById('soInspectorContainer');

let searchInputEl = document.getElementById('searchInput');
let collapseBtn = document.getElementById('collapseBtn');
let toggleDropZonesBtn = document.getElementById('toggleDropZonesBtn');
let dropZonesContainerEl = document.getElementById('dropZonesContainer');
let editModeToggleEl = document.getElementById('editModeToggle');
let saveAssetBtn = document.getElementById('saveAssetBtn');

let currentViewMode = 'prefab'; // 'prefab' or 'so'
let currentPrefabText = '';
let currentSoText = '';

let prefabViewer = new PrefabViewer(treeContainerEl, inspectorContainerEl);
let soViewer = new ScriptableObjectViewer(soInspectorContainerEl);

// Sidebar Navigation & Independent Window Switching
let sidebarNavBtns = document.querySelectorAll('.sidebar-nav-btn');
sidebarNavBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        sidebarNavBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentViewMode = btn.getAttribute('data-view');

        if (currentViewMode === 'prefab') {
            prefabDropZoneGroupEl.classList.remove('hidden');
            soDropZoneGroupEl.classList.add('hidden');
            prefabViewWorkspaceEl.classList.remove('hidden');
            soViewWorkspaceEl.classList.add('hidden');
            if (currentPrefabText) prefabViewer.loadFromText(currentPrefabText);
        } else {
            prefabDropZoneGroupEl.classList.add('hidden');
            soDropZoneGroupEl.classList.remove('hidden');
            prefabViewWorkspaceEl.classList.add('hidden');
            soViewWorkspaceEl.classList.remove('hidden');
            if (currentSoText) soViewer.loadFromText(currentSoText);
        }
    });
});

function handleFile(file) {
    let reader = new FileReader();
    reader.onload = (event) => {
        viewerLayoutEl.classList.remove('hidden');
        let text = event.target.result;

        if (currentViewMode === 'prefab') {
            currentPrefabText = text;
            prefabViewer.scriptNameResolver = prefabNameResolver;
            prefabViewer.loadFromText(text);
        } else {
            currentSoText = text;
            soViewer.loadFromText(text);
        }
    };
    reader.readAsText(file);
}

// Dedicated Script Name Resolver strictly for the Prefab Viewer
let prefabNameResolver = new ScriptNameResolver();

function updateMetaStatus() {
    let count = prefabNameResolver.knownScriptCount;
    metaStatusEl.textContent = count > 0 ? `${count} script/meta/asset item${count === 1 ? '' : 's'} indexed` : 'Ready to index...';
}

function processFileAsync(file, relativePath = '') {
    return new Promise((resolve) => {
        let identifier = relativePath || file.name;
        let lower = identifier.toLowerCase();

        let isMatch = lower.endsWith('.cs') || lower.endsWith('.meta') || lower.endsWith('.asset');
        if (!isMatch) {
            resolve();
            return;
        }

        let reader = new FileReader();
        reader.onload = (event) => {
            prefabNameResolver.addFile(identifier, event.target.result, { cs: true, meta: true, asset: true });
            updateMetaStatus();
            resolve();
        };
        reader.readAsText(file);
    });
}

async function traverseAndProcessEntry(entry, path = '') {
    if (entry.isFile) {
        let name = entry.name.toLowerCase();
        let shouldRead = name.endsWith('.cs') || name.endsWith('.meta') || name.endsWith('.asset');

        if (shouldRead) {
            return new Promise((resolve) => {
                entry.file(async (file) => {
                    await processFileAsync(file, path + file.name);
                    resolve();
                });
            });
        }
        return Promise.resolve();
    } else if (entry.isDirectory) {
        let reader = entry.createReader();
        let entries = await readAllEntries(reader);
        for (let subEntry of entries) {
            await traverseAndProcessEntry(subEntry, path + entry.name + '/');
        }
    }
}

function readAllEntries(reader) {
    return new Promise((resolve) => {
        let entries = [];
        function readBatch() {
            reader.readEntries((results) => {
                if (results.length === 0) {
                    resolve(entries);
                } else {
                    entries.push(...results);
                    readBatch();
                }
            });
        }
        readBatch();
    });
}

// UI Controls
searchInputEl.addEventListener('input', (e) => {
    prefabViewer.setSearchQuery(e.target.value);
});

collapseBtn.addEventListener('click', () => {
    prefabViewer.toggleCollapseAllHierarchy();
});

toggleDropZonesBtn.addEventListener('click', () => {
    dropZonesContainerEl.classList.toggle('collapsed');
    toggleDropZonesBtn.textContent = dropZonesContainerEl.classList.contains('collapsed') ? 'Show Drop Zones' : 'Toggle Drop Zones';
});

editModeToggleEl.addEventListener('change', (e) => {
    let enabled = e.target.checked;
    prefabViewer.setEditMode(enabled);
    soViewer.setEditMode(enabled);
    if (saveAssetBtn) {
        if (enabled) saveAssetBtn.classList.remove('hidden');
        else saveAssetBtn.classList.add('hidden');
    }
});

saveAssetBtn.addEventListener('click', () => {
    let yamlString = currentViewMode === 'prefab' ? prefabViewer.exportPrefab() : soViewer.exportAsset();
    let blob = new Blob([yamlString], { type: 'text/yaml' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = currentViewMode === 'prefab' ? 'modified.prefab' : 'modified.asset';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

// Drop Zone 1 (Prefabs)
dropZoneEl.addEventListener('click', () => fileInputEl.click());
fileInputEl.addEventListener('change', (event) => {
    if (event.target.files.length > 0) handleFile(event.target.files[0]);
});
dropZoneEl.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZoneEl.classList.add('drag-active');
});
dropZoneEl.addEventListener('dragleave', () => {
    dropZoneEl.classList.remove('drag-active');
});
dropZoneEl.addEventListener('drop', async (event) => {
    event.preventDefault();
    dropZoneEl.classList.remove('drag-active');
    let items = event.dataTransfer.items;
    if (items && items.length > 0) {
        let entry = items[0].webkitGetAsEntry ? items[0].webkitGetAsEntry() : null;
        if (entry && entry.isFile) entry.file((file) => handleFile(file));
    } else if (event.dataTransfer.files.length > 0) {
        handleFile(event.dataTransfer.files[0]);
    }
});

// SO Drop Zone (ScriptableObjects)
soDropZoneEl.addEventListener('click', () => soFileInputEl.click());
soFileInputEl.addEventListener('change', (event) => {
    if (event.target.files.length > 0) handleFile(event.target.files[0]);
});
soDropZoneEl.addEventListener('dragover', (event) => {
    event.preventDefault();
    soDropZoneEl.classList.add('drag-active');
});
soDropZoneEl.addEventListener('dragleave', () => {
    soDropZoneEl.classList.remove('drag-active');
});
soDropZoneEl.addEventListener('drop', async (event) => {
    event.preventDefault();
    soDropZoneEl.classList.remove('drag-active');
    let files = event.dataTransfer.files;
    if (files.length > 0) handleFile(files[0]);
});

// Drop Zone 2 (Assets Folder / Scripts / Configs)
metaDropZoneEl.addEventListener('click', () => metaFileInputEl.click());
metaFileInputEl.addEventListener('change', async (event) => {
    metaStatusEl.textContent = 'Parsing folder/files...';
    for (let file of event.target.files) {
        await processFileAsync(file, file.webkitRelativePath || file.name);
    }
    updateMetaStatus();
});
metaDropZoneEl.addEventListener('dragover', (event) => {
    event.preventDefault();
    metaDropZoneEl.classList.add('drag-active');
});
metaDropZoneEl.addEventListener('dragleave', () => {
    metaDropZoneEl.classList.remove('drag-active');
});
metaDropZoneEl.addEventListener('drop', async (event) => {
    event.preventDefault();
    metaDropZoneEl.classList.remove('drag-active');
    metaStatusEl.textContent = 'Parsing dropped Assets...';
    let items = event.dataTransfer.items;
    if (items) {
        for (let item of items) {
            let entry = item.webkitGetAsEntry();
            if (entry) await traverseAndProcessEntry(entry);
        }
    } else {
        for (let file of event.target.files) {
            await processFileAsync(file, file.name);
        }
    }
    updateMetaStatus();
});