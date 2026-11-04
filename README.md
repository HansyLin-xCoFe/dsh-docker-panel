# dsh-docker-panel

在 DSH 左侧栏底部加一个 Docker 入口，点开是一个带缩放动效的小窗，自动列出本机 Docker 容器的网页入口：

- 容器列表由 Host 半通过 `docker ps -a` 自动发现，Docker Desktop 或 Docker Engine 均可。
- 运行中的容器：点击卡片直接用浏览器打开 `http://localhost:<映射端口>/`。
- 已停止的容器：点击后先 `docker start`，等待端口就绪再打开；若启动失败，弹窗内会给出原因。
- Docker 守护进程未运行时，可在弹窗内一键启动 Docker Desktop。

## 开发

```powershell
node --check index.js
node --check client.js
```

安装到当前 DSH profile：

```
plugin_manager action:install_bundle target:"D:\coding\projects\dsh-docker-panel"
```

安装后左侧栏底部出现 Docker 入口（侧栏收成图标栏时该入口自动隐藏，避免与现有 footer 动作挤在一起）。
