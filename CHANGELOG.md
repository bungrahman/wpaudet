# Changelog

## [1.1.0] - 2026-06-17
### Added
- **One-click indexing**: Instant deep-links to index page via Google Search Console and Bing Webmaster.
- **Instant GSC Report**: Open GSC Search Performance report for specific durations (3, 6, 12, or 16 months) in one click.
- **URL Index Checker**: Verify indexing status of current URL or specific URL in Google and Bing using `site:` query shortcuts.
- **Schema & Structured Data Detector**: Detect JSON-LD and Microdata schema markup types on active page.
- **Modern Tab Navigation & Wider Layout**: Tab panels (Overview, SEO Tools, GSC & Bing, Server) in a cleaner 480px wide glassmorphism design.

## [1.0.5] - 2026-06-15
### Changed
- Updated version to 1.0.5.

## [1.0.4] - 2024-05-14
### Added
- **SEMrush Integration**: Shortcut button to analyze domain traffic instantly on SEMrush.
- **Multi-TLD WHOIS**: Supports WHOIS discovery for `.id`, `.com`, `.net`, `.org` via RDAP with universal fallback.
- **AI Traffic Potential**: Keyword suggestions now include traffic potential labels (`[HIGH]`, `[MEDIUM]`, `[LOW]`).
- **Smart Session Cache**: Caches AI Audit, Keywords, and Rewrite results per tab to save API usage.
- **Stealth Detection**: Enhanced logic to detect hidden WordPress sites (Ghost Mode).

### Fixed
- Fixed `fetchWhois` error 404 on non-.com domains by implementing smart RDAP routing.
- Fixed `parts is not defined` error in AI Rewriter logic.
- Updated `manifest.json` with necessary host permissions for new RDAP servers.

## [1.0.3] - 2024-05-13
### Added
- Real-time AI Article Rewriter.
- Glassmorphism UI improvements.
- Support for Groq and DeepSeek AI models.

## [1.0.2] - 2024-05-12
### Added
- CDN Detection logic (Cloudflare, Sucuri, Akamai).
- Manual API Key input for OpenAI and Google Gemini.

## [1.0.1] - 2024-05-10
### Added
- WHOIS Lookup Modal.
- Server IP and Location detection via IP-API.

## [1.0.0] - 2024-05-01
- **Initial Release**: Core detection for Themes and Plugins.
