> 归档于2026-10-12：仅记录旧规划或原版本验证，不是当前产品要求或发布结论。

# QQ独立手机验证报告

日期：2026-10-10。分支`feat/p4-qq-validation`，最终代码及两包构建基线`fc0a762`，dirty=false。QQ独立扫码、短期会话恢复、文字及TXT/PNG原件下载已取得小米14实测证据；正式QQ收件尚未接入普通设置、助手、业务库或完整备份。

## 实现与采用范围

debug菜单提供绑定二维码、手动查询、约60秒前台读取、附件下载和停止。任务key仅短期内存，绑定Secret/媒体能力进入独立SecureStore；消息、session/seq及下载回执进入独立local-only验证库。仅保存绑定本人的C2C消息，不发送消息、不采集群聊、不调用模型，也没有常驻接收器或产品后台。普通业务schema没有迁移，原件复用P3私有复制/解析组件。

接口依据[QQ官方API调用说明](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/api-use.html)及[事件协议](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html)。扫码参考[腾讯官方插件绑定入口](https://github.com/tencent-connect/openclaw-qqbot/blob/b9ba494f068959ffc1bd8a790822c613810d9f40/src/setup/login.ts)，独立适配HTTP/WS，系统AES-256-GCM解密；未安装或复制声明UNLICENSED的Node绑定分发包，没有新增npm依赖。详细边界见[验证契约](../../contracts/qq-validation-contracts.md)。

## 检查与实际账号结果

33项受影响QQ测试及前序共享二维码回归1项通过，共34项已定义检查，未重跑全部旧功能套件。类型、ARM64 debug/preview构建通过。QQ自动化覆盖固定错误/响应边界、本人/群聊过滤、字符串ID、消息及seq原子提交、防重/重开、失败阻断后续帧、心跳、新鉴权/Resume/Invalid Session、实际AbortController ponyfill取消和提前断线等。

小米14 / Android16在最终`fc0a762`原生debug和同提交干净Metro源码下，合成探针通过：系统GCM/坏认证标签、SecureStore、本人过滤、新会话/Resume/失效退回、事务/重复/重开、WebSocket重定向拒绝及取消、有界文本/图片下载、大小/重定向拒绝及取消、P3解析。随机验证库上传队列0，modelCalls=0。此结果不代替真实账号证据。

| 真实账号条目 | 实测结果 |
|---|---|
| 扫码与持久化 | 用户扫码确认，手机显示绑定；强停冷启动后仍绑定 |
| 前台窗口 | 完整60秒Resume通过，观察到RESUMED及心跳ACK |
| 文字及附件条目 | 强停期间发送的测试文字取回；兼容修正后重新发送TXT/PNG，保存2个附件条目。隔离库共4条唯一消息、2个附件部件，测试文字标记存在 |
| 下载与原件 | 保存2、失败0，类型text/image；两份手机原件可读，SHA256与发送的测试文件一致 |
| 再次读取/下载 | 读取新增0、重复0、忽略1、有效Resume；下载新增0、失败0、跳过2。数据库仍4条唯一消息/2部件/2下载回执 |

再次空读取仅证明本次未新增；实际平台重投去重未测，合成探针和自动化覆盖本地防重。真实账号后台取消没有形成正式结果，取消证据来自自动化及原生合成探针。

## 失败、修正与补收边界

首次原生探针发现带NUL拼接的哈希输入无法区分不同后缀；QQ账号/消息/媒体ID改用JSON元组再求摘要，原生不同输入检查及去重复测通过（`f469d6a`）。正式微信原本已使用JSON序列化。合成PNG同时修正CRC，随后原生图片解析通过。

首次真实窗口报告NETWORK，阶段记录显示RESUMED但没有ACK。心跳改在READY/RESUMED事务提交后启动，并守卫重复abort避免ponyfill递归；回归及完整真实窗口通过（`5a21879`）。窗口提前以1000正常码关闭仍报告NETWORK，不把提前断线当作完成。

真实文字首次成功，附件曾报告HOST。精确增加[官方插件媒体主机](https://github.com/tencent-connect/openclaw-qqbot/blob/b9ba494f068959ffc1bd8a790822c613810d9f40/src/utils/ssrf-guard.ts)中的multimedia.nt.qq.com.cn（`81c62d5`）及[官方附件适配](https://github.com/tencent-connect/openclaw-qqbot/blob/b9ba494f068959ffc1bd8a790822c613810d9f40/src/middleware/attachment.ts)的协议相对地址规范化（`3f0fbea`）后，仍发生HOST。本次开发诊断随后观察到HTTPS精确主机grouptalk.c2c.qq.com；`fc0a762`将其加入JS/Android一致白名单。重新发送TXT/PNG后收件、下载及原件校验通过。仍拒绝未知主机、相似后缀、任意子域名、非HTTPS、凭据、非标准端口、fragment与重定向。

开发诊断仅对绑定本人C2C保留最多8份scheme/hostname/port及协议相对地址、凭据、fragment布尔标记；覆盖单份私有诊断文件，结束移除监听。路径、查询、正文、文件名及ID不保存。早期失败元数据不足，不能认定每次HOST均由同一地址导致。

早期被拒绝的文件没有在后续Resume中再次提供，须由用户重发。**本地seq未越过失败帧不保证平台重投；本批不支持无缺口投递或任意离线历史承诺。** 长时离线、新会话期间漏收、过期链接、合并转发、群聊和发送能力均没有本批验收依据。

## 构建与数据保护

两包均为ARM64、应用ID`app.lime.personalassistant.dev`、提交`fc0a762ef24fd2567062e84cdda1ddcc84b1e856`、dirty=false。开发签名SHA256为`d257a8f963a473c3baff8b2bd67cc818d42dc90b2acf1155339e3385c919cf99`。

| 包 | APK SHA256 |
|---|---|
| debug | `1a3a7a4c0b02ecf5f5cf04b5ce0d92aa78878ecfa8765e4641ed786e268e42fb` |
| preview | `78126916751797d19759d7df66042596ba307baeee947236ec72a6e65291b17e` |

debug验证前后14类普通业务/助手表的行数与内容摘要一致；不扩展为全部25类对象校验。恢复本批独立preview后，从手机安装包重新核对SHA256匹配，脱离Metro冷启动通过；只读观察正式微信仍绑定、3份材料仍已保存。preview不可run-as，未声称安装后SQL逐表摘要通过。

未清应用数据、未卸载、未配置Key、模型调用0、未申请通知许可。临时Metro/8094回环夹具已停止，任务新增8081/8094 ADB映射及Download中的两份QQ测试文件已清理。实际绑定、隔离验证库及下载原件留在手机私有目录；不纳入普通备份或公开交付。仓库/文档链接与脱敏秘密检查按本批收尾执行；代码仅本地分支，未合并main或推送。

后续仅文档提交，不重新构建APK；包元数据保持实际代码基线。生成包位于忽略的artifacts，用户交付另放会话outputs；没有正式签名release或本批x86_64包。

## 正式接入前的剩余工作

当前结论是受限可用的独立验证。正式QQ接入需先提交可见的未支持/失败回执再推进seq，并提供重发指引；成功条目复用P3材料/明确选择，新增业务对象与完整备份同时接入，凭据仍排除。

沙箱媒体索引上限512项、成功下载后尚未释放；原生模块尚无Dev reload销毁连接清理。这两项须在普通接入前解决。手机真实模型建议/任务、实际通知送达、中文IME/人格表达、系统备份人工体验及P5日用场景继续待验，不据本报告声称全功能交付。
