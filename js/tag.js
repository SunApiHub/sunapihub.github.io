window.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("news-container");
  const titleEl = document.getElementById("page-title");

  // 获取 URL 中的标签参数，例如 tag.html?tag=日常
  const params = new URLSearchParams(window.location.search);
  const selectedTag = params.get("tag");

  // 如果没有提供标签参数，则显示错误
  if (!selectedTag) {
    container.textContent = "未指定标签。";
    return;
  }

  // 设置页面标题
  titleEl.textContent = `${selectedTag}`;

  // 加载 posts.json 数据
  fetch("posts.json")
    .then(res => {
      if (!res.ok) throw new Error("读取 posts.json 失败");
      return res.json();
    })
    .then(data => {
      container.innerHTML = ""; // 清空内容

      // 筛选出带有该标签的条目
      const filtered = data.filter(item => item.tags.includes(selectedTag));

      if (filtered.length === 0) {
        container.textContent = "该标签下暂无内容。";
        return;
      }

      // 遍历并渲染每条内容
      filtered.forEach(item => {
        // 时间显示
        const timeDiv = document.createElement("div");
        timeDiv.className = "news-time";
        timeDiv.textContent = item.date;
        container.appendChild(timeDiv);

        // 消息卡片容器
        const itemDiv = document.createElement("div");
        itemDiv.className = "news-item";

        // 金额显示（若不为 0）
        const priceHTML = item.price && Number(item.price) !== 0
          ? `<p class="price">¥${item.price}</p>`
          : "";

        // 标签 HTML
        const tagsHTML = item.tags.map(tag =>
          `<span class="tag tag-${tag}" data-tag="${tag}">${tag}</span>`
        ).join("");

        // 插入消息结构
        itemDiv.innerHTML = `
          <div class="news-left">
            <img src="${item.image}" alt="${item.title}" />
          </div>
          <div class="news-right">
            <h3>${item.title}</h3>
            <p>${item.content}</p>
            <div class="tags-price-line">
              <div class="tags">${tagsHTML}</div>
              ${priceHTML}
            </div>
          </div>
        `;

        container.appendChild(itemDiv);
      });
    })
    .catch(err => {
      container.textContent = "加载失败：" + err.message;
    });
});
