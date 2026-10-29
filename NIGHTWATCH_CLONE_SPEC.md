# MeReporter — Nightwatch Clone Spec (research 2026-10-28, read-only, no changes made)

Source: live Nightwatch at new.nightwatch.io, account Nurul Nahid, URLs heritagedentalstudio.ca (20 kw) + carlaschall.com (8 kw). User's 9-point spec overrides where it adds to Nightwatch (SERP + GBP split, DataForSEO admin-only).

## Home / Pinned items
- Sidebar: search sites/groups, group "My Rankings", buttons Add URL, Quick add, Create view.
- Main: "Pinned items", Day/Week/Month grouping, "Add item" card (pin a URL/view/project).

## Add URL wizard (start?step=website)
- Steps: Website → Keywords & Prompts → Competitors → Plan, + Exit.
- Fields: Website URL * (example.com), summary "Tracking in United States · English · My Rankings" + Change (Country, Language, URL Group + Create new group), checkbox "This is a local business" → Google My Business / Search for your business (Local Pack + Google Places).
- Quick add dialog: Website URL, URL Group, Cancel / Add URL.
- After add: lands on that URL's own dashboard, then "Add Keywords" flow. New URL initially shows "Collecting first rankings" / "Collecting AI visibility" progress (Keywords queued, Rankings collected, Visibility calculated, AI visibility collected).

## Dashboard (per URL)
- Breadcrumb domain > Dashboard, date-range button, Site settings, top bar Ask AI, Quick actions, Keywords usage, Notifications, Account.
- KPI cards: Search visibility %, AI visibility, Average position (100→1 scale), Traffic value $.
- Ranking distribution: Top 3 / Top 10 / Top 100 / No rank (counts + %).
- Ranking movement: Improved / Declined / Unchanged.
- AI answer presence: Strong / Occasional / Not mentioned.
- View performance table, Competitor performance (empty: "No competitors added" + Add Competitors), Google Analytics (Not connected + Connect Analytics), Top keyword gains/losses.

## Keywords
- Page KPIs: Average position, Search visibility (Indexed Pages, %, Click Potential), Keyword distribution, Traffic value, Keywords up/down.
- Controls: Show chart, All Keywords (n), search, tags, Columns, Dynamic, Filters, per-page, pagination.
- Table columns: KEYWORDS, RANK, EVOLUTION, D/W/M CHANGE, SV (GLOBAL), TAGS, ACTIONS. Row: country flag, Google icon, keyword, ranking URL or "No Ranking URL", language, rank or "–", sparkline, SV, tags, actions (Open SERP Preview, Optimize, More actions).
- Sidebar: All Keywords, Keywords went down, Keywords went up.
- Add Keywords page: tabs Manual / Suggestions, "n keywords remaining". Toolbar: Apply AI Tags, Import from Search Console, Upload CSV File, Add Manually. Switches: Enable Precise Location, Update existing keywords, Create Keyword views. Batch-edit: Select rows to batch edit + Set for selected + Tags.
- Bulk table columns: KEYWORD, COUNTRY, LANGUAGE, SEARCH ENGINE, DEVICE, TAGS, TRANSLATION, ACTIONS. Opens with 3 empty rows (Country, Language, Search Engine, desktop/mobile pre-filled). Typing 1 keyword: tab becomes "Manual 1", header "Keywords (1)", counter "221 remaining after save", Save button enables, a 4th empty row appends. Footer: + Add Keyword, Cancel, Save n Keywords, Tips for adding keywords.
- Import from Search Console dialog: property picker pre-set to the URL's property, buttons Import selected / Import all / Select another account, table KEYWORD, POSITION, CLICKS, IMPRESSIONS, CTR, checkboxes + Select all.
- Upload CSV: file picker (mapping step not observed, no file uploaded in research).

## Site Crawler / Audit
- Sub-nav: Overview, Audit Checks, All Pages. Empty state: "No crawls yet" + "Set Up Crawl" (goes to Settings > Site Crawler, not a form).
- Settings > Site Crawler: Crawling behavior (Ignore link paths textarea, Enable URL params, Follow nofollow), Performance (Page limit 5,000, Concurrency 3), Scheduling (auto run off, frequency Disabled), buttons Cancel crawling / Save crawler settings / Save & Start crawling.
- User's addition (from his screenshots, not this account's empty crawl): crawled pages count, site health %, page depth, status (OK/REDIRECT/ERROR), pages & issues table (URL, Indexable, Description, H1, Load time).

## Settings > General
- Basic: URL (disabled), Match subdomains, Match nested URLs, Name (optional), Country, Language, Group.
- Google Places & carousel: Google Place (search business, wildcard *), Google Carousel title.
- Google integration: GA Property picker (Select GA property / None), Search Console Property picker — ONE searchable list from the connected Google account, reused for every URL (observed list: None, infectionshield.ca, chronicbosscollective.com, heritagedentalstudio.ca, nurulnahid.com, getperfectwebsite.com, carlaschall.com). Helper: select GA + GSC matching this URL, enables traffic + keyword discovery.
- Position tracking: Local Pack, Image Carousel, Featured Snippet, Knowledge Panel, AI Overview Snippet (all ticked). Buttons Delete URL / Save Changes.

## Reports (main)
- List: "Build reports and email them on a schedule." + Create Report. All Reports / No reports found.
- Builder: breadcrumb domain > Reports > New Report, top-right Download, Send, Save. Report Name pre-filled "Report for https://domain/". Date Range.
- Template: Basic Report, Progress Report, Competitor Report. Format: PDF, CSV, HTML. Logo picker.
- Report elements (drag to reorder, click to configure, + Add): Keyword overview (All Keywords, n), Keyword list (All Keywords, n, Include historic results, Columns Rank/Evolution/Last Change/D/W/M Change with sort), Traffic overview, Graph, Compare periods.
- Schedule & recipients: toggle off by default; on → Frequency Weekly, Day Monday, Time 9:00 AM, "Next delivery: weekly on Monday at 09:00 to 1 recipient", Email Recipients field + Edit/Add/Remove.
- Right live preview: title, date range, Overview (Average position, Keyword distribution, Keyword change up/down), Keywords table (DOMAIN / INDEXED PAGES, KEYWORDS, RANK, EVOLUTION, LAST CHANGE, D/W/M CHANGE).

## Sidebar (inside a URL)
Dashboard; Insights (New); SEARCH ENGINES: Keywords, Views, Competitors, Graphs; AI SEARCH: AI visibility, Prompts, Brands, Citations, Sources by brand (Beta); TOOLS: Content Studio, Site Crawler, Research, Notes; Reports; Settings (General, Competitors, Site Crawler, Brand matching).

## MeReporter additions (user spec, NOT Nightwatch)
- Keywords split SERP vs GBP everywhere; GBP grid 3x3, Average Map Rank.
- DataForSEO: admin-only (two admin emails), normal users see nothing about it; cron auto-fetch updates ranks/grids; one-click admin "Run full live check".
- GSC/GA4: Google OAuth connect ONCE per Google account (not a URL text field); properties list once, pick per URL; Import from Search Console uses the picked property; GA connect via same OAuth.
- Free data must work without paid keys: GSC import, GA import, live audit crawl, stored-data reports.
- White-label: logo picker in report builder (MeReporter default, no Nightwatch logo).
