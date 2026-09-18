// ── State ─────────────────────────────────────────────────────────────────
let currentFoods   = [];
let selectedMeal   = 'Lunch';
let currentImageB64 = null;

// ── Init ──────────────────────────────────────────────────────────────────
window.addEventListener('load', async () => {
  await checkAuth();

  if (new URLSearchParams(location.search).get('auth') === 'success') {
    history.replaceState({}, '', '/');
    showToast('Signed in successfully!');
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.warn);
  }

  const now = new Date();
  const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  document.getElementById('meal-time').value = timeStr;
});

// ── Auth ──────────────────────────────────────────────────────────────────
async function checkAuth() {
  try {
    const res  = await fetch('/auth/status');
    const data = await res.json();
    if (data.authenticated) {
      show('app');
      hide('auth-overlay');
      loadHistory();
    } else {
      show('auth-overlay');
      hide('app');
    }
  } catch (e) {
    show('auth-overlay');
    hide('app');
  }
}

function signIn()  { window.location.href = '/oauth/login'; }
async function signOut() {
  await fetch('/oauth/logout', { method: 'POST' });
  show('auth-overlay');
  hide('app');
}

// ── Tabs ──────────────────────────────────────────────────────────────────
function switchTab(name, btn) {
  const currentTab = document.querySelector('.tab-content.active');
  const newTab = document.getElementById('tab-' + name);

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  if (currentTab === newTab) return;

  if (currentTab) {
    currentTab.style.opacity = '0';
    currentTab.style.transform = 'translateY(12px)';
    setTimeout(() => {
      currentTab.classList.remove('active');
      currentTab.style.opacity = '';
      currentTab.style.transform = '';
      newTab.classList.add('active');
      void newTab.offsetWidth;
      newTab.style.opacity = '1';
      newTab.style.transform = 'translateY(0)';
      if (name === 'history') loadHistory();
    }, 180);
  } else {
    newTab.classList.add('active');
    if (name === 'history') loadHistory();
  }
}

// ── Image handling ────────────────────────────────────────────────────────
function handleImage(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX = 1024;
      let w = img.width, h = img.height;
      if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
      else       { if (h > MAX) { w *= MAX / h; h = MAX; } }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      currentImageB64 = dataUrl.split(',')[1];

      const container = document.getElementById('preview-container');
      container.innerHTML = `<img src="${dataUrl}" alt="Food preview" />`;
      show('analyze-btn');
      hide('food-results');
      hide('success-msg');
      currentFoods = [];
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ── Meal selector ─────────────────────────────────────────────────────────
function selectMeal(btn) {
  document.querySelectorAll('.meal-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedMeal = btn.dataset.meal;
}

// ── Analyze ───────────────────────────────────────────────────────────────
async function analyzeFood() {
  if (!currentImageB64) return;

  hide('analyze-btn');
  show('spinner');
  hide('food-results');

  let extraText = document.getElementById('extra-text').value.trim();

  const qInputs = document.querySelectorAll('[id^="ai-q-"]');
  if (qInputs.length > 0) {
    qInputs.forEach(input => {
      if (input.value.trim()) {
         const qText = input.previousElementSibling.innerText;
         extraText += `\nQ: ${qText} \nA: ${input.value.trim()}`;
      }
    });
  }

  try {
    const res  = await fetch('/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: currentImageB64, text: extraText }),
    });
    let data;
    try {
      const text = await res.text();
      data = JSON.parse(text);
    } catch (err) {
      throw new Error(`Server returned invalid response (Status ${res.status}). Image may be too large.`);
    }

    hide('spinner');

    if (data.success) {
      currentFoods = data.foods;
      renderFoods();

      const qContainer = document.getElementById('ai-questions-container');
      const qList = document.getElementById('ai-questions-list');
      if (data.questions && data.questions.length > 0) {
        qList.innerHTML = data.questions.map((q, i) => `
          <li style="margin-bottom:0.75rem;list-style:none;">
            <div style="font-weight:600;margin-bottom:0.4rem;color:var(--text);font-size:0.95rem;">${escHtml(q)}</div>
            <input type="text" id="ai-q-${i}" placeholder="Type your answer..." style="width:100%;padding:0.6rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg);color:var(--text);font-family:inherit;" />
          </li>
        `).join('');
        qContainer.classList.remove('hidden');
      } else {
        qContainer.classList.add('hidden');
      }

      show('food-results');
      show('analyze-btn');
      document.getElementById('analyze-btn').innerHTML = '<div style="display:flex;align-items:center;justify-content:center;gap:8px;"><i data-lucide="refresh-ccw" style="width:16px;height:16px;"></i> Re-Analyze</div>';
      lucide.createIcons();
    } else {
      showToast('Analysis failed: ' + data.error, true);
      show('analyze-btn');
    }
  } catch (e) {
    hide('spinner');
    showToast('Error: ' + e.message, true);
    show('analyze-btn');
  }
}

// ── Render food cards ─────────────────────────────────────────────────────
function renderFoods() {
  const list = document.getElementById('food-list');
  list.innerHTML = '';

  currentFoods.forEach((food, idx) => {
    const card = document.createElement('div');
    card.className = 'food-card';
    card.id = `food-card-${idx}`;
    card.style.animationDelay = `${idx * 0.06}s`;
    card.innerHTML = `
      <button class="btn-remove" onclick="removeFood(${idx})" title="Remove">
        <i data-lucide="x" style="width:14px;height:14px;"></i>
      </button>
      <div class="food-name">${escHtml(food.name)}</div>
      <div class="food-qty">${escHtml(food.quantity)}</div>
      <div class="food-macros">
        <span class="macro-pill cal">🔥 ${food.calories} kcal</span>
        <span class="macro-pill macro-pill-pro">${food.protein_g}g P</span>
        <span class="macro-pill macro-pill-carb">${food.carbs_g}g C</span>
        <span class="macro-pill macro-pill-fat">${food.fat_g}g F</span>
      </div>
      <button class="btn-edit" onclick="toggleEdit(${idx})">
        <i data-lucide="pencil" style="width:12px;height:12px;"></i> Edit
      </button>
      <div class="edit-grid hidden" id="edit-${idx}">
        <input class="edit-full" placeholder="Food name" value="${escHtml(food.name)}" id="edit-name-${idx}" />
        <input placeholder="Quantity" value="${escHtml(food.quantity)}" id="edit-qty-${idx}" />
        <input type="number" placeholder="Calories" value="${food.calories}" id="edit-cal-${idx}" />
        <input type="number" placeholder="Protein (g)" value="${food.protein_g}" id="edit-pro-${idx}" />
        <input type="number" placeholder="Carbs (g)" value="${food.carbs_g}" id="edit-carb-${idx}" />
        <input type="number" placeholder="Fat (g)" value="${food.fat_g}" id="edit-fat-${idx}" />

        <div class="edit-full refine-box" style="display:flex;gap:6px;align-items:center;">
          <input type="text" id="refine-text-${idx}" placeholder="e.g. 'it was a small apple'" style="flex:1;" />
          <button type="button" onclick="refineFood(${idx})">✨ Refine</button>
        </div>

        <button class="btn-save edit-full" onclick="saveEdit(${idx})">
          <span style="display:flex;align-items:center;justify-content:center;gap:6px;">
            <i data-lucide="check" style="width:14px;height:14px;"></i> Save
          </span>
        </button>
      </div>
    `;
    list.appendChild(card);
  });

  lucide.createIcons();
  renderTotals();
}

function toggleEdit(idx) {
  const grid = document.getElementById(`edit-${idx}`);
  grid.classList.toggle('hidden');
}

function saveEdit(idx) {
  currentFoods[idx] = {
    ...currentFoods[idx],
    name:      document.getElementById(`edit-name-${idx}`).value,
    quantity:  document.getElementById(`edit-qty-${idx}`).value,
    calories:  parseFloat(document.getElementById(`edit-cal-${idx}`).value)  || 0,
    protein_g: parseFloat(document.getElementById(`edit-pro-${idx}`).value)  || 0,
    carbs_g:   parseFloat(document.getElementById(`edit-carb-${idx}`).value) || 0,
    fat_g:     parseFloat(document.getElementById(`edit-fat-${idx}`).value)  || 0,
  };
  renderFoods();
  showToast('Changes saved');
}

async function refineFood(idx) {
  const text = document.getElementById(`refine-text-${idx}`).value.trim();
  if (!text) return;

  const currentFood = {
    ...currentFoods[idx],
    name:      document.getElementById(`edit-name-${idx}`).value,
    quantity:  document.getElementById(`edit-qty-${idx}`).value,
    calories:  parseFloat(document.getElementById(`edit-cal-${idx}`).value)  || 0,
    protein_g: parseFloat(document.getElementById(`edit-pro-${idx}`).value)  || 0,
    carbs_g:   parseFloat(document.getElementById(`edit-carb-${idx}`).value) || 0,
    fat_g:     parseFloat(document.getElementById(`edit-fat-${idx}`).value)  || 0,
  };

  const btn = document.querySelector(`#edit-${idx} .refine-box button`);
  const origText = btn.innerText;
  btn.innerText = '⏳ Refining...';
  btn.disabled = true;

  try {
    const res = await fetch('/refine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ food: currentFood, text: text }),
    });
    const data = await res.json();
    if (data.success) {
      currentFoods[idx] = data.food;
      renderFoods();
      document.getElementById(`edit-${idx}`).classList.remove('hidden');
      showToast('Food refined ✨');
    } else {
      showToast('Refine failed: ' + data.error, true);
    }
  } catch (e) {
    showToast('Error: ' + e.message, true);
  } finally {
    if (btn) {
      btn.innerText = origText;
      btn.disabled = false;
    }
  }
}

function removeFood(idx) {
  const card = document.getElementById(`food-card-${idx}`);
  if (card) {
    card.style.transition = 'all 0.25s ease';
    card.style.opacity = '0';
    card.style.transform = 'translateX(40px) scale(0.95)';
    setTimeout(() => {
      currentFoods.splice(idx, 1);
      renderFoods();
      if (currentFoods.length === 0) hide('food-results');
    }, 250);
  } else {
    currentFoods.splice(idx, 1);
    renderFoods();
    if (currentFoods.length === 0) hide('food-results');
  }
}

function addFoodManually() {
  currentFoods.push({
    name: 'New item', quantity: '1 serving',
    calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0,
  });
  renderFoods();
  const newIdx = currentFoods.length - 1;
  document.getElementById(`edit-${newIdx}`).classList.remove('hidden');
  document.getElementById(`edit-name-${newIdx}`).focus();
}

function renderTotals() {
  const totals = currentFoods.reduce(
    (acc, f) => ({
      calories:  acc.calories  + (f.calories  || 0),
      protein_g: acc.protein_g + (f.protein_g || 0),
      carbs_g:   acc.carbs_g   + (f.carbs_g   || 0),
      fat_g:     acc.fat_g     + (f.fat_g     || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );

  document.getElementById('totals-card').innerHTML = `
    <div class="total-item"><span>${Math.round(totals.calories)}</span><small>kcal</small></div>
    <div class="total-item"><span>${totals.protein_g.toFixed(1)}g</span><small>Protein</small></div>
    <div class="total-item"><span>${totals.carbs_g.toFixed(1)}g</span><small>Carbs</small></div>
    <div class="total-item"><span>${totals.fat_g.toFixed(1)}g</span><small>Fat</small></div>
  `;
}

// ── Log meal ──────────────────────────────────────────────────────────────
async function logMeal() {
  if (currentFoods.length === 0) return;
  const btn = document.getElementById('log-btn');
  btn.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;gap:8px;"><div class="spinner" style="width:18px;height:18px;border-width:2px;margin:0;"></div> Logging...</div>';
  btn.disabled = true;

  const timeVal = document.getElementById('meal-time').value;
  const dateVal = document.getElementById('meal-date').value;

  let timestamp = null;
  if (timeVal && dateVal) {
    const [h, m] = timeVal.split(':');
    const [year, month, day] = dateVal.split('-');
    const d = new Date();
    d.setFullYear(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
    timestamp = d.getTime();
  } else if (timeVal) {
    const [h, m] = timeVal.split(':');
    const d = new Date();
    d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
    timestamp = d.getTime();
  }

  try {
    const res  = await fetch('/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
          foods: currentFoods,
          meal_type: selectedMeal,
          time: timeVal,
          timestamp: timestamp
      }),
    });
    const data = await res.json();

    if (data.success) {
      hide('food-results');
      
      // Optimistic UI for history
      if (data.entry) {
          data.entry.syncing = true;
          data.entry.loggedAt = Date.now();
          historyData.unshift(data.entry);
          if (document.getElementById('tab-history').classList.contains('active')) {
              renderHistoryCards();
          }
      }

      const msg = document.getElementById('success-msg');
      msg.querySelector('span').textContent =
        data.health_logged
          ? 'Logged to Google Health!'
          : `Saved. (${data.health_message})`;
      show('success-msg');
      spawnConfetti();
      showToast('Meal logged! 🎉');
    } else {
      showToast('Error: ' + (data.error || 'Unknown error'), true);
    }
  } catch (e) {
    showToast('Error: ' + e.message, true);
  } finally {
    btn.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;gap:8px;"><i data-lucide="send" style="width:18px;height:18px;"></i> Log to Google Health</div>';
    lucide.createIcons();
    btn.disabled = false;
  }
}

function resetLog() {
  currentFoods = [];
  currentImageB64 = null;
  document.getElementById('preview-container').innerHTML = `
    <div class="upload-placeholder">
      <span class="upload-icon"><i data-lucide="camera" style="width:40px;height:40px;color:var(--accent)"></i></span>
      <p style="font-weight:600;margin-bottom:4px;">Snap your meal</p>
      <p style="font-size:0.82rem;color:var(--text-dim);">Take a photo or choose from gallery</p>
      <div class="upload-buttons">
        <button type="button" class="btn-secondary" style="display:flex;align-items:center;gap:5px;" onclick="event.stopPropagation(); document.getElementById('camera-input').click()">
          <i data-lucide="camera" style="width:14px;height:14px;"></i> Camera
        </button>
        <button type="button" class="btn-secondary" style="display:flex;align-items:center;gap:5px;" onclick="event.stopPropagation(); document.getElementById('gallery-input').click()">
          <i data-lucide="image" style="width:14px;height:14px;"></i> Gallery
        </button>
      </div>
    </div>`;
  lucide.createIcons();
  document.getElementById('extra-text').value = '';
  document.getElementById('food-list').innerHTML = '';
  document.getElementById('totals-card').innerHTML = '';
  hide('analyze-btn');
  hide('food-results');
  hide('success-msg');
  hide('spinner');
  hide('ai-questions-container');
}

// ── History ───────────────────────────────────────────────────────────────
let historyData = [];
let pendingDeletes = JSON.parse(localStorage.getItem('pendingDeletes') || '[]');
pendingDeletes = pendingDeletes.filter(d => Date.now() - d.time < 2 * 60 * 60 * 1000); // 2 hours TTL
localStorage.setItem('pendingDeletes', JSON.stringify(pendingDeletes));

async function loadHistory() {
  const list = document.getElementById('history-list');
  if (historyData.length === 0) {
    list.innerHTML = '<div style="display:flex;flex-direction:column;gap:0.5rem;"><div class="skeleton-card"></div><div class="skeleton-card" style="width:90%;"></div><div class="skeleton-card" style="width:80%;"></div></div>';
  }
  
  try {
    const res  = await fetch('/history');
    let serverData = await res.json();
    
    // Filter out deleted ghost meals
    serverData = serverData.filter(srv => !pendingDeletes.some(d => d.id === srv.id));
    
    // Keep optimistic entries that haven't synced yet (and are < 15 mins old)
    const optimistic = historyData.filter(opt => {
        if (!opt.syncing) return false;
        if (Date.now() - opt.loggedAt > 15 * 60 * 1000) return false;
        
        // Check if server data already has it
        const optTime = new Date(opt.id).getTime();
        const found = serverData.find(srv => {
            if (srv.meal_type !== opt.meal_type) return false;
            const srvTime = new Date(srv.id).getTime();
            // The optimistic ID is the end time (base_time), but the server ID is the start time (p_start)
            // Since meals are 15 minutes wide, srvTime is ~15 mins before optTime.
            return Math.abs(srvTime - optTime) < 20 * 60 * 1000; // 20 minutes window
        });
        
        if (found) {
            // It just successfully synced!
            found.justSynced = true;
            return false; // remove from optimistic
        }
        return true;
    });

    historyData = [...optimistic, ...serverData];
    historyData.sort((a, b) => new Date(b.id).getTime() - new Date(a.id).getTime());
    
    renderHistoryCards();
  } catch (e) {
    list.innerHTML = '<p class="empty-msg">Could not load history.</p>';
  }
}

function renderHistoryCards() {
    const list = document.getElementById('history-list');
    if (historyData.length === 0) {
      list.innerHTML = `
        <div style="text-align:center;padding:3rem 1rem;color:var(--text-muted);">
          <i data-lucide="utensils-crossed" style="width:48px;height:48px;opacity:0.3;margin-bottom:1rem;display:block;margin-left:auto;margin-right:auto;"></i>
          <p style="font-size:1.1rem;margin-bottom:0.5rem;color:var(--text);font-weight:700;">No meals logged yet</p>
          <p style="font-size:0.85rem;">Snap a photo to get started!</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }
    
    let currentDayStr = '';

    list.innerHTML = historyData.map((entry, entryIdx) => {
      const mealIcons = { Breakfast: '☀️', Lunch: '🍽️', Dinner: '🌙', Snack: '🍎', Other: '📋' };
      const icon = mealIcons[entry.meal_type] || '📋';
      const d = new Date(entry.id);
      const timeStr = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const dateStr = d.toLocaleDateString([], {weekday: 'short', month: 'short', day: 'numeric'});

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      let dayGroupLabel = dateStr;
      if (d.toDateString() === today.toDateString()) dayGroupLabel = 'Today';
      else if (d.toDateString() === yesterday.toDateString()) dayGroupLabel = 'Yesterday';

      let dayHeaderHtml = '';
      if (dayGroupLabel !== currentDayStr) {
        currentDayStr = dayGroupLabel;
        dayHeaderHtml = `<div class="history-day-separator">${dayGroupLabel}</div>`;
      }

      const foodList = entry.foods.map(f =>
        `<div class="history-food-item">${f.quantity ? f.quantity + ' ' : ''}${f.name}</div>`
      ).join('');

      let syncHtml = '';
      if (entry.syncing) {
          const elapsed = Math.floor((Date.now() - entry.loggedAt) / 1000);
          const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
          const s = (elapsed % 60).toString().padStart(2, '0');
          syncHtml = `
            <div class="sync-indicator" data-sync-start="${entry.loggedAt}" style="margin-top: 1rem; background: rgba(255,255,255,0.02); padding: 0.75rem; border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.06);">
              <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-dim); margin-bottom:8px; font-weight:600;">
                <span style="display:flex; align-items:center; gap:6px; color:var(--accent);"><i data-lucide="loader-2" class="spin" style="width:14px;height:14px;"></i> Syncing to Google Health...</span>
                <span class="sync-timer">${m}:${s} elapsed</span>
              </div>
              <div style="height:6px; background:rgba(255,255,255,0.08); border-radius:999px; overflow:hidden; position:relative;">
                <div class="shimmer-bar" style="height:100%; width:40%; background:var(--accent); border-radius:999px; position:absolute; left:0; top:0;"></div>
              </div>
            </div>
          `;
      } else if (entry.justSynced) {
          syncHtml = `
            <div class="sync-success animate-in" style="margin-top: 1rem; background: rgba(82, 168, 116, 0.1); padding: 0.75rem; border-radius: var(--radius-sm); border: 1px solid rgba(82, 168, 116, 0.2);">
              <div style="display:flex; align-items:center; gap:6px; color:#52a874; font-size:0.8rem; font-weight:600;">
                <i data-lucide="check-circle-2" style="width:16px;height:16px;"></i> Successfully synced to Google Health!
              </div>
            </div>
          `;
          entry.justSynced = false; // only show once
      }

      return `
      ${dayHeaderHtml}
      <div class="history-card animate-in" style="animation-delay:${entryIdx * 0.04}s;" id="history-entry-${entry.id}">
        <div class="history-card-inner">
          <div class="history-header">
            <div class="history-meal-info">
              <div class="history-meal-icon">${icon}</div>
              <div class="history-meal-text">
                <span class="history-meal">${entry.meal_type} <span style="font-weight:400;color:var(--text-dim);margin-left:6px;font-size:0.8rem;">${timeStr}</span></span>
              </div>
            </div>
            <button onclick="deleteEntry('${entry.id}')" class="btn-delete-meal" title="Delete">
              <i data-lucide="trash-2" style="width:15px;height:15px;"></i>
            </button>
          </div>
          <div class="history-pills" style="margin-bottom:0.6rem;">
            <span class="macro-pill macro-pill-kcal">${Math.round(entry.totals.calories)} kcal</span>
            <span class="macro-pill macro-pill-pro">${entry.totals.protein_g}g P</span>
            <span class="macro-pill macro-pill-carb">${entry.totals.carbs_g}g C</span>
            <span class="macro-pill macro-pill-fat">${entry.totals.fat_g}g F</span>
          </div>
          <div class="history-foods">${foodList}</div>
          ${syncHtml}
        </div>
      </div>`;
    }).join('');

    setTimeout(() => lucide.createIcons(), 0);
}

async function deleteEntry(id) {
    const entry = historyData.find(e => e.id === id);
    if (!entry) return;

    if (!confirm('Delete this meal from Google Fit?')) return;

    const el = document.getElementById('history-entry-' + id);
    let btn, originalIcon;
    if (el) {
        btn = el.querySelector('.btn-delete-meal');
        if (btn) {
            originalIcon = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="loader-2" class="spin" style="width:15px;height:15px;"></i>';
            btn.disabled = true;
            lucide.createIcons();
        }
        el.style.opacity = '0.5';
    }

    try {
        const res = await fetch('/log/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ foods: entry.foods })
        });

        if (res.ok) {
            // Add to local cache so it doesn't reappear on refresh while Google syncs
            pendingDeletes.push({ id: id, time: Date.now() });
            localStorage.setItem('pendingDeletes', JSON.stringify(pendingDeletes));

            historyData = historyData.filter(e => e.id !== id);
            setTimeout(() => {
                if (el) el.remove();
                if (historyData.length === 0) loadHistory(); // show empty state
            }, 300);
            showToast('Meal deleted from Google Fit');
        } else {
            const data = await res.json();
            showToast('Failed: ' + data.error, true);
            if (el) { el.style.opacity = '1'; }
            if (btn) { btn.innerHTML = originalIcon; btn.disabled = false; }
        }
    } catch (e) {
        showToast('Error: ' + e.message, true);
        if (el) { el.style.opacity = '1'; }
        if (btn) { btn.innerHTML = originalIcon; btn.disabled = false; }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────
function show(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hide(id) { document.getElementById(id)?.classList.add('hidden'); }
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(message, isError = false) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast-pill${isError ? ' error' : ''}`;
  toast.innerHTML = `<span class="toast-dot"></span>${escHtml(message)}`;
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(20px) scale(0.95)';
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.transition = 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0) scale(1)';
  });

  setTimeout(() => {
    toast.style.transition = 'all 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px) scale(0.95)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function spawnConfetti() {
  const msg = document.getElementById('success-msg');
  if (!msg) return;
  const colors = ['#52a874', '#8ec8f2', '#ebb249', '#e0c29b', '#dfca92', '#e55b5b'];
  for (let i = 0; i < 20; i++) {
    const dot = document.createElement('div');
    dot.className = 'confetti';
    dot.style.background = colors[Math.floor(Math.random() * colors.length)];
    dot.style.left = Math.random() * 100 + '%';
    dot.style.top = Math.random() * 40 + '%';
    dot.style.animationDelay = Math.random() * 0.5 + 's';
    dot.style.animationDuration = (0.8 + Math.random() * 0.6) + 's';
    msg.appendChild(dot);
    setTimeout(() => dot.remove(), 2000);
  }
}

function autoSelectMealTime() {
  const timeInput = document.getElementById('meal-time');
  const dateInput = document.getElementById('meal-date');
  if (timeInput && !timeInput.value) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    timeInput.value = `${hh}:${mm}`;
  }
  if (dateInput && !dateInput.value) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  const h = new Date().getHours();
  let meal = 'Snack';
  if (h >= 5 && h < 11) meal = 'Breakfast';
  else if (h >= 11 && h < 16) meal = 'Lunch';
  else if (h >= 16 && h < 22) meal = 'Dinner';

  const btn = document.querySelector(`.meal-btn[data-meal="${meal}"]`);
  if (btn) selectMeal(btn);
}

document.addEventListener('DOMContentLoaded', () => {
  autoSelectMealTime();
});

// ── Background Timers ─────────────────────────────────────────────────────
setInterval(() => {
    document.querySelectorAll('.sync-indicator').forEach(el => {
        const start = parseInt(el.getAttribute('data-sync-start'), 10);
        if (!start) return;
        const elapsed = Math.floor((Date.now() - start) / 1000);
        const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const s = (elapsed % 60).toString().padStart(2, '0');
        const timerEl = el.querySelector('.sync-timer');
        if (timerEl) {
            timerEl.textContent = `${m}:${s} elapsed`;
        }
    });
}, 1000);
