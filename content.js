/**
 * WPAudet - Content Script v1.2.0
 * Responsible for detecting technology, extracting SEO, audit, schema,
 * keywords, and article content from ALL websites (WordPress or not).
 */

(function () {
    const DEBUG = false;

    // ==================== WORDPRESS DETECTION ====================
    function detectWP() {
        const markers = {
            isWP: false,
            theme: null,
            plugins: [],
            audit: null,
            schema: null,
            keywords: [],
            article: '',
            url: window.location.href,
            timestamp: Date.now()
        };

        // 1. Check for generator meta tag
        const generator = document.querySelector('meta[name="generator"]');
        if (generator && generator.content.toLowerCase().includes('wordpress')) {
            markers.isWP = true;
        }

        // 2. Check for common WP paths in scripts and links
        const commonLinks = document.querySelectorAll(
            'link[href*="wp-content"], script[src*="wp-content"], link[href*="wp-includes"], script[src*="wp-includes"]'
        );
        if (commonLinks.length > 0) markers.isWP = true;

        // 3. STEALTH DETECTION (Bypass plugins like Hide My WP Ghost)
        if (!markers.isWP) {
            const stealthSelectors = [
                'link[rel="https://api.w.org/"]',
                'link[rel="EditURI"]',
                'link[rel="wlwmanifest"]',
                'link[rel="shortlink"]',
                'link[href*="s.w.org"]',
                'link[type="application/json+oembed"]',
                'link[type="text/xml+oembed"]',
                'link[href*="/wp-json/"]',
                'script#wp-emoji-release-js',
                'style#wp-block-library-css',
                'link[href*="/storage/"]',
                'script[src*="/core/"]',
                'link[href*="/lib/"]',
                'script[src*="/lib/"]'
            ];
            if (stealthSelectors.some(sel => !!document.querySelector(sel))) {
                markers.isWP = true;
            }

            if (!markers.isWP) {
                const html = document.documentElement.outerHTML;
                const bodyClasses = document.body ? document.body.className : '';
                if (
                    bodyClasses.includes('wp-embed-responsive') ||
                    bodyClasses.includes('wp-custom-logo') ||
                    html.includes('wp-block-') ||
                    html.includes('wp-emoji') ||
                    html.includes('ver=wp')
                ) {
                    markers.isWP = true;
                }
            }
        }

        return markers;
    }

    // ==================== SCHEMA DETECTION (Universal) ====================
    function extractSchema(markers) {
        const schemaTypes = new Set();

        document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
            try {
                const data = JSON.parse(script.textContent);
                const findTypes = (obj) => {
                    if (!obj || typeof obj !== 'object') return;
                    if (obj['@type']) {
                        if (Array.isArray(obj['@type'])) {
                            obj['@type'].forEach(t => schemaTypes.add(t));
                        } else if (typeof obj['@type'] === 'string') {
                            schemaTypes.add(obj['@type']);
                        }
                    }
                    if (obj['@graph'] && Array.isArray(obj['@graph'])) {
                        obj['@graph'].forEach(item => findTypes(item));
                    }
                    for (const key in obj) {
                        if (obj.hasOwnProperty(key)) findTypes(obj[key]);
                    }
                };
                findTypes(data);
            } catch (e) { /* ignore parse errors */ }
        });

        document.querySelectorAll('[itemtype]').forEach(el => {
            const typeAttr = el.getAttribute('itemtype');
            if (typeAttr) {
                const match = typeAttr.match(/\/schema\.org\/([A-Za-z]+)/);
                if (match) {
                    schemaTypes.add(match[1]);
                } else {
                    const parts = typeAttr.split('/');
                    const lastPart = parts[parts.length - 1];
                    if (lastPart) schemaTypes.add(lastPart);
                }
            }
        });

        markers.schema = Array.from(schemaTypes);
    }

    // ==================== AUDIT DATA (Universal) ====================
    function extractAuditData(markers) {
        markers.audit = {
            seo: {
                hasTitle: !!document.title,
                hasDesc: !!document.querySelector('meta[name="description"]'),
                hasOG: !!document.querySelector('meta[property^="og:"]'),
                h1Count: document.querySelectorAll('h1').length
            },
            performance: {
                scriptCount: document.querySelectorAll('script').length,
                styleCount: document.querySelectorAll('link[rel="stylesheet"]').length,
                imageCount: document.querySelectorAll('img').length
            },
            accessibility: {
                imagesMissingAlt: Array.from(document.querySelectorAll('img')).filter(img => !img.alt).length,
                hasLang: !!document.documentElement.lang
            },
            mobile: {
                hasViewport: !!document.querySelector('meta[name="viewport"]')
            },
            security: {
                isHttps: window.location.protocol === 'https:',
                // For WordPress: check if wp-login.php is exposed
                hasHiddenLogin: markers.isWP
                    ? !!document.querySelector('link[href*="wp-login.php"]')
                    : null
            }
        };
    }

    // ==================== KEYWORD EXTRACTION (Universal) ====================
    function extractKeywords(markers) {
        const keywords = new Set();
        const metaKeywords = document.querySelector('meta[name="keywords"]');
        if (metaKeywords) {
            metaKeywords.getAttribute('content').split(',').forEach(k => keywords.add(k.trim()));
        }
        if (keywords.size === 0) {
            document.querySelectorAll('h1, h2').forEach(h => {
                const text = h.textContent.trim();
                if (text.length > 3 && text.length < 80) keywords.add(text);
            });
        }
        markers.keywords = Array.from(keywords).slice(0, 10);
    }

    // ==================== ARTICLE EXTRACTION (Universal, Smart Fallback) ====================
    function extractArticle(markers) {
        // Priority list: WP-specific → Generic semantic → Longest container fallback
        const selectors = [
            '.entry-content',
            '.post-content',
            '.article-content',
            '.post-body',         // Blogger
            '.td-post-content',   // TDmag theme
            'article .content',
            'article',
            '[role="main"]',
            'main',
            '#content',
            '.content',
            '.main-content'
        ];

        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.innerText && el.innerText.trim().length > 200) {
                markers.article = el.innerText.substring(0, 3000);
                return;
            }
        }

        // Fallback: find the div/section with the most text content
        let longestEl = null;
        let longestLen = 0;
        document.querySelectorAll('div, section, main, article').forEach(el => {
            // Skip header, footer, nav, sidebar
            const tag = el.tagName.toLowerCase();
            const role = el.getAttribute('role') || '';
            const id = el.id.toLowerCase();
            const cls = el.className.toLowerCase();
            if (['header', 'footer', 'nav', 'aside'].includes(tag)) return;
            if (['navigation', 'banner', 'contentinfo'].includes(role)) return;
            if (id.includes('header') || id.includes('footer') || id.includes('nav') || id.includes('sidebar')) return;
            if (cls.includes('header') || cls.includes('footer') || cls.includes('nav') || cls.includes('sidebar')) return;

            const len = (el.innerText || '').trim().length;
            if (len > longestLen) {
                longestLen = len;
                longestEl = el;
            }
        });

        if (longestEl && longestLen > 200) {
            markers.article = longestEl.innerText.substring(0, 3000);
        }
    }

    // ==================== WORDPRESS-SPECIFIC: THEME ====================
    function extractThemeInfo(markers) {
        let themeStyle = document.querySelector('link[href*="/themes/"]');
        if (themeStyle) {
            const match = themeStyle.href.match(/\/themes\/([^\/]+)\//);
            if (match) {
                markers.theme = {
                    slug: match[1],
                    name: capitalize(match[1].replace(/-/g, ' ')),
                    version: extractVersion(themeStyle.href)
                };
                return;
            }
        }

        themeStyle = document.querySelector('link[href*="/storage/"], link[href*="/core/"]');
        if (themeStyle) {
            const href = themeStyle.href;
            const storageMatch = href.match(/\/(storage|core)\/([^\/]+)\//);
            if (storageMatch) {
                const slug = storageMatch[2];
                const blacklist = ['modules', 'assets', 'uploads', 'plugins'];
                if (!blacklist.includes(slug)) {
                    markers.theme = {
                        slug: slug,
                        name: capitalize(slug.replace(/-/g, ' ')),
                        version: extractVersion(href)
                    };
                }
            }
        }

        if (!markers.theme) {
            const html = document.documentElement.outerHTML.toLowerCase();
            if (html.includes('blocksy')) {
                markers.theme = { slug: 'blocksy', name: 'Blocksy', version: 'Unknown' };
            } else if (html.includes('astra')) {
                markers.theme = { slug: 'astra', name: 'Astra', version: 'Unknown' };
            }
        }
    }

    // ==================== WORDPRESS-SPECIFIC: PLUGINS ====================
    function extractPluginInfo(markers) {
        const pluginSlugs = new Set();

        document.querySelectorAll('link[href*="/plugins/"], script[src*="/plugins/"]').forEach(el => {
            const path = el.href || el.src;
            const match = path.match(/\/plugins\/([^\/]+)\//);
            if (match) pluginSlugs.add(match[1]);
        });

        document.querySelectorAll('link[href*="/core/"], script[src*="/core/"], link[href*="/storage/"], script[src*="/storage/"]').forEach(el => {
            const path = el.href || el.src;
            const moduleMatch = path.match(/\/(core|storage)\/(modules|plugins)\/([^\/]+)\//);
            if (moduleMatch) pluginSlugs.add(moduleMatch[3]);
        });

        const html = document.documentElement.outerHTML;
        if (html.includes('elementor')) pluginSlugs.add('elementor');
        if (html.includes('contact-form-7')) pluginSlugs.add('contact-form-7');
        if (html.includes('woocommerce')) pluginSlugs.add('woocommerce');

        markers.plugins = Array.from(pluginSlugs).map(slug => ({
            slug: slug,
            name: capitalize(slug.replace(/-/g, ' '))
        }));
    }

    // ==================== TECHNOLOGY DETECTION (Non-WP) ====================
    function detectTechnology(markers) {
        const techs = [];

        // ---- Helper: check if any script src matches a pattern ----
        function hasScript(pattern) {
            return Array.from(document.querySelectorAll('script[src]'))
                .some(s => pattern.test(s.src));
        }

        // ---- Helper: check if any link href matches a pattern ----
        function hasLink(pattern) {
            return Array.from(document.querySelectorAll('link[href]'))
                .some(l => pattern.test(l.href));
        }

        // ---- 1. Meta generator (reliable, CMS puts it there) ----
        const generator = document.querySelector('meta[name="generator"]');
        if (generator) {
            const gen = generator.content.toLowerCase();
            if (gen.includes('joomla'))       techs.push('Joomla');
            if (gen.includes('drupal'))       techs.push('Drupal');
            if (gen.includes('wix'))          techs.push('Wix');
            if (gen.includes('squarespace'))  techs.push('Squarespace');
            if (gen.includes('ghost'))        techs.push('Ghost CMS');
            if (gen.includes('blogger'))      techs.push('Blogger');
            if (gen.includes('prestashop'))   techs.push('PrestaShop');
            if (gen.includes('magento'))      techs.push('Magento');
            if (gen.includes('webflow'))      techs.push('Webflow');
        }

        // ---- 2. Shopify: CDN domain in scripts/links ONLY ----
        if (hasScript(/cdn\.shopify\.com/) || hasLink(/cdn\.shopify\.com/)) {
            techs.push('Shopify');
        }

        // ---- 3. Next.js: unique JSON script tag injected by Next ----
        if (document.getElementById('__NEXT_DATA__') ||
            document.querySelector('script[src*="/_next/"]')) {
            techs.push('Next.js');
        }

        // ---- 4. Nuxt.js: unique Nuxt script tag ----
        if (document.querySelector('script[src*="/_nuxt/"]') ||
            document.querySelector('#__nuxt')) {
            techs.push('Nuxt.js / Vue');
        }

        // ---- 5. Gatsby: specific Gatsby script/resource pattern ----
        if (document.querySelector('script[src*="/gatsby-"]') ||
            document.querySelector('link[rel="preload"][href*="/gatsby-"]')) {
            techs.push('Gatsby');
        }

        // ---- 6. Astro: only from the resource URL, not content ----
        if (hasScript(/\/_astro\//) || hasLink(/\/_astro\//)) {
            techs.push('Astro');
        }

        // ---- 7. Angular: ng-version attribute on the app root ----
        if (document.querySelector('[ng-version]') ||
            document.querySelector('app-root') ||
            document.querySelector('ion-app')) {
            techs.push('Angular');
        }

        // ---- 8. Svelte/SvelteKit: svelte-specific attributes ----
        if (document.querySelector('[data-svelte]') ||
            hasScript(/\/_app\//) && document.querySelector('div#svelte')) {
            techs.push('Svelte / SvelteKit');
        }

        // ---- 9. React (without Next/Gatsby): data-reactroot on body ----
        if (!techs.includes('Next.js') && !techs.includes('Gatsby')) {
            if (document.querySelector('[data-reactroot]') ||
                document.querySelector('#root[data-reactroot]')) {
                techs.push('React');
            }
        }

        // ---- 10. Blogger: canonical link pointing to blogspot ----
        if (hasLink(/blogspot\.com/) ||
            document.querySelector('meta[content*="blogger.com"]')) {
            techs.push('Blogger');
        }

        // ---- 11. Cloudflare: presence of cf-specific elements ----
        if (document.querySelector('script[src*="cdn-cgi/"]') ||
            document.querySelector('link[href*="cdn-cgi/"]') ||
            !!document.cookie.split(';').find(c => c.trim().startsWith('__cf'))) {
            techs.push('Cloudflare');
        }

        // ---- 12. Laravel: csrf-token meta (must actually exist in DOM) ----
        if (!markers.isWP && document.querySelector('meta[name="csrf-token"]')) {
            techs.push('Laravel / PHP');
        }

        // ---- 13. Webflow: Webflow script/attribute ----
        if (hasScript(/webflow\.js/) ||
            document.querySelector('[data-wf-site]') ||
            document.querySelector('[data-wf-page]')) {
            techs.push('Webflow');
        }

        // ---- 14. WooCommerce (non-WP, edge case) ----
        if (!markers.isWP && hasScript(/woocommerce/)) {
            techs.push('WooCommerce');
        }

        markers.technologies = [...new Set(techs)];
    }


    // ==================== HELPERS ====================
    function extractVersion(url) {
        const match = url.match(/[?&]ver=([^&]+)/);
        return match ? match[1] : 'Unknown';
    }

    function capitalize(str) {
        return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    // ==================== MAIN RUN ====================
    const markers = detectWP();

    // Always extract universal data (SEO, schema, keywords, article, audit)
    extractAuditData(markers);
    extractSchema(markers);
    extractKeywords(markers);
    extractArticle(markers);
    detectTechnology(markers);

    // WordPress-specific extraction
    if (markers.isWP) {
        extractThemeInfo(markers);
        extractPluginInfo(markers);
    }

    if (DEBUG) console.log('WPAudet v1.2.0 data:', markers);

    // Always send site data to background (isWP flag indicates if it's WordPress)
    chrome.runtime.sendMessage({ type: 'SITE_DATA', data: markers });

})();
