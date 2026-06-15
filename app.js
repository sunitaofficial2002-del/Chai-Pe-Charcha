// ============================================================================
// Chai Pe Charcha - Main App Logic
// ============================================================================

// 1. FIREBASE CONFIGURATION (Placeholder - User must fill this)
const firebaseConfig = {
    apiKey: "AIzaSyDHkdhksc7br4DcSnhg6kevMD-VSxIXJoo",
    authDomain: "accounting-111.firebaseapp.com",
    databaseURL: "https://accounting-111-default-rtdb.firebaseio.com",
    projectId: "accounting-111",
    storageBucket: "accounting-111.firebasestorage.app",
    messagingSenderId: "455133959773",
    appId: "1:455133959773:web:e9bbfa67f88b8e204b5fb4"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.database();

// Constants
const OWNER_EMAILS = [
    "sunitaofficial2002@gmail.com",
    "smartchotuu@gmail.com",
    "smartrahul2112@gmail.com"
];

// App State
let currentUser = null;
let userRole = 'staff';
let allItems = []; // For local search in sales
let currentSaleCart = []; // { itemId, name, price, qty }

// ============================================================================
// DOM ELEMENTS
// ============================================================================
const screens = {
    login: document.getElementById('login-screen'),
    main: document.getElementById('main-app')
};
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');

// Nav
const navItems = document.querySelectorAll('.nav-item');
const contentSections = document.querySelectorAll('.content-section');
const ownerOnlyElements = document.querySelectorAll('.owner-only');

// Profile Dropdown
const profileBtn = document.getElementById('profile-btn');
const profileDropdown = document.getElementById('profile-dropdown');

// Modals
const modals = {
    item: document.getElementById('modal-item'),
    sale: document.getElementById('modal-sale'),
    expense: document.getElementById('modal-expense'),
    addStock: document.getElementById('modal-add-stock'),
    backdrop: document.getElementById('modal-backdrop')
};
const closeBtns = document.querySelectorAll('.btn-close-modal');

// Forms & Inputs
const formItem = document.getElementById('form-item');
const formExpense = document.getElementById('form-expense');
const formAddStock = document.getElementById('form-add-stock');
const saleItemSearch = document.getElementById('sale-item-search');
const saleSearchResults = document.getElementById('sale-search-results');
const saleCartItemsContainer = document.getElementById('sale-cart-items');
const saleTotalAmountEl = document.getElementById('sale-total-amount');
const btnCloseBill = document.getElementById('btn-close-bill');
const paymentModeBtns = document.querySelectorAll('.btn-mode');

// ============================================================================
// AUTHENTICATION & ROLE MANAGEMENT
// ============================================================================

btnLogin.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => {
        console.error("Login failed:", error);
        alert("Login failed: " + error.message);
    });
});

btnLogout.addEventListener('click', () => {
    auth.signOut();
    profileDropdown.classList.remove('active');
});

auth.onAuthStateChanged(user => {
    if (user) {
        // Logged in
        currentUser = user;
        
        // Determine role
        userRole = OWNER_EMAILS.includes(user.email) ? 'owner' : 'staff';
        
        // Update DB Profile
        db.ref('users/' + user.uid).update({
            name: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            role: userRole,
            lastLogin: firebase.database.ServerValue.TIMESTAMP
        });

        // Update UI
        document.getElementById('user-photo').src = user.photoURL || '';
        document.getElementById('user-name').textContent = user.displayName;
        document.getElementById('user-email').textContent = user.email;
        document.getElementById('user-role-badge').textContent = userRole;
        
        applyRoleRestrictions();
        
        screens.login.classList.remove('active');
        screens.main.classList.add('active');

        // Setup DB Listeners
        setupDatabaseListeners();
        
    } else {
        // Logged out
        currentUser = null;
        userRole = 'staff';
        
        screens.main.classList.remove('active');
        screens.login.classList.add('active');
        
        // Reset state
        db.ref().off(); // Remove listeners
    }
});

function applyRoleRestrictions() {
    if (userRole === 'staff') {
        ownerOnlyElements.forEach(el => el.classList.add('hidden'));
        // If current tab is restricted, go to sales
        const activeNav = document.querySelector('.nav-item.active');
        if (activeNav && (activeNav.dataset.target === 'expenses' || activeNav.dataset.target === 'dashboard')) {
            switchTab('sales');
        }
    } else {
        ownerOnlyElements.forEach(el => el.classList.remove('hidden'));
    }
}

// ============================================================================
// UI NAVIGATION & INTERACTION
// ============================================================================

// Profile Dropdown Toggle
profileBtn.addEventListener('click', (e) => {
    if (e.target !== btnLogout) {
        profileDropdown.classList.toggle('active');
    }
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!profileBtn.contains(e.target)) {
        profileDropdown.classList.remove('active');
    }
});

// Tabs
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const target = item.dataset.target;
        switchTab(target);
    });
});

function switchTab(targetId) {
    navItems.forEach(nav => nav.classList.remove('active'));
    contentSections.forEach(sec => sec.classList.remove('active'));
    
    document.querySelector(`.nav-item[data-target="${targetId}"]`).classList.add('active');
    document.getElementById(`section-${targetId}`).classList.add('active');
}

// Modals
function openModal(modalId) {
    modals.backdrop.classList.add('active');
    modals[modalId].classList.add('active');
}

function closeModal() {
    modals.backdrop.classList.remove('active');
    Object.values(modals).forEach(m => {
        if (m.classList) m.classList.remove('active');
    });
}

closeBtns.forEach(btn => btn.addEventListener('click', closeModal));
modals.backdrop.addEventListener('click', (e) => {
    if (e.target === modals.backdrop) closeModal();
});

document.getElementById('fab-add-item').addEventListener('click', () => {
    formItem.reset();
    document.getElementById('item-margin').textContent = '₹0.00';
    openModal('item');
});

document.getElementById('fab-add-expense').addEventListener('click', () => {
    formExpense.reset();
    openModal('expense');
});

document.getElementById('fab-add-sale').addEventListener('click', () => {
    // Reset sale cart
    currentSaleCart = [];
    renderCart();
    saleItemSearch.value = '';
    saleSearchResults.classList.remove('active');
    
    // Set active payment mode to unpaid
    paymentModeBtns.forEach(b => b.classList.remove('active'));
    document.querySelector('.btn-mode[data-mode="unpaid"]').classList.add('active');
    
    // Get next bill number (resets daily)
    db.ref('meta').once('value').then(snap => {
        const meta = snap.val() || {};
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        
        let nextNum = 1;
        if (meta.lastBillDate === today) {
            nextNum = (meta.lastBillNumber || 0) + 1;
        }
        document.getElementById('sale-bill-num').textContent = nextNum;
    });

    openModal('sale');
});

// ============================================================================
// DATABASE LISTENERS & RENDERING
// ============================================================================

function setupDatabaseListeners() {
    // 1. Items
    db.ref('items').on('value', snapshot => {
        const items = [];
        snapshot.forEach(child => {
            items.push({ id: child.key, ...child.val() });
        });
        allItems = items; // Store globally for search
        renderInventory(items);
        if (userRole === 'owner') renderDashboard(items, null, null); // Partial trigger
    });

    // 2. Sales
    db.ref('sales').orderByChild('createdAt').on('value', snapshot => {
        const sales = [];
        let pending = 0, cash = 0, online = 0;
        
        snapshot.forEach(child => {
            const sale = { id: child.key, ...child.val() };
            sales.push(sale);
            
            if (sale.status === 'unpaid') pending += sale.total;
            else if (sale.status === 'cash') cash += sale.total;
            else if (sale.status === 'online') online += sale.total;
        });
        
        sales.reverse(); // Newest first
        
        // Update summary stats
        document.getElementById('stat-pending').textContent = `₹${pending.toFixed(2)}`;
        document.getElementById('stat-cash').textContent = `₹${cash.toFixed(2)}`;
        document.getElementById('stat-online').textContent = `₹${online.toFixed(2)}`;
        document.getElementById('stat-total').textContent = `₹${(cash + online).toFixed(2)}`;
        
        renderSales(sales);
        if (userRole === 'owner') renderDashboard(allItems, sales, null); // Partial trigger
    });

    // 3. Expenses (Owner only)
    if (userRole === 'owner') {
        db.ref('expenses').orderByChild('createdAt').on('value', snapshot => {
            const expenses = [];
            snapshot.forEach(child => {
                expenses.push({ id: child.key, ...child.val() });
            });
            expenses.reverse();
            renderExpenses(expenses);
            renderDashboard(allItems, null, null); // Trigger to recalculate collection
        });
    }
}

// --- Render Inventory ---
function renderInventory(items) {
    const list = document.getElementById('inventory-list');
    list.innerHTML = '';
    
    let totalInvValue = 0;
    let totalInvProfit = 0;
    
    items.forEach(item => {
        const stock = parseFloat(item.currentStock) || 0;
        const purPrice = parseFloat(item.purchasePrice) || 0;
        const salPrice = parseFloat(item.salePrice) || 0;
        
        if (stock > 0) {
            totalInvValue += (stock * purPrice);
            totalInvProfit += (stock * (salPrice - purPrice));
        }

        const isLow = item.currentStock <= item.lowStockAlert;
        const initial = item.name.charAt(0).toUpperCase();
        
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div class="item-img-placeholder">${initial}</div>
            <div class="item-info">
                <h4>${item.name}</h4>
                <div class="item-price">₹${item.salePrice}</div>
            </div>
            <div class="item-stock-controls">
                <span class="stock-count ${isLow ? 'low' : ''}">${item.currentStock} Qty</span>
                ${userRole === 'owner' ? `<button class="btn-stepper" onclick="openAddStockModal('${item.id}', ${item.currentStock}, '${item.name.replace(/'/g, "\\'")}')"><span class="material-symbols-rounded">add</span></button>` : ''}
            </div>
        `;
        list.appendChild(card);
    });

    const elInvValue = document.getElementById('stat-inv-value');
    const elInvProfit = document.getElementById('stat-inv-profit');
    if (elInvValue) elInvValue.textContent = `₹${totalInvValue.toFixed(2)}`;
    if (elInvProfit) elInvProfit.textContent = `₹${totalInvProfit.toFixed(2)}`;
}

let currentAddStockItemId = null;
let currentAddStockCurrentQty = 0;

window.openAddStockModal = function(itemId, currentStock, itemName) {
    currentAddStockItemId = itemId;
    currentAddStockCurrentQty = currentStock;
    document.getElementById('modal-add-stock-title').textContent = `Add Stock: ${itemName}`;
    document.getElementById('add-stock-qty').value = 1;
    openModal('addStock');
};

formAddStock.addEventListener('submit', e => {
    e.preventDefault();
    if (!currentAddStockItemId) return;
    
    const addQty = parseInt(document.getElementById('add-stock-qty').value) || 0;
    
    db.ref(`items/${currentAddStockItemId}`).update({
        currentStock: currentAddStockCurrentQty + addQty,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        closeModal();
    });
});

// --- Add Item Logic ---
const elPurPrice = document.getElementById('item-purchase-price');
const elSalPrice = document.getElementById('item-sale-price');
const elMargin = document.getElementById('item-margin');

function calculateMargin() {
    const p = parseFloat(elPurPrice.value) || 0;
    const s = parseFloat(elSalPrice.value) || 0;
    const m = s - p;
    elMargin.textContent = `₹${m.toFixed(2)}`;
    elMargin.className = `read-only-field ${m > 0 ? 'text-success' : (m < 0 ? 'text-danger' : 'text-secondary')}`;
}

elPurPrice.addEventListener('input', calculateMargin);
elSalPrice.addEventListener('input', calculateMargin);

formItem.addEventListener('submit', e => {
    e.preventDefault();
    const purPrice = parseFloat(elPurPrice.value);
    const salPrice = parseFloat(elSalPrice.value);
    const opStock = parseInt(document.getElementById('item-opening-stock').value);

    const newItem = {
        name: document.getElementById('item-name').value,
        unit: 'Qty',
        fixedQty: 1,
        purchasePrice: purPrice,
        salePrice: salPrice,
        margin: salPrice - purPrice,
        openingStock: opStock,
        currentStock: opStock,
        lowStockAlert: parseInt(document.getElementById('item-low-stock').value),
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    db.ref('items').push(newItem).then(() => {
        closeModal();
    });
});

// --- Render Expenses ---
function renderExpenses(expenses) {
    const list = document.getElementById('expenses-list');
    list.innerHTML = '';
    
    expenses.forEach(exp => {
        const dateStr = new Date(exp.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
        const card = document.createElement('div');
        card.className = 'list-card';
        card.innerHTML = `
            <div class="list-card-left">
                <h4>${exp.description}</h4>
                <p><span class="badge" style="background:var(--surface-elevated); padding:2px 6px; border-radius:4px; font-size:10px; margin-right:5px;">${exp.category}</span> ${dateStr}</p>
            </div>
            <div class="list-card-right">
                <h3 class="text-danger">₹${parseFloat(exp.amount).toFixed(2)}</h3>
            </div>
        `;
        list.appendChild(card);
    });
}

formExpense.addEventListener('submit', e => {
    e.preventDefault();
    const newExp = {
        description: document.getElementById('expense-desc').value,
        amount: parseFloat(document.getElementById('expense-amount').value),
        category: document.getElementById('expense-category').value,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    };
    db.ref('expenses').push(newExp).then(() => closeModal());
});

// --- Render Sales ---
function renderSales(sales) {
    const list = document.getElementById('sales-list');
    list.innerHTML = '';
    
    sales.forEach(sale => {
        const dateStr = new Date(sale.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
        const itemCount = sale.items ? sale.items.reduce((sum, i) => sum + i.qty, 0) : 0;
        
        const card = document.createElement('div');
        card.className = `list-card ${sale.status === 'unpaid' ? 'clickable' : ''}`;
        
        card.innerHTML = `
            <div class="list-card-left">
                <h4>Bill #${sale.billNumber}</h4>
                <p>${itemCount} items • ${dateStr}</p>
            </div>
            <div class="list-card-right">
                <h3>₹${parseFloat(sale.total).toFixed(2)}</h3>
                <span class="status-badge ${sale.status}">${sale.status}</span>
            </div>
        `;
        
        if (sale.status === 'unpaid') {
            card.addEventListener('click', () => openEditSale(sale));
        }
        list.appendChild(card);
    });
}

// --- New/Edit Sale Logic ---
let activeSaleId = null; // Used if editing an unpaid bill
let activeSaleOriginalCart = [];

function openEditSale(sale) {
    activeSaleId = sale.id;
    document.getElementById('sale-bill-num').textContent = sale.billNumber;
    currentSaleCart = sale.items ? [...sale.items] : [];
    activeSaleOriginalCart = sale.items ? JSON.parse(JSON.stringify(sale.items)) : [];
    
    paymentModeBtns.forEach(b => b.classList.remove('active'));
    document.querySelector(`.btn-mode[data-mode="${sale.status}"]`).classList.add('active');
    
    renderCart();
    openModal('sale');
}

// Payment Mode Selection
paymentModeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        paymentModeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

// Item Search
saleItemSearch.addEventListener('keyup', (e) => {
    const q = e.target.value.toLowerCase();
    if (q.length === 0) {
        saleSearchResults.classList.remove('active');
        return;
    }
    
    const results = allItems.filter(item => item.name.toLowerCase().includes(q)).slice(0, 5);
    saleSearchResults.innerHTML = '';
    
    if (results.length > 0) {
        results.forEach(item => {
            const row = document.createElement('div');
            row.className = 'search-result-item';
            row.innerHTML = `<span>${item.name}</span><span class="text-secondary">₹${item.salePrice}</span>`;
            row.addEventListener('click', () => {
                addToCart(item);
                saleItemSearch.value = '';
                saleSearchResults.classList.remove('active');
            });
            saleSearchResults.appendChild(row);
        });
        saleSearchResults.classList.add('active');
    } else {
        saleSearchResults.classList.remove('active');
    }
});

function addToCart(item) {
    const existing = currentSaleCart.find(i => i.itemId === item.id);
    if (existing) {
        existing.qty += 1;
    } else {
        currentSaleCart.push({
            itemId: item.id,
            name: item.name,
            price: item.salePrice,
            purchasePrice: item.purchasePrice,
            qty: 1
        });
    }
    renderCart();
}

window.updateCartQty = function(index, delta) {
    currentSaleCart[index].qty += delta;
    if (currentSaleCart[index].qty <= 0) {
        currentSaleCart.splice(index, 1);
    }
    renderCart();
};

function renderCart() {
    saleCartItemsContainer.innerHTML = '';
    let total = 0;
    
    currentSaleCart.forEach((item, index) => {
        const itemTotal = item.price * item.qty;
        total += itemTotal;
        
        const row = document.createElement('div');
        row.className = 'cart-item';
        row.innerHTML = `
            <div class="cart-item-info flex-grow">
                <h5>${item.name}</h5>
                <span>₹${item.price} × ${item.qty}</span>
            </div>
            <div class="cart-item-controls">
                <button class="btn-stepper" onclick="updateCartQty(${index}, -1)"><span class="material-symbols-rounded" style="font-size:16px;">remove</span></button>
                <span style="font-weight:600;">${item.qty}</span>
                <button class="btn-stepper" onclick="updateCartQty(${index}, 1)"><span class="material-symbols-rounded" style="font-size:16px;">add</span></button>
            </div>
            <div class="cart-item-price">₹${itemTotal.toFixed(2)}</div>
        `;
        saleCartItemsContainer.appendChild(row);
    });
    
    saleTotalAmountEl.textContent = `₹${total.toFixed(2)}`;
}

// Close Bill
btnCloseBill.addEventListener('click', async () => {
    if (currentSaleCart.length === 0) return alert("Cart is empty!");
    
    const status = document.querySelector('.btn-mode.active').dataset.mode;
    const total = currentSaleCart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    
    // Decrease stock logic
    // (Note: we should track previous cart items if editing to adjust stock properly, 
    // but for simplicity, we just decrement based on new items added. To be safe, 
    // we assume append-only for stock deduction on edit.)
    
    if (activeSaleId) {
        // Update existing unpaid bill
        db.ref(`sales/${activeSaleId}`).update({
            items: currentSaleCart,
            total: total,
            status: status,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Calculate stock difference
        const stockDelta = {};
        activeSaleOriginalCart.forEach(i => {
            stockDelta[i.itemId] = (stockDelta[i.itemId] || 0) + i.qty;
        });
        currentSaleCart.forEach(i => {
            stockDelta[i.itemId] = (stockDelta[i.itemId] || 0) - i.qty;
        });
        
        // Apply difference
        Object.keys(stockDelta).forEach(itemId => {
            const delta = stockDelta[itemId];
            if (delta !== 0) {
                db.ref(`items/${itemId}/currentStock`).transaction(stock => (stock || 0) + delta);
            }
        });
        
        activeSaleId = null;
        activeSaleOriginalCart = [];
    } else {
        // Create new bill
        const metaRef = db.ref('meta');
        
        // Read then write bill number (with daily reset)
        metaRef.transaction((currentMeta) => {
            currentMeta = currentMeta || {};
            const d = new Date();
            const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            
            if (currentMeta.lastBillDate === today) {
                currentMeta.lastBillNumber = (currentMeta.lastBillNumber || 0) + 1;
            } else {
                currentMeta.lastBillDate = today;
                currentMeta.lastBillNumber = 1;
            }
            return currentMeta;
        }, (error, committed, snapshot) => {
            if (committed) {
                const newMeta = snapshot.val();
                const newBillNum = newMeta.lastBillNumber;
                
                const newSale = {
                    billNumber: newBillNum,
                    items: currentSaleCart,
                    total: total,
                    status: status,
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                    updatedAt: firebase.database.ServerValue.TIMESTAMP
                };
                
                db.ref('sales').push(newSale);
                
                // Deduct stock
                currentSaleCart.forEach(cartItem => {
                    const itemRef = db.ref(`items/${cartItem.itemId}/currentStock`);
                    itemRef.transaction(stock => (stock || 0) - cartItem.qty);
                });
            }
        });
    }
    
    closeModal();
});

// ============================================================================
// DASHBOARD LOGIC
// ============================================================================

function renderDashboard(items, salesData, _) {
    if (userRole !== 'owner') return;
    
    // Need both items and sales loaded to compute everything properly
    // This is called whenever items or sales update, so we grab current DB states if missing
    
    // For simplicity, we can refetch sales if not passed, but we pass them from listeners.
    // Let's do a standalone fetch for dashboard to guarantee consistency
    Promise.all([
        db.ref('items').once('value'),
        db.ref('sales').once('value'),
        db.ref('expenses').once('value')
    ]).then(([itemsSnap, salesSnap, expensesSnap]) => {
        const itemDict = {};
        itemsSnap.forEach(c => { itemDict[c.key] = c.val(); });
        
        let totalProfit = 0;
        let pendingBal = 0;
        let totalRevenue = 0;
        const itemSalesCount = {};
        
        salesSnap.forEach(c => {
            const sale = c.val();
            if (sale.status === 'unpaid') {
                pendingBal += sale.total;
            } else {
                totalRevenue += sale.total; // Only paid sales contribute to collection
            }
            
            if (sale.items) {
                sale.items.forEach(i => {
                    // Update Profit
                    const dbItem = itemDict[i.itemId];
                    const pp = i.purchasePrice !== undefined ? i.purchasePrice : (dbItem ? dbItem.purchasePrice : 0);
                    const profitPerItem = i.price - pp;
                    totalProfit += (profitPerItem * i.qty);
                    
                    // Update Sold Count
                    itemSalesCount[i.itemId] = (itemSalesCount[i.itemId] || 0) + i.qty;
                });
            }
        });

        let totalExpenses = 0;
        if (expensesSnap) {
            expensesSnap.forEach(c => {
                totalExpenses += parseFloat(c.val().amount) || 0;
            });
        }

        const collection = totalRevenue - totalExpenses;
        
        // 1. Profit, Pending & Collection
        const elProfit = document.getElementById('dash-profit');
        if (elProfit) elProfit.textContent = `₹${totalProfit.toFixed(2)}`;
        
        const elPending = document.getElementById('dash-pending');
        if (elPending) elPending.textContent = `₹${pendingBal.toFixed(2)}`;
        
        const elCollection = document.getElementById('dash-collection');
        if (elCollection) elCollection.textContent = `₹${collection.toFixed(2)}`;
        
        const elExpBalance = document.getElementById('stat-available-balance');
        if (elExpBalance) elExpBalance.textContent = `₹${collection.toFixed(2)}`;
        
        // 2. Most Sold Items (Top 5)
        const sortedItems = Object.keys(itemSalesCount).map(id => ({
            id, name: itemDict[id] ? itemDict[id].name : 'Unknown', qty: itemSalesCount[id]
        })).sort((a,b) => b.qty - a.qty).slice(0, 5);
        
        const topEl = document.getElementById('dash-top-items');
        topEl.innerHTML = '';
        sortedItems.forEach(i => {
            topEl.innerHTML += `<li><span>${i.name}</span> <span style="font-weight:600;">${i.qty} sold</span></li>`;
        });
        
        // 3. Low Stock Items
        const lowItems = Object.values(itemDict).filter(i => i.currentStock <= i.lowStockAlert);
        const lowEl = document.getElementById('dash-low-stock');
        lowEl.innerHTML = '';
        lowItems.forEach(i => {
            lowEl.innerHTML += `<li><span>${i.name}</span> <span style="font-weight:600;">${i.currentStock} left</span></li>`;
        });
        
        // 4. Suggestions Engine
        const sugEl = document.getElementById('dash-suggestions');
        sugEl.innerHTML = '';
        
        if (sortedItems.length > 0) {
            sugEl.innerHTML += `<li>Your most sold item is <b>${sortedItems[0].name}</b>. Ensure you have enough supplier stock to avoid running out.</li>`;
        }
        if (lowItems.length > 0) {
            sugEl.innerHTML += `<li>You have <b>${lowItems.length}</b> items running low on stock. Check the low stock alerts below.</li>`;
        }
        if (pendingBal > 1000) {
            sugEl.innerHTML += `<li>You have a high pending balance (₹${pendingBal.toFixed(2)}). Consider sending reminders to collect payments.</li>`;
        }
        if (sugEl.innerHTML === '') {
            sugEl.innerHTML = `<li>Business is running smoothly. Keep it up!</li>`;
        }
    });
}


// ============================================================================
// PDF REPORT GENERATION
// ============================================================================

document.getElementById('form-report').addEventListener('submit', (e) => {
    e.preventDefault();
    const days = parseInt(document.getElementById('report-timeframe').value);
    generatePDFReport(days);
    closeModal();
});

function generatePDFReport(days) {
    // 1. Fetch data
    Promise.all([
        db.ref('items').once('value'),
        db.ref('sales').once('value'),
        db.ref('expenses').once('value')
    ]).then(([itemsSnap, salesSnap, expensesSnap]) => {
        const now = Date.now();
        const cutoff = now - (days * 24 * 60 * 60 * 1000);
        
        let totalRevenue = 0;
        let totalExpenses = 0;
        let totalProfit = 0;
        let pendingBal = 0;
        
        const itemDict = {};
        if (itemsSnap) {
            itemsSnap.forEach(c => { itemDict[c.key] = c.val(); });
        }
        
        let salesHtml = '';
        if (salesSnap) {
            salesSnap.forEach(c => {
                const sale = c.val();
                if (sale.createdAt >= cutoff) {
                    if (sale.status === 'unpaid') pendingBal += sale.total;
                    else totalRevenue += sale.total;
                    
                    if (sale.items) {
                        let itemsStr = sale.items.map(i => `${i.name} (x${i.qty})`).join(', ');
                        salesHtml += `<tr><td style="padding:8px; border:1px solid #ddd;">${new Date(sale.createdAt).toLocaleDateString()}</td><td style="padding:8px; border:1px solid #ddd;">#${sale.billNumber}</td><td style="padding:8px; border:1px solid #ddd;">${itemsStr}</td><td style="padding:8px; border:1px solid #ddd;">₹${sale.total}</td><td style="padding:8px; border:1px solid #ddd;">${sale.status.toUpperCase()}</td></tr>`;
                        
                        sale.items.forEach(i => {
                            const dbItem = itemDict[i.itemId];
                            const pp = i.purchasePrice !== undefined ? i.purchasePrice : (dbItem ? dbItem.purchasePrice : 0);
                            totalProfit += ((i.price - pp) * i.qty);
                        });
                    }
                }
            });
        }
        
        let expensesHtml = '';
        if (expensesSnap) {
            expensesSnap.forEach(c => {
                const exp = c.val();
                if (exp.createdAt >= cutoff) {
                    totalExpenses += parseFloat(exp.amount) || 0;
                    expensesHtml += `<tr><td style="padding:8px; border:1px solid #ddd;">${new Date(exp.createdAt).toLocaleDateString()}</td><td style="padding:8px; border:1px solid #ddd;">${exp.description}</td><td style="padding:8px; border:1px solid #ddd;">${exp.category}</td><td style="padding:8px; border:1px solid #ddd;">₹${exp.amount}</td></tr>`;
                }
            });
        }
        
        const collection = totalRevenue - totalExpenses;
        
        const reportDiv = document.createElement('div');
        reportDiv.style.padding = '20px';
        reportDiv.style.fontFamily = 'sans-serif';
        reportDiv.style.color = '#333';
        
        let timeframeText = days == 7 ? "Last 7 Days" : days == 30 ? "Last 1 Month" : days == 60 ? "Last 2 Months" : "This Year";
        
        reportDiv.innerHTML = `
            <div style="text-align:center; margin-bottom: 20px;">
                <h1>Chai Pe Charcha - Business Report</h1>
                <p>Timeframe: ${timeframeText}</p>
                <p>Generated on: ${new Date().toLocaleString()}</p>
            </div>
            
            <div style="display:flex; justify-content:space-between; margin-bottom: 30px; border-bottom: 2px solid #eee; padding-bottom: 20px;">
                <div><h3>Total Collection</h3><h2 style="color:#007aff;">₹${collection.toFixed(2)}</h2></div>
                <div><h3>Overall Profit</h3><h2 style="color:#34c759;">₹${totalProfit.toFixed(2)}</h2></div>
                <div><h3>Pending Balance</h3><h2 style="color:#ff3b30;">₹${pendingBal.toFixed(2)}</h2></div>
            </div>
            
            <h3>Sales</h3>
            <table style="width:100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px;">
                <tr style="background:#f5f5f7; text-align:left;">
                    <th style="padding:8px; border:1px solid #ddd;">Date</th>
                    <th style="padding:8px; border:1px solid #ddd;">Bill #</th>
                    <th style="padding:8px; border:1px solid #ddd;">Items</th>
                    <th style="padding:8px; border:1px solid #ddd;">Total</th>
                    <th style="padding:8px; border:1px solid #ddd;">Status</th>
                </tr>
                ${salesHtml || '<tr><td colspan="5" style="padding:8px; text-align:center; border:1px solid #ddd;">No sales found</td></tr>'}
            </table>
            
            <h3>Expenses</h3>
            <table style="width:100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px;">
                <tr style="background:#f5f5f7; text-align:left;">
                    <th style="padding:8px; border:1px solid #ddd;">Date</th>
                    <th style="padding:8px; border:1px solid #ddd;">Description</th>
                    <th style="padding:8px; border:1px solid #ddd;">Category</th>
                    <th style="padding:8px; border:1px solid #ddd;">Amount</th>
                </tr>
                ${expensesHtml || '<tr><td colspan="4" style="padding:8px; text-align:center; border:1px solid #ddd;">No expenses found</td></tr>'}
            </table>
        `;
        
        const opt = {
            margin:       0.5,
            filename:     `Report_${timeframeText.replace(/ /g, '_')}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
        };
        
        html2pdf().set(opt).from(reportDiv).save();
    });
}
