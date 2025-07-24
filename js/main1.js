// 当整个文档加载完成后执行
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    let allPosts = []; // 用于存储所有文章数据
    let activeTagLink = null; // 用于跟踪当前激活的标签链接

    /**
     * 主初始化函数
     * 1. 加载侧边栏
     * 2. 加载并处理文章数据
     * 3. 渲染标签统计
     * 4. 渲染所有文章
     * 5. 绑定所有事件监听器
     */
    async function initialize() {
        try {
            // 并行加载导航和文章数据，提高效率
            const [navHtml, postsData] = await Promise.all([
                fetch('nav.html').then(res => res.text()),
                fetch('data.json').then(res => res.json())
            ]);

            // 1. 注入导航栏并默认高亮“首页”
            sidebar.innerHTML = navHtml;
            const homeLink = sidebar.querySelector('a[data-page="home.html"]');
            if (homeLink) homeLink.classList.add('active');

            // 2. 存储并排序文章数据
            allPosts = postsData.sort((a, b) => new Date(b.date.replace(/\//g, '-')) - new Date(a.date.replace(/\//g, '-')));

            // 3. 计算并渲染标签统计
            renderTagStatistics(calculateTagCounts(allPosts));

            // 4. 默认渲染所有文章
            renderPosts(allPosts);

            // 5. 绑定事件
            bindNavLinks();
            bindTagLinks();

        } catch (err) {
            mainContent.innerHTML = `<p>初始化失败: ${err.message}</p>`;
            console.error(err);
        }
    }

    /**
     * 渲染指定文章列表到主内容区
     * @param {Array} posts - 需要被渲染的文章对象数组
     */
    function renderPosts(posts) {
        mainContent.innerHTML = ''; // 先清空
        if (posts.length === 0) {
            mainContent.innerHTML = '<p>没有找到相关内容。</p>';
            return;
        }

        posts.forEach(item => {
            const priceHTML = (item.price && Number(item.price) !== 0) ? `<div class="price">¥${item.price}</div>` : "";
            const tagsHTML = item.tags.map(tag => `<span class="tag tag-${tag.replace(/ /g, '-')}">${tag}</span>`).join("");

            // --- 关键修改部分：使用 marked.parse() 转换 Markdown 为 HTML ---
            // 注意：marked.parse() 默认会处理基本的 HTML 标签，但为了安全考虑，
            // 如果内容来自不可信的外部来源，建议额外使用 HTML 清理库（如 DOMPurify）
            // 来防止 XSS 攻击。如果内容完全由您控制，则通常无需额外处理。
            const renderedContent = marked.parse(item.content);
            // --- 关键修改部分结束 ---

            const itemDiv = document.createElement('div');
            itemDiv.className = 'news-item';
            itemDiv.innerHTML = `
                <div class="news-left"><img src="${item.image}" alt="${item.title}" loading="lazy" /></div>
                <div class="news-right">
                    <h3 class="news-title">${item.title}</h3>
                    <p class="news-time">${item.date}</p>
                    <div class="content">${renderedContent}</div> <div class="tags-price-line">
                        <div class="tags">${tagsHTML}</div>
                        ${priceHTML}
                    </div>
                </div>
            `;
            mainContent.appendChild(itemDiv);
        });
    }

    /**
     * 计算标签数量
     * @param {Array} posts - 所有文章数据
     * @returns {Object} - 一个包含每个标签计数的对象
     */
    function calculateTagCounts(posts) {
        const counts = {};
        posts.forEach(item => {
            item.tags.forEach(tag => {
                counts[tag] = (counts[tag] || 0) + 1;
            });
        });
        return counts;
    }

    /**
     * 渲染标签统计到侧边栏
     * @param {Object} tagCounts - 包含标签计数的对象
     */
    function renderTagStatistics(tagCounts) {
        const container = document.getElementById('tag-stats-container');
        if (!container) return;

        const sortedTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);
        const listHtml = sortedTags.map(tag => `
            <li>
                <a href="#" data-tag="${tag}">
                    <span># ${tag}</span>
                    <span class="tag-count">${tagCounts[tag]}</span>
                </a>
            </li>
        `).join('');

        // 计算价格总和
        const totalPrice = allPosts.reduce((sum, post) => {
            const price = parseFloat(post.price);
            return !isNaN(price) ? sum + price : sum;
        }, 0);
        container.innerHTML = `<h4>标签统计</h4><ul>${listHtml}</ul><div class="total-price">¥${totalPrice.toFixed(2)}</div>`;
    }

    /**
     * 绑定主导航链接事件
     */
    function bindNavLinks() {
        sidebar.querySelectorAll('nav a[data-page]').forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                const page = link.getAttribute('data-page');

                // 清除所有高亮
                clearAllActiveStates();
                link.classList.add('active'); // 高亮当前点击的导航链接

                if (page === 'home.html') {
                    renderPosts(allPosts); // 点击首页，显示所有文章
                } else {
                    // 加载其他页面，如 about.html
                    mainContent.innerHTML = `<p>加载 ${page}...</p>`;
                    // ...可以添加加载其他页面的逻辑
                }
            });
        });
    }

    /**
     * 绑定标签统计链接事件 (使用事件委托)
     */
    function bindTagLinks() {
        const container = document.getElementById('tag-stats-container');
        container.addEventListener('click', e => {
            const link = e.target.closest('a[data-tag]');
            const isTotalPrice = e.target.closest('.total-price');
            if (link) {
                e.preventDefault();
                const tag = link.getAttribute('data-tag');

                const filteredPosts = allPosts.filter(post => post.tags.includes(tag));
                renderPosts(filteredPosts);

                clearAllActiveStates();
                link.classList.add('active');
                activeTagLink = link;
            } else if (isTotalPrice) {
                e.preventDefault();
                const filteredPosts = allPosts.filter(post => post.price && Number(post.price) !== 0);
                renderPosts(filteredPosts);

                clearAllActiveStates();
            }
        });
    }


    /**
     * 清除所有导航和标签链接的高亮状态
     */
    function clearAllActiveStates() {
        sidebar.querySelectorAll('a.active').forEach(a => a.classList.remove('active'));
    }


    // 启动应用
    initialize();
});
