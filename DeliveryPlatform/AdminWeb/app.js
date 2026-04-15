const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:5000/api' 
    : 'https://deliveryplatform.onrender.com/api';

// --- PLATFORM STATE ---
let state = {
    authToken: localStorage.getItem('nexus_token'),
    adminName: localStorage.getItem('nexus_admin'),
    activeView: 'dashboard',
    merchants: [],
    orders: [],
    feed: [],
    markers: {
        merchants: {},
        drivers: {},
        customers: {}
    }
};

let hubConnection = null;
let adminMap = null;

// --- INITIALIZATION ---
async function init() {
    setupEventListeners();
    if (state.authToken) {
        showApp();
    } else {
        showLogin();
    }
}

function showLogin() {
    document.getElementById('loginView').classList.remove('hidden');
    document.getElementById('appView').classList.add('hidden');
}

async function showApp() {
    document.getElementById('loginView').classList.add('hidden');
    document.getElementById('appView').classList.remove('hidden');
    
    initMap();
    await connectHub();
    await refreshData();
}

function initMap() {
    if (adminMap) return;
    adminMap = L.map('adminMap', { zoomControl: false }).setView([-26.175, 27.882], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(adminMap);
}

// --- NETWORK & HUB ---
async function connectHub() {
    if (hubConnection) return;
    
    hubConnection = new signalR.HubConnectionBuilder()
        .withUrl(API_URL.replace('/api', '/orderhub'), {
            accessTokenFactory: () => state.authToken
        })
        .withAutomaticReconnect()
        .build();

    hubConnection.on("StatusUpdated", (data) => {
        logEvent(`[SIGNAL] Order #${data.orderId} transition: ${data.status}`);
        refreshData();
    });

    hubConnection.on("DriverLocationUpdated", (data) => {
        updateDriverMarker(data);
    });

    try {
        await hubConnection.start();
        logEvent("Gateway: Secure telemetry established");
    } catch (err) {
        logEvent("Gateway Error: Connection failed");
        console.error(err);
    }
}

async function refreshData() {
    try {
        const [mRes, oRes] = await Promise.all([
            apiGet('Merchant'),
            apiGet('Order')
        ]);
        state.merchants = mRes;
        state.orders = oRes;
        render();
    } catch (e) {
        console.error("Sync Error", e);
    }
}

async function apiGet(endpoint) {
    const res = await fetch(`${API_URL}/${endpoint}`, {
        headers: { 'Authorization': `Bearer ${state.authToken}` }
    });
    if(res.status === 401) logout();
    return await res.json();
}

// --- RENDERING ENGINE ---
function render() {
    renderStats();
    renderFeed();
    renderOrders();
    renderMerchants();
    updateMapPoints();
}

function renderStats() {
    const totalRev = state.orders
        .filter(o => o.status === 'Delivered')
        .reduce((sum, o) => sum + o.totalAmount, 0);
    
    document.getElementById('statRevenue').textContent = `R${totalRev.toFixed(2)}`;
    document.getElementById('statOrders').textContent = state.orders.filter(o => o.status !== 'Delivered').length;
}

function renderFeed() {
    const list = document.getElementById('liveFeed');
    if (state.feed.length === 0) return;
    
    list.innerHTML = state.feed.map(item => `
        <div class="feed-item">
            <span class="feed-time">${item.time}</span>
            <div>${item.msg}</div>
        </div>
    `).join('');
}

function renderOrders() {
    const list = document.getElementById('activeOrdersList');
    const active = state.orders.filter(o => o.status !== 'Delivered');
    
    list.innerHTML = active.map(o => `
        <div class="order-card" onclick="focusOrder(${o.id})">
            <span class="order-badge ${o.status.toLowerCase()}">${o.status}</span>
            <div class="order-main">
                <h4>#${o.id} - ${o.merchant?.name || 'Store'}</h4>
                <p>${o.deliveryAddress}</p>
            </div>
        </div>
    `).join('');
}

function renderMerchants() {
    const list = document.getElementById('merchantList');
    list.innerHTML = state.merchants.map(m => `
        <div class="feed-item" style="display:flex; justify-content:space-between; align-items:center;">
            <span>${m.name}</span>
            <span class="status-indicator live" style="font-size:0.5rem">${m.isActive ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
    `).join('');
}

function updateMapPoints() {
    // 1. Merchants
    state.merchants.forEach(m => {
        if (!state.markers.merchants[m.id]) {
            state.markers.merchants[m.id] = L.marker([m.latitude, m.longitude], {
                icon: L.divIcon({ className: 'nexus-pin pin-merchant' })
            }).addTo(adminMap).bindPopup(`<b>${m.name}</b>`);
        }
    });

    // 2. Customers for active orders
    state.orders.filter(o => o.status !== 'Delivered').forEach(o => {
        if (!state.markers.customers[o.id]) {
            state.markers.customers[o.id] = L.marker([o.deliveryLatitude, o.deliveryLongitude], {
                icon: L.divIcon({ className: 'nexus-pin pin-customer' })
            }).addTo(adminMap).bindPopup(`Customer - Order #${o.id}`);
        }
    });
}

function updateDriverMarker(data) {
    const { orderId, lat, lng } = data;
    if (!state.markers.drivers[orderId]) {
        state.markers.drivers[orderId] = L.marker([lat, lng], {
            icon: L.divIcon({ className: 'nexus-pin pin-driver' })
        }).addTo(adminMap).bindPopup(`Driver - Order #${orderId}`);
    } else {
        state.markers.drivers[orderId].setLatLng([lat, lng]);
    }
}

// --- UTILS ---
function logEvent(msg) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    state.feed.unshift({ time, msg });
    if(state.feed.length > 50) state.feed.pop();
    renderFeed();
}

function setupEventListeners() {
    // Auth
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            
            btn.classList.add('active');
            const tab = btn.getAttribute('data-tab');
            document.getElementById(`tab-${tab}`).classList.remove('hidden');
        });
    });

    // Modal
    document.getElementById('addMerchantBtn').addEventListener('click', () => document.getElementById('merchantModal').classList.remove('hidden'));
    document.getElementById('closeModalBtn').addEventListener('click', () => document.getElementById('merchantModal').classList.add('hidden'));
    document.getElementById('merchantForm').addEventListener('submit', handleAddMerchant);
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    btn.textContent = 'CONNECTING...';
    
    try {
        const res = await fetch(`${API_URL}/Auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: document.getElementById('email').value,
                password: document.getElementById('password').value
            })
        });
        
        if (!res.ok) throw new Error('Access Denied');
        const data = await res.json();
        
        state.authToken = data.token;
        state.adminName = data.fullName;
        localStorage.setItem('nexus_token', data.token);
        localStorage.setItem('nexus_admin', data.fullName);
        
        showApp();
    } catch (err) {
        document.getElementById('loginError').classList.remove('hidden');
    } finally {
        btn.textContent = 'INITIALIZE CONNECTION';
    }
}

async function handleAddMerchant(e) {
    e.preventDefault();
    const payload = {
        name: document.getElementById('m_name').value,
        category: document.getElementById('m_category').value,
        address: document.getElementById('m_address').value,
        commissionPercentage: parseFloat(document.getElementById('m_commission').value),
        isActive: true
    };
    
    try {
        const res = await fetch(`${API_URL}/Merchant`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.authToken}`
            },
            body: JSON.stringify(payload)
        });
        if(res.ok) {
            document.getElementById('merchantModal').classList.add('hidden');
            refreshData();
        }
    } catch (e) { alert("Deployment error"); }
}

function logout() {
    localStorage.clear();
    location.reload();
}

init();
