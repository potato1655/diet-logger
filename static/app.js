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
  document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
  if (name === 'history') loadHistory();
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

  const extraText = document.getElementById('extra-text').value.trim();

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
        qList.innerHTML = data.questions.map(q => `<li>${escHtml(q)}</li>`).join('');
        qContainer.classList.remove('hidden');
      } else {
        qContainer.classList.add('hidden');
      }
      
      show('food-results');
      show('analyze-btn');
      document.getElementById('analyze-btn').innerText = '🔄 Re-Analyze with text';
    } else {
      alert('Analysis failed: ' + data.error);
      show('analyze-btn');
    }
  } catch (e) {
    hide('spinner');
    alert('Error: ' + e.message);
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
  
  try {
    const res  = await fetch('/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
          foods: currentFoods, 
          meal_type: selectedMeal,
          time: timeVal
      }),
    });
    const data = await res.json();

    if (data.success) {
      hide('food-results');
      const msg = document.getElementById('success-msg');
      msg.querySelector('span').textContent =
        data.health_logged
          ? '✅ Meal logged to Google Health!'
          : `✅ Saved locally. (Google Health: ${data.health_message})`;
      show('success-msg');
    } else {
      alert('Error logging meal');
    }
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    btn.textContent = '✅ Log Meal';
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
      list.innerHTML = '<p class="empty-msg">No meals logged yet.</p>';
      return;
    }
    list.innerHTML = data.map(entry => {
      const mealIcons = { Breakfast: '☀️', Lunch: '🍽️', Dinner: '🌙', Snack: '🍎', Other: '📋' };
      const icon = mealIcons[entry.meal_type] || '📋';
      const d = new Date(entry.id);
      const timeStr = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const dateStr = d.toLocaleDateString([], {weekday: 'short', month: 'short', day: 'numeric'});
      
      const foodList = entry.foods.map(f => 
        `<div class="history-food-item">${f.quantity ? f.quantity + ' ' : ''}${f.name}</div>`
      ).join('');
      
      // Build nutrients grid from micros
      let nutrientsHtml = '';
      entry.foods.forEach(f => {
        if (f.micros && Object.keys(f.micros).length > 0) {
          let items = '';
          for (const [k, v] of Object.entries(f.micros)) {
            if (v > 0) {
              let label = k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              items += `<div class="nutrient-item"><span class="nutrient-label">${label}</span><span class="nutrient-value">${v}</span></div>`;
            }
          }
          if (items) {
            nutrientsHtml += `<div class="nutrients-grid">${items}</div>`;
          }
        }
      });
      
      return `
      <div class="history-card" id="history-entry-${entry.id}">
        <div class="history-card-inner">
          <div class="history-header">
            <div class="history-meal-info">
              <div class="history-meal-icon">${icon}</div>
              <div class="history-meal-text">
                <span class="history-meal">${entry.meal_type}</span>
                <span class="history-time">${dateStr} · ${timeStr}</span>
              </div>
            </div>
            <div class="history-pills">
              <span class="macro-pill macro-pill-kcal">${Math.round(entry.totals.calories)} kcal</span>
              <span class="macro-pill macro-pill-pro">${entry.totals.protein_g}g P</span>
              <span class="macro-pill macro-pill-carb">${entry.totals.carbs_g}g C</span>
              <span class="macro-pill macro-pill-fat">${entry.totals.fat_g}g F</span>
              <button onclick="deleteEntry('${entry.id}')" class="btn-delete-meal" title="Delete Meal">🗑️</button>
            </div>
          </div>
          <div class="history-foods">${foodList}</div>
          ${nutrientsHtml ? `
          <details class="nutrients-dropdown">
            <summary>Show full nutrients</summary>
            ${nutrientsHtml}
          </details>` : ''}
        </div>
      </div>`;
    }).join('');
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
        } else {
            const data = await res.json();
            alert('Failed to delete meal: ' + data.error);
            document.getElementById(`history-entry-${id}`).style.opacity = '1';
        }
    } catch (e) {
        alert('Error: ' + e.message);
        document.getElementById(`history-entry-${id}`).style.opacity = '1';
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────
function show(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hide(id) { document.getElementById(id)?.classList.add('hidden'); }
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
