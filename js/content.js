window.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("news-container");

  // 读取 posts.json 文件
  fetch("posts.json")
    .then((res) => res.json())
    .then((data) => {
      container.innerHTML = ""; // 清空默认内容

      data.forEach((item) => {
        // 创建并显示时间元素
        const timeDiv = document.createElement("div");
        timeDiv.className = "news-time";
        timeDiv.textContent = item.date;
        container.appendChild(timeDiv);

        // 创建主消息内容容器
        const itemDiv = document.createElement("div");
        itemDiv.className = "news-item";

        // 构建价格显示内容（如果价格为 0，则不显示）
        const priceHTML = item.price && Number(item.price) !== 0
          ? `<p class="price">¥${item.price}</p>`
          : "";

        // 构建标签 HTML（多个标签）
        const tagsHTML = item.tags.map(tag => 
          `<span class="tag tag-${tag}" data-tag="${tag}">${tag}</span>`
        ).join("");

        // 将 HTML 插入消息容器中
        itemDiv.innerHTML = `
          <div class="news-left">
            <img src="${item.image}" alt="${item.title}" />
          </div>
          <div class="news-right">
            <h3 class="news-title">${item.title}</h3>
            <p class="content">${item.content}</p>
            <div class="tags-price-line">
              <div class="tags">${tagsHTML}</div>
              ${priceHTML}
            </div>
          </div>
        `;

        // 将消息容器添加到页面中
        container.appendChild(itemDiv);
      });
    })
    .catch((err) => {
      // 错误处理
      container.textContent = "加载失败：" + err.message;
    });
});