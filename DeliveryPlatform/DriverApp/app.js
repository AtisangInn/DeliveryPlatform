const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:5000/api' 
    : 'https://deliveryplatform.onrender.com/api';

// --- STATE ---
let state = {
    authToken: localStorage.getItem('nexus_driver_token'),
    activeJob: JSON.parse(localStorage.getItem('nexus_active_job')),
    earnings: 0,
    availableRequests: []
};

let hubConnection = null;
let driverMap = null;
let driverMarker = null;
let watchId = null;
const KAGISO_COORDS = [-26.175, 27.882];

// --- INIT ---
async function init() {
    setupUI();
    if (state.authToken) {
        showApp();
    } else {
        switchView('login');
    }
}

function showApp() {
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('app-content').classList.remove('hidden');
    
    connectHub();
    if (state.activeJob) {
        switchView('active', document.querySelectorAll('.nav-btn')[1]);
    } else {
        switchView('radar', document.querySelectorAll('.nav-btn')[0]);
        loadAvailableJobs();
    }
}

// --- NETWORK & HUB ---
async function connectHub() {
    if (hubConnection) return;
    hubConnection = new signalR.HubConnectionBuilder()
        .withUrl(API_URL.replace('/api', '/orderhub'), { accessTokenFactory: () => state.authToken })
        .withAutomaticReconnect()
        .build();

    hubConnection.on("NewOrderAvailable", (data) => {
        state.availableRequests.unshift(data);
        renderRadar();
    });

    try {
        await hubConnection.start();
        startGpsTracking();
    } catch (e) { console.error("Hub failed", e); }
}

async function loadAvailableJobs() {
    const orders = await apiGet('Order');
    state.availableRequests = orders.filter(o => o.status === 'Paid' && !o.driverId).map(o => ({
        orderId: o.id,
        merchantName: o.merchant?.name || 'Store',
        deliveryAddress: o.deliveryAddress,
        amount: o.totalAmount
    }));
    renderRadar();
}

function startGpsTracking() {
    if (!navigator.geolocation) return;
    watchId = navigator.geolocation.watchPosition(pos => {
        const { latitude, longitude } = pos.coords;
        pushLocation(latitude, longitude);
    }, null, { enableHighAccuracy: true });
}

async function pushLocation(lat, lng) {
    if (driverMarker) driverMarker.setLatLng([lat, lng]);
    if (driverMap && state.activeJob) driverMap.panTo([lat, lng]);
    
    if (hubConnection && hubConnection.state === "Connected" && state.activeJob) {
        await hubConnection.invoke("UpdateDriverLocation", state.activeJob.orderId, lat, lng);
    }
}

// --- ACTIONS ---
async function acceptJob(order) {
    try {
        const res = await fetch(`${API_URL}/Order/${order.orderId}/accept`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${state.authToken}` }
        });
        if (!res.ok) throw new Error("Job already taken");
        
        state.activeJob = order;
        state.activeJob.status = 'Assigned';
        localStorage.setItem('nexus_active_job', JSON.stringify(state.activeJob));
        
        switchView('active', document.querySelectorAll('.nav-btn')[1]);
    } catch (e) { alert(e.message); loadAvailableJobs(); }
}

async function updateOrderStatus(newStatus) {
    try {
        const res = await fetch(`${API_URL}/Order/${state.activeJob.orderId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.authToken}` },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (!res.ok) throw new Error("Update rejected");
        
        if (newStatus === 'Delivered') {
            alert("Delivery Successful! Payout credited.");
            state.earnings += 20;
            state.activeJob = null;
            localStorage.removeItem('nexus_active_job');
            document.getElementById('earnedToday').textContent = `R${state.earnings.toFixed(2)}`;
            switchView('radar', document.querySelectorAll('.nav-btn')[0]);
        } else {
            state.activeJob.status = newStatus;
            renderActiveJob();
        }
    } catch (e) { alert(e.message); }
}

// --- NAVIGATION & RENDERING ---
function switchView(viewId, navBtn) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${viewId}`).classList.remove('hidden');

    if (navBtn) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        navBtn.classList.add('active');
    }

    if (viewId === 'active') initActiveMap();
}

function renderRadar() {
    const list = document.getElementById('availableOrdersList');
    if (state.availableRequests.length === 0) {
        list.innerHTML = '';
        return;
    }
    
    list.innerHTML = state.availableRequests.map(r => `
        <div class="request-card">
            <h3>${r.merchantName}</h3>
            <p>To: ${r.deliveryAddress}</p>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:700; color:var(--secondary)">R20.00 Earning</span>
                <button class="secondary-btn" style="width:auto; padding:0.5rem 1rem;" 
                    onclick='acceptJob(${JSON.stringify(r)})'>ACCEPT</button>
            </div>
        </div>
    `).join('');
}

function initActiveMap() {
    if (!state.activeJob) return;
    if (!driverMap) {
        driverMap = L.map('driverMap', { zoomControl: false }).setView(KAGISO_COORDS, 15);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(driverMap);
        driverMarker = L.marker(KAGISO_COORDS, {
            icon: L.divIcon({ className: 'nexus-pin pin-driver', html: '🏍️', iconSize: [36,36] })
        }).addTo(driverMap);
    }
    renderActiveJob();
}

function renderActiveJob() {
    const j = state.activeJob;
    document.getElementById('activeMerchantName').textContent = j.merchantName;
    document.getElementById('activeAddress').textContent = j.deliveryAddress;
    document.getElementById('activeAmount').textContent = `R${j.amount.toFixed(2)}`;

    const pickupBtn = document.getElementById('btnPickupOrder');
    const deliverBtn = document.getElementById('btnDeliverOrder');

    if (j.status === 'Assigned' || j.status === 'Preparing') {
        pickupBtn.classList.remove('hidden');
        deliverBtn.classList.add('hidden');
    } else if (j.status === 'PickedUp' || j.status === 'OutForDelivery') {
        pickupBtn.classList.add('hidden');
        deliverBtn.classList.remove('hidden');
    }
}

// --- UTILS ---
async function apiGet(endpoint) {
    const res = await fetch(`${API_URL}/${endpoint}`, { headers: { 'Authorization': `Bearer ${state.authToken}` } });
    if(res.status === 401) logout();
    return await res.json();
}

function setupUI() {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    btn.textContent = 'CONNECTING...';
    try {
        const res = await fetch(`${API_URL}/Auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: document.getElementById('email').value, password: document.getElementById('password').value })
        });
        const data = await res.json();
        state.authToken = data.token;
        localStorage.setItem('nexus_driver_token', data.token);
        showApp();
    } catch (e) { alert("Access Denied"); btn.textContent = "Initiate Shift"; }
}

function logout() { localStorage.clear(); location.reload(); }

init();
