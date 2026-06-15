document.addEventListener('DOMContentLoaded', async () => {
    const loading = document.getElementById('loading');
    const noWp = document.getElementById('no-wp');
    const results = document.getElementById('results');
    const themeName = document.getElementById('theme-name');
    const themeVersion = document.getElementById('theme-version');
    const pluginList = document.getElementById('plugin-list');
    const pluginCount = document.getElementById('plugin-count');
    const toast = document.getElementById('toast');

    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) return;

    // Fetch data from storage
    chrome.storage.local.get(`tab_${tab.id}`, async (data) => {
        let wpData = data[`tab_${tab.id}`];

        if (!wpData || !wpData.isWP) {
            loading.classList.add('hidden');
            noWp.classList.remove('hidden');
            results.classList.add('hidden');
            return;
        }

        // START AUDIT SEQUENCE
        loading.classList.add('hidden');
        const auditScreen = document.getElementById('audit-screen');
        auditScreen.classList.remove('hidden');

        await runAuditSequence();

        // Re-fetch data in case it was updated during the artificial delay
        chrome.storage.local.get(`tab_${tab.id}`, (newData) => {
            wpData = newData[`tab_${tab.id}`] || wpData;
            displayResults(wpData);
        });
    });

    async function runAuditSequence() {
        const steps = [
            'audit-core',
            'audit-performance',
            'audit-seo',
            'audit-security',
            'audit-accessibility',
            'audit-mobile'
        ];

        for (const stepId of steps) {
            const el = document.getElementById(stepId);
            if (!el) continue;
            el.classList.add('active');

            // Artificial delay to mimic analysis
            await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 700));

            el.classList.remove('active');
            el.classList.add('completed');
        }

        // Final polish pause
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    function displayResults(wpData) {
        const auditScreen = document.getElementById('audit-screen');
        auditScreen.classList.add('hidden');
        noWp.classList.add('hidden');
        results.classList.remove('hidden');

        // Theme
        if (wpData.theme) {
            themeName.textContent = wpData.theme.name;
            themeVersion.textContent = wpData.theme.version;
        } else {
            themeName.textContent = 'Custom / Unknown';
            themeVersion.textContent = 'N/A';
        }

        // Audit Results
        if (wpData.audit) {
            const audit = wpData.audit;

            const seoEl = document.getElementById('audit-seo-val');
            seoEl.textContent = (audit.seo.hasTitle && audit.seo.hasDesc) ? 'Bagus' : 'Butuh Perbaikan';
            seoEl.className = `value ${(audit.seo.hasTitle && audit.seo.hasDesc) ? 'success-text' : 'warning-text'}`;

            const accEl = document.getElementById('audit-acc-val');
            accEl.textContent = audit.accessibility.imagesMissingAlt === 0 ? 'Optimal' : `${audit.accessibility.imagesMissingAlt} Masalah`;
            accEl.className = `value ${audit.accessibility.imagesMissingAlt === 0 ? 'success-text' : 'warning-text'}`;

            const secEl = document.getElementById('audit-sec-val');
            secEl.textContent = audit.security.isHttps ? 'Aman (HTTPS)' : 'Tidak Aman';
            secEl.className = `value ${audit.security.isHttps ? 'success-text' : 'danger-text'}`;

            const mobEl = document.getElementById('audit-mob-val');
            mobEl.textContent = audit.mobile.hasViewport ? 'Ya' : 'Tidak';
            mobEl.className = `value ${audit.mobile.hasViewport ? 'success-text' : 'danger-text'}`;
        } else {
            // Fallback if data is missing (e.g. old storage)
            ['audit-seo-val', 'audit-acc-val', 'audit-sec-val', 'audit-mob-val'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.textContent = 'Refresh Halaman';
                    el.style.fontSize = '0.7rem';
                    el.style.opacity = '0.7';
                }
            });
        }

        // Plugins
        const pluginList = document.getElementById('plugin-list');
        const pluginCount = document.getElementById('plugin-count');
        pluginList.innerHTML = '';
        pluginCount.textContent = wpData.plugins.length;

        if (wpData.plugins.length > 0) {
            wpData.plugins.forEach(plugin => {
                const tag = document.createElement('div');
                tag.className = 'plugin-tag';
                tag.textContent = plugin.name;
                pluginList.appendChild(tag);
            });
        } else {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = 'Tidak ada plugin yang terdeteksi.';
            pluginList.appendChild(empty);
        }

        // Keywords
        const keywordList = document.getElementById('keyword-list');
        const aiKeywordList = document.getElementById('ai-keyword-list');
        keywordList.innerHTML = '';
        aiKeywordList.innerHTML = '';

        if (wpData.keywords && wpData.keywords.length > 0) {
            wpData.keywords.forEach(kw => {
                const tag = document.createElement('span');
                tag.className = 'keyword-tag';
                tag.textContent = kw;
                keywordList.appendChild(tag);
            });
            // Trigger AI keywords
            getAIKeywords(wpData);
        } else {
            keywordList.innerHTML = '<p class="empty-state">Tidak ada keyword terdeteksi.</p>';
        }

        // Store current article for rewriter
        window.currentArticle = wpData.article;

        // Check for cached rewrite
        if (wpData.cache_rewrite) {
            rewriterResult.classList.remove('hidden');
            const parts = wpData.cache_rewrite.split('---');
            if (parts.length > 1) {
                rewriteTitle.textContent = parts[0].replace(/JUDUL:/i, '').trim();
                rewriteBody.textContent = parts[1].replace(/ISI:/i, '').trim();
            } else {
                rewriteBody.textContent = wpData.cache_rewrite;
            }
        } else {
            rewriterResult.classList.add('hidden');
        }

        // Initialize Insight Buttons
        initInsightButtons(tab.url);

        // Fetch Server Info
        fetchServerInfo(tab.url);
        fetchNameServers(tab.url);
    }

    // Rewriter Logic
    const rewriteBtn = document.getElementById('btn-rewrite');
    const rewriterResult = document.getElementById('rewriter-result');
    const rewriteTitle = document.getElementById('rewrite-title');
    const rewriteBody = document.getElementById('rewrite-body');
    const copyRewriteBtn = document.getElementById('btn-copy-rewrite');

    rewriteBtn.addEventListener('click', async () => {
        if (!window.currentArticle) {
            showToast('Konten artikel tidak ditemukan.');
            return;
        }

        chrome.storage.local.get(['ai_settings', `tab_${tab.id}`], async (data) => {
            const settings = data.ai_settings;
            const wpData = data[`tab_${tab.id}`];

            if (!settings || !settings[settings.provider]) {
                showToast('Masukkan API Key di Pengaturan.');
                return;
            }

            rewriteBtn.disabled = true;
            rewriteBtn.textContent = 'Proses...';
            rewriterResult.classList.remove('hidden');
            rewriteBody.textContent = 'Sedang menulis ulang artikel...';

            try {
                const prompt = `Tulis ulang artikel ini agar SEO Friendly, unik, dan menarik.
                - Gaya bahasa: Profesional & Deskriptif.
                - ATURAN FORMAT: JANGAN gunakan simbol markdown seperti # (header) atau * (bold).
                - FORMAT OUTPUT:
                JUDUL: [judul baru]
                ---
                ISI: [isi artikel lengkap]
                
                Konten: ${window.currentArticle}`;

                const response = await callAI(prompt, settings, "Anda adalah Content Writer SEO. JANGAN pernah gunakan format markdown bold atau header dalam tulisan Anda.");

                const parts = response.split('---');
                if (parts.length > 1) {
                    rewriteTitle.textContent = parts[0].replace(/JUDUL:/i, '').trim();
                    rewriteBody.textContent = parts[1].replace(/ISI:/i, '').trim();
                } else {
                    rewriteBody.textContent = response;
                }

                // Save to Cache
                if (wpData) {
                    wpData.cache_rewrite = response;
                    saveTabCache(wpData);
                }
            } catch (error) {
                rewriteBody.textContent = 'Gagal rewrite: ' + error.message;
            }

            rewriteBtn.disabled = false;
            rewriteBtn.textContent = 'Rewrite Artikel';
        });
    });

    copyRewriteBtn.addEventListener('click', () => {
        const text = `${rewriteTitle.textContent}\n\n${rewriteBody.textContent}`;
        navigator.clipboard.writeText(text).then(() => showToast('Artikel disalin!'));
    });

    // Audit Modal Logic
    const auditBtn = document.getElementById('btn-audit-detail');
    const auditModal = document.getElementById('audit-modal');
    const closeAuditModal = document.getElementById('close-audit-modal');
    const auditBody = document.getElementById('audit-detail-content');

    auditBtn.addEventListener('click', () => {
        chrome.storage.local.get(`tab_${tab.id}`, (data) => {
            const wpData = data[`tab_${tab.id}`];
            if (wpData && wpData.audit) {
                populateAuditModal(wpData.audit);
                auditModal.classList.remove('hidden');
                // Trigger AI suggestions AFTER modal is populated
                getAISuggestions(wpData);
            }
        });
    });

    closeAuditModal.addEventListener('click', () => {
        auditModal.classList.add('hidden');
    });

    auditModal.addEventListener('click', (e) => {
        if (e.target === auditModal) auditModal.classList.add('hidden');
    });

    function populateAuditModal(audit) {
        auditBody.innerHTML = `
            <div class="audit-detail-item">
                <h4>SEO Health</h4>
                <div class="audit-detail-row">
                    <span>Meta Title</span>
                    <span class="${audit.seo.hasTitle ? 'success-text' : 'danger-text'}">${audit.seo.hasTitle ? 'Ditemukan' : 'Hilang'}</span>
                </div>
                <div class="audit-detail-row">
                    <span>Meta Description</span>
                    <span class="${audit.seo.hasDesc ? 'success-text' : 'danger-text'}">${audit.seo.hasDesc ? 'Ditemukan' : 'Hilang'}</span>
                </div>
                <div class="audit-detail-row">
                    <span>Open Graph (OG)</span>
                    <span class="${audit.seo.hasOG ? 'success-text' : 'danger-text'}">${audit.seo.hasOG ? 'Ditemukan' : 'Hilang'}</span>
                </div>
                <div class="audit-detail-row">
                    <span>H1 Heading</span>
                    <span class="${audit.seo.h1Count > 0 ? 'success-text' : 'danger-text'}">${audit.seo.h1Count} Found</span>
                </div>
            </div>

            <div class="audit-detail-item">
                <h4>Performance</h4>
                <div class="audit-detail-row">
                    <span>Scripts Terdeteksi</span>
                    <span class="value">${audit.performance.scriptCount}</span>
                </div>
                <div class="audit-detail-row">
                    <span>Stylesheets Terdeteksi</span>
                    <span class="value">${audit.performance.styleCount}</span>
                </div>
                <div class="audit-detail-row">
                    <span>Total Gambar</span>
                    <span class="value">${audit.performance.imageCount}</span>
                </div>
            </div>

            <div class="audit-detail-item">
                <h4>Aksesibilitas</h4>
                <div class="audit-detail-row">
                    <span>Atribut Alt Gambar</span>
                    <span class="${audit.accessibility.imagesMissingAlt === 0 ? 'success-text' : 'warning-text'}">${audit.accessibility.imagesMissingAlt === 0 ? 'Lengkap' : audit.accessibility.imagesMissingAlt + ' Masalah'}</span>
                </div>
                <div class="audit-detail-row">
                    <span>HTML Language Tag</span>
                    <span class="${audit.accessibility.hasLang ? 'success-text' : 'danger-text'}">${audit.accessibility.hasLang ? 'Ada' : 'Hilang'}</span>
                </div>
            </div>

            <div class="audit-detail-item">
                <h4>Mobile Readiness</h4>
                <div class="audit-detail-row">
                    <span>Viewport Meta</span>
                    <span class="${audit.mobile.hasViewport ? 'success-text' : 'danger-text'}">${audit.mobile.hasViewport ? 'Optimal' : 'Tidak Ada'}</span>
                </div>
            </div>

            <div class="audit-detail-item">
                <h4>Keamanan (Dasar)</h4>
                <div class="audit-detail-row">
                    <span>HTTPS / SSL</span>
                    <span class="${audit.security.isHttps ? 'success-text' : 'danger-text'}">${audit.security.isHttps ? 'Aktif' : 'Tidak Aktif'}</span>
                </div>
                <div class="audit-detail-row">
                    <span>Login Marker</span>
                    <span class="value">${audit.security.hasHiddenLogin ? 'Terlihat' : 'Aman (Tersembunyi)'}</span>
                </div>
            </div>
            
            <div id="ai-audit-suggestions" class="audit-detail-item">
                <div class="section-header">
                    <h4>Saran Perbaikan AI</h4>
                    <button id="refresh-ai-audit" class="icon-btn-mini" title="Analisis Ulang">
                        <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none">
                            <path d="M23 4v6h-6"></path>
                            <path d="M2.05 13a10 10 0 1 0 1.95-7L10 10"></path>
                        </svg>
                    </button>
                </div>
                <p id="ai-audit-text" class="loading-text">Sedang menganalisis dengan AI...</p>
            </div>
        `;

        // Add Refresh Listener
        document.getElementById('refresh-ai-audit').addEventListener('click', () => {
            chrome.storage.local.get(`tab_${tab.id}`, (data) => {
                const wpData = data[`tab_${tab.id}`];
                if (wpData) getAISuggestions(wpData, true);
            });
        });
    }

    // AI Logic Functions
    async function getAISuggestions(wpData, force = false) {
        const audit = wpData.audit;
        const aiText = document.getElementById('ai-audit-text');
        if (!aiText) return;

        // Check Cache
        if (!force && wpData.cache_suggestions) {
            aiText.textContent = wpData.cache_suggestions;
            aiText.classList.remove('loading-text');
            return;
        }

        aiText.textContent = 'Menganalisis ulang...';
        aiText.classList.add('loading-text');

        chrome.storage.local.get('ai_settings', async (data) => {
            const settings = data.ai_settings;
            if (!settings || !settings[settings.provider]) {
                aiText.textContent = 'Masukkan API Key di Pengaturan untuk mendapatkan saran AI.';
                aiText.classList.remove('loading-text');
                return;
            }

            try {
                const prompt = `Analisis audit WordPress URl: ${wpData.url}.
                Data Audit:
                SEO: ${JSON.stringify(audit.seo)}
                Performa: ${JSON.stringify(audit.performance)}
                Security: ${JSON.stringify(audit.security)}
                Keyword: ${wpData.keywords ? wpData.keywords.join(', ') : '-'}

                TUGAS: Berikan 3 saran perbaikan teknis yang TO THE POINT dalam Bahasa Indonesia. 
                ATURAN FORMAT: 
                - JANGAN gunakan simbol markdown seperti # atau **.
                - JANGAN berikan teks analisis atau penjelasan panjang.
                - LANGSUNG ke poin perbaikan (1, 2, 3).`;

                const suggestion = await callAI(prompt, settings, "Anda adalah robot audit WordPress. Jawaban Anda harus murni teks tanpa format markdown bold atau header.");
                aiText.textContent = suggestion;

                // Save to Cache
                wpData.cache_suggestions = suggestion;
                saveTabCache(wpData);

            } catch (error) {
                aiText.textContent = 'Gagal mengambil saran AI: ' + error.message;
            }
            aiText.classList.remove('loading-text');
        });
    }

    async function getAIKeywords(wpData, force = false) {
        const baseKeywords = wpData.keywords || [];
        const aiKeywordList = document.getElementById('ai-keyword-list');

        // Add reload button if not already there
        let refreshBtn = document.getElementById('refresh-ai-keywords');
        if (!refreshBtn) {
            const header = aiKeywordList.parentElement.previousElementSibling;
            if (header && header.classList.contains('section-header')) {
                // Not the right place, keywords are in Keyword Intelligence section
            }
            // Let's add it to the label above ai-keyword-list
            const label = aiKeywordList.previousElementSibling;
            if (label && label.classList.contains('label')) {
                label.style.display = 'flex';
                label.style.justifyContent = 'space-between';
                label.style.alignItems = 'center';
                label.innerHTML = `Saran Keyword AI 
                    <button id="refresh-ai-keywords" class="icon-btn-mini" title="Refresh Keywords" style="margin-left:5px;">
                        <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" stroke-width="2" fill="none">
                            <path d="M23 4v6h-6"></path>
                            <path d="M2.05 13a10 10 0 1 0 1.95-7L10 10"></path>
                        </svg>
                    </button>`;
                refreshBtn = document.getElementById('refresh-ai-keywords');
                refreshBtn.addEventListener('click', () => getAIKeywords(wpData, true));
            }
        }

        // Check Cache
        if (!force && wpData.cache_keywords) {
            renderAIKeywords(wpData.cache_keywords);
            return;
        }

        aiKeywordList.innerHTML = '<span class="loading-text" style="font-size:0.7rem;">Loading AI...</span>';

        chrome.storage.local.get('ai_settings', async (data) => {
            const settings = data.ai_settings;
            if (!settings || !settings[settings.provider]) {
                aiKeywordList.innerHTML = '';
                return;
            }

            try {
                // Gunakan ringkasan konten biar saran keyword lebih akurat
                const articleSnippet = wpData.article ? wpData.article.substring(0, 1000) : "Tidak ada konten artikel terdeteksi.";
                const prompt = `Analisis URL: ${wpData.url}
                Keyword asli: ${baseKeywords.join(', ')}
                Potongan Konten: ${articleSnippet}

                TUGAS: Berikan 5 keyword LSI atau long-tail tambahan dalam Bahasa Indonesia yang sangat relevan.
                ESTIMASI: Berikan label estimasi potensi traffic untuk masing-masing keyword: [HIGH], [MEDIUM], atau [LOW].
                
                ATURAN FORMAT: 
                - JANGAN gunakan simbol markdown (# atau *).
                - FORMAT: Keyword [POTENTIAL]. Contoh: jasa website murah [HIGH], tutorial wp [MEDIUM]
                - Pisahkan antar keyword dengan koma.
                - JANGAN ada teks pembuka atau penutup.`;

                const response = await callAI(prompt, settings, "Anda adalah robot riset keyword SEO. Jawaban Anda HANYA berupa daftar kata kunci dengan label potensi traffic.");
                const sugKeywords = response.split(',').map(k => k.trim()).filter(k => k.length > 0);

                // Save to Cache
                wpData.cache_keywords = sugKeywords;
                saveTabCache(wpData);

                renderAIKeywords(sugKeywords);
            } catch (error) {
                console.error('AI Keyword Error:', error);
                aiKeywordList.innerHTML = '';
            }
        });
    }

    function renderAIKeywords(keywords) {
        const aiKeywordList = document.getElementById('ai-keyword-list');
        aiKeywordList.innerHTML = '';
        keywords.forEach(k => {
            const tag = document.createElement('span');
            tag.className = 'keyword-tag ai';

            // Extract Potential Label
            let label = 'low';
            let cleanKeyword = k;
            if (k.toLowerCase().includes('[high]')) {
                label = 'high';
                cleanKeyword = k.replace(/\[high\]/i, '').trim();
            } else if (k.toLowerCase().includes('[medium]')) {
                label = 'medium';
                cleanKeyword = k.replace(/\[medium\]/i, '').trim();
            } else if (k.toLowerCase().includes('[low]')) {
                label = 'low';
                cleanKeyword = k.replace(/\[low\]/i, '').trim();
            }

            tag.classList.add(label);
            tag.textContent = cleanKeyword;
            aiKeywordList.appendChild(tag);
        });
    }

    function initInsightButtons(urlStr) {
        const url = new URL(urlStr);
        const domain = url.hostname;

        document.getElementById('check-semrush').onclick = () => {
            window.open(`https://www.semrush.com/analytics/overview/?q=${domain}`, '_blank');
        };
    }

    function saveTabCache(wpData) {
        chrome.storage.local.set({ [`tab_${tab.id}`]: wpData });
    }

    async function callAI(prompt, settings, systemMsg = "Anda adalah asisten AI ahli WordPress yang selalu menjawab dalam Bahasa Indonesia yang baik dan benar.") {
        const provider = settings.provider;
        const key = settings[provider];

        if (!key) throw new Error(`API Key untuk ${provider} belum diisi.`);

        let model = "";
        if (provider === 'openai') model = settings.modelOpenai || 'gpt-4o';
        else if (provider === 'google') model = settings.modelGoogle || 'gemini-1.5-flash';
        else if (provider === 'groq') model = settings.modelGroq || 'llama-3.1-70b-versatile';
        else if (provider === 'deepseek') model = settings.modelDeepseek || 'deepseek-chat';

        let url = "";

        const cleanResponse = (text) => {
            // Remove deepseek/reasoning model <think> tags
            let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '');
            // Strip all markdown bold (**) and headers (#)
            cleaned = cleaned.replace(/\*\*/g, '').replace(/#/g, '');
            return cleaned.trim();
        };

        if (provider === 'openai') {
            url = 'https://api.openai.com/v1/chat/completions';
        } else if (provider === 'groq') {
            url = 'https://api.groq.com/openai/v1/chat/completions';
        } else if (provider === 'deepseek') {
            url = 'https://api.deepseek.com/v1/chat/completions';
        } else if (provider === 'google') {
            const gUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
            const gResp = await fetch(gUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `${systemMsg}\n\n${prompt}` }] }]
                })
            });
            const gData = await gResp.json();
            if (gData.error) throw new Error(gData.error.message || 'Gemini API Error');
            if (!gData.candidates || !gData.candidates[0]?.content?.parts?.[0]?.text) {
                throw new Error('AI tidak memberikan jawaban.');
            }
            return cleanResponse(gData.candidates[0].content.parts[0].text);
        }

        if (url) {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemMsg },
                        { role: 'user', content: prompt }
                    ]
                })
            });
            const data = await response.json();
            if (data.error) throw new Error(data.error.message || 'API Error');
            if (!data.choices || !data.choices[0]?.message?.content) {
                throw new Error('AI tidak memberikan jawaban.');
            }
            return cleanResponse(data.choices[0].message.content);
        }

        throw new Error('Provider tidak dikenali.');
    }

    // Settings Modal Logic
    const settingsBtn = document.getElementById('btn-settings');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettings = document.getElementById('close-settings');
    const saveSettings = document.getElementById('btn-save-settings');

    const apiInputs = {
        openai: document.getElementById('api-openai'),
        modelOpenai: document.getElementById('model-openai'),
        google: document.getElementById('api-google'),
        modelGoogle: document.getElementById('model-google'),
        groq: document.getElementById('api-groq'),
        modelGroq: document.getElementById('model-groq'),
        deepseek: document.getElementById('api-deepseek'),
        modelDeepseek: document.getElementById('model-deepseek'),
        provider: document.getElementById('ai-provider')
    };

    settingsBtn.addEventListener('click', () => {
        // Load existing settings
        chrome.storage.local.get('ai_settings', (data) => {
            if (data.ai_settings) {
                const s = data.ai_settings;
                apiInputs.openai.value = s.openai || '';
                apiInputs.modelOpenai.value = s.modelOpenai || 'gpt-4o';
                apiInputs.google.value = s.google || '';
                apiInputs.modelGoogle.value = s.modelGoogle || 'gemini-1.5-flash';
                apiInputs.groq.value = s.groq || '';
                apiInputs.modelGroq.value = s.modelGroq || 'llama-3.1-70b-versatile';
                apiInputs.deepseek.value = s.deepseek || '';
                apiInputs.modelDeepseek.value = s.modelDeepseek || 'deepseek-chat';
                apiInputs.provider.value = s.provider || 'openai';
            }
            settingsModal.classList.remove('hidden');
        });
    });

    closeSettings.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    saveSettings.addEventListener('click', () => {
        const settings = {
            openai: apiInputs.openai.value.trim(),
            modelOpenai: apiInputs.modelOpenai.value.trim(),
            google: apiInputs.google.value.trim(),
            modelGoogle: apiInputs.modelGoogle.value.trim(),
            groq: apiInputs.groq.value.trim(),
            modelGroq: apiInputs.modelGroq.value.trim(),
            deepseek: apiInputs.deepseek.value.trim(),
            modelDeepseek: apiInputs.modelDeepseek.value.trim(),
            provider: apiInputs.provider.value
        };

        chrome.storage.local.set({ ai_settings: settings }, () => {
            showToast('Pengaturan disimpan!');
            settingsModal.classList.add('hidden');
        });
    });

    // WHOIS Modal Logic
    const whoisBtn = document.getElementById('btn-whois');
    const whoisModal = document.getElementById('whois-modal');
    const closeModal = document.getElementById('close-modal');
    const whoisRaw = document.getElementById('whois-raw');

    whoisBtn.addEventListener('click', () => {
        whoisModal.classList.remove('hidden');
        fetchWhois(tab.url);
    });

    closeModal.addEventListener('click', () => {
        whoisModal.classList.add('hidden');
    });

    whoisModal.addEventListener('click', (e) => {
        if (e.target === whoisModal) whoisModal.classList.add('hidden');
    });

    // Copy Handler
    document.querySelectorAll('.btn-copy').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.getAttribute('data-copy');
            let textToCopy = '';

            switch (type) {
                case 'theme':
                    textToCopy = `Theme: ${themeName.textContent} (v${themeVersion.textContent})`;
                    break;
                case 'server':
                    textToCopy = `IP: ${document.getElementById('server-ip').textContent}\nHosting: ${document.getElementById('server-hosting').textContent}\nLevel: ${document.getElementById('server-location').textContent}`;
                    break;
                case 'bank':
                    textToCopy = document.getElementById('bank-acc').textContent;
                    break;
            }

            if (textToCopy) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    showToast();
                });
            }
        });
    });

    function showToast(message = 'Copied to clipboard!') {
        toast.textContent = message;
        toast.classList.remove('hidden');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 2000);
    }
});

async function fetchServerInfo(urlStr) {
    try {
        const url = new URL(urlStr);
        const domain = url.hostname;

        const response = await fetch(`http://ip-api.com/json/${domain}?fields=status,message,country,regionName,city,isp,query`);
        const data = await response.json();

        if (data.status === 'success') {
            document.getElementById('server-ip').textContent = data.query;
            document.getElementById('server-hosting').textContent = data.isp;
            document.getElementById('server-location').textContent = `${data.city}, ${data.country}`;

            // CDN Detection
            const isp = data.isp.toLowerCase();
            const cdnBadge = document.getElementById('cdn-badge');
            const cdns = ['cloudflare', 'sucuri', 'akamai', 'fastly', 'stackpath', 'amazon cloudfront', 'google cloud cdn', 'keycdn', 'bunnycdn', 'imperva'];

            if (cdns.some(cdn => isp.includes(cdn))) {
                cdnBadge.classList.remove('hidden');
                cdnBadge.title = 'Website ini diproteksi oleh CDN/Proxy';
            } else {
                cdnBadge.classList.add('hidden');
            }
        } else {
            document.getElementById('server-ip').textContent = 'Error';
            document.getElementById('server-hosting').textContent = 'Discovery failed';
            document.getElementById('server-location').textContent = 'Unknown';
        }
    } catch (error) {
        console.error('WPAudet Error fetching server info:', error);
    }
}

async function fetchNameServers(urlStr) {
    try {
        const url = new URL(urlStr);
        const domain = url.hostname.replace(/^www\./, '');

        const response = await fetch(`https://dns.google/resolve?name=${domain}&type=NS`);
        const data = await response.json();

        if (data.Answer) {
            const nsList = data.Answer.map(ans => ans.data).join(', ');
            document.getElementById('server-ns').textContent = nsList;
        } else {
            document.getElementById('server-ns').textContent = 'Tidak ditemukan';
        }
    } catch (error) {
        console.error('WPAudet Error fetching NS:', error);
    }
}

async function fetchWhois(urlStr) {
    try {
        const url = new URL(urlStr);
        const domain = url.hostname.replace(/^www\./, '');
        const whoisRaw = document.getElementById('whois-raw');
        const parts = domain.split('.');
        const tld = parts[parts.length - 1].toLowerCase();

        whoisRaw.textContent = `Menganalisis domain ${domain}...`;

        // Strategi RDAP Multi-TLD
        let rdapUrl = `https://rdap.org/domain/${domain}`; // Default universal redirector

        if (tld === 'com') {
            rdapUrl = `https://rdap.verisign.com/com/v1/domain/${domain}`;
        } else if (tld === 'net') {
            rdapUrl = `https://rdap.verisign.com/net/v1/domain/${domain}`;
        } else if (tld === 'id') {
            rdapUrl = `https://rdap.pandi.id/rdap/domain/${domain}`;
        } else if (tld === 'org') {
            rdapUrl = `https://rdap.publicinterestregistry.net/rdap/v1/domain/${domain}`;
        }

        const response = await fetch(rdapUrl);
        if (!response.ok) {
            // If specific registry fails, try the universal one as last resort
            if (!rdapUrl.includes('rdap.org')) {
                const fallbackResp = await fetch(`https://rdap.org/domain/${domain}`);
                if (fallbackResp.ok) return handleRdapResponse(await fallbackResp.json());
            }
            whoisRaw.textContent = `Gagal mengambil data WHOIS (Error: ${response.status}).\n\nMungkin domain ini menggunakan TLD yang belum didukung RDAP secara publik.`;
            return;
        }

        const data = await response.json();
        handleRdapResponse(data);

    } catch (error) {
        document.getElementById('whois-raw').textContent = 'Error: Link RDAP tidak merespons atau domain tidak valid.';
    }
}

function handleRdapResponse(data) {
    const whoisRaw = document.getElementById('whois-raw');
    let display = `Domain: ${data.ldhName || 'N/A'}\n`;
    display += `Status: ${data.status?.join(', ') || 'N/A'}\n\n`;

    if (data.events) {
        data.events.forEach(ev => {
            const date = new Date(ev.eventDate).toLocaleDateString();
            display += `${ev.eventAction}: ${date}\n`;
        });
    }

    if (data.entities) {
        // Find Registrar
        const registrar = data.entities.find(e => e.roles && e.roles.includes('registrar'));
        if (registrar) {
            display += `\nRegistrar: ${registrar.vcardArray?.[1]?.[1]?.[3] || registrar.handle || 'N/A'}\n`;
        }
    }

    whoisRaw.textContent = display;
}
