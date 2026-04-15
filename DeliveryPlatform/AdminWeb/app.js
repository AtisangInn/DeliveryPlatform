const API_URL = 'http://localhost:5000/api';
let authToken = localStorage.getItem('nexus_token');
let adminName = localStorage.getItem('nexus_admin');

// DOM Elements
const loginView = document.getElementById('loginView');
const appView = document.getElementById('appView');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutBtn');
const merchantTableBody = document.getElementById('merchantTableBody');

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        
        const viewName = item.getAttribute('data-view');
        document.querySelectorAll('.content-panel').forEach(panel => panel.classList.add('hidden'));
        document.getElementById(`view-${viewName}`).classList.remove('hidden');
        
        const titles = {
            'dashboard': { title: 'System Overview', sub: 'Real-time metrics and platform telemetry' },
            'merchants': { title: 'Merchants & Menus', sub: 'Manage registered entities and inventory' },
            'orders': { title: 'Active Orders', sub: 'Live logistics tracing' },
            'drivers': { title: 'Driver Fleet', sub: 'Courier management and status' }
        };
        
        document.getElementById('viewTitle').textContent = titles[viewName].title;
        document.getElementById('viewSubtitle').textContent = titles[viewName].sub;
        
        if (viewName === 'merchants') loadMerchants();
    });
});

// Initialization
function init() {
    if (authToken) {
        showApp();
    } else {
        showLogin();
    }
}

function showLogin() {
    loginView.classList.remove('hidden');
    appView.classList.add('hidden');
}

function showApp() {
    loginView.classList.add('hidden');
    appView.classList.remove('hidden');
    document.getElementById('adminNameDisplay').textContent = adminName || 'System Admin';
    loadDashboardStats();
}

// Auth
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');
    
    btn.textContent = 'Authenticating...';
    
    try {
        const response = await fetch(`${API_URL}/Auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        if (!response.ok) throw new Error('Invalid security protocol');
        
        const data = await response.json();
        
        if(data.role !== 'Admin') throw new Error('Unauthorized clearance level');

        authToken = data.token;
        adminName = data.fullName;
        localStorage.setItem('nexus_token', authToken);
        localStorage.setItem('nexus_admin', adminName);
        
        showApp();
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
    } finally {
        btn.textContent = 'Authenticate ->';
    }
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('nexus_token');
    localStorage.removeItem('nexus_admin');
    authToken = null;
    showLogin();
});

// APIs
async function apiGet(endpoint) {
    const res = await fetch(`${API_URL}/${endpoint}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if(res.status === 401) logoutBtn.click();
    return await res.json();
}

async function loadDashboardStats() {
    try {
        const merchants = await apiGet('Merchant');
        document.getElementById('statMerchants').textContent = merchants.length;
    } catch (e) { console.error('Data pull failed', e); }
}

async function loadMerchants() {
    try {
        merchantTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Pulling records...</td></tr>';
        const merchants = await apiGet('Merchant');
        
        merchantTableBody.innerHTML = '';
        merchants.forEach(m => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-family: monospace; color: var(--text-tertiary)">NEX-${m.id.toString().padStart(4, '0')}</td>
                <td style="font-weight: 500; color: var(--text-primary)">${m.name}</td>
                <td>${m.category}</td>
                <td>${m.commissionPercentage}%</td>
                <td><span class="badge ${m.isActive ? 'active' : 'inactive'}">${m.isActive ? 'OPERATIONAL' : 'OFFLINE'}</span></td>
            `;
            merchantTableBody.appendChild(tr);
        });
    } catch (e) {
        console.error(e);
        merchantTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--danger);">Data synchronization failed</td></tr>';
    }
}

// Modals Setup
const merchantModal = document.getElementById('merchantModal');
document.getElementById('addMerchantBtn').addEventListener('click', () => {
    merchantModal.classList.remove('hidden');
});

document.getElementById('closeModalBtn').addEventListener('click', () => {
    merchantModal.classList.add('hidden');
    document.getElementById('merchantForm').reset();
});

document.getElementById('merchantForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const ogText = btn.textContent;
    btn.textContent = 'Deploying...';
    
    const payload = {
        name: document.getElementById('m_name').value,
        category: document.getElementById('m_category').value,
        address: document.getElementById('m_address').value,
        commissionPercentage: parseFloat(document.getElementById('m_commission').value),
        isActive: true
    };
    
    try {
        const response = await fetch(`${API_URL}/Merchant`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error('Deployment rejected');
        
        document.getElementById('closeModalBtn').click();
        loadMerchants();
        loadDashboardStats();
    } catch (err) {
        alert(err.message);
    } finally {
        btn.textContent = ogText;
    }
});

// Boot
init();
