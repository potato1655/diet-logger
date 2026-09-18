// ── State ─────────────────────────────────────────────────────────────────
let currentFoods   = [];
let selectedMeal   = 'Lunch';
let currentImageB64 = null;

// ── Init ──────────────────────────────────────────────────────────────────
window.addEventListener('load', async () => {
  await checkAuth();

  // Handle OAuth success redirect
  if (new URLSearchParams(location.search).get('auth') === 'success') {
    history.replaceState({}, '', '/');
  }

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.warn);
  }

  // Set default meal time to now
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
    currentTab.style.transform = 'translateY(10px)';
    setTimeout(() => {
      currentTab.classList.remove('active');
      newTab.classList.add('active');
      // Force reflow
      void newTab.offsetWidth;
      newTab.style.opacity = '1';
      newTab.style.transform = 'translateY(0)';
      if (name === 'history') loadHistory();
      if (name === 'home') loadHistory(); // we need history for dashboard
    }, 150); // match half transition time
  } else {
    newTab.classList.add('active');
    void newTab.offsetWidth;
    newTab.style.opacity = '1';
    newTab.style.transform = 'translateY(0)';
    if (name === 'history' || name === 'home') loadHistory();
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
      // Client side resize to avoid Payload Too Large errors
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 1024;
      const MAX_HEIGHT = 1024;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
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
  
  // Collect AI question answers if they exist
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
      throw new Error(`Server returned invalid response (Status ${res.status}). This usually means the image file is too large.`);
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
            <div style="font-weight:500;margin-bottom:0.4rem;color:var(--text);font-size:0.95rem;">${escHtml(q)}</div>
            <input type="text" id="ai-q-${i}" placeholder="Type your answer here..." style="width:100%;padding:0.6rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg);color:var(--text);" />
          </li>
        `).join('');
        qContainer.classList.remove('hidden');
      } else {
        qContainer.classList.add('hidden');
      }
      
      show('food-results');
      show('analyze-btn');
      document.getElementById('analyze-btn').innerHTML = '<div style="display:flex;align-items:center;justify-content:center;gap:6px;"><i data-lucide="refresh-ccw" style="width:16px;height:16px;"></i> Re-Analyze</div>';
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
    card.innerHTML = `
      <button class="btn-remove" onclick="removeFood(${idx})" title="Remove">✕</button>
      <div class="food-name">${escHtml(food.name)}</div>
      <div class="food-qty">${escHtml(food.quantity)}</div>
      <div class="food-macros">
        <span class="macro-pill cal">🔥 ${food.calories} kcal</span>
        <span class="macro-pill">🥩 ${food.protein_g}g protein</span>
        <span class="macro-pill">🍞 ${food.carbs_g}g carbs</span>
        <span class="macro-pill">🧈 ${food.fat_g}g fat</span>
      </div>
      <button class="btn-edit" onclick="toggleEdit(${idx})">✏️ Edit</button>
      <div class="edit-grid hidden" id="edit-${idx}">
        <input class="edit-full" placeholder="Food name" value="${escHtml(food.name)}" id="edit-name-${idx}" />
        <input placeholder="Quantity" value="${escHtml(food.quantity)}" id="edit-qty-${idx}" />
        <input type="number" placeholder="Calories" value="${food.calories}" id="edit-cal-${idx}" />
        <input type="number" placeholder="Protein (g)" value="${food.protein_g}" id="edit-pro-${idx}" />
        <input type="number" placeholder="Carbs (g)" value="${food.carbs_g}" id="edit-carb-${idx}" />
        <input type="number" placeholder="Fat (g)" value="${food.fat_g}" id="edit-fat-${idx}" />
        
        <div class="edit-full refine-box">
          <input type="text" id="refine-text-${idx}" placeholder="e.g. 'it was a small apple'" style="width: 70%;" />
          <button type="button" onclick="refineFood(${idx})" style="padding: 0.5rem; background: var(--primary); color: white; border: none; border-radius: 4px;">✨ Refine</button>
        </div>
        
        <button class="btn-save edit-full" onclick="saveEdit(${idx})">💾 Save Changes</button>
      </div>
    `;
    list.appendChild(card);
  });

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
}

async function refineFood(idx) {
  const text = document.getElementById(`refine-text-${idx}`).value.trim();
  if (!text) return;
  
  // Read current unsaved values from the form just in case they modified it
  const currentFood = {
    ...currentFoods[idx],
    name:      document.getElementById(`edit-name-${idx}`).value,
    quantity:  document.getElementById(`edit-qty-${idx}`).value,
    calories:  parseFloat(document.getElementById(`edit-cal-${idx}`).value)  || 0,
    protein_g: parseFloat(document.getElementById(`edit-pro-${idx}`).value)  || 0,
    carbs_g:   parseFloat(document.getElementById(`edit-carb-${idx}`).value) || 0,
    fat_g:     parseFloat(document.getElementById(`edit-fat-${idx}`).value)  || 0,
  };

  const btn = document.querySelector(`#edit-${idx} button[onclick="refineFood(${idx})"]`);
  btn.innerText = '✨ Refining...';
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
      // Keep edit open
      document.getElementById(`edit-${idx}`).classList.remove('hidden');
    } else {
      alert('Refine failed: ' + data.error);
    }
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    if (btn) {
      btn.innerText = '✨ Refine';
      btn.disabled = false;
    }
  }
}


function removeFood(idx) {
  currentFoods.splice(idx, 1);
  renderFoods();
  if (currentFoods.length === 0) hide('food-results');
}

function addFoodManually() {
  currentFoods.push({
    name: 'New item', quantity: '1 serving',
    calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0,
  });
  renderFoods();
  // Auto-open edit for the new item
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
  btn.textContent = 'Logging...';
  btn.disabled = true;

  const timeVal = document.getElementById('meal-time').value; // e.g. "14:30"
  
  // Calculate exact timestamp on the client to avoid server timezone bugs
  let timestamp = null;
  if (timeVal) {
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
      const msg = document.getElementById('success-msg');
      msg.querySelector('span').textContent =
        data.health_logged
          ? 'Meal logged to Google Health!'
          : `Saved locally. (Google Health: ${data.health_message})`;
      show('success-msg');
      showToast('Meal logged successfully!');
    } else {
      showToast('Error logging meal: ' + (data.error || 'Unknown error'), true);
    }
  } catch (e) {
    showToast('Error: ' + e.message, true);
  } finally {
    btn.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;gap:6px;"><i data-lucide="check" style="width:18px;height:18px;"></i> Log Meal</div>';
    lucide.createIcons();
    btn.disabled = false;
  }
}

function resetLog() {
  currentFoods = [];
  currentImageB64 = null;
  document.getElementById('preview-container').innerHTML = `
    <div class="upload-placeholder">
      <span class="upload-icon">📸</span>
      <p>Tap to take a photo<br/><small>or choose from gallery</small></p>
    </div>`;
  document.getElementById('extra-text').value = '';
  document.getElementById('food-list').innerHTML = '';
  document.getElementById('totals-card').innerHTML = '';
  hide('analyze-btn');
  hide('food-results');
  hide('success-msg');
  hide('spinner');
  document.getElementById('food-input').value = '';
}

// ── History ───────────────────────────────────────────────────────────────
let historyData = [];

async function loadHistory() {
  const list = document.getElementById('history-list');
  list.innerHTML = '<p class="empty-msg">Loading...</p>';
  try {
    const res  = await fetch('/history');
    const data = await res.json();
    historyData = data;
    if (data.length === 0) {
      list.innerHTML = `
        <div class="empty-state" style="text-align:center;padding:3rem 1rem;color:var(--text-muted)">
          <i data-lucide="utensils-crossed" style="width:48px;height:48px;opacity:0.5;margin-bottom:1rem;"></i>
          <p style="font-size:1.1rem;margin-bottom:0.5rem;color:var(--text)">No meals logged yet</p>
          <p style="font-size:0.9rem">Your recent meals from Google Fit will appear here.</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }
    let currentDayStr = '';
    
    list.innerHTML = data.map(entry => {
      const mealIcons = { Breakfast: '☀️', Lunch: '🍽️', Dinner: '🌙', Snack: '🍎', Other: '📋' };
      const icon = mealIcons[entry.meal_type] || '📋';
      const d = new Date(entry.id);
      const timeStr = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const dateStr = d.toLocaleDateString([], {weekday: 'short', month: 'short', day: 'numeric'});
      
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      let dayGroupLabel = dateStr;
      if (d.toDateString() === today.toDateString()) {
        dayGroupLabel = 'Today';
      } else if (d.toDateString() === yesterday.toDateString()) {
        dayGroupLabel = 'Yesterday';
      }
      
      let dayHeaderHtml = '';
      if (dayGroupLabel !== currentDayStr) {
        currentDayStr = dayGroupLabel;
        dayHeaderHtml = `<div class="history-day-separator" style="margin-top: 1.25rem; margin-bottom: 0.6rem; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; padding-left: 0.25rem;">${dayGroupLabel}</div>`;
      }
      
      const foodList = entry.foods.map(f => 
        `<div class="history-food-item">${f.quantity ? f.quantity + ' ' : ''}${f.name}</div>`
      ).join('');
      
      return `
      ${dayHeaderHtml}
      <div class="history-card" id="history-entry-${entry.id}">
        <div class="history-card-inner">
          <div class="history-header">
            <div class="history-meal-info">
              <div class="history-meal-icon">${icon}</div>
              <div class="history-meal-text">
                <span class="history-meal">${entry.meal_type} <span style="font-weight:400; color:var(--text-dim); margin-left:6px; font-size:0.8rem;">${timeStr}</span></span>
              </div>
            </div>
            <button onclick="deleteEntry('${entry.id}')" class="btn-delete-meal" title="Delete Meal">
              <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
            </button>
          </div>
          <div class="history-pills" style="margin-bottom:0.75rem;">
            <span class="macro-pill macro-pill-kcal">${Math.round(entry.totals.calories)} kcal</span>
            <span class="macro-pill macro-pill-pro">${entry.totals.protein_g}g P</span>
            <span class="macro-pill macro-pill-carb">${entry.totals.carbs_g}g C</span>
            <span class="macro-pill macro-pill-fat">${entry.totals.fat_g}g F</span>
          </div>
          <div class="history-foods">${foodList}</div>
        </div>
      </div>`;
    }).join('');
    
    // Instantiate lucide icons for trash bin
    setTimeout(() => lucide.createIcons(), 0);
  } catch (e) {
    list.innerHTML = '<p class="empty-msg">Could not load history.</p>';
  }
}

async function deleteEntry(id) {
    const entry = historyData.find(e => e.id === id);
    if (!entry) return;
    
    if (!confirm('Are you sure you want to delete this meal? This will remove it from Google Fit as well.')) return;
    
    document.getElementById(`history-entry-${id}`).style.opacity = '0.5';
    
    try {
        const res = await fetch('/log/delete', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ foods: entry.foods })
        });
        
        if (res.ok) {
            loadHistory();
            showToast('Meal deleted successfully');
        } else {
            const data = await res.json();
            showToast('Failed to delete meal: ' + data.error, true);
            document.getElementById(`history-entry-${id}`).style.opacity = '1';
        }
    } catch (e) {
        showToast('Error: ' + e.message, true);
        document.getElementById(`history-entry-${id}`).style.opacity = '1';
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
  toast.style.cssText = `
    background: ${isError ? 'var(--red)' : 'var(--accent)'};
    color: white;
    padding: 12px 16px;
    border-radius: var(--radius-sm);
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    font-size: 0.95rem;
    font-weight: 500;
    transition: opacity 0.3s, transform 0.3s;
    opacity: 0;
    transform: translateY(20px);
    pointer-events: auto;
  `;
  toast.textContent = message;
  container.appendChild(toast);
  
  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });
  
  // Remove after 4s
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function autoSelectMealTime() {
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


