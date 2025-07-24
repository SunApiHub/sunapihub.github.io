// 当整个文档加载完成后执行
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar'); // 获取侧边栏元素
    const mainContent = document.getElementById('main-content'); // 获取主内容区元素
    let allPosts = []; // 用于存储所有文章数据
    let activeTagLink = null; // 用于跟踪当前激活的标签链接（例如，当前选中的标签）

    // --- 新增常量：定义内容折叠的阈值高度 ---
    const MAX_CONTENT_HEIGHT = 120; // 例如，120px，当内容高度超过此值时将折叠
    // --- 结束新增常量 ---

    /**
     * 主初始化函数
     * 负责应用的整体启动流程：
     * 1. 加载侧边栏 HTML
     * 2. 加载并处理文章数据 (data.json)
     * 3. 渲染标签统计信息
     * 4. 渲染所有文章到主内容区
     * 5. 绑定所有必要的事件监听器 (导航链接、标签链接)
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

            // 3. 计算并渲染标签统计信息（例如每个标签的文章数量）
            renderTagStatistics(calculateTagCounts(allPosts));

            // 4. 默认渲染所有文章到主内容区
            // 确保在 DOM 元素渲染后才绑定事件和检查高度，因为折叠逻辑依赖于元素的实际高度
            renderPosts(allPosts);

            // 5. 绑定所有事件监听器
            bindNavLinks(); // 绑定主导航链接点击事件
            bindTagLinks(); // 绑定标签链接点击事件

        } catch (err) {
            // 如果初始化过程中发生错误，显示错误信息
            mainContent.innerHTML = `<p>初始化失败: ${err.message}</p>`;
            console.error(err); // 在控制台输出详细错误
        }
    }

    /**
     * 渲染指定文章列表到主内容区
     * 为每篇文章创建 HTML 结构，并将其添加到页面中。
     * @param {Array} posts - 需要被渲染的文章对象数组
     */
    function renderPosts(posts) {
        mainContent.innerHTML = ''; // 先清空主内容区，防止重复内容
        if (posts.length === 0) {
            mainContent.innerHTML = '<p>没有找到相关内容。</p>'; // 如果没有文章，显示提示信息
            return;
        }

        // 遍历每篇文章数据，生成其 HTML 结构
        posts.forEach(item => {
            // 根据价格是否存在和是否为0，生成价格 HTML
            const priceHTML = (item.price && Number(item.price) !== 0) ? `<div class="price">¥${item.price}</div>` : "";
            // 将文章标签转换为 HTML span 元素，并处理标签名中的空格以用于 CSS 类名
            const tagsHTML = item.tags.map(tag => `<span class="tag tag-${tag.replace(/ /g, '-')}">${tag}</span>`).join("");

            // 使用 marked.js 将文章的 Markdown 内容转换为 HTML
            const renderedContent = marked.parse(item.content);

            // 创建一个 div 元素作为单篇文章的容器
            const itemDiv = document.createElement('div');
            itemDiv.className = 'news-item'; // 添加 CSS 类名
            // 设置文章的内部 HTML 结构
            itemDiv.innerHTML = `
                <div class="news-left"><img src="${item.image}" alt="${item.title}" loading="lazy" /></div>
                <div class="news-right">
                    <h3 class="news-title">${item.title}</h3>
                    <p class="news-time">${item.date}</p>
                    <div class="content-wrapper"> <div class="content">${renderedContent}</div>
                    </div>
                    <div class="tags-price-line">
                        <div class="tags">${tagsHTML}</div>
                        ${priceHTML}
                    </div>
                </div>
            `;
            mainContent.appendChild(itemDiv); // 将生成的文章元素添加到主内容区

            // --- 新增逻辑：在文章添加到 DOM 后检查并折叠内容 ---
            const contentDiv = itemDiv.querySelector('.content'); // 获取文章内容 div
            const contentWrapper = itemDiv.querySelector('.content-wrapper'); // 获取内容包裹器

            // 使用 setTimeout 确保 DOM 渲染完成，以便正确获取 scrollHeight
            // 延迟0ms是为了把这个任务放到事件队列的末尾，让浏览器有机会完成当前的渲染任务，
            // 从而能够准确计算元素的实际高度（scrollHeight）。
            setTimeout(() => {
                // 如果内容的实际高度超过了设定的最大高度
                if (contentDiv.scrollHeight > MAX_CONTENT_HEIGHT) {
                    contentWrapper.classList.add('collapsed'); // 给内容包裹器添加 'collapsed' 类，触发 CSS 折叠样式
                    const toggleButton = document.createElement('button'); // 创建展开/收起按钮
                    toggleButton.className = 'toggle-content-button'; // 添加 CSS 类名
                    // 初始显示向下箭头（﹀，表示可以展开）
                    toggleButton.innerHTML = '﹀';
                    // 为按钮添加点击事件监听器
                    toggleButton.addEventListener('click', () => {
                        contentWrapper.classList.toggle('collapsed'); // 切换 'collapsed' 类，实现展开/收起
                        // 根据当前是否折叠来切换按钮的箭头方向
                        toggleButton.innerHTML = contentWrapper.classList.contains('collapsed') ? '﹀' : '︿';
                    });
                    contentWrapper.appendChild(toggleButton); // 将按钮添加到内容包裹器内部
                }
            }, 0);
            // --- 结束新增逻辑 ---
        });
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

                // 清除所有导航和标签链接的高亮状态
                clearAllActiveStates();
                link.classList.add('active'); // 高亮当前点击的导航链接

                if (page === 'home.html') {
                    renderPosts(allPosts); // 如果点击的是首页，则显示所有文章
                } else {
                    // 如果点击的是其他页面（如 about.html），则显示加载提示
                    mainContent.innerHTML = `<p>加载 ${page}...</p>`;
                    // TODO: 在这里可以添加实际加载其他页面内容的逻辑
                }
            });
        });
    }

    /**
     * 绑定标签统计链接的点击事件 (使用事件委托，提高性能)
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

                // 根据标签过滤文章
                const filteredPosts = allPosts.filter(post => post.tags.includes(tag));
                renderPosts(filteredPosts); // 渲染过滤后的文章

                clearAllActiveStates(); // 清除所有高亮状态
                link.classList.add('active'); // 高亮当前点击的标签链接
                activeTagLink = link; // 记录当前激活的标签链接
            } else if (isTotalPrice) {
                e.preventDefault(); // 阻止默认行为
                // 过滤出所有有价格的文章
                const filteredPosts = allPosts.filter(post => post.price && Number(post.price) !== 0);
                renderPosts(filteredPosts); // 渲染过滤后的文章

                clearAllActiveStates(); // 清除所有高亮状态
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
