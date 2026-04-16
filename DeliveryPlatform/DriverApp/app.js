/* ============================================
   EASYWAY DRIVER APP — JavaScript
   GPS tracking, order workflow, SignalR
   ============================================ */

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : 'https://deliveryplatform.onrender.com/api';

const KAGISO_CENTER = [-26.155, 27.778];
const DRIVER_EARNING_PER_DELIVERY = 35.00;

// ─── STATE ───
let state = {
    authToken: localStorage.getItem('ew_driver_token'),
    driverName: localStorage.getItem('ew_driver_name'),
    activeJob: JSON.parse(localStorage.getItem('ew_active_job') || 'null'),
    availableOrders: [],
    completedToday: 0,
    earningsToday: 0
};

let hubConnection = null;
let driverMap = null;
let driverMarker = null;
let merchantMarker = null;
let customerMarker = null;
let watchId = null;

// ─── INIT ───
function init() {
    if (state.authToken) {
        showApp();
    } else {
        showAuth();
    }
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
}

function showAuth() {
    document.getElementById('authScreen').classList.add('active-screen');
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('appShell').classList.add('hidden');
}

function showApp() {
    document.getElementById('authScreen').classList.remove('active-screen');
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appShell').classList.remove('hidden');

    if (state.driverName) {
        document.getElementById('driverName').textContent = state.driverName;
    }

    connectHub();

    if (state.activeJob) {
        switchView('active', document.querySelector('.nav-item[data-view="active"]'));
    } else {
        loadAvailableJobs();
    }
}

// ─── AUTH ───
async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const errEl = document.getElementById('authError');
    errEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Connecting...';

    try {
        const res = await fetch(`${API_URL}/Auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: document.getElementById('email').value.trim(),
                password: document.getElementById('password').value
            })
        });

        if (!res.ok) throw new Error('Invalid credentials');
        const data = await res.json();

        if (data.role && data.role !== 'Driver') {
            throw new Error('This app is for drivers only');
        }

        state.authToken = data.token;
        state.driverName = data.fullName;
        localStorage.setItem('ew_driver_token', data.token);
        localStorage.setItem('ew_driver_name', data.fullName);

        showApp();
    } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Start Driving';
    }
}

// ─── NAVIGATION ───
function switchView(viewId, btn) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
    const target = document.getElementById('view' + viewId.charAt(0).toUpperCase() + viewId.slice(1));
    if (target) target.classList.add('active-view');

    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    // Show/hide nav for active view
    const header = document.querySelector('.driver-header');
    const nav = document.getElementById('bottomNav');

    if (viewId === 'active' && state.activeJob) {
        header.style.display = 'none';
        nav.style.display = 'none';
        initActiveMap();
        renderActiveJob();
    } else {
        header.style.display = 'flex';
        nav.style.display = 'flex';
    }

    if (viewId === 'available') loadAvailableJobs();
    if (viewId === 'history') loadHistory();
}

// ─── SIGNALR ───
async function connectHub() {
    if (hubConnection) return;

    hubConnection = new signalR.HubConnectionBuilder()
        .withUrl(API_URL.replace('/api', '/orderhub'), {
            accessTokenFactory: () => state.authToken
        })
        .withAutomaticReconnect([0, 2000, 5000, 10000])
        .build();

    hubConnection.on('NewOrderAvailable', (data) => {
        showToast('New order available!');
        loadAvailableJobs();
    });

    hubConnection.on('StatusUpdated', (data) => {
        if (state.activeJob && data.orderId === state.activeJob.orderId) {
            if (data.status === 'Delivered') {
                completeDelivery();
            }
        }
    });

    hubConnection.onreconnecting(() => showToast('Reconnecting...'));
    hubConnection.onreconnected(() => {
        showToast('Connected');
        startGpsTracking();
    });

    try {
        await hubConnection.start();
        startGpsTracking();
    } catch (e) {
        console.error('Hub failed:', e);
    }
}

// ─── GPS ───
function startGpsTracking() {
    if (!navigator.geolocation) {
        console.warn('Geolocation not available');
        return;
    }
    if (watchId) navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition(
        (pos) => pushLocation(pos.coords.latitude, pos.coords.longitude),
        (err) => console.warn('GPS error:', err.message),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
}

async function pushLocation(lat, lng) {
    // Update local marker
    if (driverMarker) driverMarker.setLatLng([lat, lng]);
    if (driverMap && state.activeJob) driverMap.panTo([lat, lng]);

    // Broadcast to hub
    if (hubConnection && hubConnection.state === 'Connected' && state.activeJob) {
        try {
            await hubConnection.invoke('UpdateDriverLocation', state.activeJob.orderId, lat, lng);
        } catch (e) { /* ignore */ }
    }
}

// ─── AVAILABLE ORDERS ───
async function loadAvailableJobs() {
    try {
        const res = await fetch(`${API_URL}/Order`, {
            headers: { 'Authorization': `Bearer ${state.authToken}` }
        });
        if (res.status === 401) return logout();
        const orders = await res.json();

        state.availableOrders = orders
            .filter(o => o.status === 'Paid' && !o.driverId)
            .map(o => ({
                orderId: o.id,
                merchantName: o.merchant?.name || 'Restaurant',
                merchantLat: o.merchant?.latitude || KAGISO_CENTER[0],
                merchantLng: o.merchant?.longitude || KAGISO_CENTER[1],
                deliveryAddress: o.deliveryAddress || 'Kagiso',
                deliveryLat: o.deliveryLatitude,
                deliveryLng: o.deliveryLongitude,
                amount: o.totalAmount,
                customerName: o.customer?.fullName || 'Customer',
                customerPhone: o.customer?.phone || ''
            }));

        renderAvailableOrders();
    } catch (e) {
        console.error('Load jobs failed:', e);
    }
}

function renderAvailableOrders() {
    const list = document.getElementById('ordersList');
    const empty = document.getElementById('emptyRadar');

    if (state.availableOrders.length === 0) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    list.innerHTML = state.availableOrders.map(o => `
        <div class="order-card">
            <div class="order-card-top">
                <h3>${o.merchantName}</h3>
                <span class="order-badge badge-new">NEW</span>
            </div>
            <div class="order-card-address">
                <span>📍</span>
                <span>${o.deliveryAddress}</span>
            </div>
            <div class="order-card-footer">
                <span class="order-earning">R${DRIVER_EARNING_PER_DELIVERY.toFixed(2)}</span>
                <button class="accept-btn" onclick='acceptJob(${JSON.stringify(o).replace(/'/g, "&#39;")})'>Accept</button>
            </div>
        </div>
    `).join('');
}

// ─── ACCEPT JOB ───
async function acceptJob(order) {
    try {
        const res = await fetch(`${API_URL}/Order/${order.orderId}/accept`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${state.authToken}` }
        });

        if (!res.ok) throw new Error('Order already taken');

        state.activeJob = { ...order, status: 'Assigned' };
        localStorage.setItem('ew_active_job', JSON.stringify(state.activeJob));

        showToast('Order accepted!');
        switchView('active', document.querySelector('.nav-item[data-view="active"]'));

        // Join the order's SignalR group
        if (hubConnection && hubConnection.state === 'Connected') {
            hubConnection.invoke('JoinOrder', order.orderId).catch(() => {});
        }
    } catch (e) {
        showToast(e.message);
        loadAvailableJobs();
    }
}

// ─── ACTIVE MAP ───
function initActiveMap() {
    if (!state.activeJob) return;

    if (!driverMap) {
        driverMap = L.map('driverMap', { zoomControl: false }).setView(KAGISO_CENTER, 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(driverMap);
    }

    setTimeout(() => driverMap.invalidateSize(), 200);

    // Merchant marker
    if (!merchantMarker && state.activeJob.merchantLat) {
        merchantMarker = L.marker([state.activeJob.merchantLat, state.activeJob.merchantLng], {
            icon: L.divIcon({
                className: 'custom-pin',
                html: '<div style="background:#22c55e;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)">🏪</div>',
                iconSize: [32, 32], iconAnchor: [16, 16]
            })
        }).addTo(driverMap).bindPopup(state.activeJob.merchantName);
    }

    // Customer marker
    if (!customerMarker && state.activeJob.deliveryLat) {
        customerMarker = L.marker([state.activeJob.deliveryLat, state.activeJob.deliveryLng], {
            icon: L.divIcon({
                className: 'custom-pin',
                html: '<div style="background:#e85d2a;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)">🏠</div>',
                iconSize: [32, 32], iconAnchor: [16, 16]
            })
        }).addTo(driverMap).bindPopup('Customer');
    }

    // Driver marker
    if (!driverMarker) {
        driverMarker = L.marker(KAGISO_CENTER, {
            icon: L.divIcon({
                className: 'custom-pin',
                html: '<div style="background:#1a1a1a;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid white;box-shadow:0 2px 12px rgba(0,0,0,0.5)">🛵</div>',
                iconSize: [36, 36], iconAnchor: [18, 18]
            })
        }).addTo(driverMap);
    }

    // Fit bounds
    const bounds = [];
    if (merchantMarker) bounds.push(merchantMarker.getLatLng());
    if (customerMarker) bounds.push(customerMarker.getLatLng());
    if (bounds.length >= 1) {
        bounds.push(driverMarker.getLatLng());
        driverMap.fitBounds(L.latLngBounds(bounds).pad(0.3));
    }
}

function renderActiveJob() {
    const j = state.activeJob;
    if (!j) return;

    document.getElementById('jobMerchant').textContent = j.merchantName;
    document.getElementById('jobEarning').textContent = `R${DRIVER_EARNING_PER_DELIVERY.toFixed(2)}`;

    const pickupBtn = document.getElementById('btnPickup');
    const deliverBtn = document.getElementById('btnDeliver');
    const navBtn = document.getElementById('navBtn');
    const customerRow = document.getElementById('customerInfoRow');
    const stepLabel = document.getElementById('jobStepLabel');

    if (j.status === 'Assigned' || j.status === 'Preparing') {
        stepLabel.textContent = 'PICKUP FROM';
        document.getElementById('jobAddress').textContent = j.merchantName;
        pickupBtn.classList.remove('hidden');
        deliverBtn.classList.add('hidden');
        customerRow.classList.add('hidden');

        // Navigation to merchant
        navBtn.classList.remove('hidden');
        navBtn.href = `https://www.google.com/maps/dir/?api=1&destination=${j.merchantLat},${j.merchantLng}&travelmode=driving`;
    } else if (j.status === 'PickedUp' || j.status === 'OutForDelivery') {
        stepLabel.textContent = 'DELIVER TO';
        document.getElementById('jobAddress').textContent = j.deliveryAddress;
        pickupBtn.classList.add('hidden');
        deliverBtn.classList.remove('hidden');

        // Show customer info
        customerRow.classList.remove('hidden');
        document.getElementById('jobCustomer').textContent = j.customerName;
        if (j.customerPhone) {
            document.getElementById('callCustomerBtn').href = `tel:${j.customerPhone}`;
        }

        // Navigation to customer
        navBtn.classList.remove('hidden');
        navBtn.href = `https://www.google.com/maps/dir/?api=1&destination=${j.deliveryLat},${j.deliveryLng}&travelmode=driving`;
    }
}

// ─── WORKFLOW ───
async function confirmPickup() {
    await updateOrderStatus('PickedUp');
}

async function confirmDelivery() {
    await updateOrderStatus('Delivered');
}

async function updateOrderStatus(newStatus) {
    const btn = newStatus === 'PickedUp' ? document.getElementById('btnPickup') : document.getElementById('btnDeliver');
    btn.disabled = true;
    btn.textContent = 'Updating...';

    try {
        const res = await fetch(`${API_URL}/Order/${state.activeJob.orderId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.authToken}`
            },
            body: JSON.stringify({ status: newStatus })
        });

        if (!res.ok) throw new Error('Update failed');

        if (newStatus === 'Delivered') {
            completeDelivery();
        } else {
            state.activeJob.status = newStatus;
            localStorage.setItem('ew_active_job', JSON.stringify(state.activeJob));
            renderActiveJob();
            showToast('Order picked up — head to customer');
        }
    } catch (e) {
        showToast(e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = newStatus === 'PickedUp' ? '✓ Confirm Pickup' : '✓ Confirm Delivery';
    }
}

function completeDelivery() {
    state.earningsToday += DRIVER_EARNING_PER_DELIVERY;
    state.completedToday++;

    document.getElementById('earningsToday').textContent = `R${state.earningsToday.toFixed(2)}`;

    showToast('🎉 Delivery complete! R' + DRIVER_EARNING_PER_DELIVERY.toFixed(2) + ' earned');

    state.activeJob = null;
    localStorage.removeItem('ew_active_job');

    // Clear map markers
    if (merchantMarker && driverMap) { driverMap.removeLayer(merchantMarker); merchantMarker = null; }
    if (customerMarker && driverMap) { driverMap.removeLayer(customerMarker); customerMarker = null; }

    setTimeout(() => {
        switchView('available', document.querySelector('.nav-item[data-view="available"]'));
    }, 1500);
}

// ─── HISTORY ───
async function loadHistory() {
    try {
        const res = await fetch(`${API_URL}/Order`, {
            headers: { 'Authorization': `Bearer ${state.authToken}` }
        });
        if (!res.ok) return;
        const orders = await res.json();
        const completed = orders.filter(o => o.status === 'Delivered');

        const list = document.getElementById('historyList');
        const empty = document.getElementById('emptyHistory');

        if (completed.length === 0) {
            list.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }

        empty.classList.add('hidden');
        list.innerHTML = completed.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)).map(o => {
            const date = new Date(o.updatedAt || o.createdAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
            return `
                <div class="history-card">
                    <div class="history-card-top">
                        <h4>${o.merchant?.name || 'Restaurant'} → ${o.deliveryAddress?.split(',')[0] || 'Customer'}</h4>
                        <strong>R${DRIVER_EARNING_PER_DELIVERY.toFixed(2)}</strong>
                    </div>
                    <p>${date} • Order #${o.id}</p>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Load history failed:', e);
    }
}

// ─── UTILITIES ───
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2500);
}

function logout() {
    localStorage.removeItem('ew_driver_token');
    localStorage.removeItem('ew_driver_name');
    localStorage.removeItem('ew_active_job');
    if (watchId) navigator.geolocation.clearWatch(watchId);
    if (hubConnection) hubConnection.stop();
    location.reload();
}

// ─── BOOT ───
init();
