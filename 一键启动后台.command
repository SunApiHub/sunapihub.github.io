#!/bin/zsh

# 双击即可启动 SunApiHub 后台；如果已经启动，则直接打开。
SCRIPT_DIR="${0:A:h}"
ADMIN_URL="http://127.0.0.1:8080/admin/"
HEALTH_URL="http://127.0.0.1:8080/admin/api/health"
LOG_FILE="$SCRIPT_DIR/admin/server.log"

cd "$SCRIPT_DIR" || exit 1

open_admin() {
  open "$ADMIN_URL"
  exit 0
}

service_is_running() {
  local health_response
  health_response="$(curl --silent --fail --max-time 1 "$HEALTH_URL" 2>/dev/null)" || return 1
  [[ "$health_response" == *'"service":"sunapihub-admin"'* ]]
}

if service_is_running; then
  echo "后台服务已在运行，正在打开……"
  open_admin
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "启动失败：电脑上没有找到 python3。"
  echo "请安装 Python 3 后再双击这个文件。"
  read "? 按回车键关闭窗口……"
  exit 1
fi

if ! python3 -c 'import flask, PIL' >/dev/null 2>&1; then
  echo "启动失败：缺少后台所需的 Python 组件。"
  echo "请先在终端执行：python3 -m pip install flask pillow"
  read "? 按回车键关闭窗口……"
  exit 1
fi

echo "正在启动后台服务……"
nohup python3 "$SCRIPT_DIR/admin/server.py" >"$LOG_FILE" 2>&1 &

for attempt in {1..40}; do
  if service_is_running; then
    echo "启动成功，正在打开后台……"
    open_admin
  fi
  sleep 0.25
done

echo "启动失败，请查看日志：$LOG_FILE"
echo ""
tail -n 20 "$LOG_FILE" 2>/dev/null
read "? 按回车键关闭窗口……"
exit 1
