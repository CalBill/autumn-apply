const ADAPTERS = [
  { id: "moka", name: "Moka 招聘", hosts: [/\.mokahr\.com$/i], level: "assisted", notes: "支持原生输入框；动态下拉、文件和多段经历需要逐步确认。" },
  { id: "beisen", name: "北森招聘", hosts: [/\.beisen\.com$/i, /\.italent\.cn$/i], level: "assisted", notes: "支持常见文本字段；级联选择器和多步骤页面需要逐页确认。" },
  { id: "feishu", name: "飞书招聘", hosts: [/\.jobs\.feishu\.cn$/i, /^jobs\.bytedance\.com$/i], level: "assisted", notes: "支持原生文本控件；自定义选择器会标记为人工处理。" },
  { id: "greenhouse", name: "Greenhouse", hosts: [/\.greenhouse\.io$/i], level: "assisted", notes: "支持标准申请字段；附件和自愿披露问题由用户处理。" },
  { id: "lever", name: "Lever", hosts: [/\.lever\.co$/i], level: "assisted", notes: "支持标准文本字段；附件和声明由用户处理。" },
];

export function detectFormAdapter(value) {
  let hostname = "";
  try { hostname = new URL(value).hostname; } catch { hostname = String(value ?? ""); }
  return ADAPTERS.find((adapter) => adapter.hosts.some((pattern) => pattern.test(hostname)))
    ?? { id: "generic", name: "通用招聘表单", level: "generic", notes: "只填写高置信度原生字段，其他控件标记为人工处理。" };
}
