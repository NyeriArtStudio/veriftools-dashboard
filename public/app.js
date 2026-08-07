const API_BASE = '';

const stateSelector = document.getElementById('stateSelector');
const statesGrid = document.getElementById('statesGrid');
const formSection = document.getElementById('formSection');
const stateTitle = document.getElementById('stateTitle');
const dynamicFields = document.getElementById('dynamicFields');
const licenseForm = document.getElementById('licenseForm');
const photoInput = document.getElementById('photo');
const photoPreview = document.getElementById('photoPreview');
const submitBtn = document.getElementById('submitBtn');
const resultSection = document.getElementById('resultSection');
const outputContainer = document.getElementById('outputContainer');
const downloadLink = document.getElementById('downloadLink');
const errorBox = document.getElementById('errorBox');
const backBtn = document.getElementById('backBtn');
const resetBtn = document.getElementById('resetBtn');

let currentStateId = null;
let currentStateName = null;

async function init() {
    try {
        const res = await fetch('/api/states');
        const states = await res.json();
        statesGrid.innerHTML = states.map(s => `
            <div class="state-card" data-id="${s.id}">
                <h3>${s.name}</h3>
                <div class="template-id">Template #${s.template_id}</div>
            </div>
        `).join('');
        
        document.querySelectorAll('.state-card').forEach(card => {
            card.addEventListener('click', () => loadState(card.dataset.id));
        });
    } catch (err) {
        showError('Failed to load states: ' + err.message);
    }
}

async function loadState(stateId) {
    try {
        const res = await fetch(`/api/states/${stateId}/fields`);
        const config = await res.json();
        
        currentStateId = stateId;
        currentStateName = config.name;
        stateTitle.textContent = config.name;
        buildForm(config.fields);
        
        stateSelector.classList.add('hidden');
        formSection.classList.remove('hidden');
        resultSection.classList.add('hidden');
        clearError();
    } catch (err) {
        showError('Failed to load form: ' + err.message);
    }
}

function buildForm(fields) {
    const groups = {
        'Personal Information': fields.filter(f => 
            ['first_name','first_middle_name','last_name','date_of_birth','sex','height','weight','eyes','hair_color'].includes(f.name)
        ),
        'License Details': fields.filter(f => 
            ['license_number','id_number','dl_class','endorsements','restrictions','dups_number','issue_date','expire_date','replaced_date','revision_date'].includes(f.name)
        ),
        'Address': fields.filter(f => 
            ['address_street','address_city','address_state','address_zip'].includes(f.name)
        ),
        'Additional': fields.filter(f => {
            const known = ['first_name','first_middle_name','last_name','date_of_birth','sex','height','weight','eyes','hair_color','license_number','id_number','dl_class','endorsements','restrictions','dups_number','issue_date','expire_date','replaced_date','revision_date','address_street','address_city','address_state','address_zip'];
            return !known.includes(f.name);
        })
    };

    dynamicFields.innerHTML = Object.entries(groups)
        .filter(([_, g]) => g.length > 0)
        .map(([name, g]) => `
            <fieldset>
                <legend>${name}</legend>
                ${renderRows(g)}
            </fieldset>
        `).join('');
}

function renderRows(fields) {
    const rows = [];
    for (let i = 0; i < fields.length; i += 2) {
        const pair = fields.slice(i, i + 2);
        rows.push(pair.length === 2 ? `
            <div class="form-row">
                ${renderField(pair[0])}
                ${renderField(pair[1])}
            </div>
        ` : renderField(pair[0]));
    }
    return rows.join('');
}

function renderField(f) {
    const req = f.required ? ' <span class="required">*</span>' : '';
    const ph = f.placeholder ? ` placeholder="${f.placeholder}"` : '';
    
    let input;
    if (f.type === 'select') {
        const opts = f.options.map(o => `<option value="${o}">${o==='M'?'Male':o==='F'?'Female':o}</option>`).join('');
        input = `<select id="${f.name}" name="${f.name}" ${f.required?'required':''}>
            <option value="">Select</option>${opts}</select>`;
    } else {
        input = `<input type="${f.type||'text'}" id="${f.name}" name="${f.name}"${ph} ${f.required?'required':''}>`;
    }
    
    return `<div class="form-group"><label for="${f.name}">${f.label}${req}</label>${input}</div>`;
}

photoInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
        showError('Photo must be under 10MB');
        this.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = e => photoPreview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
    reader.readAsDataURL(file);
});

licenseForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    clearError();
    
    const formData = new FormData(this);
    
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    try {
        const res = await fetch(`/api/generate/${currentStateId}`, {
            method: 'POST',
            body: formData
        });
        
        const contentType = res.headers.get('content-type') || '';
        
        if (res.status === 402) {
            const data = await res.json();
            showError(`${data.message}. <a href="${data.vendorUrl}" target="_blank">Top up wallet →</a>`, true);
            return;
        }
        
        if (contentType.includes('image')) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            outputContainer.innerHTML = `<img src="${url}" alt="${currentStateName} License">`;
            downloadLink.href = url;
            downloadLink.download = `${currentStateId}-license.png`;
            downloadLink.classList.remove('hidden');
        } else {
            const text = await res.text();
            let data;
            try { data = JSON.parse(text); } catch { data = {raw: text}; }
            outputContainer.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
            downloadLink.classList.add('hidden');
        }
        
        formSection.classList.add('hidden');
        resultSection.classList.remove('hidden');
        
    } catch (err) {
        showError('Error: ' + err.message);
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
});

backBtn.addEventListener('click', () => {
    formSection.classList.add('hidden');
    stateSelector.classList.remove('hidden');
    licenseForm.reset();
    photoPreview.innerHTML = '';
    currentStateId = null;
});

resetBtn.addEventListener('click', () => {
    resultSection.classList.add('hidden');
    formSection.classList.remove('hidden');
    licenseForm.reset();
    photoPreview.innerHTML = '';
    clearError();
});

function showError(msg, isHtml = false) {
    errorBox.innerHTML = isHtml ? msg : `<p>${msg}</p>`;
    errorBox.classList.remove('hidden');
}

function clearError() {
    errorBox.classList.add('hidden');
    errorBox.innerHTML = '';
}

init();
