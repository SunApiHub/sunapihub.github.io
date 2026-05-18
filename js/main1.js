// 当整个文档加载完成后执行
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar'); // 获取侧边栏元素
    const mainContent = document.getElementById('main-content'); // 获取主内容区元素
    let allPosts = []; // 用于存储所有文章数据
    let activeTagLink = null; // 用于跟踪当前激活的标签链接（例如，当前选中的标签）
    const STEAM_PROXY_BASE = 'https://nameless-sky-1205.sun-api.workers.dev';
    const steamCache = new Map();
    const STEAM_TITLE_MAP = {
        '帝国时代4': '1466860',
        '勇者斗恶龙 建造者2': '1072420',
        '刺客信条 影': '3159330',
        '刺客信条：影': '3159330',
        'MGS1终于降价了': '2131630',
        'MGS1': '2131630'
    };
    let steamTotalsCache = {
        loading: false,
        totalMinutes: null,
        recentMinutes: null,
        error: null
    };
    let steamTotalsPromise = null;
    let activeMusicCard = null;

    // --- 侧边栏自动收起阈值 ---
    const SIDEBAR_WIDTH = 220;
    const SIDEBAR_LEFT = 16;
    const SIDEBAR_GAP = 20;
    const CONTENT_MAX_WIDTH = 900;
    const SIDEBAR_HIDE_AT = SIDEBAR_LEFT + SIDEBAR_WIDTH + SIDEBAR_GAP + CONTENT_MAX_WIDTH + 40;
    // --- 结束阈值 ---

    // --- 新增无限滚动相关变量 ---
    const INITIAL_LOAD_COUNT = 20; // 首次加载的文章数量 - 此变量未在当前JS中使用，但保留作为配置
    const LOAD_MORE_COUNT = 10;    // 每次滚动到底部时加载的文章数量
    let currentLoadedCount = 0;    // 当前已加载的文章总数
    let isLoading = false;         // 防止重复加载的标志
    let currentFilteredPosts = []; // 用于存储当前过滤/显示的文章列表
    // --- 结束新增无限滚动相关变量 ---

    // --- 移除菜单切换按钮变量和断点 ---
    // let menuToggleBtn; // 声明菜单切换按钮变量 - 已移除
    // const MOBILE_BREAKPOINT = 1200; // 定义移动端断点，与CSS保持一致 - 已移除
    // --- 结束移除 ---

    function resolveSteamAppId(item) {
        const explicitId = item.steamAppId ?? item.steam_appid ?? item.appid;
        if (explicitId !== undefined && explicitId !== null && String(explicitId).trim() !== '') {
            return String(explicitId).trim();
        }
        const mappedId = STEAM_TITLE_MAP[item.title];
        return mappedId ? String(mappedId) : null;
    }

    function formatSteamHours(minutes) {
        const value = Number(minutes);
        if (!Number.isFinite(value) || value <= 0) return '0h';
        const hours = value / 60;
        return hours >= 10 ? `${hours.toFixed(1)}h` : `${hours.toFixed(2)}h`;
    }

    function getSteamAppIds(posts = allPosts) {
        return [...new Set(posts.map(resolveSteamAppId).filter(Boolean))];
    }

    function countRenderedLines(element) {
        if (!element) return 0;
        const range = document.createRange();
        range.selectNodeContents(element);
        const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
        if (!rects.length) return 0;

        const lineTops = [];
        const tolerance = 2;
        rects.forEach(rect => {
            const top = rect.top;
            if (!lineTops.some(existingTop => Math.abs(existingTop - top) <= tolerance)) {
                lineTops.push(top);
            }
        });
        return lineTops.length;
    }

    function normalizeMusicUrl(url) {
        if (!url) return '';
        const trimmed = String(url).trim();
        return trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
    }

    function buildMusicAutoplayUrl(url) {
        const normalized = normalizeMusicUrl(url);
        if (!normalized) return '';

        try {
            const parsed = new URL(normalized, window.location.href);
            parsed.searchParams.set('autoplay', '1');
            return parsed.toString();
        } catch {
            const joiner = normalized.includes('?') ? '&' : '?';
            return `${normalized}${joiner}autoplay=1`;
        }
    }

    function stopMusicPlayer(state) {
        if (!state) return;
        state.card.classList.remove('music-playing');
        state.button.classList.remove('is-playing');
        state.button.setAttribute('aria-label', '播放音乐');
        if (state.icon) {
            state.icon.textContent = '♪';
        }
        state.iframe.src = 'about:blank';
        if (activeMusicCard === state.card) {
            activeMusicCard = null;
        }
    }

    function playMusicPlayer(state) {
        if (!state) return;
        if (activeMusicCard && activeMusicCard !== state.card) {
            stopMusicPlayer(activeMusicCard.__musicState);
        }
        state.card.classList.add('music-playing');
        state.button.classList.add('is-playing');
        state.button.setAttribute('aria-label', '停止音乐');
        if (state.icon) {
            state.icon.textContent = '⏹';
        }
        state.iframe.src = state.autoplaySrc;
        activeMusicCard = state.card;
    }

    function setupMusicPlayer(card, musicUrl) {
        if (!card || !musicUrl) return;
        const button = card.querySelector('[data-music-toggle]');
        const iframe = card.querySelector('[data-music-frame]');
        if (!button || !iframe) return;

        const state = {
            card,
            button,
            iframe,
            icon: button.querySelector('[data-music-icon]'),
            autoplaySrc: buildMusicAutoplayUrl(musicUrl),
        };
        card.__musicState = state;

        button.addEventListener('click', () => {
            if (card.classList.contains('music-playing')) {
                stopMusicPlayer(state);
            } else {
                playMusicPlayer(state);
            }
        });
    }

    function augmentPost(item) {
        const steamAppId = resolveSteamAppId(item);
        const tags = Array.isArray(item.tags) ? [...item.tags] : [];
        const hasMusic = Boolean(item.musicUrl || item.musicIframe || item.musicSrc);

        if (steamAppId && !tags.includes('Steam')) {
            tags.push('Steam');
        }
        if (hasMusic && !tags.includes('Music')) {
            tags.push('Music');
        }

        return {
            ...item,
            steamAppId,
            tags
        };
    }

    function getDisplayTags(item) {
        const tags = Array.isArray(item.tags) ? [...item.tags] : [];
        const steamIndex = tags.indexOf('Steam');
        if (steamIndex > 0) {
            tags.splice(steamIndex, 1);
            tags.unshift('Steam');
        }
        const musicIndex = tags.indexOf('Music');
        if (musicIndex > -1) {
            tags.splice(musicIndex, 1);
            const nextSteamIndex = tags.indexOf('Steam');
            if (nextSteamIndex >= 0) {
                tags.splice(nextSteamIndex + 1, 0, 'Music');
            } else {
                tags.unshift('Music');
            }
        }
        return tags;
    }

    function fetchSteamGameInfo(appid) {
        if (steamCache.has(appid)) {
            return steamCache.get(appid);
        }

        const request = fetch(`${STEAM_PROXY_BASE}/steam/game?appid=${encodeURIComponent(appid)}`)
            .then(async (res) => {
                if (!res.ok) {
                    throw new Error(`Steam proxy HTTP ${res.status}`);
                }
                return res.json();
            })
            .catch((err) => ({ error: err.message || String(err) }));

        steamCache.set(appid, request);
        return request;
    }

    function renderSteamTotals(container = document.getElementById('tag-stats-container')) {
        if (!container) return;

        const totalTimeValue = container.querySelector('[data-steam-total-time-value]');
        const recentTimeValue = container.querySelector('[data-steam-recent-time-value]');
        const totalTimeBox = container.querySelector('[data-steam-total-time-box]');
        const recentTimeBox = container.querySelector('[data-steam-recent-time-box]');

        if (totalTimeValue) {
            totalTimeValue.textContent = steamTotalsCache.loading
                ? '-'
                : steamTotalsCache.error
                    ? '读取失败'
                    : `${formatSteamHours(steamTotalsCache.totalMinutes)}`
        }

        if (recentTimeValue) {
            recentTimeValue.textContent = steamTotalsCache.loading
                ? '-'
                : steamTotalsCache.error
                    ? '读取失败'
                    : `${formatSteamHours(steamTotalsCache.recentMinutes)}`
        }

        if (totalTimeBox) {
            totalTimeBox.classList.toggle('is-loading', steamTotalsCache.loading);
            totalTimeBox.classList.toggle('is-error', !!steamTotalsCache.error);
        }

        if (recentTimeBox) {
            recentTimeBox.classList.toggle('is-loading', steamTotalsCache.loading);
            recentTimeBox.classList.toggle('is-error', !!steamTotalsCache.error);
        }
    }

    async function refreshSteamTotals() {
        if (steamTotalsPromise) {
            return steamTotalsPromise;
        }

        const appids = getSteamAppIds();
        if (!appids.length) {
            steamTotalsCache = {
                loading: false,
                totalMinutes: 0,
                recentMinutes: 0,
                error: null
            };
            renderSteamTotals();
            return steamTotalsCache;
        }

        steamTotalsCache = {
            loading: true,
            totalMinutes: null,
            recentMinutes: null,
            error: null
        };
        renderSteamTotals();

        steamTotalsPromise = (async () => {
            try {
                const results = await Promise.all(appids.map(async (appid) => {
                    const data = await fetchSteamGameInfo(appid);
                    if (data.error) return null;
                    const owned = data.owned || null;
                    return {
                        total: Number(owned?.playtime_forever) || 0,
                        recent: Number(owned?.playtime_2weeks) || 0
                    };
                }));

                const totals = results.reduce((acc, item) => {
                    if (!item) return acc;
                    acc.total += item.total;
                    acc.recent += item.recent;
                    return acc;
                }, { total: 0, recent: 0 });

                steamTotalsCache = {
                    loading: false,
                    totalMinutes: totals.total,
                    recentMinutes: totals.recent,
                    error: null
                };
            } catch (error) {
                steamTotalsCache = {
                    loading: false,
                    totalMinutes: null,
                    recentMinutes: null,
                    error: error?.message || String(error)
                };
            } finally {
                steamTotalsPromise = null;
                renderSteamTotals();
            }

            return steamTotalsCache;
        })();

        return steamTotalsPromise;
    }

    async function hydrateSteamMeta(targetEl, item) {
        const appid = resolveSteamAppId(item);
        if (!appid || !targetEl) return;

        const card = targetEl.closest('.news-right');
        const newsItem = card ? card.closest('.news-item') : null;
        const steamNameEl = card ? card.querySelector('[data-steam-name]') : null;
        const steamProgressEl = card ? card.querySelector('[data-steam-progress]') : null;
        const tagsEl = card ? card.querySelector('.tags') : null;
        const priceEl = card ? card.querySelector('.price') : null;
        const footerRightEl = card ? card.querySelector('.footer-right') : null;

        targetEl.classList.add('steam-loading');
        targetEl.innerHTML = '<span class="steam-note">加载中...</span>';
        if (steamProgressEl) {
            steamProgressEl.classList.add('steam-loading');
            steamProgressEl.innerHTML = '';
            steamProgressEl.style.display = '';
        }

        const data = await fetchSteamGameInfo(appid);
        if (data.error) {
            targetEl.classList.remove('steam-loading');
            targetEl.classList.add('steam-error');
            targetEl.innerHTML = `<span class="steam-note">${data.error}</span>`;
            if (steamProgressEl) {
                steamProgressEl.classList.remove('steam-loading');
                steamProgressEl.classList.add('steam-error');
                steamProgressEl.innerHTML = `<span class="steam-note">${data.error}</span>`;
            }
            return;
        }

        const storeName = data.store?.name || item.title;
        const playtimeForever = data.owned ? formatSteamHours(data.owned.playtime_forever) : null;
        const achievements = Array.isArray(data.achievements?.achievements) ? data.achievements.achievements : [];
        const unlocked = achievements.length > 0
            ? achievements.filter((achievement) => Number(achievement.achieved) === 1).length
            : null;
        const isAllComplete = unlocked !== null && achievements.length > 0 && unlocked === achievements.length;

        if (steamNameEl) {
            steamNameEl.textContent = storeName;
            steamNameEl.classList.remove('steam-loading');
        }

        const metaParts = [];
        const metaLineParts = [];
        if (playtimeForever !== null) {
            metaLineParts.push(`<span class="steam-pill">总时长 ${playtimeForever}</span>`);
        }
        if (unlocked !== null) {
            metaLineParts.push(`<span class="steam-pill">成就 ${unlocked}/${achievements.length}</span>`);
        }
        if (metaLineParts.length) {
            metaParts.unshift(`<div class="steam-meta-line">${metaLineParts.join('')}</div>`);
        }
        if (data.note) {
            metaParts.push(`<span class="steam-note">${data.note}</span>`);
        }

        targetEl.classList.remove('steam-loading');
        targetEl.innerHTML = metaParts.join('');

        if (steamProgressEl) {
            steamProgressEl.classList.remove('steam-loading', 'steam-error');
            const progress = (unlocked !== null && achievements.length > 0)
                ? Math.max(0, Math.min(100, (unlocked / achievements.length) * 100))
                : 0;
            steamProgressEl.innerHTML = unlocked !== null
                ? `
                    <div class="steam-achievement-block${isAllComplete ? ' steam-achievement-block--complete' : ''}">
                        <div class="steam-achievement-bar${isAllComplete ? ' steam-achievement-bar--complete' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}">
                            <div class="steam-achievement-fill${isAllComplete ? ' steam-achievement-fill--complete' : ''}" data-target-width="${progress}"></div>
                        </div>
                    </div>
                `
                : '';

            if (unlocked !== null) {
                const fillEl = steamProgressEl.querySelector('.steam-achievement-fill');
                if (fillEl) {
                    fillEl.style.width = '0%';
                    requestAnimationFrame(() => {
                        fillEl.style.width = `${progress}%`;
                    });
                }
            }

            if (unlocked === null) {
                steamProgressEl.style.display = 'none';
                if (newsItem) {
                    newsItem.classList.add('steam-no-achievements');
                }
                if (footerRightEl) {
                    footerRightEl.style.flexWrap = 'nowrap';
                    footerRightEl.style.alignItems = 'center';
                    footerRightEl.style.justifyContent = 'flex-end';
                }
                if (priceEl && footerRightEl && priceEl.parentElement !== footerRightEl) {
                    priceEl.style.display = 'inline-flex';
                    priceEl.style.marginTop = '0';
                    priceEl.style.marginLeft = 'auto';
                    priceEl.style.alignSelf = 'center';
                    footerRightEl.appendChild(priceEl);
                }
            } else {
                steamProgressEl.style.display = '';
                if (newsItem) {
                    newsItem.classList.remove('steam-no-achievements');
                }
                if (footerRightEl) {
                    footerRightEl.style.flexWrap = '';
                    footerRightEl.style.alignItems = '';
                    footerRightEl.style.justifyContent = '';
                }
                if (priceEl && priceEl.parentElement === footerRightEl) {
                    priceEl.style.display = '';
                    priceEl.style.marginTop = '';
                    priceEl.style.marginLeft = '';
                    priceEl.style.alignSelf = '';
                    card.appendChild(priceEl);
                }
            }
        }

        if (tagsEl) {
            if (isAllComplete) {
                if (!item.tags.includes('全成就')) {
                    item.tags.push('全成就');
                    renderTagStatistics(calculateTagCounts(allPosts));
                }
            } else {
                const existingIndex = item.tags.indexOf('全成就');
                if (existingIndex !== -1) {
                    item.tags.splice(existingIndex, 1);
                    renderTagStatistics(calculateTagCounts(allPosts));
                }
            }
        }
    }

    /**
     * 主初始化函数
     * 负责应用的整体启动流程：
     * 1. 加载侧边栏 HTML
     * 2. 加载并处理文章数据 (data.json)
     * 3. 渲染标签统计信息
     * 4. 渲染所有文章到主内容区
     * 5. 绑定所有必要的事件监听器 (导航链接、标签链接, 滚动事件)
     */
    async function initialize() {
        try {
            // --- marked.js 配置：用于将 Markdown 转换为 HTML ---
            const renderer = new marked.Renderer();
            const linkRenderer = renderer.link; // 保存原始的链接渲染器
            // 重写链接渲染器，使其在所有 Markdown 链接上添加 target="_blank" 和 rel="noopener noreferrer" 属性
            renderer.link = (href, title, text) => {
                const html = linkRenderer.call(renderer, href, title, text);
                // 将生成的 <a> 标签的起始部分替换，添加新属性
                return html.replace(/^<a /, '<a target="_blank" rel="noopener noreferrer" ');
            };
            marked.setOptions({ renderer: renderer }); // 应用自定义的渲染器配置
            // --- 结束 marked.js 配置 ---

            // 使用 Promise.all 并行加载导航 HTML 和文章数据，提高加载效率
            const [navHtml, postsData] = await Promise.all([
                fetch('nav.html').then(res => res.text()), // 获取 nav.html 内容
                fetch('data.json').then(res => res.json()) // 获取 data.json 数据
            ]);

            // 1. 注入导航栏内容到侧边栏，并默认高亮“首页”链接
            sidebar.innerHTML = navHtml;
            const homeLink = sidebar.querySelector('a[data-page="home.html"]');
            if (homeLink) homeLink.classList.add('active'); // 如果找到首页链接，则添加 active 类

            // --- 移除：创建并添加菜单切换按钮及其事件监听器 ---
            // menuToggleBtn = document.createElement('button');
            // menuToggleBtn.className = 'menu-toggle';
            // menuToggleBtn.innerHTML = '☰ 菜单'; // 汉堡图标和文字
            // document.body.appendChild(menuToggleBtn); // 将按钮添加到 body 底部
            // menuToggleBtn.addEventListener('click', toggleSidebar);
            // --- 结束移除 ---

            // 2. 存储、补充 Steam 标签，并按日期降序排序文章数据（最新文章在前）
            allPosts = postsData
                .map(augmentPost)
                .sort((a, b) => new Date(b.date.replace(/\//g, '-')) - new Date(a.date.replace(/\//g, '-')));
            currentFilteredPosts = allPosts; // 初始时，当前过滤的文章就是所有文章

            // 3. 计算并渲染标签统计信息（例如每个标签的文章数量）
            renderTagStatistics(calculateTagCounts(allPosts));

            // 4. 默认渲染初始数量的文章
            renderInitialPosts(allPosts); // 使用新函数渲染初始文章

            // 5. 绑定所有事件监听器
            bindNavLinks(); // 绑定主导航链接点击事件
            bindTagLinks(); // 绑定标签链接点击事件
            bindScrollEvent(); // 绑定滚动事件监听器
            updateSidebarVisibility(); // 初始化时根据窗口宽度决定边栏显示状态
            window.addEventListener('resize', updateSidebarVisibility);

        } catch (err) {
            // 如果初始化过程中发生错误，显示错误信息
            mainContent.innerHTML = `<p>初始化失败: ${err.message}</p>`;
            console.error(err); // 在控制台输出详细错误
        }
    }

    /**
     * 渲染初始数量的文章到主内容区
     * @param {Array} postsToRender - 需要被渲染的文章对象数组
     */
    function renderInitialPosts(postsToRender) {
        if (activeMusicCard && activeMusicCard.__musicState) {
            stopMusicPlayer(activeMusicCard.__musicState);
        }
        mainContent.innerHTML = ''; // 清空主内容区
        currentLoadedCount = 0; // 重置已加载计数
        currentFilteredPosts = postsToRender; // 更新当前要渲染的文章列表
        loadMorePosts(); // 调用加载更多函数来加载初始文章
    }

    /**
     * 加载更多文章并追加到主内容区
     * 这是无限滚动的核心函数
     */
    function loadMorePosts() {
        if (isLoading || currentLoadedCount >= currentFilteredPosts.length) {
            // 如果正在加载中，或者所有文章都已加载，则不再加载
            return;
        }

        isLoading = true; // 设置加载标志，防止重复触发

        const startIndex = currentLoadedCount;
        const endIndex = Math.min(startIndex + LOAD_MORE_COUNT, currentFilteredPosts.length);
        const postsBatch = currentFilteredPosts.slice(startIndex, endIndex);

        if (postsBatch.length === 0) {
            isLoading = false;
            // 如果没有更多文章可加载，可以在这里显示“已加载全部”的提示
            if (mainContent.querySelector('.no-more-posts') === null) {
                const noMoreDiv = document.createElement('div');
                noMoreDiv.className = 'no-more-posts';
                noMoreDiv.textContent = '没有更多内容了。';
                mainContent.appendChild(noMoreDiv);
            }
            return;
        }

        // 渲染这一批文章
        postsBatch.forEach(item => {
            const priceHTML = (item.price && Number(item.price) !== 0) ? `<div class="price">¥${item.price}</div>` : "";
            const displayTags = getDisplayTags(item);
            const tagsHTML = displayTags.map(tag => `<span class="tag tag-${tag.replace(/ /g, '-')}">${tag}</span>`).join("");
            const renderedContent = marked.parse(item.content);
            const steamAppId = item.steamAppId || resolveSteamAppId(item);
            const musicUrl = normalizeMusicUrl(item.musicUrl || item.musicIframe || item.musicSrc);
            const musicButtonHTML = musicUrl ? `
                <button class="music-toggle" type="button" data-music-toggle aria-label="播放音乐"><span class="music-toggle-icon" data-music-icon>♪</span></button>
            ` : "";
            const musicFrameHTML = musicUrl ? `
                <iframe class="music-frame" data-music-frame title="${item.title} 音乐播放器" allow="autoplay; encrypted-media" scrolling="no" frameborder="0"></iframe>
            ` : "";
            const steamMetaHTML = steamAppId
                ? `<div class="steam-meta steam-loading" data-steam-appid="${steamAppId}"><span class="steam-note">加载中...</span></div>`
                : "";
            const steamNameHTML = steamAppId
                ? `<div class="steam-name steam-loading" data-steam-name>Steam 加载中...</div>`
                : "";
            const steamProgressHTML = steamAppId
                ? `<div class="steam-progress steam-loading" data-steam-progress></div>`
                : "";

            const itemDiv = document.createElement('div');
            itemDiv.className = 'news-item';
            itemDiv.innerHTML = `
                <div class="news-left${musicUrl ? ' has-music' : ''}">
                    ${musicButtonHTML}
                    ${musicUrl ? `
                        <div class="music-artwork">
                            <img class="music-cover-base" src="${item.image}" alt="${item.title}" loading="lazy" />
                            <div class="music-disc" aria-hidden="true">
                                <img src="${item.image}" alt="" loading="lazy" />
                            </div>
                        </div>
                    ` : `
                        <img src="${item.image}" alt="${item.title}" loading="lazy" />
                    `}
                    ${musicFrameHTML}
                </div>
                <div class="news-right">
                    <h3 class="news-title">${item.title}</h3>
                    ${steamNameHTML}
                    <p class="news-time">${item.date}</p>
                    <div class="content-wrapper">
                        <div class="content">${renderedContent}</div>
                    </div>
                    <div class="tags-price-line">
                        <div class="tags">${tagsHTML}</div>
                        <div class="footer-right">
                            ${steamMetaHTML}
                        </div>
                    </div>
                    ${steamProgressHTML}
                    ${priceHTML}
                </div>
            `;
            mainContent.appendChild(itemDiv);

            if (steamAppId) {
                const steamMeta = itemDiv.querySelector('.steam-meta');
                hydrateSteamMeta(steamMeta, item);
            }
            if (musicUrl) {
                setupMusicPlayer(itemDiv, musicUrl);
            }

            // 检查并折叠内容
            const contentDiv = itemDiv.querySelector('.content');
            const contentWrapper = itemDiv.querySelector('.content-wrapper');
            requestAnimationFrame(() => {
                const renderedLines = countRenderedLines(contentDiv);

                if (renderedLines <= 2) {
                    contentWrapper.classList.remove('collapsed');
                    return;
                }

                contentWrapper.classList.add('collapsed');

                const toggleButton = document.createElement('button');
                toggleButton.className = 'toggle-content-button';
                toggleButton.innerHTML = '﹀'; // 初始显示向下箭头
                toggleButton.addEventListener('click', () => {
                    contentWrapper.classList.toggle('collapsed');
                    toggleButton.innerHTML = contentWrapper.classList.contains('collapsed') ? '﹀' : '︿';
                });
                contentWrapper.appendChild(toggleButton);
            });
        });

        currentLoadedCount += postsBatch.length; // 更新已加载文章数量
        isLoading = false; // 重置加载标志
    }


    /**
     * 计算所有文章中每个标签出现的次数
     * @param {Array} posts - 所有文章数据
     * @returns {Object} - 一个包含每个标签及其出现次数的对象
     */
    function calculateTagCounts(posts) {
        const counts = {};
        posts.forEach(item => {
            item.tags.forEach(tag => {
                counts[tag] = (counts[tag] || 0) + 1; // 如果标签已存在则加1，否则初始化为1
            });
        });
        return counts;
    }

    function getTagSortGroup(tag) {
        if (/[\u4e00-\u9fff]/.test(tag)) return 0; // 中文优先
        if (/^[A-Za-z]/.test(tag)) return 1; // 英文第二
        return 2; // 其它放最后
    }

    function compareTags(a, b) {
        const groupDiff = getTagSortGroup(a) - getTagSortGroup(b);
        if (groupDiff !== 0) return groupDiff;

        const group = getTagSortGroup(a);
        if (group === 0) {
            return a.localeCompare(b, 'zh-Hans-u-co-pinyin', { sensitivity: 'base', numeric: true });
        }
        if (group === 1) {
            return a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
        }
        return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
    }

    /**
     * 渲染标签统计信息到侧边栏
     * @param {Object} tagCounts - 包含标签计数的对象
     */
    function renderTagStatistics(tagCounts) {
        const container = document.getElementById('tag-stats-container'); // 获取标签统计容器
        if (!container) return; // 如果容器不存在，则退出
        const activeTagName = activeTagLink ? activeTagLink.getAttribute('data-tag') : null;

        // 将标签按“中文 -> 英文 -> 其它”分组，并在组内按字母/拼音排序
        const sortedTags = Object.keys(tagCounts).sort(compareTags);
        // 生成标签列表的 HTML 字符串
        const listHtml = sortedTags.map(tag => `
            <li>
                <a href="#" data-tag="${tag}">
                    <span># ${tag}</span>
                    <span class="tag-count">${tagCounts[tag]}</span>
                </a>
            </li>
        `).join('');

        // 计算所有文章的价格总和
        const totalPrice = allPosts.reduce((sum, post) => {
            const price = parseFloat(post.price); // 将价格字符串转换为浮点数
            return !isNaN(price) ? sum + price : sum; // 如果是有效数字则累加，否则跳过
        }, 0); // 初始总和为0
        // 将标签列表和总价格注入到容器中
        container.innerHTML = `
            <h4>标签统计</h4>
            <ul class="tag-home-list">
                <li>
                    <a href="#" data-tag-home>
                        <span>首页</span>
                    </a>
                </li>
            </ul>
            <ul>${listHtml}</ul>
            <div class="total-price" data-total-price>¥${totalPrice.toFixed(2)}</div>
            <div class="sidebar-total-time-group">
                <div class="sidebar-total-caption">近两周</div>
                <div class="total-price sidebar-total-time-box" data-steam-recent-time-box>
                    <span class="sidebar-time-icon">⏱</span>
                    <span data-steam-recent-time-value>-</span>
                </div>
                <div class="sidebar-total-caption">总时间</div>
                <div class="total-price sidebar-total-time-box" data-steam-total-time-box>
                    <span class="sidebar-time-icon">⏱</span>
                    <span data-steam-total-time-value>-</span>
                </div>
            </div>
        `;
        renderSteamTotals(container);
        refreshSteamTotals();
        if (!activeTagName) {
            const homeStatsLink = container.querySelector('a[data-tag-home]');
            if (homeStatsLink) homeStatsLink.classList.add('active');
        }
        if (activeTagName) {
            const activeLink = container.querySelector(`a[data-tag="${CSS.escape(activeTagName)}"]`);
            if (activeLink) {
                activeLink.classList.add('active');
                activeTagLink = activeLink;
            }
        }
    }

    /**
     * 绑定主导航链接的点击事件
     */
    function bindNavLinks() {
        sidebar.querySelectorAll('nav a[data-page]').forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault(); // 阻止链接的默认跳转行为
                const page = link.getAttribute('data-page'); // 获取链接的 data-page 属性值

                // 清除所有高亮
                clearAllActiveStates();
                link.classList.add('active'); // 高亮当前点击的导航链接

                if (page === 'home.html') {
                    renderInitialPosts(allPosts); // 点击首页，重新渲染初始数量的所有文章
                } else {
                    // 如果点击的是其他页面（如 about.html），则显示加载提示
                    mainContent.innerHTML = `<p>加载 ${page}...</p>`;
                    // TODO: 在这里可以添加实际加载其他页面内容的逻辑
                }
                // 移除：在小屏幕上点击导航链接后自动关闭侧边栏
                // if (window.innerWidth <= MOBILE_BREAKPOINT) { // 判断是否在小屏幕模式
                //     closeSidebar();
                // }
            });
        });
    }

    /**
     * 绑定标签统计链接的点击事件 (使用事件委托)
     */
    function bindTagLinks() {
        const container = document.getElementById('tag-stats-container'); // 获取标签统计容器
        // 为容器添加点击事件监听器，利用事件冒泡处理子元素的点击
        container.addEventListener('click', e => {
            const link = e.target.closest('a[data-tag]'); // 查找被点击元素最近的 data-tag 链接
            const homeLink = e.target.closest('a[data-tag-home]');
            const isTotalPrice = e.target.closest('[data-total-price]'); // 检查是否点击了总价格区域
            if (homeLink) {
                e.preventDefault();
                renderInitialPosts(allPosts);
                clearAllActiveStates();
                homeLink.classList.add('active');
                activeTagLink = null;
            } else if (link) {
                e.preventDefault(); // 阻止链接的默认行为
                const tag = link.getAttribute('data-tag'); // 获取点击的标签名

                const filteredPosts = allPosts.filter(post => post.tags.includes(tag));
                renderInitialPosts(filteredPosts); // 渲染过滤后的文章，并重置加载状态

                clearAllActiveStates(); // 清除所有高亮状态
                link.classList.add('active'); // 高亮当前点击的标签链接
                activeTagLink = link; // 记录当前激活的标签链接
                // 移除：在小屏幕上点击标签链接后自动关闭侧边栏
                // if (window.innerWidth <= MOBILE_BREAKPOINT) { // 判断是否在小屏幕模式
                //     closeSidebar();
                // }
            } else if (isTotalPrice) {
                e.preventDefault(); // 阻止默认行为
                // 过滤出所有有价格的文章
                const filteredPosts = allPosts.filter(post => post.price && Number(post.price) !== 0);
                renderInitialPosts(filteredPosts); // 渲染过滤后的文章，并重置加载状态

                clearAllActiveStates(); // 清除所有高亮状态
                // 移除：在小屏幕上点击总价格后自动关闭侧边栏
                // if (window.innerWidth <= MOBILE_BREAKPOINT) { // 判断是否在小屏幕模式
                //     closeSidebar();
                // }
            }
        });
    }

    /**
     * 绑定滚动事件监听器
     */
    function bindScrollEvent() {
        window.addEventListener('scroll', () => {
            // 判断用户是否滚动到页面底部附近
            // document.documentElement.scrollHeight: 整个页面的可滚动高度
            // window.innerHeight: 浏览器窗口的可见高度
            // window.scrollY: 当前页面滚动的垂直距离
            // 当 (滚动距离 + 窗口高度 + 200px (阈值)) >= 整个页面高度时，认为接近底部
            if ((window.scrollY + window.innerHeight + 200) >= document.documentElement.scrollHeight) {
                loadMorePosts(); // 如果接近底部，加载更多文章
            }
        });
    }

    function isMobileBrowser() {
        if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
            return navigator.userAgentData.mobile;
        }

        return /Mobi|Android.+Mobile|iPhone|iPod|Windows Phone|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    /**
     * 手机浏览器使用手机排版；桌面端只根据可用宽度决定是否隐藏侧边栏。
     */
    function updateSidebarVisibility() {
        if (!sidebar) return;

        const isMobile = isMobileBrowser();
        const shouldHideSidebar = isMobile || window.innerWidth < SIDEBAR_HIDE_AT;

        document.body.classList.toggle('mobile-browser', isMobile);
        document.body.classList.toggle('desktop-browser', !isMobile);
        document.body.classList.toggle('sidebar-hidden', shouldHideSidebar);
    }

    /**
     * 清除所有导航和标签链接的高亮状态
     */
    function clearAllActiveStates() {
        // 移除所有带有 'active' 类的链接的 'active' 类
        sidebar.querySelectorAll('a.active').forEach(a => a.classList.remove('active'));
    }

    // --- 移除以下与菜单切换按钮相关的函数 ---
    // /**
    //  * 切换侧边栏的显示/隐藏状态
    //  */
    // function toggleSidebar() {
    //     sidebar.classList.toggle('open');
    //     document.body.classList.toggle('sidebar-open'); // 给body添加类，可能用于阻止内容滚动或移动内容
    // }

    // /**
    //  * 关闭侧边栏
    //  */
    // function closeSidebar() {
    //     sidebar.classList.remove('open');
    //     document.body.classList.remove('sidebar-open');
    // }
    // --- 结束移除 ---

    // 启动应用
    initialize();
});
