// This runs only on a user-visible Sogou Weixin result page. It does not
// submit forms, solve CAPTCHAs, or navigate. Once the page is available in the
// user's normal browser context, it sends the public result list to the
// extension for local parsing and storage.
(() => {
  const list = document.querySelector(".news-list");
  if (!list || !globalThis.chrome?.runtime?.id) return;

  chrome.runtime.sendMessage({
    type: "autumnapply:wechat-results-page",
    query: new URL(location.href).searchParams.get("query") ?? "",
    html: list.outerHTML,
  }, (response) => {
    if (chrome.runtime.lastError || !response?.imported) return;
    const notice = document.createElement("div");
    notice.textContent = `AutumnApply 已导入 ${response.imported} 条公众号招聘线索；返回“找岗位”后再次搜索即可合并展示。`;
    Object.assign(notice.style, {
      position: "fixed", right: "18px", bottom: "18px", zIndex: "2147483647",
      maxWidth: "360px", padding: "12px 14px", borderRadius: "10px",
      color: "#fff", background: "#1f6a45", fontSize: "14px", lineHeight: "1.45",
      boxShadow: "0 8px 24px rgba(0,0,0,.2)",
    });
    document.body.append(notice);
  });
})();
