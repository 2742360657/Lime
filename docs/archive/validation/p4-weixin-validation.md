> 归档于2026-10-12：仅记录旧规划或原版本验证，不是当前产品要求或发布结论。

# P4-B 微信手机能力验证

日期：2026-10-09。分支`feat/p4-wechat-intake`；这是独立验证模块，不是正式渠道入口或发布版。

## 已实现范围

依据腾讯openclaw-weixin固定提交`24de5c9eb0dd5e595d7e2d090ed8a3f82870d42c`（2.4.9/MIT）的[协议](https://github.com/Tencent/openclaw-weixin/blob/24de5c9eb0dd5e595d7e2d090ed8a3f82870d42c/docs/protocol_zh_CN.md)、[API](https://github.com/Tencent/openclaw-weixin/blob/24de5c9eb0dd5e595d7e2d090ed8a3f82870d42c/src/api/api.ts)与[类型](https://github.com/Tencent/openclaw-weixin/blob/24de5c9eb0dd5e595d7e2d090ed8a3f82870d42c/src/api/types.ts)编写手机适配，不安装Node/OpenClaw插件。复用Expo fetch、SecureStore、Crypto、本地PowerSync和P3材料解析；新增lossless-json 4.3.1/MIT处理uint64，AES使用Android javax.crypto。

提交依次为契约`8aeb55c`、协议`c25c88c`、收件/游标/私密媒体能力`044ac6a`、原生边界/开发探针`fb5175c`、类型声明`8dcd303`、夹具与账号验证步骤`4f11335`。每次实际提交均通过暂存区脱敏秘密检查。

验证库独立于普通记录；平台token和媒体下载能力不进SQL或模型上下文。前台显式读取最多两次/70秒，批次入库与非空游标同事务，稳定ID去重，拒绝其它发送者和群消息。不支持内容保留标记；文本、图片和文件分别验证，不能将类型声明当已支持全部内容。取消/退出前台中止；媒体独立重试，上限10MiB，私有下载后复用P3复制/解析，不自动分析。

普通设置/收件UI尚未接入，普通数据库schema未变。只有debug开发菜单开放隔离探针及账号验证；preview保留现有普通功能，不暴露开发菜单。协议边界见[契约](../../contracts/weixin-validation-contracts.md)。

## 集中检查与修复

- 集中6个suite/86项Jest通过；新增18项覆盖协议与SQLite收件关键边界。首轮类型检查发现prepared messages数组推断问题，显式类型修正后通过。
- 首次229文件仓库结构检查通过；最终231文件结构/链接及diff检查通过，分模块暂存秘密扫描通过。未重新调用模型、重复旧UI套件或构建所有架构。
- 小米14/Android16上debug+当前Metro隔离合成探针通过：无损ID、本人过滤、游标原子提交/重开/重复、SecureStore、请求取消、系统AES三种密钥格式、实际原生HTTP下载、错误padding/超限/重定向拒绝、下载取消及P3文本解析。local-only上传队列0，实际账号/模型调用0。
- 首次手机探针失败在取消测试夹具：QR使用POST，延迟响应仅实现GET，提前返回404使取消断言失败。夹具补POST延迟后只复测受影响原生探针，不重跑整个旧套件；增加固定stage/code诊断，不记录响应或异常原文。
- 探针前后已有14类普通记录行数/摘要一致。证据只覆盖这些记录，不等于全沙箱逐字节校验。随机测试库/私密测试项和本次新建合成原件已清理，没有清应用数据。

## 包身份与手机证据

两包均ARM64、`app.lime.personalassistant.dev`，开发签名SHA256为`d257a8f963a473c3baff8b2bd67cc818d42dc90b2acf1155339e3385c919cf99`。

| 包 | 构建Git/dirty | APK SHA256 | 用途 |
|---|---|---|---|
| debug | 8dcd303/false | 9abe44d6b30a7ed826ce3563d7b7d0ea93efb3c4ccb521196cf4aa40b2462f86 | 同签名覆盖安装；JS随后由本仓库Metro提供诊断/夹具修正后的代码 |
| preview | 4f11335/false | 80f7a9f9b20dd423d0caaffb679be03c8ebeb621cb8d74a2f59146e45bc0b255 | 最终独立试用包；不是正式release |

debug原生实现与4f11335相同，最后两次修正只影响TypeScript/Python。扫码与账号步骤由同一debug/本仓库Metro执行；不能将debug APK内提交当后续热加载源码提交。未构建当前x86_64或正式release。

## 真实账号证据

手机通过真实HTTPS获取二维码，用户扫码后，状态接口返回confirmed并在SecureStore保存绑定本人/机器人凭据。账号ID、token和二维码仅在手机及忽略的本地私密输出；报告不含它们。扫码绑定已实测，不代表正式微信收件已交付。

应用被强停期间，用户向新绑定机器人发送一条测试文字、一张无私人信息图片及本任务合成UTF-8文件；重新打开并显式读取保存3条完整消息，忽略0条。两份附件下载成功、失败0；独立验证库确认P3返回类型为image/text，文本原件hash与97字节测试夹具一致。不向报告输出消息原文、图片hash或平台ID。附件回执本批只记录类型/原件位置，未持久化解析ready/unsupported状态；不据此声称图片OCR正确或附件全文都可分析。正式接入时由P3完整材料仓储保存解析状态和失败说明。

再次重开读取新增0条；再次下载保存0/失败0/跳过2，验证库仍只有3条消息与2份成功附件回执。真实路径没有重投同一message_id，平台读过游标后返回空；协议重投的防重证据来自自动化/合成探针，二者不混为同一结果。全部账号步骤modelCalls=0，普通记录未生成任务或来源。

这一证据仅证明本次短时间关闭后补收与立即下载；长时间离线/链接有效期、合并转发、语音/视频、地区切换或QQ均未测，不承诺无限历史补收。

账号测试结束后、换preview之前，已有14类普通记录摘要再次一致。最终4f11335独立preview同签名覆盖安装，已核对手机实际APK hash与构建记录一致；停本任务Metro/8093夹具并移除8081/8093映射后，日记导航启动通过。preview不可run-as，未将安装后的SQL摘要再次核对填写为通过。自己的Download合成文件已删除；验证账号/库及附件原件私密保留用于后续衔接，不归入普通记录导出。

## 后续门槛

真实少量材料验证通过后，先完成P5-04全对象手动导出/受控恢复，再接正式渠道设置/收件入口及授权聊天管线，避免先大量积累无法完整导出的材料。QQ独立验证；P4-A实际锁屏/重启投递、手机真实云聊天、中文IME及人工日记/人格体验继续单列。

本批Git提交留在本地分支，未合并main或推送GitHub。私密账号、二维码、原件、日志、签名、APK与研究clone不提交。
