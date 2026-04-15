const API_URL = 'http://localhost:5000/api';
let authToken = localStorage.getItem('nexus_driver_token');
let hubConnection = null;
let currentOrderId = null;
let map = null;
let driverMarker = null;
const KAGISO_COORDS = [-26.17, 27.78];

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    btn.textContent = 'Authenticating...';
    
    try {
        const response = await fetch(`${API_URL}/Auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: document.getElementById('email').value,
                password: document.getElementById('password').value
            })
        });

        if (!response.ok) throw new Error('Invalid credentials');
        
        const data = await response.json();
        if (data.role !== 'Driver') throw new Error('Unauthorized role. Must be a Driver.');

        authToken = data.token;
        localStorage.setItem('nexus_driver_token', authToken);
        
        await initializeApp();
    } catch (err) {
        alert(err.message);
        btn.textContent = 'Go Online';
    }
});

function logout() {
    localStorage.removeItem('nexus_driver_token');
    window.location.reload();
}

function switchView(viewName, navContext) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${viewName}`).classList.remove('hidden');
    
    if (viewName === 'active') {
        setTimeout(initMap, 200); // Wait for DOM to be visible
    }

    if (navContext) {
        document.querySelectorAll('.nav-btn').forEach(n => n.classList.remove('active'));
        navContext.classList.add('active');
    }
}

async function initializeApp() {
    if (!authToken) return;
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('app-content').classList.remove('hidden');
    
    // Connect WebSockets
    await connectSignalR();
    
    // Load existing active orders (if any)
    loadAvailableOrders();
}

function initMap() {
    if (map) return;
    
    map = L.map('map').setView(KAGISO_COORDS, 14);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    // Initial Marker
    driverMarker = L.marker(KAGISO_COORDS, {
        draggable: false,
        title: "Your Location"
    }).addTo(map)
      .bindPopup("<b>You</b><br>Click map to simulate moving.")
      .openPopup();

    // -- SIMULATION MODE --
    // When the map is clicked, move the driver icon and tell the backend
    map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        moveDriver(lat, lng);
    });
}

async function moveDriver(lat, lng) {
    if (!driverMarker) return;
    driverMarker.setLatLng([lat, lng]);
    
    // Send to SignalR
    if (hubConnection && hubConnection.state === signalR.HubConnectionState.Connected && currentOrderId) {
        console.log("Pushing Location Tracking:", { lat, lng });
        await hubConnection.invoke("UpdateDriverLocation", currentOrderId, lat, lng);
    }
}

async function connectSignalR() {
    hubConnection = new signalR.HubConnectionBuilder()
        .withUrl("http://localhost:5000/orderhub", {
            accessTokenFactory: () => authToken
        })
        .withAutomaticReconnect()
        .build();

    hubConnection.on("NewOrderAvailable", (orderConfig) => {
        console.log("INCOMING SIGNALR PING:", orderConfig);
        renderIncomingOrder(orderConfig);
    });

    try {
        await hubConnection.start();
        console.log("SignalR Connected! Listening for Orders...");
    } catch (err) {
        console.error("SignalR Connection Error: ", err);
    }
}

function renderIncomingOrder(order) {
    document.getElementById('radarAnim').classList.remove('active');
    const container = document.getElementById('availableOrdersList');
    if(container.innerHTML.includes('Waiting')) container.innerHTML = '';

    const div = document.createElement('div');
    div.className = 'card';
    div.id = `order-${order.orderId}`;
    div.innerHTML = `
        <h3>${order.merchantName}</h3>
        <p>Drop-off: ${order.deliveryAddress}</p>
        <p style="font-weight: 600; color: var(--primary); margin: 0.5rem 0;">Earnings: R20.00</p>
        <button class="primary" onclick="acceptOrder(${order.orderId}, '${order.merchantName}', '${order.deliveryAddress}', ${order.amount})">Accept Delivery</button>
    `;
    container.appendChild(div);
}

async function loadAvailableOrders() {
    try {
        const response = await fetch(`${API_URL}/Order`, { 
            headers: { 'Authorization': `Bearer ${authToken}` } 
        });
        if (response.ok) {
            const orders = await response.json();
            const container = document.getElementById('availableOrdersList');
            
            // Only show orders that are 'Paid' and have no driver assigned
            const available = orders.filter(o => o.status === 'Paid' && !o.driverId);
            
            if (available.length > 0) {
                container.innerHTML = '';
                document.getElementById('radarAnim').classList.remove('active');
                available.forEach(o => renderIncomingOrder({
                    orderId: o.id,
                    merchantName: o.merchant ? o.merchant.name : 'Unknown Merchant',
                    deliveryAddress: o.deliveryAddress,
                    amount: o.totalAmount
                }));
            }
        }
    } catch (e) { console.warn("Failed to load existing orders:", e); }
}

async function acceptOrder(id, merchant, address, amount) {
    // In Milestone 5, we assign the order via API
    try {
        const response = await fetch(`${API_URL}/Order/${id}/accept`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (!response.ok) throw new Error('Could not accept order.');
        
        document.getElementById(`order-${id}`).remove();
        
        // Setup Active View
        currentOrderId = id;
        document.getElementById('activeMerchantName').textContent = merchant;
        document.getElementById('activeAddress').textContent = address;
        document.getElementById('activeAmount').textContent = `Total Order: R${amount.toFixed(2)}`;
        
        document.getElementById('btnPickupOrder').classList.remove('hidden');
        document.getElementById('btnDeliverOrder').classList.add('hidden');
        
        switchView('active', document.querySelectorAll('.nav-btn')[1]);
        
    } catch (err) { alert(err.message); }
}

async function updateOrderStatus(newStatus) {
    try {
        const response = await fetch(`${API_URL}/Order/${currentOrderId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (!response.ok) throw new Error('Update failed');
        
        if (newStatus === 'PickedUp') {
            document.getElementById('btnPickupOrder').classList.add('hidden');
            document.getElementById('btnDeliverOrder').classList.remove('hidden');
        } else if (newStatus === 'Delivered') {
            alert('Delivery Complete! R20.00 added to your earnings.');
            currentOrderId = null;
            switchView('home', document.querySelectorAll('.nav-btn')[0]);
            document.getElementById('radarAnim').classList.add('active');
        }
        
    } catch(err) { alert(err.message); }
}

// Auto-login check
if (authToken) { initializeApp(); }
