/* ============================================
   EASYWAY DELIVERIES — CUSTOMER APP
   Production-ready JavaScript
   ============================================ */

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : 'https://deliveryplatform.onrender.com/api';

const DELIVERY_FEE = 35.00;
const KAGISO_CENTER = [-26.155, 27.778];

// ─── STATE ───
let state = {
    authToken: localStorage.getItem('ew_token'),
    userName: localStorage.getItem('ew_name'),
    isRegister: false,
    merchants: [],
    selectedMerchant: null,
    cart: JSON.parse(localStorage.getItem('ew_cart') || '[]'),
    deliveryAddress: localStorage.getItem('ew_address') || '',
    deliveryLat: parseFloat(localStorage.getItem('ew_lat')) || null,
    deliveryLng: parseFloat(localStorage.getItem('ew_lng')) || null,
    activeOrder: null,
    driverInfo: null,
    markers: { merchant: null, customer: null, driver: null }
};

let hubConnection = null;
let trackingMap = null;
let addressTimer = null;
let locationPickerMapInstance = null;
let deferredPrompt = null;

// ─── PWA INSTALL LOGIC ───
window.addEventListener('beforeinstallprompt', (e) => {
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Show the install button in the account view
    const installContainer = document.getElementById('installContainer');
    if (installContainer) {
        installContainer.classList.remove('hidden');
    }
});

async function installApp() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isAndroid = /Android/i.test(navigator.userAgent);
    
    // Open the visual guide modal
    document.getElementById('installModal').classList.remove('hidden');
    
    if (isIOS) {
        document.getElementById('iosGuide').classList.remove('hidden');
        document.getElementById('androidGuide').classList.add('hidden');
        document.getElementById('pwaDirectBtn').classList.add('hidden');
    } else {
        // Default to Android/Chrome guide
        document.getElementById('androidGuide').classList.remove('hidden');
        document.getElementById('iosGuide').classList.add('hidden');
        // If native prompt is available, show the direct button too
        if (deferredPrompt) {
            document.getElementById('pwaDirectBtn').classList.remove('hidden');
        } else {
            document.getElementById('pwaDirectBtn').classList.add('hidden');
        }
    }
}

async function triggerNativeInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    closeInstallModal();
}

function closeInstallModal() {
    document.getElementById('installModal').classList.add('hidden');
}

window.addEventListener('appinstalled', (evt) => {
    console.log('Easyway was installed.');
    showToast('Success! Easyway is now on your home screen.');
});

// ─── INIT ───
function init() {
    if (state.authToken) {
        showApp();
    } else {
        showAuth();
    }
    setupAuthListeners();

    // Check for payment redirect params
    const params = new URLSearchParams(window.location.search);
    if (params.get('status') === 'success') {
        showToast('Payment successful!');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('status') === 'cancel') {
        showToast('Payment cancelled');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
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

    if (state.deliveryAddress) {
        document.getElementById('headerAddress').textContent = state.deliveryAddress.split(',')[0];
    } else if (navigator.geolocation) {
        // Auto-fetch location if missing
        navigator.geolocation.getCurrentPosition(async (pos) => {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
                const data = await res.json();
                if (data && data.display_name) {
                    selectAddress(data.display_name, pos.coords.latitude, pos.coords.longitude);
                }
            } catch (e) { console.error('Auto-location error:', e); }
        }, () => {}, { timeout: 10000 });
    }

    document.getElementById('addressPickerBtn').addEventListener('click', openAddressModal);

    loadMerchants();
    connectHub();
    checkActiveOrders();
}

// ─── AUTH ───
function setupAuthListeners() {
    document.getElementById('loginForm').addEventListener('submit', handleAuth);
    document.getElementById('toggleAuth').addEventListener('click', (e) => {
        e.preventDefault();
        state.isRegister = !state.isRegister;
        const fields = document.getElementById('registerFields');
        const btn = document.getElementById('authBtn');
        const title = document.getElementById('authTitle');
        const subtitle = document.getElementById('authSubtitle');
        const toggleLabel = document.getElementById('toggleLabel');
        const toggleLink = document.getElementById('toggleAuth');

        if (state.isRegister) {
            fields.classList.add('show');
            fields.classList.remove('hidden');
            btn.textContent = 'Create Account';
            title.textContent = 'Create account';
            subtitle.textContent = 'Sign up to start ordering';
            toggleLabel.textContent = 'Already have an account?';
            toggleLink.textContent = 'Sign In';
        } else {
            fields.classList.remove('show');
            setTimeout(() => fields.classList.add('hidden'), 400);
            btn.textContent = 'Sign In';
            title.textContent = 'Welcome back';
            subtitle.textContent = 'Sign in to start ordering';
            toggleLabel.textContent = "Don't have an account?";
            toggleLink.textContent = 'Create Account';
        }
        document.getElementById('authError').classList.add('hidden');
    });
}

async function handleAuth(e) {
    e.preventDefault();
    const btn = document.getElementById('authBtn');
    const errEl = document.getElementById('authError');
    errEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = state.isRegister ? 'Creating...' : 'Signing in...';

    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;

    try {
        if (state.isRegister) {
            const name = document.getElementById('regName').value.trim();
            const phone = document.getElementById('regPhone').value.trim();
            if (!name || !phone) throw new Error('Please fill in all fields');

            const regRes = await fetch(`${API_URL}/Auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullName: name, email, password, phone, role: 'Customer' })
            });
            if (!regRes.ok) {
                const msg = await regRes.text();
                throw new Error(msg || 'Registration failed');
            }
        }

        // Login
        const loginRes = await fetch(`${API_URL}/Auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (!loginRes.ok) throw new Error('Invalid email or password');
        const data = await loginRes.json();

        state.authToken = data.token;
        state.userName = data.fullName;
        localStorage.setItem('ew_token', data.token);
        localStorage.setItem('ew_name', data.fullName);

        showApp();
    } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = state.isRegister ? 'Create Account' : 'Sign In';
    }
}

// ─── NAVIGATION ───
function navigateTo(viewId, btn) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
    const target = document.getElementById('view' + viewId.charAt(0).toUpperCase() + viewId.slice(1));
    if (target) target.classList.add('active-view');

    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    if (viewId === 'home') loadMerchants();
    if (viewId === 'orders') loadOrders();
    if (viewId === 'tracking') initTracking();
    if (viewId === 'account') loadProfile();

    // Header and footer are now always visible
    document.getElementById('appHeader').style.display = 'flex';
    document.getElementById('bottomNav').style.display = 'flex';
}

function loadProfile() {
    document.getElementById('profileName').textContent = state.userName || 'Valued Customer';
    document.getElementById('profileEmail').textContent = 'Kagiso Local';
    
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const installContainer = document.getElementById('installContainer');

    if (isStandalone) {
        installContainer.classList.add('hidden');
    } else if (isMobile) {
        // Always show on mobile to provide manual instructions at the very least
        installContainer.classList.remove('hidden');
    }
}

function goHome() {
    navigateTo('home', document.querySelector('.nav-item[data-view="home"]'));
}

// ─── MERCHANTS ───
async function loadMerchants() {
    try {
        const res = await fetch(`${API_URL}/Merchant`, {
            headers: { 'Authorization': `Bearer ${state.authToken}` }
        });
        if (res.status === 401) return logout();
        state.merchants = await res.json();

        // Load menu items for each merchant
        for (let m of state.merchants) {
            try {
                const mRes = await fetch(`${API_URL}/Merchant/${m.id}`, {
                    headers: { 'Authorization': `Bearer ${state.authToken}` }
                });
                if (mRes.ok) {
                    const full = await mRes.json();
                    m.menuItems = full.menuItems || [];
                }
            } catch (e) { m.menuItems = []; }
        }

        renderMerchants();
        renderCategories();
    } catch (e) {
        console.error('Load merchants failed:', e);
    }
}

function renderMerchants(filter = '') {
    const grid = document.getElementById('merchantGrid');
    const empty = document.getElementById('emptyMerchants');
    let filtered = state.merchants;

    if (filter) {
        const q = filter.toLowerCase();
        filtered = filtered.filter(m =>
            m.name.toLowerCase().includes(q) ||
            m.category.toLowerCase().includes(q) ||
            (m.menuItems || []).some(i => i.name.toLowerCase().includes(q))
        );
    }

    if (!grid || !empty) return;

    if (filtered.length === 0) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    grid.innerHTML = filtered.map(m => {
        const itemCount = (m.menuItems || []).length;
        const emoji = getCategoryEmoji(m.category);
        const imageHtml = m.logoUrl 
            ? `<img src="${m.logoUrl}" alt="${m.name}" class="merchant-logo-img">`
            : emoji;
            
        return `
            <div class="merchant-card" onclick="openMerchant(${m.id})">
                <div class="merchant-card-img">
                    ${imageHtml}
                    <span class="merchant-tag">${m.category}</span>
                </div>
                <div class="merchant-card-body">
                    <h3>${m.name}</h3>
                    <div class="merchant-card-meta">
                        <span>${itemCount} items</span>
                        <span class="meta-dot"></span>
                        <span>R${DELIVERY_FEE.toFixed(0)} delivery</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function getCategoryEmoji(cat) {
    const map = {
        'Fast Food': '🍔', 'Pizza': '🍕', 'African Cuisine': '🍲',
        'Drinks': '🥤', 'Desserts': '🍰', 'Coffee': '☕'
    };
    return map[cat] || '🍽️';
}

function renderCategories() {
    const cats = [...new Set(state.merchants.map(m => m.category))];
    const scroll = document.getElementById('categoryScroll');
    scroll.innerHTML = ['All', ...cats].map((c, i) => `
        <button class="cat-chip ${i === 0 ? 'active' : ''}" onclick="filterByCategory('${c}', this)">${c}</button>
    `).join('');
}

function filterByCategory(cat, btn) {
    document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    if (cat === 'All') {
        renderMerchants();
    } else {
        const grid = document.getElementById('merchantGrid');
        const empty = document.getElementById('emptyMerchants');
        const filtered = state.merchants.filter(m => m.category === cat);
        if (filtered.length === 0) {
            grid.innerHTML = '';
            empty.classList.remove('hidden');
        } else {
            empty.classList.add('hidden');
            grid.innerHTML = filtered.map(m => {
                const emoji = getCategoryEmoji(m.category);
                return `
                    <div class="merchant-card" onclick="openMerchant(${m.id})">
                        <div class="merchant-card-img">
                            ${emoji}
                            <span class="merchant-tag">${m.category}</span>
                        </div>
                        <div class="merchant-card-body">
                            <h3>${m.name}</h3>
                            <div class="merchant-card-meta">
                                <span>${(m.menuItems||[]).length} items</span>
                                <span class="meta-dot"></span>
                                <span>R${DELIVERY_FEE.toFixed(0)} delivery</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

function filterMerchants(val) {
    renderMerchants(val);
}

// ─── MENU ───
function openMerchant(id) {
    const m = state.merchants.find(x => x.id === id);
    if (!m) return;
    state.selectedMerchant = m;

    const logoHtml = m.logoUrl 
        ? `<img src="${m.logoUrl}" class="menu-merchant-logo" alt="${m.name}">`
        : '';

    document.getElementById('menuName').textContent = m.name;
    document.getElementById('menuMeta').textContent = `${m.category} • ${m.address}`;
    
    // Update banner with logo if present
    const banner = document.querySelector('.menu-merchant-banner');
    const existingLogo = banner.querySelector('.menu-merchant-logo');
    if (existingLogo) existingLogo.remove();
    if (logoHtml) banner.insertAdjacentHTML('afterbegin', logoHtml);

    const items = m.menuItems || [];
    const container = document.getElementById('menuCategories');

    if (items.length === 0) {
        container.innerHTML = `<div class="empty-state"><span class="empty-icon">🍽️</span><h3>Menu coming soon</h3><p>This restaurant is setting up their menu.</p></div>`;
    } else {
        // Group by category
        const groups = {};
        items.forEach(item => {
            const cat = item.category || 'Menu';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(item);
        });

        container.innerHTML = Object.entries(groups).map(([cat, catItems]) => `
            <h3 class="menu-category-title">${cat}</h3>
            ${catItems.filter(i => i.isAvailable).map(item => `
                <div class="menu-item">
                    <div class="menu-item-info">
                        <h4>${item.name}</h4>
                        <p class="item-desc">${item.description}</p>
                        <span class="item-price">R${item.price.toFixed(2)}</span>
                    </div>
                    <div class="menu-item-right">
                        <div class="menu-item-image">
                            ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.name}">` : '🍔'}
                        </div>
                        <button class="add-item-btn" onclick="addToCart(${item.id}, '${item.name.replace(/'/g, "\\'")}', ${item.price})">+</button>
                    </div>
                </div>
            `).join('')}
        `).join('');
    }

    navigateTo('menu', null);
    document.getElementById('viewMenu').classList.add('active-view');
}

// ─── CART ───
function addToCart(id, name, price) {
    // Prevent mixing merchants
    if (state.cart.length > 0) {
        // Find if the item belongs to the currently selected merchant
        const belongsToSelected = state.selectedMerchant && 
            state.selectedMerchant.menuItems.some(mi => mi.id === id);
            
        if (!belongsToSelected) {
            if (confirm('Your cart contains items from another restaurant. Clear cart and add this item?')) {
                state.cart = [];
            } else {
                return;
            }
        }
    }

    const existing = state.cart.find(i => i.id === id);
    if (existing) {
        existing.qty++;
    } else {
        state.cart.push({ id, name, price, qty: 1 });
    }
    updateCartBadge();
    saveCart();
    showToast(`${name} added to cart`);
}

function saveCart() {
    localStorage.setItem('ew_cart', JSON.stringify(state.cart));
}

function removeFromCart(id) {
    state.cart = state.cart.filter(i => i.id !== id);
    updateCartBadge();
    saveCart();
    renderCartSheet();
}

function changeQty(id, delta) {
    const item = state.cart.find(i => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
        state.cart = state.cart.filter(i => i.id !== id);
    }
    updateCartBadge();
    saveCart();
    renderCartSheet();
}

function updateCartBadge() {
    const count = state.cart.reduce((s, i) => s + i.qty, 0);
    document.getElementById('cartBadge').textContent = count;
}

function openCart() {
    renderCartSheet();
    document.getElementById('cartOverlay').classList.remove('hidden');
}

function closeCart() {
    document.getElementById('cartOverlay').classList.add('hidden');
}

function renderCartSheet() {
    const container = document.getElementById('cartItems');
    const empty = document.getElementById('cartEmpty');
    const footer = document.getElementById('cartFooter');

    if (state.cart.length === 0) {
        container.innerHTML = '';
        empty.classList.remove('hidden');
        footer.classList.add('hidden');
        return;
    }

    empty.classList.add('hidden');
    footer.classList.remove('hidden');

    container.innerHTML = state.cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-info">
                <h4>${item.name}</h4>
                <span>R${(item.price * item.qty).toFixed(2)}</span>
            </div>
            <div class="qty-controls">
                <button class="qty-btn" onclick="changeQty(${item.id}, -1)">−</button>
                <span class="qty-value">${item.qty}</span>
                <button class="qty-btn" onclick="changeQty(${item.id}, 1)">+</button>
            </div>
        </div>
    `).join('');

    const subtotal = state.cart.reduce((s, i) => s + (i.price * i.qty), 0);
    document.getElementById('cartSubtotal').textContent = `R${subtotal.toFixed(2)}`;
    document.getElementById('cartTotal').textContent = `R${(subtotal + DELIVERY_FEE).toFixed(2)}`;

    // Populate address if saved
    const addrInput = document.getElementById('deliveryAddressInput');
    if (state.deliveryAddress && !addrInput.value) {
        addrInput.value = state.deliveryAddress;
    }
}

// ─── ADDRESS PICKER LOGIC ───
async function useLiveLocation() {
    if (!navigator.geolocation) {
        showToast('Geolocation is not supported by your browser');
        return;
    }

    const btn = document.getElementById('useLiveLocationBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '⌛ Accessing GPS...';
    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            if (locationPickerMapInstance) {
                locationPickerMapInstance.setView([lat, lng], 18);
            }
            btn.innerHTML = '✓ Location Accessed';
            btn.classList.add('btn-success');
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
                btn.classList.remove('btn-success');
            }, 2000);
        },
        (err) => {
            console.error('Location error:', err);
            showToast('Permission denied or GPS error');
            btn.innerHTML = originalText;
            btn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

function selectAddress(display, lat, lng) {
    state.deliveryAddress = display;
    state.deliveryLat = lat;
    state.deliveryLng = lng;
    localStorage.setItem('ew_address', display);
    localStorage.setItem('ew_lat', lat);
    localStorage.setItem('ew_lng', lng);

    document.getElementById('deliveryAddressInput').value = display;
    document.getElementById('headerAddress').textContent = display.split(',')[0];

    const selected = document.getElementById('selectedAddress');
    if (selected) {
        selected.textContent = '✓ Address confirmed';
        selected.classList.remove('hidden');
    }
}

// Address modal
function openAddressModal() {
    document.getElementById('addressModal').classList.remove('hidden');
    // We don't clear the input if it already has a value, helps user edit
    
    // Initialize map if missing
    if (!locationPickerMapInstance) {
        locationPickerMapInstance = L.map('locationPickerMap', { zoomControl: false }).setView(
            [state.deliveryLat || KAGISO_CENTER[0], state.deliveryLng || KAGISO_CENTER[1]], 16
        );
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(locationPickerMapInstance);

        // Add a static center marker
        const centerIcon = L.divIcon({
            className: 'custom-pin',
            html: '<div style="font-size:30px; transform:translate(-15px, -30px);">📍</div>',
            iconSize: [30, 30]
        });
        // We'll just rely on the user positioning the map under the static CSS pin
    } else {
        locationPickerMapInstance.setView([state.deliveryLat || KAGISO_CENTER[0], state.deliveryLng || KAGISO_CENTER[1]], 16);
    }

    setTimeout(() => {
        locationPickerMapInstance.invalidateSize();
    }, 200);
}

function closeAddressModal() {
    document.getElementById('addressModal').classList.add('hidden');
}

async function confirmMapPin() {
    if (!locationPickerMapInstance) return;
    const center = locationPickerMapInstance.getCenter();
    const lat = center.lat;
    const lng = center.lng;

    const btn = document.getElementById('confirmLocationBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Confirming...';

    const inputVal = document.getElementById('modalAddressInput').value.trim();

    try {
        let display = "";
        
        // If user entered a house number, use that as the primary label
        if (inputVal.length > 0) {
            display = inputVal;
            // Append town if it's missing
            if (!display.toLowerCase().includes('kagiso')) display += ", Kagiso";
        } else {
            // Otherwise try to reverse geocode a street name
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
            const data = await res.json();
            display = (data.address.road ? data.address.road : "Kagiso") + ", Mogale City";
        }

        selectAddress(display, lat, lng);
        closeAddressModal();
        showToast('Location confirmed!');
    } catch (e) {
        console.error('Reverse geocode error:', e);
        // Fallback to whatever is in the box
        selectAddress(inputVal || "Pinned Location", lat, lng);
        closeAddressModal();
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// ─── CHECKOUT ───
async function processCheckout() {
    if (state.cart.length === 0) return showToast('Cart is empty');
    if (!state.deliveryAddress || !state.deliveryLat) return showToast('Please set your delivery address');

    const btn = document.getElementById('checkoutBtn');
    btn.disabled = true;
    btn.textContent = 'Processing...';

    const payload = {
        merchantId: state.selectedMerchant.id,
        deliveryAddress: state.deliveryAddress,
        deliveryLatitude: state.deliveryLat,
        deliveryLongitude: state.deliveryLng,
        items: state.cart.map(i => ({
            menuItemId: i.id,
            name: i.name,
            quantity: i.qty,
            price: i.price
        }))
    };

    try {
        const res = await fetch(`${API_URL}/Order/checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.authToken}`
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText || 'Checkout failed');
        }

        const data = await res.json();

        // Redirect to PayFast
        if (data.paymentHtmlForm) {
            document.open();
            document.write(data.paymentHtmlForm);
            document.close();
        }
    } catch (e) {
        showToast(e.message);
        btn.disabled = false;
        btn.textContent = 'Place Order & Pay';

        // If items are not found (stale cart), clear it
        if (e.message.includes('not found')) {
            state.cart = [];
            localStorage.removeItem('ew_cart');
            updateCartBadge();
            closeCart();
            showToast('Your cart was stale and has been cleared. Please re-add items.');
        }

        // If session expired (happens after DB reset/wipe)
        if (e.message.toLowerCase().includes('session has expired') || e.message.toLowerCase().includes('user session')) {
            showToast('Your session has expired. Please log in again.');
            setTimeout(logout, 2000);
        }
    }
}

// ─── ORDERS ───
async function loadOrders() {
    try {
        const res = await fetch(`${API_URL}/Order`, {
            headers: { 'Authorization': `Bearer ${state.authToken}` }
        });
        if (res.status === 401) return logout();
        const orders = await res.json();

        const list = document.getElementById('ordersList');
        const empty = document.getElementById('emptyOrders');

        if (orders.length === 0) {
            list.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }

        empty.classList.add('hidden');
        list.innerHTML = orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(o => {
            const isActive = ['Paid', 'Assigned', 'PickedUp', 'Preparing', 'OutForDelivery'].includes(o.status);
            const badgeClass = o.status === 'Delivered' ? 'badge-delivered' : isActive ? 'badge-active' : 'badge-cancelled';
            const date = new Date(o.createdAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
            return `
                <div class="order-history-card" ${isActive ? `onclick="viewActiveOrder(${o.id})"` : ''}>
                    <div class="order-history-top">
                        <h4>${o.merchant?.name || 'Restaurant'}</h4>
                        <span class="order-status-badge ${badgeClass}">${o.status}</span>
                    </div>
                    <p class="order-history-meta">${date} • Order #${o.id}</p>
                    <div class="order-history-bottom">
                        <span>${o.orderItems?.length || 0} items</span>
                        <strong>R${o.totalAmount?.toFixed(2) || '0.00'}</strong>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Load orders failed:', e);
    }
}

async function checkActiveOrders() {
    try {
        const res = await fetch(`${API_URL}/Order`, {
            headers: { 'Authorization': `Bearer ${state.authToken}` }
        });
        if (!res.ok) return;
        const orders = await res.json();
        const active = orders.find(o => ['Paid', 'Assigned', 'PickedUp', 'Preparing', 'OutForDelivery'].includes(o.status));
        if (active) {
            state.activeOrder = active;
            if (hubConnection && hubConnection.state === 'Connected') {
                hubConnection.invoke('JoinOrder', active.id).catch(() => {});
            }
            navigateTo('tracking', document.querySelector('.nav-item[data-view="tracking"]'));
        }
    } catch (e) { console.error('Check active orders failed:', e); }
}

function viewActiveOrder(orderId) {
    const order = { id: orderId };
    state.activeOrder = order;
    navigateTo('tracking', document.querySelector('.nav-item[data-view="tracking"]'));
    // Reload full order data
    fetchOrderDetails(orderId);
}

async function fetchOrderDetails(orderId) {
    try {
        const res = await fetch(`${API_URL}/Order`, {
            headers: { 'Authorization': `Bearer ${state.authToken}` }
        });
        if (!res.ok) return;
        const orders = await res.json();
        const order = orders.find(o => o.id === orderId);
        if (order) {
            state.activeOrder = order;
            renderTracking();
        }
    } catch (e) { console.error(e); }
}

// ─── SIGNALR ───
async function connectHub() {
    if (hubConnection) return;
    hubConnection = new signalR.HubConnectionBuilder()
        .withUrl(API_URL.replace('/api', '/orderhub'), {
            accessTokenFactory: () => state.authToken
        })
        .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
        .build();

    hubConnection.on('StatusUpdated', (data) => {
        if (state.activeOrder && data.orderId === state.activeOrder.id) {
            state.activeOrder.status = data.status;
            renderTracking();

            if (data.status === 'Delivered') {
                showToast('🎉 Your order has been delivered!');
                state.cart = [];
                updateCartBadge();
                setTimeout(() => {
                    state.activeOrder = null;
                    clearMapMarkers();
                    goHome();
                }, 3000);
            }
        }
    });

    hubConnection.on('SyncState', (message) => {
        if (message.type === 'ActiveOrders') {
            // Pick the first active order for tracking in this view
            const active = message.data[0]; 
            if (active && (!state.activeOrder || state.activeOrder.id !== active.id)) {
                fetchOrderDetails(active.id);
                navigateTo('tracking', document.querySelector('.nav-item[data-view="tracking"]'));
            }
        }
    });

    hubConnection.on('DriverLocationUpdated', (data) => {
        if (state.activeOrder && data.orderId === state.activeOrder.id) {
            updateDriverMarker(data.lat, data.lng);
        }
    });

    hubConnection.onreconnecting(() => showToast('Reconnecting...'));
    hubConnection.onreconnected(() => {
        showToast('Connected');
        if (state.activeOrder) {
            hubConnection.invoke('JoinOrder', state.activeOrder.id).catch(() => {});
        }
    });

    try {
        await hubConnection.start();
    } catch (e) {
        console.error('Hub connection failed:', e);
    }
}

// ─── TRACKING MAP ───
function initTracking() {
    if (!state.activeOrder) {
        document.getElementById('viewTracking').querySelector('.tracking-panel').innerHTML = `
            <div class="empty-state" style="padding:2rem;">
                <span class="empty-icon">📦</span>
                <h3>No active delivery</h3>
                <p>Place an order to start tracking</p>
                <button class="btn-primary" style="margin-top:1rem;padding:0.75rem 2rem;width:auto;" onclick="goHome()">Browse Restaurants</button>
            </div>
        `;
        return;
    }

    if (!trackingMap) {
        trackingMap = L.map('trackingMap', { zoomControl: false }).setView(KAGISO_CENTER, 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(trackingMap);
    }

    setTimeout(() => trackingMap.invalidateSize(), 200);
    renderTracking();

    if (hubConnection && hubConnection.state === 'Connected') {
        hubConnection.invoke('JoinOrder', state.activeOrder.id).catch(() => {});
    }
}

function renderTracking() {
    const o = state.activeOrder;
    if (!o) return;

    // Status text
    const statusLabels = {
        'Paid': 'Order confirmed',
        'Assigned': 'Driver on the way to restaurant',
        'Preparing': 'Being prepared',
        'PickedUp': 'Driver picked up your order',
        'OutForDelivery': 'On the way to you',
        'Delivered': 'Delivered!'
    };

    const statusEl = document.getElementById('trackingStatusText');
    const orderIdEl = document.getElementById('trackingOrderId');
    if (statusEl) statusEl.textContent = statusLabels[o.status] || o.status;
    if (orderIdEl) orderIdEl.textContent = String(o.id).padStart(4, '0');

    // Timeline
    const statusOrder = ['Paid', 'Assigned', 'PickedUp', 'Delivered'];
    const currentIdx = statusOrder.indexOf(o.status === 'Preparing' ? 'Assigned' : o.status === 'OutForDelivery' ? 'PickedUp' : o.status);

    document.querySelectorAll('.timeline-step').forEach((step, idx) => {
        step.classList.remove('completed', 'active');
        if (idx < currentIdx) step.classList.add('completed');
        if (idx === currentIdx) step.classList.add('active');
    });

    // Map markers
    if (trackingMap) {
        if (o.deliveryLatitude && o.deliveryLongitude && !state.markers.customer) {
            state.markers.customer = L.marker([o.deliveryLatitude, o.deliveryLongitude], {
                icon: L.divIcon({
                    className: 'custom-pin',
                    html: '<div style="background:#e85d2a;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)">🏠</div>',
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                })
            }).addTo(trackingMap).bindPopup('Your location');
        }

        if (o.merchant && !state.markers.merchant) {
            state.markers.merchant = L.marker([o.merchant.latitude, o.merchant.longitude], {
                icon: L.divIcon({
                    className: 'custom-pin',
                    html: '<div style="background:#22a45d;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)">🏪</div>',
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                })
            }).addTo(trackingMap).bindPopup(o.merchant.name);
        }

        // Fit bounds
        const points = [];
        if (state.markers.customer) points.push(state.markers.customer.getLatLng());
        if (state.markers.merchant) points.push(state.markers.merchant.getLatLng());
        if (state.markers.driver) points.push(state.markers.driver.getLatLng());
        if (points.length >= 2) {
            trackingMap.fitBounds(L.latLngBounds(points).pad(0.2));
        }
    }

    // Driver card
    const driverCard = document.getElementById('driverCard');
    if (driverCard && o.driver) {
        driverCard.classList.remove('hidden');
        document.getElementById('driverCardName').textContent = o.driver.fullName || 'Your driver';
        document.getElementById('driverCardStatus').textContent =
            o.status === 'PickedUp' || o.status === 'OutForDelivery' ? 'Heading to you' : 'Heading to restaurant';
        if (o.driver.phone) {
            document.getElementById('driverCallBtn').href = `tel:${o.driver.phone}`;
        }
    }
}

function updateDriverMarker(lat, lng) {
    if (!trackingMap) return;

    const driverCard = document.getElementById('driverCard');
    if (driverCard) driverCard.classList.remove('hidden');

    if (!state.markers.driver) {
        state.markers.driver = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'custom-pin',
                html: '<div style="background:#1a1a1a;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid white;box-shadow:0 2px 12px rgba(0,0,0,0.4)">🛵</div>',
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            })
        }).addTo(trackingMap);
    } else {
        // Smooth animation
        const current = state.markers.driver.getLatLng();
        const steps = 20;
        const latStep = (lat - current.lat) / steps;
        const lngStep = (lng - current.lng) / steps;
        let step = 0;
        const animate = () => {
            if (step >= steps) return;
            step++;
            state.markers.driver.setLatLng([
                current.lat + latStep * step,
                current.lng + lngStep * step
            ]);
            requestAnimationFrame(animate);
        };
        animate();
    }
}

function clearMapMarkers() {
    Object.values(state.markers).forEach(m => { if (m && trackingMap) trackingMap.removeLayer(m); });
    state.markers = { merchant: null, customer: null, driver: null };
}

// ─── UTILITIES ───
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2500);
}

function logout() {
    localStorage.removeItem('ew_token');
    localStorage.removeItem('ew_name');
    state.authToken = null;
    state.userName = null;
    state.cart = [];
    state.activeOrder = null;
    if (hubConnection) hubConnection.stop();
    location.reload();
}

// ─── BOOT ───
init();
