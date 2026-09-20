#!/bin/zsh
set -e
cd "${0:A:h}"

if ! command -v node >/dev/null 2>&1; then
  echo "需要先安装 Node.js 20 或更高版本。"
  read "?按回车退出…"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "首次启动：正在安装依赖…"
  npm install
fi

npm run launch
echo
read "?AutumnApply 已启动。按回车关闭此窗口…"
