/* ============================================
   EASYWAY ADMIN DASHBOARD — JavaScript
   Full CRUD, live map, SignalR events
   ============================================ */

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : 'https://deliveryplatform.onrender.com/api';

const KAGISO_CENTER = [-26.155, 27.778];

// ─── STATE ───
let state = {
    authToken: localStorage.getItem('ew_admin_token'),
    adminName: localStorage.getItem('ew_admin_name'),
    merchants: [],
    orders: [],
    drivers: [],
    feed: [],
    mapMarkers: { merchants: {}, drivers: {}, customers: {} },
    orderFilter: 'all'
};

let hubConnection = null;
let adminMap = null;
let adminMerchantPickerMap = null;

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
    document.getElementById('appShell').classList.add('hidden');
}

function showApp() {
    document.getElementById('authScreen').classList.remove('active-screen');
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appShell').classList.remove('hidden');

    initMap();
    connectHub();
    refreshAll();
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

        if (data.role && data.role !== 'Admin') {
            throw new Error('Admin access required');
        }

        state.authToken = data.token;
        state.adminName = data.fullName;
        localStorage.setItem('ew_admin_token', data.token);
        localStorage.setItem('ew_admin_name', data.fullName);

        showApp();
    } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
}

// ─── NAVIGATION ───
function switchPage(pageId, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active-page'));
    document.getElementById('page' + pageId.charAt(0).toUpperCase() + pageId.slice(1))?.classList.add('active-page');

    document.querySelectorAll('.sidebar-link').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    if (pageId === 'orders') renderOrders();
    if (pageId === 'merchants') renderMerchants();
    if (pageId === 'drivers') renderDrivers();
    if (pageId === 'dashboard') { renderKPIs(); updateMapPoints(); }
}

// ─── DATA LOADING ───
async function refreshAll() {
    try {
        const [merchants, orders] = await Promise.all([
            apiGet('Merchant'),
            apiGet('Order')
        ]);
        state.merchants = merchants || [];
        state.orders = orders || [];
        renderKPIs();
        updateMapPoints();
        logEvent('Dashboard synced');
    } catch (e) {
        console.error('Refresh failed:', e);
        logEvent('Sync error: ' + e.message);
    }
}

async function apiGet(endpoint) {
    const res = await fetch(`${API_URL}/${endpoint}`, {
        headers: { 'Authorization': `Bearer ${state.authToken}` }
    });
    if (res.status === 401) return logout();
    return await res.json();
}

async function apiPost(endpoint, body) {
    const res = await fetch(`${API_URL}/${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.authToken}`
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || 'Request failed');
    }
    return res;
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

    hubConnection.on('StatusUpdated', (data) => {
        logEvent(`Order #${data.orderId} → ${data.status}`);
        refreshAll();
    });

    hubConnection.on('NewOrderAvailable', (data) => {
        logEvent(`🆕 New order from ${data.merchantName || 'restaurant'}`);
        refreshAll();
    });

    hubConnection.on('DriverLocationUpdated', (data) => {
        updateDriverMapMarker(data);
    });

    hubConnection.onreconnecting(() => {
        document.getElementById('hubStatus').textContent = 'Reconnecting...';
    });

    hubConnection.onreconnected(() => {
        document.getElementById('hubStatus').textContent = 'Live';
        logEvent('Connection restored');
    });

    try {
        await hubConnection.start();
        document.getElementById('hubStatus').textContent = 'Live';
        logEvent('Real-time connection established');
    } catch (e) {
        document.getElementById('hubStatus').textContent = 'Offline';
        logEvent('Connection failed');
        console.error('Hub error:', e);
    }
}

// ─── MAP ───
function initMap() {
    if (adminMap) return;
    adminMap = L.map('adminMap', { zoomControl: false }).setView(KAGISO_CENTER, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(adminMap);

    setTimeout(() => adminMap.invalidateSize(), 300);
}

function updateMapPoints() {
    if (!adminMap) return;

    // Merchants
    state.merchants.forEach(m => {
        if (!state.mapMarkers.merchants[m.id] && m.latitude && m.longitude) {
            state.mapMarkers.merchants[m.id] = L.marker([m.latitude, m.longitude], {
                icon: L.divIcon({
                    className: 'map-pin',
                    html: '<div style="background:#22c55e;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">🏪</div>',
                    iconSize: [28, 28], iconAnchor: [14, 14]
                })
            }).addTo(adminMap).bindPopup(`<b>${m.name}</b><br>${m.category}`);
        }
    });

    // Active order customers
    state.orders.forEach(o => {
        const isSettled = ['Delivered', 'PaymentFailed', 'Cancelled'].includes(o.status);

        if (isSettled) {
            // Prune if exists
            if (state.mapMarkers.customers[o.id]) {
                adminMap.removeLayer(state.mapMarkers.customers[o.id]);
                delete state.mapMarkers.customers[o.id];
            }
            if (state.mapMarkers.drivers[o.id]) {
                adminMap.removeLayer(state.mapMarkers.drivers[o.id]);
                delete state.mapMarkers.drivers[o.id];
            }
        } else {
            // Add or keep active
            if (!state.mapMarkers.customers[o.id] && o.deliveryLatitude && o.deliveryLongitude) {
                state.mapMarkers.customers[o.id] = L.marker([o.deliveryLatitude, o.deliveryLongitude], {
                    icon: L.divIcon({
                        className: 'map-pin',
                        html: '<div style="background:#ff6b2c;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">🏠</div>',
                        iconSize: [24, 24], iconAnchor: [12, 12]
                    })
                }).addTo(adminMap).bindPopup(`Order #${o.id}<br>${o.deliveryAddress || ''}`);
            }
        }
    });
}

function updateDriverMapMarker(data) {
    const { orderId, lat, lng } = data;
    if (!adminMap) return;

    if (!state.mapMarkers.drivers[orderId]) {
        state.mapMarkers.drivers[orderId] = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'map-pin',
                html: '<div style="background:#1a1a1a;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4)">🛵</div>',
                iconSize: [30, 30], iconAnchor: [15, 15]
            })
        }).addTo(adminMap).bindPopup(`Driver (Order #${orderId})`);
    } else {
        state.mapMarkers.drivers[orderId].setLatLng([lat, lng]);
    }
}

function clearSettledMapPins() {
    updateMapPoints(); // Running this now auto-prunes
    showToast('Map cleaned of settled deliveries');
}

// ─── KPIs ───
function renderKPIs() {
    const delivered = state.orders.filter(o => o.status === 'Delivered');
    const active = state.orders.filter(o => !['Delivered', 'PaymentFailed', 'Cancelled', 'Pending'].includes(o.status));
    const revenue = delivered.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    document.getElementById('kpiRevenue').textContent = `R${revenue.toFixed(2)}`;
    document.getElementById('kpiActiveOrders').textContent = active.length;
    document.getElementById('kpiCompleted').textContent = delivered.length;
    document.getElementById('kpiDrivers').textContent = state.merchants.length; // placeholder
}

// ─── ORDERS PAGE ───
function filterOrders(status, btn) {
    state.orderFilter = status;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderOrders();
}

function renderOrders() {
    const container = document.getElementById('ordersTable');
    let filtered = state.orders;

    if (state.orderFilter !== 'all') {
        filtered = filtered.filter(o => o.status === state.orderFilter);
    }

    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (filtered.length === 0) {
        container.innerHTML = '<div class="feed-empty" style="padding:3rem;">No orders found</div>';
        return;
    }

    container.innerHTML = filtered.map(o => {
        const statusClass = 'status-' + o.status.toLowerCase();
        const date = new Date(o.createdAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        return `
            <div class="table-row">
                <span class="table-id">#${o.id}</span>
                <div class="table-cell">
                    <h4>${o.merchant?.name || 'Restaurant'}</h4>
                    <p>${o.deliveryAddress ? o.deliveryAddress.split(',').slice(0, 2).join(',') : 'N/A'}</p>
                </div>
                <div class="table-cell">
                    <h4>${o.customer?.fullName || 'Customer'}</h4>
                    <p>${date}</p>
                </div>
                <div class="table-cell">
                    <span class="status-badge ${statusClass}">${o.status}</span>
                </div>
                <span class="table-amount">R${(o.totalAmount || 0).toFixed(2)}</span>
            </div>
        `;
    }).join('');
}

// ─── MERCHANTS PAGE ───
function renderMerchants() {
    const grid = document.getElementById('merchantsGrid');

    if (state.merchants.length === 0) {
        grid.innerHTML = '<div class="feed-empty" style="padding:3rem;">No merchants yet. Add your first!</div>';
        return;
    }

    grid.innerHTML = state.merchants.map(m => `
        <div class="merchant-admin-card">
            <div class="merchant-admin-top">
                <h3>${m.name}</h3>
                <span class="merchant-status ${m.isActive ? 'active' : 'inactive'}">${m.isActive ? 'Active' : 'Inactive'}</span>
            </div>
            <div class="merchant-admin-meta">
                <span>📂 ${m.category}</span>
                <span>📍 ${m.address}</span>
                <span>💰 ${m.commissionPercentage}% commission</span>
            </div>
            <div class="merchant-admin-actions">
                <button class="btn-sm" onclick="openMenuModal(${m.id})">📋 Menu Items</button>
                <button class="btn-sm" onclick="toggleMerchant(${m.id}, ${!m.isActive})">${m.isActive ? '⏸️ Pause' : '▶️ Activate'}</button>
            </div>
        </div>
    `).join('');
}

async function handleAddMerchant(e) {
    e.preventDefault();

    const name = document.getElementById('m_name').value.trim();
    const address = document.getElementById('m_address').value.trim();
    const category = document.getElementById('m_category').value;
    const commission = parseFloat(document.getElementById('m_commission').value) || 10;

    let lat = KAGISO_CENTER[0];
    let lng = KAGISO_CENTER[1];

    if (adminMerchantPickerMap) {
        const center = adminMerchantPickerMap.getCenter();
        lat = center.lat;
        lng = center.lng;
    }

    const payload = {
        name,
        category,
        address,
        latitude: lat,
        longitude: lng,
        commissionPercentage: commission,
        isActive: true
    };

    try {
        await apiPost('Merchant', payload);
        closeModal('merchantModal');
        showToast('Merchant added successfully');
        state.merchants = await apiGet('Merchant');
        renderMerchants();
        updateMapPoints();
        document.getElementById('merchantForm').reset();
    } catch (e) {
        showToast('Error: ' + e.message);
    }
}

async function toggleMerchant(id, newStatus) {
    try {
        const merchant = state.merchants.find(m => m.id === id);
        if (!merchant) return;
        merchant.isActive = newStatus;

        await fetch(`${API_URL}/Merchant/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.authToken}`
            },
            body: JSON.stringify(merchant)
        });

        showToast(`${merchant.name} ${newStatus ? 'activated' : 'paused'}`);
        state.merchants = await apiGet('Merchant');
        renderMerchants();
    } catch (e) {
        showToast('Error updating merchant');
    }
}

// ─── MENU ITEM MANAGEMENT ───
let currentMenuMerchantId = null;

async function openMenuModal(merchantId) {
    currentMenuMerchantId = merchantId;
    document.getElementById('mi_merchantId').value = merchantId;

    const merchant = state.merchants.find(m => m.id === merchantId);
    document.getElementById('menuModalTitle').textContent = `Menu — ${merchant?.name || 'Merchant'}`;

    // Fetch full merchant with items
    try {
        const res = await fetch(`${API_URL}/Merchant/${merchantId}`, {
            headers: { 'Authorization': `Bearer ${state.authToken}` }
        });
        const full = await res.json();
        renderMenuItems(full.menuItems || []);
    } catch (e) {
        renderMenuItems([]);
    }

    openModal('menuModal');
}

function renderMenuItems(items) {
    const list = document.getElementById('menuItemsList');
    if (items.length === 0) {
        list.innerHTML = '<div class="feed-empty" style="padding:1rem;">No menu items yet</div>';
        return;
    }

    list.innerHTML = items.map(item => `
        <div class="menu-admin-item">
            <div class="menu-admin-left">
                <div class="menu-admin-img">
                    ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.name}">` : '🍔'}
                </div>
                <div>
                    <strong>${item.name}</strong>
                    <span class="item-cat"> • ${item.category || 'Uncategorized'}</span>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:0.75rem;">
                <span class="item-price">R${item.price.toFixed(2)}</span>
                <button class="edit-btn" onclick="editMenuItem(${item.id})">✎</button>
                <button class="delete-btn" onclick="deleteMenuItem(${item.id})">✕</button>
            </div>
        </div>
    `).join('');
}

function resetMenuItemForm() {
    document.getElementById('menuItemForm').reset();
    document.getElementById('mi_id').value = '';
    document.getElementById('mi_submitBtn').textContent = 'Add Item';
    document.getElementById('mi_cancelEdit').style.display = 'none';
}

function editMenuItem(itemId) {
    const merchant = state.merchants.find(m => m.id === currentMenuMerchantId);
    if (!merchant) return;
    const item = merchant.menuItems.find(i => i.id === itemId);
    if (!item) return;

    document.getElementById('mi_id').value = item.id;
    document.getElementById('mi_name').value = item.name;
    document.getElementById('mi_price').value = item.price;
    document.getElementById('mi_category').value = item.category || '';
    document.getElementById('mi_desc').value = item.description || '';
    document.getElementById('mi_imageUrl').value = item.imageUrl || '';

    document.getElementById('mi_submitBtn').textContent = 'Update Item';
    document.getElementById('mi_cancelEdit').style.display = 'inline-block';
    
    // Scroll to form
    document.getElementById('menuItemForm').scrollIntoView({ behavior: 'smooth' });
}

async function handleSaveMenuItem(e) {
    e.preventDefault();
    const merchantId = parseInt(document.getElementById('mi_merchantId').value);
    const itemId = document.getElementById('mi_id').value;

    const payload = {
        id: itemId ? parseInt(itemId) : 0,
        merchantId,
        name: document.getElementById('mi_name').value.trim(),
        price: parseFloat(document.getElementById('mi_price').value),
        category: document.getElementById('mi_category').value.trim() || 'General',
        description: document.getElementById('mi_desc').value.trim(),
        imageUrl: document.getElementById('mi_imageUrl').value.trim(),
        isAvailable: true
    };

    try {
        if (itemId) {
            // Update
            await fetch(`${API_URL}/Merchant/${merchantId}/menu/${itemId}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.authToken}` 
                },
                body: JSON.stringify(payload)
            });
            showToast('Menu item updated');
        } else {
            // Create
            await apiPost(`Merchant/${merchantId}/menu`, payload);
            showToast('Menu item added');
        }
        
        resetMenuItemForm();
        document.getElementById('mi_merchantId').value = merchantId;
        
        // Refresh merchant data to get updated menu
        const mRes = await fetch(`${API_URL}/Merchant/${merchantId}`, {
            headers: { 'Authorization': `Bearer ${state.authToken}` }
        });
        if (mRes.ok) {
            const updatedMerchant = await mRes.json();
            const idx = state.merchants.findIndex(m => m.id === merchantId);
            if (idx !== -1) state.merchants[idx] = updatedMerchant;
            renderMenuItems(updatedMerchant.menuItems || []);
        }
    } catch (e) {
        showToast('Error: ' + e.message);
    }
}

async function deleteMenuItem(itemId) {
    if (!confirm('Remove this menu item?')) return;
    try {
        await fetch(`${API_URL}/Merchant/${currentMenuMerchantId}/menu/${itemId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${state.authToken}` }
        });
        showToast('Item removed');
        openMenuModal(currentMenuMerchantId);
    } catch (e) {
        showToast('Error removing item');
    }
}

// ─── DRIVERS PAGE ───
function renderDrivers() {
    // We'll load drivers from the orders data (drivers who've accepted orders) 
    // and any we can fetch. For now show from orders.
    const driverMap = {};
    state.orders.forEach(o => {
        if (o.driver && !driverMap[o.driver.id]) {
            driverMap[o.driver.id] = o.driver;
        }
    });

    const drivers = Object.values(driverMap);
    const grid = document.getElementById('driversGrid');

    if (drivers.length === 0) {
        grid.innerHTML = '<div class="feed-empty" style="padding:3rem;">No drivers registered yet. Use the button above to add one.</div>';
        return;
    }

    grid.innerHTML = drivers.map(d => `
        <div class="driver-admin-card">
            <div class="driver-admin-top">
                <div class="driver-admin-avatar">🛵</div>
                <div class="driver-admin-name">
                    <h3>${d.fullName || 'Driver'}</h3>
                    <span>${d.email || ''}</span>
                </div>
            </div>
            <div class="driver-admin-meta">
                <span>📱 ${d.phone || 'N/A'}</span>
            </div>
        </div>
    `).join('');
}

async function handleAddDriver(e) {
    e.preventDefault();

    const payload = {
        fullName: document.getElementById('d_name').value.trim(),
        email: document.getElementById('d_email').value.trim(),
        password: document.getElementById('d_password').value,
        phone: document.getElementById('d_phone').value.trim(),
        role: 'Driver'
    };

    try {
        await apiPost('Auth/register', payload);
        showToast('Driver registered successfully');
        closeModal('driverModal');
        document.getElementById('driverForm').reset();
        logEvent(`New driver: ${payload.fullName}`);
    } catch (e) {
        showToast('Error: ' + e.message);
    }
}

// ─── ACTIVITY FEED ───
function logEvent(msg) {
    const time = new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    state.feed.unshift({ time, msg });
    if (state.feed.length > 50) state.feed.pop();
    renderFeed();
}

function renderFeed() {
    const container = document.getElementById('eventFeed');
    if (state.feed.length === 0) {
        container.innerHTML = '<div class="feed-empty">No activity yet</div>';
        return;
    }

    container.innerHTML = state.feed.map(f => `
        <div class="feed-item">
            <span class="feed-time">${f.time}</span>
            <span class="feed-msg">${f.msg}</span>
        </div>
    `).join('');
}

// ─── MODALS ───
function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
    
    if (id === 'merchantModal') {
        if (!adminMerchantPickerMap) {
            adminMerchantPickerMap = L.map('adminMerchantMap', { zoomControl: false }).setView(KAGISO_CENTER, 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }).addTo(adminMerchantPickerMap);
        }
        setTimeout(() => adminMerchantPickerMap.invalidateSize(), 200);
    }
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

// ─── UTILITIES ───
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function logout() {
    localStorage.removeItem('ew_admin_token');
    localStorage.removeItem('ew_admin_name');
    if (hubConnection) hubConnection.stop();
    location.reload();
}

// ─── BOOT ───
init();
