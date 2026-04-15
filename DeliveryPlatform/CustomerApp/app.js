const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:5000/api' 
    : 'https://deliveryplatform.onrender.com/api';

// --- STATE ---
let state = {
    authToken: localStorage.getItem('nexus_cust_token'),
    userName: localStorage.getItem('nexus_cust_name'),
    activeView: 'home',
    merchants: [],
    selectedMerchant: null,
    cart: [],
    activeOrder: null, // Full order object when tracking
    markers: {
        merchant: null,
        customer: null,
        driver: null
    }
};

let hubConnection = null;
let customerMap = null;
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
    document.getElementById('currentLocation').textContent = "123 Sandton Dr, Kagiso";
    
    refreshMerchants();
    connectHub();
    checkActiveOrders();
}

// --- NAVIGATION ---
function switchView(viewId, navBtn) {
    state.activeView = viewId;
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${viewId}`).classList.remove('hidden');

    if (navBtn) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        navBtn.classList.add('active');
    }

    if (viewId === 'home') refreshMerchants();
    if (viewId === 'tracking') initTrackingView();
}

// --- DATA & SYNC ---
async function refreshMerchants() {
    state.merchants = await apiGet('Merchant');
    renderMerchants();
}

async function checkActiveOrders() {
    const orders = await apiGet('Order');
    const active = orders.find(o => ['Paid', 'Assigned', 'PickedUp', 'Preparing', 'OutForDelivery'].includes(o.status));
    if (active) {
        state.activeOrder = active;
        hubConnection?.invoke("JoinOrder", active.id);
        switchView('tracking', document.querySelectorAll('.nav-btn')[1]);
    }
}

async function connectHub() {
    if (hubConnection) return;
    hubConnection = new signalR.HubConnectionBuilder()
        .withUrl(API_URL.replace('/api', '/orderhub'), { accessTokenFactory: () => state.authToken })
        .withAutomaticReconnect()
        .build();

    hubConnection.on("StatusUpdated", (data) => {
        if (state.activeOrder && data.orderId === state.activeOrder.id) {
            state.activeOrder.status = data.status;
            renderTracking();
        }
    });

    hubConnection.on("DriverLocationUpdated", (data) => {
        if (state.activeOrder && data.orderId === state.activeOrder.id) {
            updateDriverMarker(data.lat, data.lng);
        }
    });

    try { await hubConnection.start(); } catch (e) { console.error("Hub fail", e); }
}

// --- RENDERING ---
function renderMerchants() {
    const list = document.getElementById('merchantList');
    list.innerHTML = state.merchants.map(m => `
        <div class="merchant-card" onclick="openMerchant(${m.id})">
            <div class="m-icon">🍔</div>
            <div class="m-info">
                <h3>${m.name}</h3>
                <p>${m.category} • 15-25 min</p>
            </div>
        </div>
    `).join('');
}

async function openMerchant(id) {
    const m = state.merchants.find(x => x.id === id);
    state.selectedMerchant = m;
    switchView('menu');
    document.getElementById('menuMerchantName').textContent = m.name;
    document.getElementById('menuMerchantCategory').textContent = m.category;
    
    // Simulate/Fetch Menu
    const menuItems = m.menuItems?.length ? m.menuItems : [
        { id: 101, name: 'Nexus Burger', description: 'Double beef, secret sauce', price: 95 },
        { id: 102, name: 'Fries', description: 'Large cut, sea salt', price: 35 }
    ];

    document.getElementById('menuItemsList').innerHTML = menuItems.map(item => `
        <div class="menu-item">
            <div>
                <h4>${item.name}</h4>
                <p style="font-size:0.75rem; color:var(--text-secondary)">${item.description}</p>
                <strong style="color:var(--primary)">R${item.price.toFixed(2)}</strong>
            </div>
            <button class="add-btn" onclick="addToCart(${item.id}, '${item.name}', ${item.price})">+</button>
        </div>
    `).join('');
}

function initTrackingView() {
    if (!state.activeOrder) {
        document.getElementById('view-tracking').innerHTML = `
            <div style="padding: 4rem 2rem; text-align:center">
                <h2>No Active Orders</h2>
                <p style="color:var(--text-secondary); margin-top:1rem">Order some food to start tracking.</p>
                <button class="primary-btn" style="margin-top:2rem" onclick="switchView('home')">Go Shopping</button>
            </div>
        `;
        return;
    }
    
    if (!customerMap) {
        customerMap = L.map('customerMap', { zoomControl: false }).setView(KAGISO_COORDS, 15);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(customerMap);
    }
    renderTracking();
}

function renderTracking() {
    const o = state.activeOrder;
    if (!o) return;

    document.getElementById('trackStatus').textContent = o.status.replace(/([A-Z])/g, ' $1').trim();
    document.getElementById('trackOrderId').textContent = o.id.toString().padStart(4, '0');

    // Update Path Steps
    const statusMap = { 'Paid': 1, 'Assigned': 2, 'Preparing': 2, 'PickedUp': 3, 'OutForDelivery': 3, 'Delivered': 4 };
    const currentStep = statusMap[o.status] || 1;

    document.querySelectorAll('.path-step').forEach((s, idx) => {
        s.classList.remove('completed', 'active');
        if (idx + 1 < currentStep) s.classList.add('completed');
        if (idx + 1 === currentStep) s.classList.add('active');
    });

    // Map Markers
    if (!state.markers.customer) {
        state.markers.customer = L.marker([o.deliveryLatitude, o.deliveryLongitude], {
            icon: L.divIcon({ className: 'nexus-pin pin-customer', html: '🏠', iconSize: [30,30] })
        }).addTo(customerMap);
    }

    if (o.merchant && !state.markers.merchant) {
        state.markers.merchant = L.marker([o.merchant.latitude, o.merchant.longitude], {
            icon: L.divIcon({ className: 'nexus-pin pin-merchant', html: '🏪', iconSize: [30,30] })
        }).addTo(customerMap);
    }
}

function updateDriverMarker(lat, lng) {
    if (!customerMap) return;
    document.getElementById('driverDetails').classList.remove('hidden');
    
    if (!state.markers.driver) {
        state.markers.driver = L.marker([lat, lng], {
            icon: L.divIcon({ className: 'nexus-pin pin-driver', html: '🏍️', iconSize: [36,36] })
        }).addTo(customerMap);
    } else {
        state.markers.driver.setLatLng([lat, lng]);
    }
    customerMap.panTo([lat, lng]);
}

// --- CART & CHECKOUT ---
function addToCart(id, name, price) {
    const existing = state.cart.find(i => i.id === id);
    if(existing) existing.qty++;
    else state.cart.push({ id, name, price, qty: 1 });
    renderCart();
}

function renderCart() {
    const count = state.cart.reduce((s, i) => s + i.qty, 0);
    document.getElementById('cartCount').textContent = count;
    
    const subtotal = state.cart.reduce((s, i) => s + (i.price * i.qty), 0);
    document.getElementById('cartSubtotal').textContent = `R${subtotal.toFixed(2)}`;
    document.getElementById('cartTotal').textContent = `R${(subtotal + 20).toFixed(2)}`;
    
    document.getElementById('cartItemsList').innerHTML = state.cart.map(item => `
        <div class="cart-item" style="display:flex; justify-content:space-between; margin-bottom:1rem">
            <span>${item.qty}x ${item.name}</span>
            <strong>R${(item.price * item.qty).toFixed(2)}</strong>
        </div>
    `).join('');
}

async function processCheckout() {
    const btn = document.getElementById('checkoutBtn');
    btn.textContent = 'INITIATING SECURE PAYMENT...';
    
    const payload = {
        merchantId: state.selectedMerchant.id,
        deliveryAddress: "123 Sandton Dr, Kagiso",
        items: state.cart.map(i => ({ menuItemId: i.id, quantity: i.qty }))
    };

    try {
        const res = await fetch(`${API_URL}/Order/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.authToken}` },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        document.open(); document.write(data.paymentHtmlForm); document.close();
    } catch (e) { alert("Checkout failed"); }
}

// --- CORE UTILS ---
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
    btn.textContent = 'AUTHENTICATING...';
    try {
        const res = await fetch(`${API_URL}/Auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: document.getElementById('email').value, password: document.getElementById('password').value })
        });
        const data = await res.json();
        state.authToken = data.token;
        state.userName = data.fullName;
        localStorage.setItem('nexus_cust_token', data.token);
        localStorage.setItem('nexus_cust_name', data.fullName);
        showApp();
    } catch (e) { alert("Login failed"); btn.textContent = "Sign In"; }
}

function toggleCart() { document.getElementById('cartSheet').classList.toggle('hidden'); }
document.getElementById('cartBtn').addEventListener('click', toggleCart);

function logout() { localStorage.clear(); location.reload(); }

init();
