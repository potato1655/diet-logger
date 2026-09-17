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

  try {
    const res  = await fetch('/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ foods: currentFoods, meal_type: selectedMeal }),
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
async function loadHistory() {
  const list = document.getElementById('history-list');
  list.innerHTML = '<p class="empty-msg">Loading...</p>';
  try {
    const res  = await fetch('/history');
    const data = await res.json();
    if (data.length === 0) {
      list.innerHTML = '<p class="empty-msg">No meals logged yet.</p>';
      return;
    }
    list.innerHTML = data.map(entry => `
      <div class="history-card" id="history-entry-${entry.id}">
        <div class="history-header">
          <div>
            <span class="history-meal">${entry.meal_type}</span>
            <span class="history-time" style="margin-left:8px; font-size:0.85rem;">
                ${new Date(entry.id).toLocaleDateString()} at ${new Date(entry.id).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </span>
          </div>
          <div>
            <span class="history-cals">${Math.round(entry.totals.calories)} kcal</span>
            <button onclick="deleteEntry('${entry.id}')" style="background:none; border:none; cursor:pointer; color:#ef4444; margin-left: 8px;" title="Delete Meal">🗑️</button>
          </div>
        </div>
        <div class="history-foods">${entry.foods.map(f => f.name).join(' · ')}</div>
        <div class="history-macros">
          <span class="macro-pill">🥩 ${entry.totals.protein_g}g</span>
          <span class="macro-pill">🍞 ${entry.totals.carbs_g}g</span>
          <span class="macro-pill">🧈 ${entry.totals.fat_g}g</span>
        </div>
        <details style="margin-top: 8px; font-size: 0.85rem; color: #64748b;">
          <summary style="cursor: pointer; font-weight: 500;">Show full nutrients</summary>
          <div style="margin-top: 4px; padding: 4px; background: rgba(0,0,0,0.02); border-radius: 4px;">
            ${entry.foods.map(f => {
                let micros = [];
                if (f.sugar_g) micros.push(`Sugar: ${f.sugar_g}g`);
                if (f.fiber_g) micros.push(`Fiber: ${f.fiber_g}g`);
                if (f.cholesterol_mg) micros.push(`Cholesterol: ${f.cholesterol_mg}mg`);
                if (f.sodium_mg) micros.push(`Sodium: ${f.sodium_mg}mg`);
                if (f.potassium_mg) micros.push(`Potassium: ${f.potassium_mg}mg`);
                if (f.vitamin_a_iu) micros.push(`Vit A: ${f.vitamin_a_iu}IU`);
                if (f.vitamin_c_mg) micros.push(`Vit C: ${f.vitamin_c_mg}mg`);
                if (f.calcium_mg) micros.push(`Calcium: ${f.calcium_mg}mg`);
                if (f.iron_mg) micros.push(`Iron: ${f.iron_mg}mg`);
                return micros.length > 0 ? `<b>${f.name}</b>: ${micros.join(', ')}` : '';
            }).filter(s => s).join('<br>')}
          </div>
        </details>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = '<p class="empty-msg">Could not load history.</p>';
  }
}

async function deleteEntry(id) {
    if (!confirm('Are you sure you want to delete this meal? This will remove it from Google Fit as well.')) return;
    
    document.getElementById(`history-entry-${id}`).style.opacity = '0.5';
    
    try {
        const res = await fetch(`/log/${id}`, { method: 'DELETE' });
        if (res.ok) {
            loadHistory();
        } else {
            alert('Failed to delete meal');
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
