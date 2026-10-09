# P4-B 微信手机验证契约

日期：2026-10-09。上游固定腾讯openclaw-weixin提交24de5c9eb0dd5e595d7e2d090ed8a3f82870d42c、版本2.4.9/MIT。依据其[协议](https://github.com/Tencent/openclaw-weixin/blob/24de5c9eb0dd5e595d7e2d090ed8a3f82870d42c/docs/protocol_zh_CN.md)、[API](https://github.com/Tencent/openclaw-weixin/blob/24de5c9eb0dd5e595d7e2d090ed8a3f82870d42c/src/api/api.ts)和[类型](https://github.com/Tencent/openclaw-weixin/blob/24de5c9eb0dd5e595d7e2d090ed8a3f82870d42c/src/api/types.ts)。不是安装OpenClaw或服务器。

## 本批交付边界

先实现可复用的HTTP协议适配与独立手机验证探针，不接普通设置/收件UI，不让真实消息进入普通记录或模型上下文。账号与原型生成物留在手机私密验证存储及忽略的.local；可审查的适配器/合成测试/开发探针代码提交Git。此前“原型忽略”指私人会话/捕获材料，不让干净clone依赖未提交的源码。本批不宣称正式微信窗口可日用。

复用Expo fetch、SecureStore、Crypto、现有SQLite/材料解析；AES-128-ECB/PKCS#7使用Android javax.crypto.Cipher。上游message_id是uint64，不能先JSON.parse再补救；采用成熟lossless-json处理不安全整数，固定版本及许可后引入，不自写JSON解析器/加密算法。

## 身份、网络与存储

- QR从固定ilinkai.weixin.qq.com开始；只允许HTTPS、标准443、无用户信息的微信API主机（ilinkai.weixin.qq.com及其子域）。返回其它区域主机时暂停并另行核实，不广泛允许任意weixin.qq.com或外站。CDN仅novac2c.cdn.weixin.qq.com/c2c，无凭据，不跟随HTTP重定向；网络请求限制时长和响应大小。
- QR请求不带bot_token/base_info；状态GET不带Authorization/X-WECHAT-UIN；认证getupdates使用2.4.9元数据与随机uint32十进制base64头。真实token仅在SecureStore，错误只返回固定分类，不暴露URL/响应原文/凭据。
- 扫码confirmed必须具备token、botId、绑定本人userId和允许的baseurl。消息仅接受该userId、用户类型，拒绝群和其它发信人；只收件，不发消息/typing/主动提醒。
- 消息ID无损保留为字符串；文本、附件标记、状态/不支持类型与唯一回执进独立local-only验证库。批次消息和非空游标同一事务提交；空游标不覆盖旧值，事务失败游标不推进。下载独立重试，不阻塞消息持久化。验证库不是普通数据库，也不进入当前基础导出。
- 一次显式读取最多两次/70秒长轮询、最多200条/响应1MiB；取消/后台切换中止，不常驻、不自动调用模型。未完成/不支持内容保留标记，不悄悄当可分析文字。
- 本批附件解密输出仅私有临时文件，再走现有P3复制/解析；上限10MiB，检查长度/文件名与主机/路径，失败删除自己的临时文件，不删除已有原件。媒体密钥/下载参数是私密临时能力，不交给Agent或导出；原型账号捕获只留验证沙箱。

## 集中验收门槛

开发时先记录案例，实现子模块后集中检查：失真uint64、恶意主机/重定向、本人过滤、参数/取消/超时/响应上限、token脱敏与SecureStore、游标原子性/空值/重复消息、密文边界/错误padding、独立重试、原生材料兼容。手机合成探针不读用户库或实际Key；账号二维码准备好后才请用户扫码。账号实测分别记录文本/图片/文档、应用关闭后稍后读取、链接过期和缺失格式；没有证据一律未测。完整手动导出恢复仍早于大量真实材料正式入库。
