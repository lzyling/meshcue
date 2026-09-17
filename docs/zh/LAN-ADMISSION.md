# MeshCue · 内网定向入场适配（0.4）

此适配补齐「服务器有许可，但 Windows 浏览器拿不到」的缺口。用户打开普通工作台网址；Agent 在本机为**已核对的客户端 IPv4**签发入场许可，网页自动领取，服务直接写入 HttpOnly cookie。用户不输入 token、不切换 Control UI、不回 Mac 配对。带 token 的聊天链接仍未提供；这不是解除宿主凭据规则。**16:32已改为[长期记住浏览器](BROWSER-TRUST.md)：30天未使用才过期，取代60分钟硬截止。**

## Agent 操作

1. 核对目标设备的内网 IPv4，以及本次独立服务的 runtime、端口和来源。不可按“第一个连接”或 User-Agent 自动授予。仅适用于直接连接的内网，不将代理／NAT 共享出口当成单台设备身份。
2. 用既有 `publish --origin` 发布模型并绑定可信原会话。`status` 核对 active 和回传目标；授权不允许代为清理已有锁或草稿。
3. 在对应 runtime 执行 `reviewctl admit`。以下 IP 仅为文档示例，必须换成已核对的目标：

```sh
REVIEW_DATA_DIR=tmp/isolated-review node scripts/reviewctl.mjs admit 192.168.1.22
REVIEW_DATA_DIR=tmp/isolated-review node scripts/reviewctl.mjs status
```

命令只返回 address、expiresAt、singleUse 元数据，没有可复制的许可值。不给目标地址以外的设备发放许可。

4. 在原会话给出普通 LAN 网址。新网页会自动领取；此前打开的旧构建只需刷新一次以加载新代码。看到正确模型及 `viewerReceipts` 后，才算模型交付；HTTP 200 首页不算。
5. 用户标记并自行提交后，Agent 按提交消息中**带正确 REVIEW_DATA_DIR 的读取命令**读取该实例的完整批次，再回原会话。测试实例不可误读正式 runtime。

## 授权规则与边界

- 本机 Unix IPC 的 `/access/admit` 接收已核对地址，创建内存内1小时一次性许可；没有浏览器授权管理接口。
- `POST /api/access/claim` 只接受空 JSON，经既有 Host／Origin／自定义标头保护，使用 TCP `socket.remoteAddress` 匹配。请求正文、`X-Forwarded-For`、`X-Real-IP`、`Forwarded` 均不能指定领取者。
- 匹配成功，立即消费许可并建立30天闲置到期的浏览器授权，实际使用自动续期；HTTP 响应通过 `Set-Cookie` 交给浏览器。Cookie 为 HttpOnly／SameSite=Strict；领取响应 no-store、正文不含凭据，URL、日志、CLI、Git 也不包含凭据。普通内网 HTTP 不是 TLS。
- 已有有效 cookie 的重复领取保持同一身份与原截止时间，也不消耗新签发的许可。新的未用许可替换旧未用许可；普通发行与定向发行共用一个许可槽。
- 许可单次使用是按浏览器会话兑换，不是永久 IP 白名单。另一无 cookie 浏览器即使来自同一 IP，也不能重复领取；新标签页共享同一已授权浏览器 cookie，但继续遵守独立编辑视窗／锁规则。
- 撤销、来源切换或30天未使用使相应浏览器授权失效；服务重启保留已授权浏览器，但未用入场许可不持久化。若首次 Cookie 响应丢失，Agent 可重新签发；不开放匿名写接口。
- 授权失效停止编辑，保留未同步草稿。重新签发后，打开的网页自动领取；同模型同审阅先复核视窗归属，再按原 revision／冲突规则恢复草稿，不抢其他视窗的锁。
- 所有模型、下载、草稿、标注、提交仍经过 cookie 校验。入场条件是短期限时授权指定地址，不是允许任意内网扫描者进入；地址匹配不宣称为强设备身份认证。
- **实例本身会到点消失（0.11 起）**：闲置满 24 小时自我回收、停止监听，所以内网上不会留下一个没人管、
  却带着 30 天浏览器授权的服务。回收前一个 tick 会在 `/api/state` 里通告，页面因此能说「闲置回收、标记都在」，
  而不是退回跟崩溃一样的「连线中断」。重开项目即可恢复；`REVIEW_IDLE_HOURS=0` 会关掉这个机制。
- 写操作在进到鉴权之前先被三道挡：`Host` 必须等于服务实际绑定的地址（否则 421）、跨站的 `Origin` 或
  `Sec-Fetch-Site` 直接拒（403）、外加一个跨源表单发不出来的 `X-Review-Client` 标头。这三道是 CSRF 防护，
  跟 cookie 校验是两层，不要当成同一层。
- 本机 agent 入口是 Unix socket 并 `chmod 0600`，不监听任何 TCP 端口；浏览器够不着 `publish`／`retain`／
  `activate`，所以**网页无法改变正在显示的是哪一版**。

## 验收范围

新增测试覆盖错误地址／伪造转发标头、跨站和路由变体、一次性与期限、发行轮换、原会话期限／身份保留、来源变更及撤销。真实浏览器通过普通 `review.test` HTTP 入口自动领取，未使用 fixture cookie 注入；可加载、标记、刷新恢复和下载，未同步草稿可在原页自动恢复。

Windows 用户已确认内网页面连通；目标地址核对、Windows 实际模型操作及真实 Telegram 回传，仍需分别记录真实结果，不能用 Mac 浏览器或 fake Gateway 代替。
