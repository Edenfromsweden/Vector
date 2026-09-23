const GNMATH_API = "https://cdn.jsdelivr.net/gh/freebuisness/assets@main/zones.json";
const GNMATH_COVER = "https://cdn.jsdelivr.net/gh/freebuisness/covers@main";
const GNMATH_HTML = "https://cdn.jsdelivr.net/gh/freebuisness/html@main";
const UGS_API = "https://cdn.jsdelivr.net/gh/Sea-Math/ugs-json@main/games.json";
const UGS_HTML_URL1 = "https://cdn.jsdelivr.net/gh/Sea-Math/ugs-1@main";
const UGS_HTML_URL2 = "https://cdn.jsdelivr.net/gh/Sea-Math/ugs-2@main";
const UGS_HTML_URL3 = "https://cdn.jsdelivr.net/gh/Sea-Math/ugs-3@main";
const DAKNUX_API_URLS = [
    "https://cdn.jsdelivr.net/gh/daknux/assets@latest/zones.json",
    "https://cdn.jsdelivr.net/gh/daknux/assets@master/zones.json"
];
let DAKNUX_API = DAKNUX_API_URLS[Math.floor(Math.random() * DAKNUX_API_URLS.length)];
const DAKNUX_COVER = "https://cdn.jsdelivr.net/gh/daknux/covers@main";
const DAKNUX_HTML = "https://cdn.jsdelivr.net/gh/daknux/html@main";
// CKV (cherrigames, hosted on GitLab): manifest + assets are all relative to the
// repo root, served through jsDelivr's GitLab mirror.
const CKV_BASE = "https://cdn.jsdelivr.net/gl/x8r/cherrigames@main";
const CKV_API = CKV_BASE + "/ckv.json";

class LumiSDK {
    constructor() {
        this.games = [];
        this.filteredGames = [];
        this.currentPage = 1;
        this.currentSearch = "";
        this.currentSource = "All";
        this.currentGameUrl = "";
        this.currentGameHtml = "";
        this.currentGameTitle = "game";

        this.config = {
            container: '#games',
            columns: 8,
            rows: 4,
            gamesPerPage: 32,
            fontFamily: "'Inter', 'Poppins', 'Segoe UI', sans-serif"
        };

        this.colors = {
            menuBackground: "#040706", gameBackground: "#040706", text: "#d3e3d9",
            searchBackground: "#0a100c", searchBorder: "#152219", searchFocus: "#1f7a4d",
            dropdownBackground: "#0d1511", dropdownBorder: "#152219", cardBackground: "#070c09",
            cardBorder: "#1f7a4d", cardHoverBorder: "#35b97a", badgeBackground: "rgba(4,7,6,0.9)",
            badgeText: "#d3e3d9", randomBtnBg: "#1f7a4d", randomBtnText: "#d3e3d9",
            randomBtnHover: "#35b97a", pageBtnBg: "#0a100c", pageBtnText: "#729080",
            pageBtnBorder: "#152219", pageBtnActiveBg: "#1f7a4d", pageBtnActiveText: "#d3e3d9",
            actionBtnBorder: "#152219", backBtnBg: "#0a100c", backBtnHover: "#0d1511",
            backBtnText: "#d3e3d9", downloadBtnBg: "#1f7a4d", downloadBtnHover: "#35b97a",
            downloadBtnText: "#d3e3d9", blankBtnBg: "#0a100c", blankBtnHover: "#1f7a4d",
            blankBtnText: "#d3e3d9", fullscreenBtnBg: "#1f7a4d", fullscreenBtnHover: "#35b97a",
            fullscreenBtnText: "#d3e3d9"
        };
    }

    async init(options) {
        this.config = { ...this.config, ...options };
        if (options.colors) {
            this.colors = { ...this.colors, ...options.colors };
        }

        this.container = document.querySelector(this.config.container);
        if (!this.container) return;

        this.injectStyles();
        this.buildUI();
        this.grid.innerHTML = '<div class="lumi-empty">loading games...</div>';
        try {
            await this.loadGames();
        } catch (e) {
            console.error("lumi: failed to load games", e);
        }
        this.applyFilters();
    }

    injectStyles() {
        if (document.getElementById('lumi-styles')) {
            document.getElementById('lumi-styles').remove();
        }

        const c = this.colors;
        const style = document.createElement('style');
        style.id = 'lumi-styles';

        style.innerHTML = `
            .lumi-wrapper { font-family: 'Inter', system-ui, -apple-system, sans-serif; background: transparent; color: var(--text); width: 100%; min-height: 0; box-sizing: border-box; display: flex; flex-direction: column; }
            .lumi-wrapper *, .lumi-wrapper *::before, .lumi-wrapper *::after { box-sizing: border-box; }
            .lumi-menu-view { display: flex; flex-direction: column; width: 100%; min-height: 0; }
            .lumi-header { flex-shrink: 0; display: flex; gap: 10px; width: 100%; max-width: 1200px; margin: 0 auto 20px; align-items: center; flex-wrap: wrap; justify-content: center; }

            .lumi-search { flex: 1 1 160px; min-width: 160px; max-width: 420px; height: 38px; padding: 0 16px; border: 1px solid rgba(255,255,255,.09); border-radius: 12px; background: rgba(10,16,12,.5); -webkit-backdrop-filter: blur(16px) saturate(1.25); backdrop-filter: blur(16px) saturate(1.25); box-shadow: inset 0 1px 0 rgba(255,255,255,.06); color: var(--text); font-family: 'Inter', sans-serif; font-size: 13px; outline: none; transition: border-color .18s ease, box-shadow .18s ease, background .18s ease; }
            .lumi-search:focus { border-color: rgba(var(--green-rgb),.5); background: rgba(10,16,12,.68); box-shadow: 0 0 0 3px var(--green-soft), inset 0 1px 0 rgba(255,255,255,.06); }
            .lumi-search::placeholder { color: var(--muted); }

            .lumi-count { flex-shrink: 0; font-size: 12px; color: var(--muted); white-space: nowrap; }

            .lumi-source-select { height: 38px; padding: 0 14px; border: 1px solid rgba(255,255,255,.09); border-radius: 12px; background: rgba(10,16,12,.5); -webkit-backdrop-filter: blur(16px) saturate(1.25); backdrop-filter: blur(16px) saturate(1.25); box-shadow: inset 0 1px 0 rgba(255,255,255,.06); color: var(--text-dim); font-family: 'Inter', sans-serif; font-size: 13px; outline: none; cursor: pointer; transition: border-color .18s ease, color .18s ease, background .18s ease; }
            .lumi-source-select:hover { color: var(--text); border-color: rgba(255,255,255,.15); }
            .lumi-source-select:focus { border-color: rgba(var(--green-rgb),.5); box-shadow: 0 0 0 3px var(--green-soft); }
            .lumi-source-select option { background-color: #0d1511; color: #d3e3d9; }

            .lumi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 18px; width: 100%; max-width: 1200px; margin: 0 auto; justify-content: center; }

            .lumi-game-card { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; aspect-ratio: 1 / 1; padding: 16px 12px; background: rgba(10,16,12,.5); -webkit-backdrop-filter: blur(16px) saturate(1.3); backdrop-filter: blur(16px) saturate(1.3); border: 1px solid rgba(255,255,255,.09); border-radius: 16px; box-shadow: inset 0 1px 0 rgba(255,255,255,.07); color: var(--text-dim); font-family: 'Inter', sans-serif; text-align: center; cursor: pointer; overflow: hidden; transition: background .18s ease, border-color .18s ease, transform .18s ease, box-shadow .18s ease; }
            .lumi-game-card:hover { background: rgba(13,21,17,.58); border-color: rgba(var(--green-rgb),.45); transform: translateY(-3px); box-shadow: 0 16px 36px -16px rgba(0,0,0,.75), 0 0 0 1px rgba(var(--green-rgb),.12), inset 0 1px 0 rgba(255,255,255,.09); color: var(--text); }
            .lumi-game-ic { display: flex; align-items: center; justify-content: center; width: 96px; height: 96px; flex-shrink: 0; border-radius: 18px; background: rgba(var(--green-rgb),.08); border: 1px solid rgba(var(--green-rgb),.16); color: var(--green); overflow: hidden; transition: background .18s ease, border-color .18s ease, color .18s ease; }
            .lumi-game-card:hover .lumi-game-ic { color: var(--green-lit); background: rgba(var(--green-rgb),.13); border-color: rgba(var(--green-rgb),.32); }
            .lumi-game-img { width: 100%; height: 100%; border-radius: 17px; object-fit: cover; display: block; }
            .lumi-game-ic svg { width: 34px; height: 34px; }
            .lumi-game-title { font-size: 12.5px; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }

            .lumi-empty { grid-column: 1 / -1; padding: 38px 0; color: var(--muted); font-size: 13px; text-align: center; }

            .lumi-pagination { flex-shrink: 0; display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
            .lumi-page-btn { height: 28px; padding: 0 13px; border: 1px solid rgba(255,255,255,.09); background: rgba(10,16,12,.5); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); color: var(--text-dim); border-radius: 999px; cursor: pointer; font-family: 'Inter', sans-serif; font-size: 12px; transition: background .18s ease, border-color .18s ease, color .18s ease; }
            .lumi-page-btn:hover { color: var(--text); border-color: rgba(255,255,255,.16); background: rgba(13,21,17,.6); }
            .lumi-page-btn.active { background: rgba(var(--green-rgb),.24); color: var(--green-lit); border-color: rgba(var(--green-rgb),.5); }

            .lumi-game-view { display: none; position: relative; width: 100%; min-height: 60vh; background: rgba(4,7,6,.45); -webkit-backdrop-filter: blur(20px) saturate(1.2); backdrop-filter: blur(20px) saturate(1.2); border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,.1); box-shadow: inset 0 1px 0 rgba(255,255,255,.06); }
            .lumi-iframe { width: 100%; height: 70vh; min-height: 420px; border: none; background: #000; }
            .lumi-iframe:fullscreen { width: 100vw; height: 100vh; min-height: 0; }
            .lumi-iframe:-webkit-full-screen { width: 100vw; height: 100vh; min-height: 0; }
            .lumi-game-view:fullscreen { min-height: 0; padding: 0; border: none; border-radius: 0; }
            .lumi-game-view:fullscreen .lumi-iframe { height: 100vh; }
            .lumi-toolbar { position: absolute; top: 14px; left: 14px; display: flex; gap: 6px; z-index: 10; padding: 6px; border-radius: 14px; background: rgba(7,12,9,.6); -webkit-backdrop-filter: blur(14px) saturate(1.25); backdrop-filter: blur(14px) saturate(1.25); border: 1px solid rgba(255,255,255,.1); box-shadow: 0 8px 24px -12px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.07); }

            .lumi-action-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 1px solid transparent; background: transparent; color: var(--text-dim); border-radius: 10px; cursor: pointer; transition: background .18s ease, color .18s ease, border-color .18s ease, transform .18s ease; }
            .lumi-action-btn svg { width: 17px; height: 17px; }
            .lumi-action-btn:hover { background: rgba(255,255,255,.07); color: var(--text); border-color: rgba(255,255,255,.1); }
            .lumi-action-btn:active { transform: scale(.94); }
            .lumi-back-btn { background: rgba(var(--green-rgb),.22); border-color: rgba(var(--green-rgb),.35); color: var(--green-lit); }
            .lumi-back-btn:hover { background: rgba(var(--green-rgb),.34); border-color: rgba(var(--green-rgb),.55); color: var(--text); }

            .launch-lumi::-webkit-scrollbar { width: 10px; }
            .launch-lumi::-webkit-scrollbar-track { background: transparent; }
            .launch-lumi::-webkit-scrollbar-thumb { background: rgba(var(--green-rgb),.22); border-radius: 999px; border: 2px solid transparent; background-clip: content-box; }
            .launch-lumi::-webkit-scrollbar-thumb:hover { background: rgba(var(--green-rgb),.38); background-clip: content-box; border: 2px solid transparent; }

            @media (max-width: 560px) {
                .lumi-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
                .lumi-game-ic { width: 80px; height: 80px; border-radius: 14px; }
                .lumi-game-img { border-radius: 13px; }
            }
        `;

        document.head.appendChild(style);
    }

    buildUI() {
        this.container.innerHTML = `
            <div class="lumi-wrapper" id="lumi-main-wrapper">
                <div class="lumi-menu-view">
                    <div class="lumi-header">
                        <select class="lumi-source-select">
                            <option value="All">all</option>
                            <option value="GNMath">gnmath</option>
                            <option value="UGS">ugs</option>
                            <option value="Daknux">daknux</option>
                            <option value="CKV">ckv</option>
                        </select>
                        <input type="text" class="lumi-search" placeholder="search games...">
                        <span class="lumi-count"></span>
                    </div>
                    <div class="lumi-grid"></div>
                    <div class="lumi-pagination"></div>
                </div>
                <div class="lumi-game-view">
                    <div class="lumi-toolbar">
                        <button class="lumi-action-btn lumi-back-btn" title="back" aria-label="back"><i data-lucide="arrow-left"></i></button>
                        <button class="lumi-action-btn lumi-fullscreen-btn" title="fullscreen" aria-label="fullscreen"><i data-lucide="maximize"></i></button>
                    </div>
                    <iframe class="lumi-iframe" src="" sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms" allowfullscreen></iframe>
                </div>
            </div>
        `;

        this.wrapper = this.container.querySelector('#lumi-main-wrapper');
        this.menuView = this.container.querySelector('.lumi-menu-view');
        this.grid = this.container.querySelector('.lumi-grid');
        this.pagination = this.container.querySelector('.lumi-pagination');
        this.searchInput = this.container.querySelector('.lumi-search');
        this.countEl = this.container.querySelector('.lumi-count');
        this.sourceSelect = this.container.querySelector('.lumi-source-select');

        this.gameView = this.container.querySelector('.lumi-game-view');
        this.iframe = this.container.querySelector('.lumi-iframe');
        this.backBtn = this.container.querySelector('.lumi-back-btn');
        this.fullscreenBtn = this.container.querySelector('.lumi-fullscreen-btn');

        this.searchInput.addEventListener('input', (e) => {
            this.currentSearch = e.target.value;
            this.applyFilters();
        });

        this.sourceSelect.addEventListener('change', (e) => {
            this.currentSource = e.target.value;
            this.applyFilters();
        });

        this.backBtn.addEventListener('click', () => this.closeGame());

        this.fullscreenBtn.addEventListener('click', () => {
            const el = this.iframe || this.gameView;
            if (el.requestFullscreen) {
                el.requestFullscreen();
            } else if (el.webkitRequestFullscreen) {
                el.webkitRequestFullscreen();
            } else if (el.mozRequestFullScreen) {
                el.mozRequestFullScreen();
            } else if (el.msRequestFullscreen) {
                el.msRequestFullscreen();
            } else if (this.gameView.requestFullscreen) {
                this.gameView.requestFullscreen();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.gameView && this.gameView.style.display === 'block') {
                this.closeGame();
            }
        });

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    cleanPath(path) {
        if (!path) return '';
        return path
            .replace(/%7BHTML_URL%7D\//gi, '')
            .replace(/{HTML_URL}\//gi, '')
            .replace(/%7BCOVER_URL%7D\//gi, '')
            .replace(/{COVER_URL}\//gi, '')
            .replace(/^\//, '');
    }

    async loadGames() {
        let loadedGames = [];
        const fetchJSON = async (url) => {
            try {
                const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
                if (!res.ok) return [];
                return await res.json();
            } catch (e) {
                console.error("lumi: fetch failed", url, e);
                return [];
            }
        };

        const gnmathData = await fetchJSON(GNMATH_API);
        gnmathData.forEach(g => {
            const cleanUrlParam = this.cleanPath(g.url);
            const gameUrl = cleanUrlParam.includes('.') ? `${GNMATH_HTML}/${cleanUrlParam}` : `${GNMATH_HTML}/${cleanUrlParam}/index.html`;

            loadedGames.push({
                title: g.title || g.name,
                cover: g.cover ? `${GNMATH_COVER}/${this.cleanPath(g.cover)}` : "",
                url: gameUrl,
                source: "GNMath"
            });
        });

        const ugsData = await fetchJSON(UGS_API);
        ugsData.forEach(g => {
            let ugsHtmlBase = UGS_HTML_URL1;
            let rawUrl = g.url || "";

            if (rawUrl.includes("{HTML_URL2}") || g.repo === 'ugs-2') {
                ugsHtmlBase = UGS_HTML_URL2;
            } else if (rawUrl.includes("{HTML_URL3}") || g.repo === 'ugs-3') {
                ugsHtmlBase = UGS_HTML_URL3;
            }

            let finalCover = g.cover || g.image || "";
            finalCover = finalCover.replace(/{COVER_URL}/g, UGS_HTML_URL1.replace('/ugs-1@main', '/ugs-covers@main'));
            if (!finalCover.startsWith('http')) {
                finalCover = `${UGS_HTML_URL1}/${this.cleanPath(finalCover)}`;
            }

            let finalUrl = rawUrl
                .replace(/{HTML_URL1}/g, UGS_HTML_URL1)
                .replace(/{HTML_URL2}/g, UGS_HTML_URL2)
                .replace(/{HTML_URL3}/g, UGS_HTML_URL3);

            if (!finalUrl.startsWith('http')) {
                finalUrl = `${ugsHtmlBase}/${this.cleanPath(finalUrl)}`;
            }

            loadedGames.push({
                title: g.title || g.name,
                cover: finalCover || "",
                url: finalUrl,
                source: "UGS"
            });
        });

        const daknuxData = await fetchJSON(DAKNUX_API);
        daknuxData.forEach(g => {
            const cleanUrlParam = this.cleanPath(g.url);
            const gameUrl = cleanUrlParam.includes('.') ? `${DAKNUX_HTML}/${cleanUrlParam}` : `${DAKNUX_HTML}/${cleanUrlParam}/index.html`;

            loadedGames.push({
                title: g.title || g.name,
                cover: g.cover ? `${DAKNUX_COVER}/${this.cleanPath(g.cover)}` : "",
                url: gameUrl,
                source: "Daknux"
            });
        });

        const ckvData = await fetchJSON(CKV_API);
        ckvData.forEach(g => {
            const rawUrl = g.url || "";
            const rawImg = g.img || g.cover || "";
            loadedGames.push({
                title: g.name || g.title,
                cover: rawImg ? `${CKV_BASE}/${this.cleanPath(rawImg)}` : "",
                url: rawUrl.startsWith('http') ? rawUrl : `${CKV_BASE}/${this.cleanPath(rawUrl)}`,
                source: "CKV"
            });
        });

        this.games = loadedGames.filter(game => game.url && game.title);
    }

    applyFilters() {
        const lowerQuery = this.currentSearch.toLowerCase();

        this.filteredGames = this.games.filter(game => {
            const matchesSearch = game.title.toLowerCase().includes(lowerQuery);
            const matchesSource = this.currentSource === "All" || game.source === this.currentSource;
            return matchesSearch && matchesSource;
        });

        this.currentPage = 1;
        this.updateView();
    }

    escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    async reload() {
        if (!this.grid) return;
        this.grid.innerHTML = '<div class="lumi-empty">loading games...</div>';
        try {
            await this.loadGames();
        } catch (e) {
            console.error("lumi: reload failed", e);
        }
        this.applyFilters();
    }

    renderGrid() {
        this.grid.innerHTML = '';
        const start = (this.currentPage - 1) * this.config.gamesPerPage;
        const pageGames = this.filteredGames.slice(start, start + this.config.gamesPerPage);

        if (pageGames.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'lumi-empty';
            if (this.games.length === 0) {
                empty.textContent = "couldn't load games — ";
                const retry = document.createElement('button');
                retry.type = 'button';
                retry.className = 'lumi-page-btn';
                retry.textContent = 'retry';
                retry.onclick = () => this.reload();
                empty.appendChild(retry);
            } else {
                empty.textContent = 'no games found';
            }
            this.grid.appendChild(empty);
            return;
        }

        const fragment = document.createDocumentFragment();
        pageGames.forEach(game => {
            const card = document.createElement('div');
            card.className = 'lumi-game-card';
            card.title = game.title;
            const art = game.cover
                ? `<img src="${game.cover}" alt="" class="lumi-game-img" loading="lazy">`
                : '<i data-lucide="gamepad-2"></i>';
            card.innerHTML = `
                <span class="lumi-game-ic">${art}</span>
                <span class="lumi-game-title">${this.escapeHtml(game.title)}</span>
            `;
            const img = card.querySelector('img');
            if (img) {
                img.addEventListener('error', () => {
                    const ic = document.createElement('i');
                    ic.setAttribute('data-lucide', 'gamepad-2');
                    img.replaceWith(ic);
                    if (window.lucide && typeof window.lucide.createIcons === 'function') {
                        window.lucide.createIcons();
                    }
                }, { once: true });
            }
            card.onclick = () => this.playGame(game);
            fragment.appendChild(card);
        });
        this.grid.appendChild(fragment);
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    renderPagination() {
        this.pagination.innerHTML = '';
        const totalPages = Math.ceil(this.filteredGames.length / this.config.gamesPerPage);
        if (totalPages <= 1) return;

        const fragment = document.createDocumentFragment();

        const createBtn = (text, page, isActive = false) => {
            const btn = document.createElement('button');
            btn.className = `lumi-page-btn ${isActive ? 'active' : ''}`;
            btn.innerText = text;
            btn.onclick = () => {
                this.currentPage = page;
                this.updateView();
            };
            fragment.appendChild(btn);
        };

        if (this.currentPage > 1) createBtn('prev', this.currentPage - 1);

        let startPage = Math.max(1, this.currentPage - 2);
        let endPage = Math.min(totalPages, startPage + 4);

        for (let i = startPage; i <= endPage; i++) {
            createBtn(i, i, i === this.currentPage);
        }

        if (this.currentPage < totalPages) createBtn('next', this.currentPage + 1);

        this.pagination.appendChild(fragment);
    }

    updateView() {
        if (this.countEl) {
            const n = this.filteredGames.length;
            this.countEl.textContent = n + (n === 1 ? " game" : " games");
        }
        this.renderGrid();
        this.renderPagination();
    }

    async playGame(game) {
        if (!game || !game.url) return;

        this.currentGameUrl = game.url;
        this.currentGameTitle = game.title || "game";
        this.currentGameHtml = "";
        this.menuView.style.display = 'none';
        this.gameView.style.display = 'block';

        try {
            const response = await fetch(game.url);
            let htmlText = await response.text();

            const defaultHtmlUrl = game.source === 'GNMath' ? GNMATH_HTML : game.source === 'Daknux' ? DAKNUX_HTML : UGS_HTML_URL1;
            const defaultCoverUrl = game.source === 'GNMath' ? GNMATH_COVER : game.source === 'Daknux' ? DAKNUX_COVER : UGS_HTML_URL1.replace('/ugs-1@main', '/ugs-covers@main');

            htmlText = htmlText
                .replace(/{HTML_URL1}/gi, UGS_HTML_URL1)
                .replace(/%7BHTML_URL1%7D/gi, UGS_HTML_URL1)
                .replace(/{HTML_URL2}/gi, UGS_HTML_URL2)
                .replace(/%7BHTML_URL2%7D/gi, UGS_HTML_URL2)
                .replace(/{HTML_URL3}/gi, UGS_HTML_URL3)
                .replace(/%7BHTML_URL3%7D/gi, UGS_HTML_URL3)
                .replace(/{HTML_URL}/gi, defaultHtmlUrl)
                .replace(/%7BHTML_URL%7D/gi, defaultHtmlUrl)
                .replace(/{COVER_URL}/gi, defaultCoverUrl)
                .replace(/%7BCOVER_URL%7D/gi, defaultCoverUrl);

            htmlText = htmlText.replace(/(src|href|action|data)=(['"])\/([^/])/gi, '$1=$2$3');

            const baseUrl = game.url.substring(0, game.url.lastIndexOf('/') + 1);

            if (!/<base\b[^>]*>/i.test(htmlText)) {
                const baseTag = `<base href="${baseUrl}">`;
                if (htmlText.match(/<head[^>]*>/i)) {
                    htmlText = htmlText.replace(/(<head[^>]*>)/i, `$1\n    ${baseTag}`);
                } else {
                    htmlText = `${baseTag}\n${htmlText}`;
                }
            }

            this.currentGameHtml = htmlText;
            this.iframe.srcdoc = htmlText;

        } catch (e) {
            this.iframe.removeAttribute('srcdoc');
            this.iframe.src = game.url;
        }
    }

    closeGame() {
        this.gameView.style.display = 'none';
        this.menuView.style.display = 'flex';
        this.iframe.removeAttribute('srcdoc');
        this.iframe.src = '';
        this.currentGameUrl = "";
        this.currentGameHtml = "";
        this.currentGameTitle = "game";
    }
}

window.Lumi = new LumiSDK();
