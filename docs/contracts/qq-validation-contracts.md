> 现有代码契约快照：后续需按[当前产品定义](../product-scope.md)修订；不作为自主处理模式的既定交互要求。

# QQ独立手机验证契约

日期：2026-10-10，基线5d44601。仅开发菜单与独立随机/验证库，不改普通业务schema、正式微信绑定或完整备份。没有模型调用、消息发送、群聊采集或常驻接收器。

采用上轮核查的[官方事件协议](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html)及[官方插件绑定入口](https://github.com/tencent-connect/openclaw-qqbot/blob/b9ba494f068959ffc1bd8a790822c613810d9f40/src/setup/login.ts)作为接口参考，独立实现HTTP/WS适配；不安装或复制UNLICENSED的Node绑定包。联网不可用时记录未测，不将合成服务当QQ云端。

- 绑定任务key只在有界内存中保留，AppSecret只进独立SecureStore；扫码结果必须有本人user_openid。缺本人标识则拒绝收件，不用第一条消息推断本人。AES-256-GCM用Android系统provider，错误不包含密文/Key/响应。
- HTTPS接口固定官方host；响应有大小/超时/重定向限制，网关仅接受已列官方WSS地址。前台显式操作，后台/取消/关闭终止。会话和序号落本地SQLite，凭据/临时token/媒体URL不进SQL。
- 附件允许精确匹配的腾讯媒体域名，包括[官方插件列出的multimedia.nt.qq.com.cn](https://github.com/tencent-connect/openclaw-qqbot/blob/b9ba494f068959ffc1bd8a790822c613810d9f40/src/utils/ssrf-guard.ts)及本次实测的grouptalk.c2c.qq.com；协议相对地址先补HTTPS再校验。JS和Android白名单一致，不因此信任其任意子域名或重定向。
- 仅本人C2C_MESSAGE_CREATE；文本及附件描述单独保存，群聊/陌生人只推进已处理序号不留正文。message ID保持字符串。消息/媒体引用/seq同事务，SQL失败不推进seq。附件URL作为SecureStore能力，原件下载独立重试。
- 明确区分Identify、新READY、Resume、RESUMED及Invalid Session。失效会话只退回一次新鉴权，不声称补收成功。60秒窗口、心跳ACK和有界队列；临时断开/强停重开需真实账号验证。
- 本批不承诺任意历史、附件有效期、合并转发或发送能力。界面普通接入须等实际扫码、文本/图片/文件、取消和离线行为证据，再决定范围。

验收条目QQ-01绑定/固定错误/凭据隔离，QQ-02本人及群聊过滤、重复与seq事务/重开，QQ-03WS心跳/Resume/Invalid Session/取消，QQ-04Android GCM与附件/P3，QQ-05实际账号与补收边界。台账登记不表示通过。

fc0a762本批真实/合成证据见[验收报告](../archive/validation/p4-qq-validation.md)。实际被拒绝的附件未由后续Resume重投；正式接入前须将未支持/失败内容的可见回执与seq同事务提交，提供重发指引，并处理验证沙箱的512项媒体索引及原生重载清理。普通QQ材料/备份接入另设产品契约，不直接使用验证库。
