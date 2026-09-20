import { loadApplications } from "./shared/storage.js";

const applicationId = new URLSearchParams(location.search).get("id");
const application = (await loadApplications()).find((item) => item.id === applicationId);
const root = document.querySelector("#resume");

function appendText(tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  root.append(element);
}

if (!application?.preparation?.resumeVariant?.markdown) {
  appendText("p", "没有找到可打印的岗位版简历。请返回申请准备页重新生成。");
  document.querySelector("#print").disabled = true;
} else {
  let list = null;
  for (const rawLine of application.preparation.resumeVariant.markdown.split("\n")) {
    const line = rawLine.trim();
    if (!line) { list = null; continue; }
    if (line.startsWith("### ")) { list = null; appendText("h3", line.slice(4)); }
    else if (line.startsWith("## ")) { list = null; appendText("h2", line.slice(3)); }
    else if (line.startsWith("# ")) { list = null; appendText("h1", line.slice(2)); }
    else if (line.startsWith("> ")) { list = null; appendText("blockquote", line.slice(2)); }
    else if (line.startsWith("- ")) {
      if (!list) { list = document.createElement("ul"); root.append(list); }
      const item = document.createElement("li"); item.textContent = line.slice(2); list.append(item);
    } else { list = null; appendText("p", line.replace(/\*\*/g, "")); }
  }
}
document.querySelector("#print").addEventListener("click", () => window.print());
