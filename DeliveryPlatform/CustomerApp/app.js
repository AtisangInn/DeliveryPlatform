const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:5000/api' 
    : 'https://delivery-platform-api.onrender.com/api'; // Replace with your actual Render URL

let authToken = localStorage.getItem('nexus_cust_token');
let userName = localStorage.getItem('nexus_cust_name');
let hubConnection = null;
let customerMap = null;
let driverMarker = null;
let storeMarker = null;
const KAGISO_COORDS = [-26.17, 27.78];

// Cart State
let cart = []; // Array of { id, name, price, qty }

// DOM
const loginForm = document.getElementById('loginForm');
const merchantList = document.getElementById('merchantList');
const menuItemsList = document.getElementById('menuItemsList');

// Switch logic
function switchView(viewId, navElement = null) {
    document.querySelectorAll('.view').forEach(v => {
        if(v.id !== 'view-login') v.classList.add('hidden');
    });
    
    document.getElementById(`view-${viewId}`).classList.remove('hidden');
    
    // Handle nav highlight if clicked from bottom bar
    if(navElement) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        navElement.classList.add('active');
    }
    
    if (viewId === 'home') loadMerchants();
    if (viewId === 'cart') renderCart();
    if (viewId === 'orders') loadOrders();
}

// Initialization
function init() {
    if (authToken) {
        document.getElementById('view-login').classList.add('hidden');
        document.getElementById('app-content').classList.remove('hidden');
        document.getElementById('userNameDisplay').textContent = userName || 'Customer';
        loadMerchants();
        connectSignalR();
    }
}

async function connectSignalR() {
    if (!authToken) return;
    
    const hubUrl = API_URL.replace('/api', '/orderhub');
    
    hubConnection = new signalR.HubConnectionBuilder()
        .withUrl(hubUrl, {
            accessTokenFactory: () => authToken
        })
        .withAutomaticReconnect()
        .build();

    hubConnection.on("StatusUpdated", (data) => {
        console.log("Order Status Update:", data);
        // If we are currently on the orders view, reload them
        const ordersView = document.getElementById('view-orders');
        if (!ordersView.classList.contains('hidden')) {
            loadOrders();
        }
        
        // Push notification simulation
        alert(`Order #${data.orderId} updated to: ${data.status}`);
    });

    hubConnection.on("DriverLocationUpdated", (data) => {
        console.log("DRIVER MOVE:", data);
        updateDriverMarker(data.lat, data.lng);
    });

    try {
        await hubConnection.start();
        console.log("Customer SignalR Connected!");
    } catch (err) {
        console.error("Customer SignalR Connection Error: ", err);
    }
}

// Authentication
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const btn = document.getElementById('loginBtn');
        btn.textContent = 'Verifying...';
        
        try {
            const response = await fetch(`${API_URL}/Auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            
            if (!response.ok) throw new Error('Invalid credentials');
            const data = await response.json();
            
            authToken = data.token;
            userName = data.fullName;
            localStorage.setItem('nexus_cust_token', authToken);
            localStorage.setItem('nexus_cust_name', userName);
            
            document.getElementById('view-login').classList.add('hidden');
            document.getElementById('app-content').classList.remove('hidden');
            document.getElementById('userNameDisplay').textContent = userName;
            loadMerchants();
        } catch (err) {
            alert(err.message);
        } finally {
            btn.textContent = 'Sign In';
        }
    });
}

function logout() {
    localStorage.removeItem('nexus_cust_token');
    localStorage.removeItem('nexus_cust_name');
    authToken = null;
    document.getElementById('view-login').classList.remove('hidden');
    document.getElementById('app-content').classList.add('hidden');
}

async function apiGet(endpoint) {
    const res = await fetch(`${API_URL}/${endpoint}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if(res.status === 401) logout();
    return await res.json();
}

// Data Loading
async function loadMerchants() {
    try {
        const merchants = await apiGet('Merchant');
        let html = '';
        merchants.forEach(m => {
            html += `
                <div class="merchant-card" onclick="openMerchant(${m.id})">
                    <div class="m-img">🍔</div>
                    <div>
                        <h3 style="color: var(--text-dark); margin-bottom: 0.25rem;">${m.name}</h3>
                        <p style="font-size: 0.8rem;">${m.category} • 15-25 min</p>
                    </div>
                </div>
            `;
        });
        merchantList.innerHTML = html || '<p>No merchants online.</p>';
    } catch {
        merchantList.innerHTML = '<p>Error fetching data.</p>';
    }
}

async function loadOrders() {
    const ordersContainer = document.getElementById('view-orders');
    ordersContainer.innerHTML = '<h1>Your Orders</h1><p style="text-align: center; margin-top: 2rem;">Loading...</p>';

    try {
        const orders = await apiGet('Order');
        renderOrders(orders);
    } catch (e) {
        ordersContainer.innerHTML = '<h1>Your Orders</h1><p>Failed to load orders.</p>';
    }
}

function renderOrders(orders) {
    const ordersContainer = document.getElementById('view-orders');
    let html = '<h1>Your Orders</h1>';
    
    if (!orders || orders.length === 0) {
        html += '<p style="text-align: center; margin-top: 2rem;">No active orders.</p>';
    } else {
        orders.forEach(o => {
            let statusColor = '#6B7280'; // Muted
            if (o.status === 'Paid') statusColor = '#2563EB'; // Blue
            if (o.status === 'Assigned' || o.status === 'PickedUp') statusColor = '#F59E0B'; // Orange
            if (o.status === 'Delivered') statusColor = '#10B981'; // Green

            html += `
                <div class="merchant-card" style="cursor: default; display: block; padding: 1rem;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <h3 style="margin:0;">${o.merchant ? o.merchant.name : 'Unknown Merchant'}</h3>
                            <p style="font-size: 0.8rem; margin: 0.3rem 0;">#${o.id} • ${new Date(o.createdAt).toLocaleDateString()}</p>
                        </div>
                        <span style="background: ${statusColor}; color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 700;">
                            ${o.status.toUpperCase()}
                        </span>
                    </div>
                    <div style="margin-top: 0.8rem; border-top: 1px dashed #E5E7EB; padding-top: 0.8rem; display: flex; justify-content: space-between;">
                        <span style="font-size: 0.9rem;">Total Amount</span>
                        <strong style="color: var(--primary);">R${o.totalAmount.toFixed(2)}</strong>
                    </div>
                </div>
            `;
        });
    }
    
    ordersContainer.innerHTML = html;

    // Check if there's an active delivery to show the map
    const activeOrder = orders.find(o => o.status === 'Paid' || o.status === 'Assigned' || o.status === 'PickedUp');
    if (activeOrder) {
        document.getElementById('tracking-container').classList.remove('hidden');
        initTrackingMap(activeOrder);
    } else {
        document.getElementById('tracking-container').classList.add('hidden');
    }
}

function initTrackingMap(order) {
    if (customerMap) return; // Only init once
    
    customerMap = L.map('customer-map').setView(KAGISO_COORDS, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(customerMap);

    // 1. Store Marker
    storeMarker = L.marker([KAGISO_COORDS[0] + 0.005, KAGISO_COORDS[1] + 0.005], {
        icon: L.icon({
            iconUrl: 'https://cdn-icons-png.flaticon.com/512/610/610365.png',
            iconSize: [32, 32]
        })
    }).addTo(customerMap).bindPopup("<b>Merchant</b><br>Preparing your order...");

    // 2. Delivery Marker (Home)
    L.marker(KAGISO_COORDS, {
        icon: L.icon({
            iconUrl: 'https://cdn-icons-png.flaticon.com/512/25/25694.png',
            iconSize: [32, 32]
        })
    }).addTo(customerMap).bindPopup("<b>Your Home</b>");

    // 3. Driver Marker
    driverMarker = L.marker([KAGISO_COORDS[0] - 0.01, KAGISO_COORDS[1] - 0.01], {
        icon: L.icon({
            iconUrl: 'https://cdn-icons-png.flaticon.com/512/2964/2964514.png',
            iconSize: [40, 40]
        })
    }).addTo(customerMap).bindPopup("<b>Driver</b><br>Moving to location...");
}

function updateDriverMarker(lat, lng) {
    if (driverMarker) {
        driverMarker.setLatLng([lat, lng]);
        // Optional: Auto-pan map to follow driver
        // customerMap.panTo([lat, lng]);
    }
}

async function openMerchant(id) {
    switchView('menu');
    menuItemsList.innerHTML = '<p>Loading menu...</p>';
    
    try {
        const merchant = await apiGet(`Merchant/${id}`);
        document.getElementById('menuMerchantName').textContent = merchant.name;
        document.getElementById('menuMerchantCategory').textContent = merchant.category;
        
        let html = '';
        
        // Let's generate fake menu items if none exist, just for the simulation
        const fakeMenu = [
            { id: 101, name: 'Classic Burger', desc: 'Beef, cheese, lettuce', price: 85.00 },
            { id: 102, name: 'Large Chips', desc: 'Locally sourced potatoes', price: 35.00 },
            { id: 103, name: 'Soda Can', desc: '330ml Ice cold', price: 20.00 }
        ];

        const itemsToShow = (merchant.menuItems && merchant.menuItems.length > 0) ? merchant.menuItems : fakeMenu;

        itemsToShow.forEach(item => {
            html += `
                <div class="menu-item">
                    <div>
                        <h4 style="color: var(--text-dark); font-size: 1rem;">${item.name}</h4>
                        <p style="font-size: 0.75rem; margin-bottom: 0.5rem; max-width: 200px;">${item.desc || item.description || ''}</p>
                        <strong style="color: var(--primary);">R${item.price.toFixed(2)}</strong>
                    </div>
                    <button class="add-btn" onclick="addToCart(${item.id}, '${item.name}', ${item.price})">+</button>
                </div>
            `;
        });
        
        menuItemsList.innerHTML = html;
        
    } catch {
        menuItemsList.innerHTML = '<p>Failed to load menu.</p>';
    }
}

// Cart Logic
function addToCart(id, name, price) {
    const existing = cart.find(i => i.id === id);
    if(existing) {
        existing.qty++;
    } else {
        cart.push({ id, name, price, qty: 1 });
    }
    updateCartIcon();
    
    // Haptic feedback simulation
    if(navigator.vibrate) navigator.vibrate(50);
}

function updateCartIcon() {
    const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
    document.getElementById('cartCount').textContent = totalQty;
}

function renderCart() {
    const cartItemsList = document.getElementById('cartItemsList');
    const cartTotalBox = document.getElementById('cartTotalBox');
    const promoBox = document.getElementById('promoBox');
    
    if (cart.length === 0) {
        cartItemsList.innerHTML = '<p style="text-align: center; margin-top: 2rem;">Your cart is empty.</p>';
        cartTotalBox.style.display = 'none';
        promoBox.style.display = 'none';
        return;
    }
    
    let html = '';
    let subtotal = 0;
    
    cart.forEach(item => {
        const itemTotal = item.price * item.qty;
        subtotal += itemTotal;
        html += `
            <div class="cart-item">
                <div style="flex:1;">
                    <div style="font-weight: 500; color: var(--text-dark);">${item.qty}x ${item.name}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">Remove</div>
                </div>
                <div style="font-weight: 600; color: var(--text-dark);">R${itemTotal.toFixed(2)}</div>
            </div>
        `;
    });
    
    cartItemsList.innerHTML = html;
    
    document.getElementById('cartSubtotal').textContent = `R${subtotal.toFixed(2)}`;
    document.getElementById('cartTotal').textContent = `R${(subtotal + 20).toFixed(2)}`;
    
    cartTotalBox.style.display = 'block';
    promoBox.style.display = 'flex';
}

async function processCheckout() {
    const btn = document.getElementById('checkoutBtn');
    btn.textContent = 'Processing...';

    // Build the request matching the C# CheckoutRequest model
    const payload = {
        merchantId: 1, // Hardcoded for this milestone logic demonstration
        deliveryAddress: "123 Sandton Dr",
        items: cart.map(i => ({ menuItemId: i.id, name: i.name, quantity: i.qty, price: i.price }))
    };

    try {
        const response = await fetch(`${API_URL}/Order/checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errTxt = await response.text();
            throw new Error(`API Error: ${response.status} - ${errTxt}`);
        }
        
        const data = await response.json();
        
        // Use document.write to cleanly execute the script tag inside the HTML
        document.open();
        document.write(data.paymentHtmlForm);
        document.close();
        
    } catch (err) {
        alert(err.message);
        btn.textContent = 'Checkout & Pay';
    }
}

init();
