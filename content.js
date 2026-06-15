/**
 * WP Detector - Content Script
 * Responsible for detecting WordPress markers, themes, and plugins.
 */

(function () {
    const DEBUG = true;

    function detectWP() {
        const markers = {
            isWP: false,
            theme: null,
            plugins: [],
            audit: null // Initialize audit here
        };

        // 1. Check for generator meta tag
        const generator = document.querySelector('meta[name="generator"]');
        if (generator && generator.content.toLowerCase().includes('wordpress')) {
            markers.isWP = true;
        }

        // 2. Check for common WP paths in scripts and links
        const commonLinks = document.querySelectorAll('link[href*="wp-content"], script[src*="wp-content"], link[href*="wp-includes"], script[src*="wp-includes"]');
        if (commonLinks.length > 0) markers.isWP = true;

        // 3. STEALTH DETECTION (Bypass plugins like Hide My WP Ghost)
        if (!markers.isWP) {
            const stealthMarkers = [
                'link[rel="https://api.w.org/"]',     // REST API
                'link[rel="EditURI"]',              // WLW Manifest
                'link[rel="wlwmanifest"]',           // WLW Manifest
                'link[rel="shortlink"]',            // Shortlink (?p=ID)
                'link[href*="s.w.org"]',             // Emoji Prefetch
                'link[type="application/json+oembed"]', // oEmbed JSON
                'link[type="text/xml+oembed"]',        // oEmbed XML
                'link[href*="/wp-json/"]',           // REST API link
                'script#wp-emoji-release-js',        // Emoji Script ID
                'style#wp-block-library-css',        // Gutenberg Blocks CSS
                'link[href*="/storage/"]',           // Renamed wp-content (Common)
                'script[src*="/core/"]',             // Renamed wp-content (Common)
                'link[href*="/lib/"]',               // Renamed wp-includes (Common)
                'script[src*="/lib/"]'                // Renamed wp-includes (Common)
            ];

            if (stealthMarkers.some(selector => !!document.querySelector(selector))) {
                markers.isWP = true;
            }

            // Check for block editor classes or other WP fingerprints
            if (!markers.isWP) {
                const html = document.documentElement.outerHTML;
                const bodyClasses = document.body.className;

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

        if (markers.isWP) {
            extractThemeInfo(markers);
            extractPluginInfo(markers);
            extractAuditData(markers);
        }

        return markers;
    }

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
                hasHiddenLogin: !!document.querySelector('link[href*="wp-login.php"]') // simplified
            }
        };
    }

    function extractThemeInfo(markers) {
        // 1. Standard WP path
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

        // 2. Renamed path (Common in Hide My WP: /storage/theme-slug/)
        themeStyle = document.querySelector('link[href*="/storage/"], link[href*="/core/"]');
        if (themeStyle) {
            const href = themeStyle.href;
            // Blocksy specific or common pattern
            const storageMatch = href.match(/\/(storage|core)\/([^\/]+)\//);
            if (storageMatch) {
                const slug = storageMatch[2];
                // Exclude common renamed "wp-content" if it's not a theme slug
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

        // 3. Fallback: Search in HTML for theme signatures
        if (!markers.theme) {
            const html = document.documentElement.outerHTML.toLowerCase();
            if (html.includes('blocksy')) {
                markers.theme = { slug: 'blocksy', name: 'Blocksy', version: 'Unknown' };
            } else if (html.includes('astra')) {
                markers.theme = { slug: 'astra', name: 'Astra', version: 'Unknown' };
            }
        }
    }

    function extractPluginInfo(markers) {
        const pluginSlugs = new Set();

        // 1. Standard WP path
        document.querySelectorAll('link[href*="/plugins/"], script[src*="/plugins/"]').forEach(el => {
            const path = el.href || el.src;
            const match = path.match(/\/plugins\/([^\/]+)\//);
            if (match) pluginSlugs.add(match[1]);
        });

        // 2. Renamed/Obfuscated path (e.g. /core/modules/..., /storage/plugins/...)
        document.querySelectorAll('link[href*="/core/"], script[src*="/core/"], link[href*="/storage/"], script[src*="/storage/"]').forEach(el => {
            const path = el.href || el.src;
            // Pattern for Hide My WP modules
            const moduleMatch = path.match(/\/(core|storage)\/(modules|plugins)\/([^\/]+)\//);
            if (moduleMatch) {
                pluginSlugs.add(moduleMatch[3]);
            }
        });

        // 3. Common fingerprints
        const html = document.documentElement.outerHTML;
        if (html.includes('elementor')) pluginSlugs.add('elementor');
        if (html.includes('contact-form-7')) pluginSlugs.add('contact-form-7');
        if (html.includes('woocommerce')) pluginSlugs.add('woocommerce');

        markers.plugins = Array.from(pluginSlugs).map(slug => ({
            slug: slug,
            name: capitalize(slug.replace(/-/g, ' '))
        }));
    }

    function extractVersion(url) {
        const match = url.match(/[?&]ver=([^&]+)/);
        return match ? match[1] : 'Unknown';
    }

    function capitalize(str) {
        return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    // Run detection
    const markers = detectWP();

    if (markers.isWP) {
        // Keyword Extraction
        const keywords = new Set();
        const metaKeywords = document.querySelector('meta[name="keywords"]');
        if (metaKeywords) {
            metaKeywords.getAttribute('content').split(',').forEach(k => keywords.add(k.trim()));
        }
        // Extract from H1/H2 if no meta keywords
        if (keywords.size === 0) {
            document.querySelectorAll('h1, h2').forEach(h => {
                const text = h.textContent.trim();
                if (text.length > 3 && text.length < 50) keywords.add(text);
            });
        }

        // Article Content Extraction (for Rewriter)
        let articleContent = "";
        const entryContent = document.querySelector('.entry-content, .post-content, .article-content, article, #content, main');
        if (entryContent) {
            articleContent = entryContent.innerText.substring(0, 3000); // Limit to 3000 chars
        }

        const results = {
            ...markers,
            keywords: Array.from(keywords).slice(0, 10),
            article: articleContent,
            url: window.location.href,
            timestamp: Date.now()
        };

        if (DEBUG) console.log('WPAudet: WordPress detected!', results);
        chrome.runtime.sendMessage({ type: 'WP_DETECTED', data: results });
    } else {
        chrome.runtime.sendMessage({ type: 'WP_NOT_DETECTED' });
    }

})();
