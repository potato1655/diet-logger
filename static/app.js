// ── State ─────────────────────────────────────────────────────────────────
let currentFoods   = [];
let selectedMeal   = 'Lunch';
let currentImageB64 = null;

// ── Daily Targets (Male 19-21, Weight Gain Plan) ──────────────────────────
const DAILY_TARGETS = {
  macros: {
    calories:  { label: 'Calories',  target: 2350,  unit: 'kcal' },
    protein_g: { label: 'Protein',   target: 130,   unit: 'g' },
    carbs_g:   { label: 'Carbs',     target: 295,   unit: 'g' },
    fat_g:     { label: 'Fat',       target: 73,    unit: 'g' },
    fiber_g:   { label: 'Fiber',     target: 38,    unit: 'g' },
  },
  micros: {
    // Vitamins
    vitamin_a_iu:     { label: 'Vitamin A',      target: 3000,  unit: 'IU'  },  // 900mcg ≈ 3000 IU
    vitamin_c_mg:     { label: 'Vitamin C',      target: 90,    unit: 'mg'  },
    vitamin_d_iu:     { label: 'Vitamin D',      target: 600,   unit: 'IU'  },
    vitamin_e_mg:     { label: 'Vitamin E',      target: 15,    unit: 'mg'  },
    vitamin_k_mcg:    { label: 'Vitamin K',      target: 120,   unit: 'mcg' },
    thiamin_mg:       { label: 'Thiamin (B1)',   target: 1.2,   unit: 'mg'  },
    riboflavin_mg:    { label: 'Riboflavin (B2)',target: 1.3,   unit: 'mg'  },
    niacin_mg:        { label: 'Niacin (B3)',    target: 16,    unit: 'mg'  },
    vitamin_b6_mg:    { label: 'Vitamin B6',     target: 1.3,   unit: 'mg'  },
    folate_mcg:       { label: 'Folate (B9)',    target: 400,   unit: 'mcg' },
    vitamin_b12_mcg:  { label: 'Vitamin B12',    target: 2.4,   unit: 'mcg' },
    biotin_mcg:       { label: 'Biotin (B7)',    target: 30,    unit: 'mcg' },
    pantothenic_mg:   { label: 'Pantothenic (B5)',target: 5,    unit: 'mg'  },
    choline_mg:       { label: 'Choline',        target: 550,   unit: 'mg'  },
    // Minerals
    calcium_mg:       { label: 'Calcium',        target: 1000,  unit: 'mg'  },
    iron_mg:          { label: 'Iron',           target: 8,     unit: 'mg'  },
    magnesium_mg:     { label: 'Magnesium',      target: 400,   unit: 'mg'  },
    phosphorus_mg:    { label: 'Phosphorus',     target: 700,   unit: 'mg'  },
    potassium_mg:     { label: 'Potassium',      target: 3400,  unit: 'mg'  },
    sodium_mg:        { label: 'Sodium',         target: 2300,  unit: 'mg', max: true },
    zinc_mg:          { label: 'Zinc',           target: 11,    unit: 'mg'  },
    selenium_mcg:     { label: 'Selenium',       target: 55,    unit: 'mcg' },
    copper_mcg:       { label: 'Copper',         target: 900,   unit: 'mcg' },
    manganese_mg:     { label: 'Manganese',      target: 2.3,   unit: 'mg'  },
    chromium_mcg:     { label: 'Chromium',        target: 35,    unit: 'mcg' },
    iodine_mcg:       { label: 'Iodine',         target: 150,   unit: 'mcg' },
    // Essential fats
    omega_3_g:        { label: 'Omega-3 (ALA)',  target: 1.6,   unit: 'g'   },
    omega_6_g:        { label: 'Omega-6 (LA)',   target: 17,    unit: 'g'   },
    epa_dha_mg:       { label: 'EPA + DHA',      target: 375,   unit: 'mg'  },
  }
};

function renderDailyDashboard(meals) {
  const container = document.getElementById('daily-dashboard');
  if (!container) return;
  
  // Filter to today's meals only
  const today = new Date();
  const todayStr = today.toDateString();
  const todayMeals = meals.filter(m => new Date(m.id).toDateString() === todayStr);
  
  if (todayMeals.length === 0) {
    container.innerHTML = `<div class="dashboard-empty">No meals logged today yet</div>`;
    return;
  }
  
  // Sum macros
  const sums = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };
  const microSums = {};
  
  todayMeals.forEach(m => {
    sums.calories  += m.totals?.calories  || 0;
    sums.protein_g += m.totals?.protein_g || 0;
    sums.carbs_g   += m.totals?.carbs_g   || 0;
    sums.fat_g     += m.totals?.fat_g     || 0;
    sums.fiber_g   += m.totals?.fiber_g   || 0;
    
    m.foods.forEach(f => {
      if (f.micros) {
        for (const [k, v] of Object.entries(f.micros)) {
          microSums[k] = (microSums[k] || 0) + v;
        }
      }
    });
  });
  
  // ── Hero Macros (Google Fit Style) ──
  const cals = Math.round(sums.calories || 0);
  const targetCals = DAILY_TARGETS.macros.calories.target;
  const diff = targetCals - cals;
  
  let state = 'under';
  if (Math.abs(diff) <= 150) state = 'target';
  else if (diff < 0) state = 'over';

  let heroColor = '#5cc5ed'; // Cyan
  let glowColor = 'rgba(92, 197, 237, 0.4)';
  let heroTitle = '';
  let heroSubtitle = '';

  if (state === 'under') {
    heroTitle = `<span style="font-size: 3.5rem;">${diff.toLocaleString()}</span> <span style="font-size: 1.2rem; font-weight: 500; color: var(--text);">cal under</span>`;
    heroSubtitle = "Keep fuelling your body to stay energized for the rest of the day.";
  } else if (state === 'target') {
    heroColor = '#6dbf8d'; // Green
    glowColor = 'rgba(109, 191, 141, 0.4)';
    heroTitle = `<span style="font-size: 3.5rem;">On target</span>`;
    heroSubtitle = "You're in the calorie sweet spot. Great work finding the right balance.";
  } else {
    heroColor = '#f2a93b'; // Orange
    glowColor = 'rgba(242, 169, 59, 0.4)';
    heroTitle = `<span style="font-size: 3.5rem;">${Math.abs(diff).toLocaleString()}</span> <span style="font-size: 1.2rem; font-weight: 500; color: var(--text);">cal over</span>`;
    heroSubtitle = "Looks like it's a higher energy day. Remember, weekly balance matters most.";
  }
  
  document.documentElement.style.setProperty('--glow-color', glowColor);

  let macroHtml = `
    <div class="hero-metric-container" style="margin: 1.5rem 0 2rem 0; z-index: 1; position: relative;">
      <div style="font-size: 1rem; color: var(--text); margin-bottom: 0.5rem; font-weight: 600;">Today</div>
      <div style="font-weight: 700; letter-spacing: -0.03em; color: ${heroColor}; line-height: 1; margin-bottom: 0.75rem; display: flex; align-items: baseline; gap: 6px;">
        ${heroTitle}
      </div>
      <div style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.4; max-width: 95%;">
        ${heroSubtitle}
      </div>
    </div>
    
    <div class="hero-macros-row" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin-bottom: 2rem; background: var(--card); padding: 8px; border-radius: 16px; border: 1px solid var(--border);">
  `;

  for (const key of ['protein_g', 'carbs_g', 'fat_g']) {
    const info = DAILY_TARGETS.macros[key];
    const current = Math.round(sums[key] || 0);
    const pct = Math.min(Math.round((current / info.target) * 100), 100);
    const barColor = key === 'protein_g' ? '#7cb8e0' : key === 'carbs_g' ? '#d8a850' : '#c8b090';
    macroHtml += `
      <div class="hero-macro-item" style="display: flex; flex-direction: column; gap: 4px; cursor: pointer; padding: 8px; border-radius: 10px; transition: background 0.2s;" onclick="openMacroHistory('${key}')" onmouseover="this.style.background='var(--bg-raised)'" onmouseout="this.style.background='transparent'">
        <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">${info.label}</div>
        <div style="font-size: 0.95rem; font-weight: 600; color: var(--text);">${current} <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 400;">/ ${info.target}g</span></div>
        <div style="height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; margin-top: 4px; overflow: hidden;">
          <div style="width: ${pct}%; background: ${barColor}; height: 100%; border-radius: 2px;"></div>
        </div>
      </div>
    `;
  }
  macroHtml += `</div>`;
  
  // Render micro progress (only the ones that have data)
  let microHtml = '';
  const microEntries = Object.entries(DAILY_TARGETS.micros).filter(([k]) => (microSums[k] || 0) > 0);
  
  if (microEntries.length > 0) {
    let groups = { 'VITAMINS': [], 'MINERALS': [], 'FATS & FIBER': [], 'OTHER': [] };
    
    for (const [key, info] of microEntries) {
      const current = Math.round((microSums[key] || 0) * 10) / 10;
      const pct = Math.min(Math.round((current / info.target) * 100), 100);
      let color = '#ff5e5e'; // red
      if (pct >= 100) color = 'var(--accent)';
      else if (pct >= 33) color = '#f2a93b'; // yellow

      const itemObj = {
        key, pct,
        html: `
        <div style="background: var(--bg-raised); border-radius: 14px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between; border: 1px solid var(--border);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <div style="font-size: 0.9rem; font-weight: 500; color: var(--text);">${info.label}</div>
          </div>
          <div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 6px;">${current} / ${info.target} <span style="font-size: 0.7rem;">${info.unit}</span></div>
            <div style="height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; display: flex;">
              <div style="width:${pct}%; background:${color}; height: 100%; border-radius: 2px;"></div>
            </div>
          </div>
        </div>`
      };
        
      if (key.startsWith('vitamin_')) groups['VITAMINS'].push(itemObj);
      else if (['calcium_mg', 'iron_mg', 'potassium_mg', 'sodium_mg', 'zinc_mg', 'magnesium_mg'].includes(key)) groups['MINERALS'].push(itemObj);
      else if (key.includes('fat') || key.includes('fiber') || key.includes('omega') || key.includes('cholesterol')) groups['FATS & FIBER'].push(itemObj);
      else groups['OTHER'].push(itemObj);
    }
    
    for (const [groupName, itemsObj] of Object.entries(groups)) {
      if (itemsObj.length > 0) {
        itemsObj.sort((a, b) => a.pct - b.pct);
        const items = itemsObj.map(i => i.html);
        
        microHtml += `
          <div style="margin-top: 1.5rem; margin-bottom: 0.75rem; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; padding-left: 4px;">
            ${groupName}
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            ${items.join('')}
          </div>
        `;
      }
    }
    microHtml += `<div style="text-align: center; color: var(--text-dim); font-size: 0.65rem; margin-top: 1rem; margin-bottom: 0.5rem;">sorted by most behind</div>`;
  }
  
  window.currentMicroHtml = microHtml;
  
  let microButtonHtml = '';
  if (microHtml) {
    microButtonHtml = `
      <div style="margin-top: 0.5rem; margin-bottom: 2rem;">
        <button onclick="openMicrosModal()" style="width: 100%; background: var(--bg-raised); border: 1px solid var(--border); padding: 1rem; border-radius: 16px; color: var(--text); cursor: pointer; font-size: 0.95rem; font-weight: 500; display: flex; align-items: center; justify-content: space-between; font-family: inherit; transition: all 0.2s;" onmouseover="this.style.background='var(--card)'" onmouseout="this.style.background='var(--bg-raised)'">
          <div style="display: flex; align-items: center; gap: 0.8rem;">
            <div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 10px;">
              <i data-lucide="test-tubes" style="width: 18px; height: 18px; color: #7cb8e0;"></i>
            </div>
            Detailed Micronutrients
          </div>
          <i data-lucide="chevron-right" style="width: 18px; height: 18px; color: var(--text-dim);"></i>
        </button>
      </div>
    `;
  }

  container.innerHTML = `
    ${macroHtml}
    ${microButtonHtml}
    
    <div id="ai-week-insight-container" style="margin-bottom: 0.5rem;">
      <button onclick="getWeekInsight()" class="btn-ai-insight" style="width: 100%; background: var(--bg-raised); border: 1px solid var(--border); padding: 1rem; border-radius: 16px; color: var(--text); cursor: pointer; font-size: 0.95rem; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 0.6rem; font-family: inherit; transition: all 0.2s;" onmouseover="this.style.background='var(--card)'" onmouseout="this.style.background='var(--bg-raised)'">
        <i data-lucide="sparkles" style="width: 18px; height: 18px; color: var(--accent);"></i>
        Weekly AI Summary
      </button>
    </div>
  `;
  
  setTimeout(() => lucide.createIcons(), 0);
}

function openMicrosModal() {
  document.getElementById('generic-modal-title').innerText = "Micronutrients";
  document.getElementById('generic-modal-content').innerHTML = window.currentMicroHtml || '<p>No data</p>';
  document.getElementById('generic-modal').style.display = 'block';
  setTimeout(() => lucide.createIcons(), 0);
}

function openMacroHistory(macroKey) {
  const info = DAILY_TARGETS.macros[macroKey];
  document.getElementById('generic-modal-title').innerText = info.label + " History (Last 7 Days)";
  
  // Build last 7 days history
  const today = new Date();
  today.setHours(0,0,0,0);
  
  let chartHtml = `<div style="display: flex; flex-direction: column; gap: 12px; margin-top: 1rem;">`;
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toDateString();
    
    // Calculate sum for this date
    let daySum = 0;
    const dayMeals = window.historyData ? window.historyData.filter(m => new Date(m.id).toDateString() === dateStr) : [];
    dayMeals.forEach(m => {
      daySum += (m.totals?.[macroKey] || 0);
    });
    daySum = Math.round(daySum);
    
    const pct = Math.min(Math.round((daySum / info.target) * 100), 100);
    const barColor = macroKey === 'protein_g' ? '#7cb8e0' : macroKey === 'carbs_g' ? '#d8a850' : '#c8b090';
    
    let displayDate = d.toLocaleDateString([], {weekday: 'short', month: 'short', day: 'numeric'});
    if (i === 0) displayDate = 'Today';
    else if (i === 1) displayDate = 'Yesterday';
    
    chartHtml += `
      <div style="background: var(--card); padding: 12px; border-radius: 12px; border: 1px solid var(--border);">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="font-size: 0.85rem; font-weight: 500;">${displayDate}</span>
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--text);">${daySum} <span style="font-size: 0.7rem; color: var(--text-dim); font-weight: 400;">/ ${info.target}g</span></span>
        </div>
        <div style="height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;">
          <div style="width: ${pct}%; background: ${barColor}; height: 100%; border-radius: 3px;"></div>
        </div>
      </div>
    `;
  }
  
  chartHtml += `</div>`;
  
  document.getElementById('generic-modal-content').innerHTML = chartHtml;
  document.getElementById('generic-modal').style.display = 'block';
}

function closeModal() {
  document.getElementById('generic-modal').style.display = 'none';
}

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
    renderDailyDashboard(data);
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
      
      // Aggregate micros for the entire meal
      let mealMicros = {};
      entry.foods.forEach(f => {
        if (f.micros) {
          for (const [k, v] of Object.entries(f.micros)) {
            mealMicros[k] = (mealMicros[k] || 0) + v;
          }
        }
      });
      
      let nutrientsHtml = '';
      if (Object.keys(mealMicros).length > 0) {
        let groups = { 'VITAMINS': [], 'MINERALS': [], 'FATS & FIBER': [], 'OTHER': [] };
        for (const [key, value] of Object.entries(mealMicros)) {
          if (value > 0) {
            const roundedVal = Math.round(value * 10) / 10;
            let label = key.replace(/_[a-z]+$/, '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            
            let targetInfo = DAILY_TARGETS.micros[key];
            let pillHtml = '';
            if (targetInfo) {
              const pct = Math.min(Math.round((value / targetInfo.target) * 100), 100);
              const colorClass = pct >= 100 ? 'complete' : pct >= 50 ? 'partial' : 'low';
              pillHtml = `<span class="dash-micro-pct ${colorClass}" style="margin-left:6px; font-size:0.65rem;">${pct}%</span>`;
            }
            
            const itemHtml = `<div class="nutrient-item">
              <span class="nutrient-label">${label}</span>
              <span class="nutrient-value">${roundedVal}${pillHtml}</span>
            </div>`;
            
            if (key.startsWith('vitamin_')) groups['VITAMINS'].push(itemHtml);
            else if (['calcium_mg', 'iron_mg', 'potassium_mg', 'sodium_mg', 'zinc_mg', 'magnesium_mg'].includes(key)) groups['MINERALS'].push(itemHtml);
            else if (key.includes('fat') || key.includes('fiber') || key.includes('omega') || key.includes('cholesterol')) groups['FATS & FIBER'].push(itemHtml);
            else groups['OTHER'].push(itemHtml);
          }
        }
        
        for (const [groupName, items] of Object.entries(groups)) {
          if (items.length > 0) {
            nutrientsHtml += `
              <div class="dash-section-label" style="margin-top:.75rem;">${groupName}</div>
              <div class="nutrients-grid">${items.join('')}</div>
            `;
          }
        }
      }
      
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
          
          <div id="ai-insight-container-${entry.id}" style="margin-top: 0.75rem;">
            <button onclick="getMealInsight('${entry.id}')" class="btn-ai-insight" style="background: none; border: 1px solid var(--border); padding: 0.35rem 0.75rem; border-radius: var(--radius-sm); color: var(--text-muted); cursor: pointer; font-size: 0.75rem; display: flex; align-items: center; gap: 0.4rem; font-family: inherit; transition: all 0.2s;">
              <i data-lucide="sparkles" style="width: 14px; height: 14px; color: var(--accent);"></i>
              Meal Insight
            </button>
          </div>

          ${nutrientsHtml ? `
          <details class="nutrients-dropdown">
            <summary>Show full nutrients</summary>
            <div class="nutrients-dropdown-content">
              ${nutrientsHtml}
            </div>
          </details>` : ''}
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

// ── AI Insights ────────────────────────────────────────────────────────────
async function getMealInsight(mealId) {
  const entry = historyData.find(e => e.id === mealId);
  if (!entry) return;
  
  const container = document.getElementById(`ai-insight-container-${mealId}`);
  if (!container) return;
  
  container.innerHTML = `<div style="color: var(--text-dim); font-size: 0.8rem; padding: 0.5rem; background: var(--bg-raised); border-radius: var(--radius-sm); border: 1px solid var(--border);"><i data-lucide="loader-2" class="spin" style="width:14px;height:14px;margin-right:6px;vertical-align:middle;"></i> Generating insight...</div>`;
  lucide.createIcons();
  
  try {
    const res = await fetch('/analyze/meal-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meal: entry })
    });
    const data = await res.json();
    if (data.success) {
      container.innerHTML = `
        <div style="background: var(--bg-raised); padding: 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border); font-size: 0.85rem; color: var(--text); line-height: 1.5; position: relative;">
          <i data-lucide="sparkles" style="width: 14px; height: 14px; color: var(--accent); float: left; margin-top: 2px; margin-right: 6px;"></i>
          ${escHtml(data.summary).replace(/\n/g, '<br>')}
        </div>
      `;
    } else {
      container.innerHTML = `<div style="color: var(--red); font-size: 0.8rem;">Failed to get insight: ${data.error}</div>`;
    }
  } catch (e) {
    container.innerHTML = `<div style="color: var(--red); font-size: 0.8rem;">Error: ${e.message}</div>`;
  }
  lucide.createIcons();
}

async function getWeekInsight() {
  const container = document.getElementById('ai-week-insight-container');
  if (!container || !historyData.length) return;
  
  container.innerHTML = `
    <div style="background: var(--bg-raised); border: 1px solid var(--border); padding: 1rem; border-radius: var(--radius); text-align: center;">
      <i data-lucide="loader-2" class="spin" style="width:24px;height:24px;color:var(--accent);margin-bottom:0.5rem;"></i>
      <div style="color: var(--text-muted); font-size: 0.85rem;">Analyzing your week...</div>
    </div>
  `;
  lucide.createIcons();
  
  try {
    const res = await fetch('/analyze/week-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meals: historyData })
    });
    const data = await res.json();
    if (data.success) {
      container.innerHTML = `
        <div style="background: var(--bg-raised); border: 1px solid var(--border); padding: 1rem; border-radius: var(--radius); position: relative;">
          <h4 style="margin: 0 0 0.5rem 0; font-size: 0.9rem; color: var(--text); display: flex; align-items: center; gap: 0.4rem;">
            <i data-lucide="sparkles" style="width: 16px; height: 16px; color: var(--accent);"></i>
            Weekly AI Insight
          </h4>
          <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.6;">
            ${escHtml(data.summary).replace(/\n/g, '<br>')}
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `<div style="color: var(--red); font-size: 0.85rem; padding: 1rem; background: var(--bg-raised); border-radius: var(--radius);">Failed to get insight: ${data.error}</div>`;
    }
  } catch (e) {
    container.innerHTML = `<div style="color: var(--red); font-size: 0.85rem; padding: 1rem; background: var(--bg-raised); border-radius: var(--radius);">Error: ${e.message}</div>`;
  }
  lucide.createIcons();
}
