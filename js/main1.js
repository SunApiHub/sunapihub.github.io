// 当整个文档加载完成后执行
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar'); // 获取侧边栏元素
    const mainContent = document.getElementById('main-content'); // 获取主内容区元素
    let allPosts = []; // 用于存储所有文章数据
    let activeTagLink = null; // 用于跟踪当前激活的标签链接（例如，当前选中的标签）

    // --- 新增常量：定义内容折叠的阈值高度 ---
    const MAX_CONTENT_HEIGHT = 120; // 例如，120px，当内容高度超过此值时将折叠
    // --- 结束新增常量 ---

    // --- 新增无限滚动相关变量 ---
    const INITIAL_LOAD_COUNT = 20; // 首次加载的文章数量
    const LOAD_MORE_COUNT = 5;    // 每次滚动到底部时加载的文章数量
    let currentLoadedCount = 0;   // 当前已加载的文章总数
    let isLoading = false;        // 防止重复加载的标志
    let currentFilteredPosts = []; // 用于存储当前过滤/显示的文章列表
    // --- 结束新增无限滚动相关变量 ---

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

            // 2. 存储并按日期降序排序文章数据（最新文章在前）
            allPosts = postsData.sort((a, b) => new Date(b.date.replace(/\//g, '-')) - new Date(a.date.replace(/\//g, '-')));
            currentFilteredPosts = allPosts; // 初始时，当前过滤的文章就是所有文章

            // 3. 计算并渲染标签统计信息（例如每个标签的文章数量）
            renderTagStatistics(calculateTagCounts(allPosts));

            // 4. 默认渲染初始数量的文章
            renderInitialPosts(allPosts); // 使用新函数渲染初始文章

            // 5. 绑定所有事件监听器
            bindNavLinks(); // 绑定主导航链接点击事件
            bindTagLinks(); // 绑定标签链接点击事件
            bindScrollEvent(); // 新增：绑定滚动事件监听器

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
            const tagsHTML = item.tags.map(tag => `<span class="tag tag-${tag.replace(/ /g, '-')}">${tag}</span>`).join("");
            const renderedContent = marked.parse(item.content);

            const itemDiv = document.createElement('div');
            itemDiv.className = 'news-item';
            itemDiv.innerHTML = `
                <div class="news-left"><img src="${item.image}" alt="${item.title}" loading="lazy" /></div>
                <div class="news-right">
                    <h3 class="news-title">${item.title}</h3>
                    <p class="news-time">${item.date}</p>
                    <div class="content-wrapper">
                        <div class="content">${renderedContent}</div>
                    </div>
                    <div class="tags-price-line">
                        <div class="tags">${tagsHTML}</div>
                        ${priceHTML}
                    </div>
                </div>
            `;
            mainContent.appendChild(itemDiv);

            // 检查并折叠内容（保持不变）
            const contentDiv = itemDiv.querySelector('.content');
            const contentWrapper = itemDiv.querySelector('.content-wrapper');
            setTimeout(() => {
                if (contentDiv.scrollHeight > MAX_CONTENT_HEIGHT) {
                    contentWrapper.classList.add('collapsed');
                    const toggleButton = document.createElement('button');
                    toggleButton.className = 'toggle-content-button';
                    toggleButton.innerHTML = '﹀'; // 初始显示向下箭头
                    toggleButton.addEventListener('click', () => {
                        contentWrapper.classList.toggle('collapsed');
                        toggleButton.innerHTML = contentWrapper.classList.contains('collapsed') ? '﹀' : '︿';
                    });
                    contentWrapper.appendChild(toggleButton);
                }
            }, 0);
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

    /**
     * 渲染标签统计信息到侧边栏
     * @param {Object} tagCounts - 包含标签计数的对象
     */
    function renderTagStatistics(tagCounts) {
        const container = document.getElementById('tag-stats-container'); // 获取标签统计容器
        if (!container) return; // 如果容器不存在，则退出

        // 将标签按其计数降序排序
        const sortedTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);
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
        container.innerHTML = `<h4>标签统计</h4><ul>${listHtml}</ul><div class="total-price">¥${totalPrice.toFixed(2)}</div>`;
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
            const isTotalPrice = e.target.closest('.total-price'); // 检查是否点击了总价格区域
            if (link) {
                e.preventDefault(); // 阻止链接的默认行为
                const tag = link.getAttribute('data-tag'); // 获取点击的标签名

                const filteredPosts = allPosts.filter(post => post.tags.includes(tag));
                renderInitialPosts(filteredPosts); // 渲染过滤后的文章，并重置加载状态

                clearAllActiveStates(); // 清除所有高亮状态
                link.classList.add('active'); // 高亮当前点击的标签链接
                activeTagLink = link; // 记录当前激活的标签链接
            } else if (isTotalPrice) {
                e.preventDefault(); // 阻止默认行为
                // 过滤出所有有价格的文章
                const filteredPosts = allPosts.filter(post => post.price && Number(post.price) !== 0);
                renderInitialPosts(filteredPosts); // 渲染过滤后的文章，并重置加载状态

                clearAllActiveStates(); // 清除所有高亮状态
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

    /**
     * 清除所有导航和标签链接的高亮状态
     */
    function clearAllActiveStates() {
        // 移除所有带有 'active' 类的链接的 'active' 类
        sidebar.querySelectorAll('a.active').forEach(a => a.classList.remove('active'));
    }

    // 启动应用
    initialize();
});
