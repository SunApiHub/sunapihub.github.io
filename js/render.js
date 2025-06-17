 // 页码
let allPosts = [];
let currentPage = 1;
const itemsPerPage = 5;

window.addEventListener("DOMContentLoaded", function () {
  fetch("posts.json")
    .then((res) => {
      if (!res.ok) throw new Error("读取 posts.json 失败");
      return res.json();
    })
    .then((data) => {
      allPosts = data;
      renderPage(currentPage);
    })
    .catch((err) => {
      document.getElementById("news-container").textContent = "加载失败：" + err.message;
    });
});

function renderPage(page) {
  const start = (page - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const currentItems = allPosts.slice(start, end);

  const newsContainer = document.getElementById("news-container");
  newsContainer.innerHTML = "";

  currentItems.forEach(item => {
    const div = document.createElement("div");
    div.className = "news-item";
    div.innerHTML = `
      <h3>${item.title}</h3>
      <p>${item.content}</p>
      <p><strong>时间:</strong> ${item.date}</p>
      <p><strong>标签:</strong> ${item.tags.join(", ")}</p>
      ${item.price ? `<p><strong>价格:</strong> ¥${item.price}</p>` : ""}
    `;
    newsContainer.appendChild(div);
  });

  renderPagination();
}

function renderPagination() {
  const pageCount = Math.ceil(allPosts.length / itemsPerPage);
  const pagination = document.getElementById("pagination");
  pagination.innerHTML = "";

  // 上一页
  const prevBtn = document.createElement("button");
  prevBtn.textContent = "上一页";
  prevBtn.disabled = currentPage === 1;
  prevBtn.onclick = () => {
    if (currentPage > 1) {
      currentPage--;
      renderPage(currentPage);
    }
  };
  pagination.appendChild(prevBtn);

  // 页码范围最多显示 5 个
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(pageCount, startPage + 4);
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }

  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement("button");
    pageBtn.textContent = i;
    if (i === currentPage) {
      pageBtn.className = "active";
    }
    pageBtn.onclick = () => {
      currentPage = i;
      renderPage(currentPage);
    };
    pagination.appendChild(pageBtn);
  }

  // 下一页
  const nextBtn = document.createElement("button");
  nextBtn.textContent = "下一页";
  nextBtn.disabled = currentPage === pageCount;
  nextBtn.onclick = () => {
    if (currentPage < pageCount) {
      currentPage++;
      renderPage(currentPage);
    }
  };
  pagination.appendChild(nextBtn);
}