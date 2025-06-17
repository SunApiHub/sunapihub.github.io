// 统计
window.addEventListener("DOMContentLoaded", function () {
  const tagStatsContainer = document.getElementById("tag-stats");

  fetch("posts.json")
    .then((res) => {
      if (!res.ok) throw new Error("读取 posts.json 失败");
      return res.json();
    })
    .then((data) => {
      const tagCount = {};
      let totalPrice = 0;

      data.forEach(item => {
        item.tags.forEach(tag => {
          tagCount[tag] = (tagCount[tag] || 0) + 1;
        });
        totalPrice += Number(item.price || 0);
      });

      tagStatsContainer.innerHTML = `
        <p><strong>标签：</strong></p>
        <ul>
          ${Object.entries(tagCount)
            .map(([tag, count]) => 
              `<li><a href="tag.html?tag=${encodeURIComponent(tag)}">${tag}：${count}</a></li>`
            ).join("")}
        </ul>
        <p><strong>总败家：</strong> ¥${totalPrice}</p>
      `;
    })
    .catch(err => {
      tagStatsContainer.textContent = "统计加载失败：" + err.message;
    });
});